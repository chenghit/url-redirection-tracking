// DynamoDB client configuration and utilities

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  ScanCommand, 
  QueryCommand,
  GetCommand,
  BatchWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DYNAMODB_TABLE_NAME, ERROR_MESSAGES } from './constants';
import { TrackingEvent, DynamoDBTrackingItem, AnalyticsQuery } from './types';
import { Logger } from './logger';
import { 
  DynamoDBError as AppDynamoDBError, 
  wrapDynamoDBOperation, 
  sendToDLQ,
  executeWithDLQFallback
} from './error-handler';

// DynamoDB client configuration with retry logic and timeout settings
const client = new DynamoDBClient({ 
  region: AWS_REGION,
  maxAttempts: 3,
  retryMode: 'adaptive',
  requestHandler: {
    requestTimeout: 5000, // 5 second timeout
    httpsAgent: {
      maxSockets: 50
    }
  }
});

export const dynamoDbClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 100, // milliseconds
  maxDelay: 5000, // milliseconds
  backoffMultiplier: 2
};

/**
 * Determines if an error should not be retried
 */
function isNonRetryableError(error: any): boolean {
  const errorCode = error?.name || error?.code;
  const nonRetryableErrors = [
    'ValidationException',
    'ResourceNotFoundException',
    'ConditionalCheckFailedException',
    'ItemCollectionSizeLimitExceededException',
    'RequestLimitExceeded',
    'AccessDeniedException'
  ];
  
  return nonRetryableErrors.includes(errorCode);
}

/**
 * Writes a tracking event to DynamoDB with comprehensive error handling
 * @param event - Tracking event to store
 * @param logger - Logger instance for structured logging
 * @returns Promise<void>
 * @throws AppDynamoDBError for non-retryable errors
 */
export async function writeTrackingEvent(
  event: TrackingEvent, 
  logger?: Logger
): Promise<void> {
  const loggerInstance = logger || new Logger({ 
    correlation_id: event.tracking_id,
    operation: 'writeTrackingEvent'
  });

  const item: DynamoDBTrackingItem = {
    tracking_id: event.tracking_id,
    timestamp: event.timestamp,
    formatted_timestamp: event.formatted_timestamp,
    source_attribution: event.source_attribution,
    client_ip: event.client_ip,
    destination_url: event.destination_url,
    ttl: event.ttl,
  };

  await wrapDynamoDBOperation(async () => {
    const command = new PutCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Item: item,
      // Add condition to prevent duplicate writes
      ConditionExpression: 'attribute_not_exists(tracking_id)'
    });

    try {
      await dynamoDbClient.send(command);
      loggerInstance.info('Successfully wrote tracking event to DynamoDB', {
        tracking_id: event.tracking_id,
        table: DYNAMODB_TABLE_NAME
      });
    } catch (error) {
      // Add additional context to DynamoDB errors
      const enhancedError = error as any;
      enhancedError.trackingId = event.tracking_id;
      enhancedError.operation = 'writeTrackingEvent';
      enhancedError.tableName = DYNAMODB_TABLE_NAME;
      throw enhancedError;
    }
  }, 'writeTrackingEvent', loggerInstance);
}

/**
 * Writes a tracking event asynchronously with DLQ fallback
 * @param event - Tracking event to store
 * @param logger - Logger instance for structured logging
 * @returns Promise<void>
 */
export async function writeTrackingEventAsync(
  event: TrackingEvent, 
  logger: Logger
): Promise<void> {
  // Fire and forget with DLQ fallback
  executeWithDLQFallback(
    () => writeTrackingEvent(event, logger),
    event,
    'writeTrackingEventAsync',
    logger,
    false // Don't throw errors, just log and send to DLQ
  ).catch(error => {
    // This should never happen since executeWithDLQFallback handles errors
    logger.error('Unexpected error in writeTrackingEventAsync', error as Error, {
      tracking_id: event.tracking_id
    });
  });
}

/**
 * Writes multiple tracking events to DynamoDB in batch with retry logic
 * @param events - Array of tracking events to store
 * @param logger - Logger instance for structured logging
 * @returns Promise<void>
 * @throws AppDynamoDBError for non-retryable errors
 */
