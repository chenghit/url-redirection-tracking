// DLQ Processor Lambda function for retrying failed tracking events

import { SQSEvent, SQSRecord, Context, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { writeTrackingEvent, batchWriteTrackingEvents } from '../../shared/dynamodb';
import { TrackingEvent } from '../../shared/types';
import { createLogger, Logger } from '../../shared/logger';
import { 
  AppError, 
  DynamoDBError, 
  ConfigurationError, 
  wrapDynamoDBOperation,
  sendToDLQ
} from '../../shared/error-handler';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { AWS_REGION } from '../../shared/constants';

/**
 * Interface for DLQ message structure
 */
export interface DLQMessage {
  tracking_event: TrackingEvent;
  error_details: {
    message: string;
    name: string;
    stack?: string;
    code?: string;
  };
  retry_count: number;
  failed_at: string;
  correlation_id: string;
}

// Configuration constants
const MAX_RETRY_COUNT = 3;
const BATCH_SIZE = 25; // DynamoDB batch write limit
const MAX_BACKOFF_DELAY_SECONDS = 900; // 15 minutes

/**
 * Main Lambda handler for processing DLQ messages
 * Uses partial batch response feature to handle failures
 */
export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<SQSBatchResponse> => {
  const logger = createLogger(context, {
    operation: 'dlq-processor',
    message_count: event.Records.length,
    request_id: context.awsRequestId
  });

  logger.info('DLQ processor started', {
    message_count: event.Records.length,
    function_name: context.functionName,
    request_id: context.awsRequestId,
    remaining_time_ms: context.getRemainingTimeInMillis()
  });

  // Track failed message IDs for partial batch response
  const failedMessageIds: string[] = [];

  // Group messages for batch processing
  const messagesToRetry: DLQMessage[] = [];
  const messagesToDiscard: SQSRecord[] = [];

  // Parse and categorize messages
  for (const record of event.Records) {
    try {
      const dlqMessage = JSON.parse(record.body) as DLQMessage;
      
      // Create a logger with the correlation ID from the message
      const messageLogger = logger.withContext({
        correlation_id: dlqMessage.correlation_id,
        tracking_id: dlqMessage.tracking_event.tracking_id,
        retry_count: dlqMessage.retry_count.toString()
      });
      
      messageLogger.info('Processing DLQ message', {
        message_id: record.messageId,
        original_error: dlqMessage.error_details.name,
        error_code: dlqMessage.error_details.code,
        original_failure_time: dlqMessage.failed_at
      });

      if (dlqMessage.retry_count >= MAX_RETRY_COUNT) {
        messageLogger.warn('Message exceeded max retry count, discarding', {
          max_retry_count: MAX_RETRY_COUNT,
          destination_url: dlqMessage.tracking_event.destination_url
        });
        messagesToDiscard.push(record);
      } else {
        messagesToRetry.push(dlqMessage);
      }
    } catch (parseError) {
      logger.error('Failed to parse DLQ message', parseError as Error, {
        message_id: record.messageId,
        receipt_handle: record.receiptHandle,
        body_excerpt: record.body.substring(0, 100) + (record.body.length > 100 ? '...' : '')
      });
      
      // Add to failed messages for partial batch response
      failedMessageIds.push(record.messageId);
      
      // Discard unparseable messages
      messagesToDiscard.push(record);
    }
  }

  // Process retry messages in batches
  if (messagesToRetry.length > 0) {
    const processingResults = await processRetryMessages(messagesToRetry, logger);
    
    // Add any failed message IDs to our tracking
    failedMessageIds.push(...processingResults.failedMessageIds);
  }

  // Log discarded messages
  if (messagesToDiscard.length > 0) {
    logger.info('Discarded messages', {
      discarded_count: messagesToDiscard.length,
      message_ids: messagesToDiscard.map(r => r.messageId).slice(0, 10), // Limit to first 10 for log size
      total_message_ids: messagesToDiscard.map(r => r.messageId).length
    });
  }

  logger.info('DLQ processor completed', {
    processed_count: messagesToRetry.length,
    discarded_count: messagesToDiscard.length,
    failed_count: failedMessageIds.length,
    success_rate: messagesToRetry.length > 0 ? 
      `${((messagesToRetry.length - failedMessageIds.length) / messagesToRetry.length * 100).toFixed(2)}%` : 
      'N/A'
  });

  // Return partial batch response for SQS to handle retries of failed messages
  return {
    batchItemFailures: failedMessageIds.map(id => ({ itemIdentifier: id } as SQSBatchItemFailure))
  };
};

/**
 * Processes retry messages in batches
 * @returns Object containing arrays of failed message IDs
 */
async function processRetryMessages(
  messages: DLQMessage[],
  logger: Logger
): Promise<{ failedMessageIds: string[] }> {
  // Track failed message IDs
  const failedMessageIds: string[] = [];
  
  // Split messages into batches
  const batches: DLQMessage[][] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    batches.push(messages.slice(i, i + BATCH_SIZE));
  }

  logger.info('Processing retry messages in batches', {
    total_messages: messages.length,
    batch_count: batches.length,
    batch_size: BATCH_SIZE
  });

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    const batchLogger = logger.withContext({
      batch_index: batchIndex + 1,
      batch_count: batches.length,
      batch_size: batch.length
    });
    
    batchLogger.info(`Processing batch ${batchIndex + 1}/${batches.length}`);

    try {
      const batchResults = await processBatch(batch, batchLogger);
      failedMessageIds.push(...batchResults.failedMessageIds);
    } catch (error) {
      batchLogger.error('Unexpected error processing batch', error as Error);
      
      // If the entire batch fails, add all message IDs to failed list
      failedMessageIds.push(...batch.map(msg => msg.tracking_event.tracking_id));
    }
  }

  return { failedMessageIds };
}

