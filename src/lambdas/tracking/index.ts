import { SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { TrackingEvent } from '../../types';
import { formatTimestampToUTC8 } from '../../utils/timestamp';
import { createLogger, StructuredLogger } from '../../utils/logger';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables will be read at runtime

/**
 * Interface for tracking message from SQS
 */
interface TrackingMessage {
  tracking_id: string;
  timestamp: string;
  source_attribution?: string;
  client_ip: string;
  destination_url: string;
}

/**
 * Validates a tracking message from SQS
 * @param message - The message to validate
 * @returns true if valid, false otherwise
 */
function validateTrackingMessage(message: any): message is TrackingMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  // Required fields
  if (!message.tracking_id || typeof message.tracking_id !== 'string') {
    return false;
  }

  if (!message.timestamp || typeof message.timestamp !== 'string') {
    return false;
  }

  if (!message.client_ip || typeof message.client_ip !== 'string') {
    return false;
  }

  if (!message.destination_url || typeof message.destination_url !== 'string') {
    return false;
  }

  // Optional field validation
  if (message.source_attribution !== undefined && typeof message.source_attribution !== 'string') {
    return false;
  }

  // Validate timestamp format (should be ISO 8601)
  try {
    const date = new Date(message.timestamp);
    if (isNaN(date.getTime())) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Processes a single SQS record and extracts tracking message
 * @param record - SQS record to process
 * @param logger - Structured logger instance
 * @returns Parsed tracking message or null if invalid
 */
function processRecord(record: SQSRecord, logger: StructuredLogger): TrackingMessage | null {
  try {
    // Parse the message body
    const messageBody = JSON.parse(record.body);
    
    // Validate the message structure
    if (!validateTrackingMessage(messageBody)) {
      logger.error('Invalid message structure', null, {
        messageId: record.messageId,
        body: record.body
      });
      return null;
    }

    logger.debug('Successfully parsed SQS message', {
      messageId: record.messageId,
      trackingId: messageBody.tracking_id,
      sourceAttribution: messageBody.source_attribution,
      clientIp: messageBody.client_ip,
      destinationUrl: messageBody.destination_url
    });

    return messageBody;
  } catch (error) {
    logger.error('Failed to parse SQS message', error, {
      messageId: record.messageId,
      body: record.body
    });
    return null;
  }
}

/**
 * Transforms a tracking message into a DynamoDB item
 * @param message - The tracking message to transform
 * @returns DynamoDB item ready for persistence
 */
function transformToDynamoDBItem(message: TrackingMessage): TrackingEvent {
  // Calculate TTL (optional - 1 year from now)
  const ttl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

  return {
    tracking_id: message.tracking_id,
    timestamp: message.timestamp,
    formatted_timestamp: formatTimestampToUTC8(message.timestamp),
    source_attribution: message.source_attribution,
    client_ip: message.client_ip,
    destination_url: message.destination_url,
    ttl
  };
}

/**
 * Main Lambda handler for processing SQS events
 * @param event - SQS event containing batch of messages
 * @returns SQS batch response with failed message IDs
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  // Initialize structured logger
  const logger = createLogger({
    correlationId: StructuredLogger.generateCorrelationId()
  });

  const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
  
  logger.logRequestStart('Processing SQS batch', {
    recordCount: event.Records.length,
    tableName: DYNAMODB_TABLE_NAME
  });

  if (!DYNAMODB_TABLE_NAME) {
    logger.error('DYNAMODB_TABLE_NAME environment variable not set');
    throw new Error('Missing required environment variable: DYNAMODB_TABLE_NAME');
  }

  const failedMessageIds: string[] = [];
  const validItems: TrackingEvent[] = [];

  // Process each record in the batch
  for (const record of event.Records) {
    const trackingMessage = processRecord(record, logger);
    
    if (!trackingMessage) {
      // Invalid message - don't retry, just log and continue
      logger.warn('Skipping invalid message', { messageId: record.messageId });
      continue;
    }

    try {
      // Transform to DynamoDB item
      const dynamoItem = transformToDynamoDBItem(trackingMessage);
      validItems.push(dynamoItem);
      
      logger.debug('Successfully transformed message to DynamoDB item', {
        messageId: record.messageId,
        trackingId: dynamoItem.tracking_id,
        sourceAttribution: dynamoItem.source_attribution,
        clientIp: dynamoItem.client_ip
      });
    } catch (error) {
      logger.error('Failed to transform message to DynamoDB item', error, {
        messageId: record.messageId,
        trackingMessage
      });
      failedMessageIds.push(record.messageId);
    }
  }

  // If we have valid items, attempt to write them to DynamoDB
  if (validItems.length > 0) {
    try {
      await batchWriteToDynamoDB(validItems, event.Records, failedMessageIds, DYNAMODB_TABLE_NAME, logger);
    } catch (error) {
      logger.error('Batch write operation failed', error);
      // Add all message IDs to failed list for retry
      event.Records.forEach(record => {
        if (!failedMessageIds.includes(record.messageId)) {
          failedMessageIds.push(record.messageId);
        }
      });
    }
  }

  logger.logRequestEnd('Batch processing completed', {
    totalRecords: event.Records.length,
    validItems: validItems.length,
    failedMessages: failedMessageIds.length,
    successRate: ((validItems.length / event.Records.length) * 100).toFixed(2) + '%'
  });

  return {
    batchItemFailures: failedMessageIds.map(messageId => ({ itemIdentifier: messageId }))
  };
}

/**
 * Writes items to DynamoDB using BatchWriteItem
 * @param items - Items to write
 * @param records - Original SQS records for error mapping
 * @param failedMessageIds - Array to collect failed message IDs
 * @param tableName - DynamoDB table name
 * @param logger - Structured logger instance
 */
async function batchWriteToDynamoDB(
  items: TrackingEvent[], 
  records: SQSRecord[], 
  failedMessageIds: string[],
  tableName: string,
  logger: StructuredLogger
): Promise<void> {
  // DynamoDB BatchWriteItem supports up to 25 items per request
  const BATCH_SIZE = 25;
  
  logger.info('Starting DynamoDB batch write operation', {
    totalItems: items.length,
    batchSize: BATCH_SIZE,
    tableName
  });
  
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchRecords = records.slice(i, i + BATCH_SIZE);
    const batchStartTime = Date.now();
    
    try {
      const putRequests = batch.map(item => ({
        PutRequest: {
          Item: item
        }
      }));

      const command = new BatchWriteCommand({
        RequestItems: {
          [tableName]: putRequests
        }
      });

      const response = await docClient.send(command);
      const batchDuration = Date.now() - batchStartTime;

      // Handle unprocessed items (partial failures)
      if (response.UnprocessedItems && response.UnprocessedItems[tableName]) {
        const unprocessedItems = response.UnprocessedItems[tableName];
        logger.warn('Some items were not processed', {
          unprocessedCount: unprocessedItems.length,
          totalBatchSize: batch.length,
          batchIndex: Math.floor(i / BATCH_SIZE) + 1,
          duration: batchDuration
        });

        // Map unprocessed items back to message IDs
        unprocessedItems.forEach((unprocessedItem, index) => {
          const recordIndex = i + index;
          if (recordIndex < batchRecords.length) {
            failedMessageIds.push(batchRecords[recordIndex].messageId);
          }
        });
      }

      logger.info('Successfully wrote batch to DynamoDB', {
        batchSize: batch.length,
        unprocessedCount: response.UnprocessedItems?.[tableName]?.length || 0,
        batchIndex: Math.floor(i / BATCH_SIZE) + 1,
        duration: batchDuration,
        consumedCapacity: response.ConsumedCapacity
      });

    } catch (error) {
      const batchDuration = Date.now() - batchStartTime;
      logger.error('Failed to write batch to DynamoDB', error, {
        batchSize: batch.length,
        batchIndex: Math.floor(i / BATCH_SIZE) + 1,
        duration: batchDuration,
        tableName
      });

      // Add all message IDs from this batch to failed list
      batchRecords.forEach(record => {
        if (!failedMessageIds.includes(record.messageId)) {
          failedMessageIds.push(record.messageId);
        }
      });
    }
  }
}