export async function batchWriteTrackingEvents(
  events: TrackingEvent[],
  logger?: Logger
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const loggerInstance = logger || new Logger({ 
    operation: 'batchWriteTrackingEvents',
    batch_size: events.length
  });

  // DynamoDB batch write supports up to 25 items per request
  const batchSize = 25;
  const batches: TrackingEvent[][] = [];
  
  for (let i = 0; i < events.length; i += batchSize) {
    batches.push(events.slice(i, i + batchSize));
  }

  loggerInstance.info('Processing batch write operation', {
    total_events: events.length,
    batch_count: batches.length,
    batch_size: batchSize
  });

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    await wrapDynamoDBOperation(async () => {
      const putRequests = batch.map(event => ({
        PutRequest: {
          Item: {
            tracking_id: event.tracking_id,
            timestamp: event.timestamp,
            formatted_timestamp: event.formatted_timestamp,
            source_attribution: event.source_attribution,
            client_ip: event.client_ip,
            destination_url: event.destination_url,
            ttl: event.ttl,
          } as DynamoDBTrackingItem
        }
      }));

      const command = new BatchWriteCommand({
        RequestItems: {
          [DYNAMODB_TABLE_NAME]: putRequests
        }
      });

      const result = await dynamoDbClient.send(command);
      
      // Handle unprocessed items
      if (result.UnprocessedItems && 
          result.UnprocessedItems[DYNAMODB_TABLE_NAME] && 
          result.UnprocessedItems[DYNAMODB_TABLE_NAME].length > 0) {
        
        const unprocessedCount = result.UnprocessedItems[DYNAMODB_TABLE_NAME].length;
        loggerInstance.warn(`Batch write returned unprocessed items`, {
          batch_index: batchIndex,
          unprocessed_count: unprocessedCount,
          processed_count: batch.length - unprocessedCount
        });
        
        // Extract unprocessed items and send them to DLQ
        const unprocessedItems = result.UnprocessedItems[DYNAMODB_TABLE_NAME];
        const unprocessedEvents = unprocessedItems.map(item => {
          const putRequest = item.PutRequest;
          if (!putRequest || !putRequest.Item) {
            return null;
          }
          return putRequest.Item as TrackingEvent;
        }).filter(Boolean) as TrackingEvent[];
        
        // Send each unprocessed item to DLQ
        for (const event of unprocessedEvents) {
          const error = new AppDynamoDBError(
            ERROR_MESSAGES.DYNAMODB_WRITE_FAILED,
            new Error('Item unprocessed in batch write'),
            {
              tracking_id: event.tracking_id,
              operation: 'batchWriteTrackingEvents',
              batch_index: batchIndex
            }
          );
          
          await sendToDLQ(
            event, 
            error, 
            loggerInstance, 
            loggerInstance.getCorrelationId()
          );
        }
      } else {
        loggerInstance.info(`Successfully processed batch ${batchIndex + 1}/${batches.length}`, {
          batch_size: batch.length
        });
      }
    }, `batchWriteTrackingEvents_batch_${batchIndex + 1}`, loggerInstance);
  }
}

/**
 * Retrieves a single tracking event by tracking ID
 * @param trackingId - The tracking ID to retrieve
 * @param logger - Logger instance for structured logging
 * @returns Promise<TrackingEvent | null>
 * @throws AppDynamoDBError for non-retryable errors
 */
export async function getTrackingEvent(
  trackingId: string,
  logger?: Logger
): Promise<TrackingEvent | null> {
  const loggerInstance = logger || new Logger({ 
    correlation_id: trackingId,
    operation: 'getTrackingEvent'
  });

  return await wrapDynamoDBOperation(async () => {
    const command = new GetCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Key: {
        tracking_id: trackingId
      }
    });

    const result = await dynamoDbClient.send(command);
    
    if (result.Item) {
      loggerInstance.info('Successfully retrieved tracking event', {
        tracking_id: trackingId
      });
    } else {
      loggerInstance.info('Tracking event not found', {
        tracking_id: trackingId
      });
    }
    
    return result.Item ? (result.Item as TrackingEvent) : null;
  }, 'getTrackingEvent', loggerInstance);
}

/**
 * Queries tracking events from DynamoDB with retry logic
 * @param query - Analytics query parameters
 * @param logger - Logger instance for structured logging
 * @returns Promise<TrackingEvent[]>
 * @throws AppDynamoDBError for non-retryable errors
 */