/**
 * Processes a single batch of retry messages
 * @returns Object containing arrays of failed message IDs
 */
async function processBatch(
  batch: DLQMessage[],
  logger: Logger
): Promise<{ failedMessageIds: string[] }> {
  const failedMessageIds: string[] = [];
  const trackingEvents = batch.map(msg => msg.tracking_event);
  
  try {
    // Attempt batch write with enhanced logging
    await logger.timeOperation('batchWriteTrackingEvents', async () => {
      await batchWriteTrackingEvents(trackingEvents, logger);
    });

    logger.info('Batch write successful', {
      batch_size: batch.length,
      tracking_ids_sample: trackingEvents.slice(0, 3).map(e => e.tracking_id),
      total_tracking_ids: trackingEvents.length
    });

    // Log successful retries
    batch.forEach(msg => {
      const messageLogger = logger.withContext({
        correlation_id: msg.correlation_id,
        tracking_id: msg.tracking_event.tracking_id
      });
      
      messageLogger.info('Tracking event retry successful', {
        retry_count: msg.retry_count,
        original_failure_time: msg.failed_at,
        destination_url: msg.tracking_event.destination_url.substring(0, 100) // Truncate long URLs
      });
    });

  } catch (batchError) {
    logger.warn('Batch write failed, falling back to individual writes', {
      batch_size: batch.length,
      error: (batchError as Error).message,
      error_name: (batchError as Error).name
    });

    // Fall back to individual writes
    const individualResults = await processIndividualWrites(batch, logger);
    failedMessageIds.push(...individualResults.failedMessageIds);
  }
  
  return { failedMessageIds };
}

/**
 * Processes individual writes when batch write fails
 * @returns Object containing arrays of failed message IDs
 */
async function processIndividualWrites(
  batch: DLQMessage[],
  logger: Logger
): Promise<{ failedMessageIds: string[] }> {
  const failedMessageIds: string[] = [];
  
  const results = await Promise.allSettled(
    batch.map(async (msg) => {
      const messageLogger = logger.withContext({
        correlation_id: msg.correlation_id,
        tracking_id: msg.tracking_event.tracking_id,
        retry_count: msg.retry_count.toString()
      });
      
      try {
        await messageLogger.timeOperation(`writeTrackingEvent_${msg.tracking_event.tracking_id}`, async () => {
          await writeTrackingEvent(msg.tracking_event, messageLogger);
        });

        messageLogger.info('Individual tracking event retry successful', {
          destination_url: msg.tracking_event.destination_url.substring(0, 100) // Truncate long URLs
        });

        return { success: true, message: msg };
      } catch (error) {
        messageLogger.error('Individual tracking event retry failed', error as Error, {
          error_name: (error as Error).name,
          error_code: (error as any).code
        });

        // Add to failed message IDs
        failedMessageIds.push(msg.tracking_event.tracking_id);

        // Check if we should retry again
        if (msg.retry_count + 1 < MAX_RETRY_COUNT) {
          await requeueMessage(msg, messageLogger);
        } else {
          messageLogger.error('Tracking event permanently failed after max retries', error as Error, {
            max_retry_count: MAX_RETRY_COUNT,
            destination_url: msg.tracking_event.destination_url,
            client_ip: msg.tracking_event.client_ip
          });
          
          // Log detailed error information for permanent failures
          messageLogger.error('Permanent failure details', error as Error, {
            tracking_event: JSON.stringify(msg.tracking_event),
            original_error: msg.error_details
          });
        }

        return { success: false, message: msg, error };
      }
    })
  );

  // Log summary with detailed statistics
  const successful = results.filter(r => r.status === 'fulfilled' && (r as any).value?.success).length;
  const failed = results.length - successful;
  const successRate = results.length > 0 ? (successful / results.length * 100).toFixed(2) + '%' : 'N/A';

  logger.info('Individual writes completed', {
    total: batch.length,
    successful,
    failed,
    success_rate: successRate,
    failed_ids: failedMessageIds.length <= 5 ? failedMessageIds : failedMessageIds.length + ' ids'
  });
  
  return { failedMessageIds };
}

/**
 * Requeues a message for another retry attempt with exponential backoff
 */
async function requeueMessage(
  msg: DLQMessage,
  logger: Logger
): Promise<void> {
  try {
    const dlqUrl = process.env.TRACKING_DLQ_URL;
    if (!dlqUrl) {
      throw new ConfigurationError(
        'Dead letter queue URL not configured for requeue',
        { tracking_id: msg.tracking_event.tracking_id },
        logger.getCorrelationId()
      );
    }

    const sqsClient = new SQSClient({ 
      region: process.env.AWS_REGION || AWS_REGION,
      maxAttempts: 3
    });
    
    // Create updated message with incremented retry count
    const updatedMessage: DLQMessage = {
      ...msg,
      retry_count: msg.retry_count + 1,
      failed_at: new Date().toISOString()
    };

    // Calculate delay based on retry count (exponential backoff)
    const delaySeconds = Math.min(
      Math.pow(2, msg.retry_count) * 60, 
      MAX_BACKOFF_DELAY_SECONDS
    );

    const command = new SendMessageCommand({
      QueueUrl: dlqUrl,
      MessageBody: JSON.stringify(updatedMessage),
      DelaySeconds: delaySeconds,
      MessageAttributes: {
        'tracking_id': {
          DataType: 'String',
          StringValue: msg.tracking_event.tracking_id
        },
        'retry_count': {
          DataType: 'Number',
          StringValue: updatedMessage.retry_count.toString()
        },
        'correlation_id': {
          DataType: 'String',
          StringValue: msg.correlation_id
        },
        'error_type': {
          DataType: 'String',
          StringValue: msg.error_details.name || 'UnknownError'
        }
      }
    });

    await wrapDynamoDBOperation(
      async () => await sqsClient.send(command),
      'requeueMessage',
      logger
    );
    
    logger.info('Message requeued for retry', {
      retry_count: updatedMessage.retry_count,
      delay_seconds: delaySeconds,
      next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString()
    });

  } catch (requeueError) {
    logger.error('Failed to requeue message', requeueError as Error, {
      retry_count: msg.retry_count
    });
    
    // If we can't requeue, try to send to DLQ directly as a last resort
    try {
      await sendToDLQ(
        msg.tracking_event,
        requeueError as Error,
        logger,
        msg.correlation_id,
        msg.retry_count + 1
      );
    } catch (dlqError) {
      logger.error('Failed to send to DLQ after requeue failure', dlqError as Error);
    }
  }
}