export async function queryTrackingEvents(
  query: AnalyticsQuery,
  logger?: Logger
): Promise<TrackingEvent[]> {
  const loggerInstance = logger || new Logger({ 
    operation: 'queryTrackingEvents',
    query_params: JSON.stringify(query)
  });

  return await wrapDynamoDBOperation(async () => {
    // This is a basic implementation using Scan
    // The actual implementation will be enhanced in the analytics task
    const command = new ScanCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Limit: query.limit || 100,
    });

    const result = await dynamoDbClient.send(command);
    
    loggerInstance.info('Successfully queried tracking events', {
      result_count: result.Items?.length || 0,
      limit: query.limit || 100
    });
    
    return (result.Items || []) as TrackingEvent[];
  }, 'queryTrackingEvents', loggerInstance);
}

/**
 * Queries tracking events by source attribution using GSI
 * @param sourceAttribution - Source attribution to filter by
 * @param limit - Maximum number of items to return
 * @param logger - Logger instance for structured logging
 * @returns Promise<TrackingEvent[]>
 * @throws AppDynamoDBError for non-retryable errors
 */
export async function queryTrackingEventsBySource(
  sourceAttribution: string, 
  limit: number = 100,
  logger?: Logger
): Promise<TrackingEvent[]> {
  const loggerInstance = logger || new Logger({ 
    operation: 'queryTrackingEventsBySource',
    source_attribution: sourceAttribution,
    limit
  });

  return await wrapDynamoDBOperation(async () => {
    const command = new QueryCommand({
      TableName: DYNAMODB_TABLE_NAME,
      IndexName: 'GSI1', // GSI1: source_attribution (PK) + timestamp (SK)
      KeyConditionExpression: 'source_attribution = :sa',
      ExpressionAttributeValues: {
        ':sa': sourceAttribution
      },
      Limit: limit,
      ScanIndexForward: false // Most recent first
    });

    const result = await dynamoDbClient.send(command);
    
    loggerInstance.info('Successfully queried tracking events by source', {
      source_attribution: sourceAttribution,
      result_count: result.Items?.length || 0,
      limit
    });
    
    return (result.Items || []) as TrackingEvent[];
  }, 'queryTrackingEventsBySource', loggerInstance);
}

/**
 * Queries tracking events by time range using GSI
 * @param startDate - Start date in ISO format
 * @param endDate - End date in ISO format
 * @param limit - Maximum number of items to return
 * @param logger - Logger instance for structured logging
 * @returns Promise<TrackingEvent[]>
 * @throws AppDynamoDBError for non-retryable errors
 */
export async function queryTrackingEventsByTimeRange(
  startDate: string,
  endDate: string,
  limit: number = 100,
  logger?: Logger
): Promise<TrackingEvent[]> {
  const loggerInstance = logger || new Logger({ 
    operation: 'queryTrackingEventsByTimeRange',
    start_date: startDate,
    end_date: endDate,
    limit
  });

  return await wrapDynamoDBOperation(async () => {
    const command = new ScanCommand({
      TableName: DYNAMODB_TABLE_NAME,
      FilterExpression: '#ts BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':start': startDate,
        ':end': endDate
      },
      Limit: limit
    });

    const result = await dynamoDbClient.send(command);
    
    loggerInstance.info('Successfully queried tracking events by time range', {
      start_date: startDate,
      end_date: endDate,
      result_count: result.Items?.length || 0,
      limit
    });
    
    return (result.Items || []) as TrackingEvent[];
  }, 'queryTrackingEventsByTimeRange', loggerInstance);
}

/**
 * Creates TTL value for DynamoDB item (optional for permanent storage)
 * @param daysFromNow - Number of days from now for TTL
 * @returns Unix timestamp for TTL
 */
export function createTTL(daysFromNow: number = 365): number {
  const now = new Date();
  const ttlDate = new Date(now.getTime() + (daysFromNow * 24 * 60 * 60 * 1000));
  return Math.floor(ttlDate.getTime() / 1000);
}

/**
 * Validates DynamoDB table configuration
 * @param logger - Logger instance for structured logging
 * @returns Promise<boolean> - True if table is accessible and properly configured
 */
export async function validateTableConfiguration(logger?: Logger): Promise<boolean> {
  const loggerInstance = logger || new Logger({ operation: 'validateTableConfiguration' });
  
  try {
    await wrapDynamoDBOperation(async () => {
      const command = new ScanCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Limit: 1
      });
      
      await dynamoDbClient.send(command);
      loggerInstance.info('DynamoDB table validation successful', {
        table: DYNAMODB_TABLE_NAME
      });
    }, 'validateTableConfiguration', loggerInstance);
    
    return true;
  } catch (error) {
    loggerInstance.error('DynamoDB table validation failed', error as Error, {
      table: DYNAMODB_TABLE_NAME
    });
    return false;
  }
}