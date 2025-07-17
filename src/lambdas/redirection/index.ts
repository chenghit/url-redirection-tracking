// Redirection Lambda function entry point with enhanced monitoring and observability
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { extractClientIp, createTrackingEvent } from '../../shared/utils';
import { writeTrackingEvent } from '../../shared/dynamodb';
import { createLoggerFromEvent } from '../../shared/logger';
import { 
  handleError, 
  validateUrlOrThrow, 
  validateSourceAttributionOrThrow,
  createErrorResponse
} from '../../shared/error-handler';

/**
 * Main Lambda handler for URL redirection
 * Processes API Gateway events, validates URLs, and performs redirects
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const logger = createLoggerFromEvent(event, context);
  
  try {
    // Log request start with enhanced context
    logger.logRequestStart(event, context);

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const url = queryParams.url;
    const sa = queryParams.sa;

    // Validate URL and source attribution (throws ValidationError if invalid)
    const validatedUrl = await logger.timeOperation('url_validation', async () => {
      return validateUrlOrThrow(url);
    });
    
    const validatedSa = await logger.timeOperation('sa_validation', async () => {
      return validateSourceAttributionOrThrow(sa);
    });

    // Extract client IP for tracking
    const clientIp = extractClientIp(
      event.headers || {},
      event.requestContext?.identity?.sourceIp || 'unknown'
    );

    logger.info('URL validation successful', {
      destination_url: validatedUrl,
      source_attribution: validatedSa,
      client_ip: clientIp
    });

    // Create tracking event for asynchronous processing
    const trackingEvent = await logger.timeOperation('create_tracking_event', async () => {
      return createTrackingEvent(
        validatedUrl,
        clientIp,
        validatedSa
      );
    });

    // Start asynchronous tracking (fire-and-forget to avoid blocking redirect)
    writeTrackingEventAsync(trackingEvent, logger);

    // Log custom metrics for monitoring
    logger.metric('redirection_count', 1, 'Count', {
      has_source_attribution: validatedSa ? 'true' : 'false',
      destination_domain: new URL(validatedUrl).hostname
    });

    // Calculate response time
    const duration = Date.now() - startTime;
    
    // Log request completion with performance metrics
    logger.logRequestEnd(302, duration);

    // Return redirect response immediately with correlation ID for tracing
    return {
      statusCode: 302,
      headers: {
        Location: validatedUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Correlation-ID': logger.getCorrelationId(),
        'X-Response-Time': `${duration}ms`
      },
      body: ''
    };

  } catch (error) {
    const errorResponse = handleError(error, logger, 'redirection');
    
    // Log request completion with error status
    const duration = Date.now() - startTime;
    logger.logRequestEnd(errorResponse.statusCode, duration);
    
    // Add correlation ID and response time to error response headers
    errorResponse.headers = {
      ...errorResponse.headers,
      'X-Response-Time': `${duration}ms`
    };
    
    return errorResponse;
  }
};

/**
 * Asynchronously writes tracking event to DynamoDB without blocking the response
 * Uses fire-and-forget pattern to ensure redirect performance is not impacted
 * @param trackingEvent - The tracking event to store
 * @param logger - Logger instance for structured logging
 */
function writeTrackingEventAsync(
  trackingEvent: import('../../shared/types').TrackingEvent, 
  logger: import('../../shared/logger').Logger
): void {
  // Fire-and-forget: start the async operation but don't await it
  writeTrackingEvent(trackingEvent)
    .then(() => {
      logger.info('Tracking event recorded successfully', {
        tracking_id: trackingEvent.tracking_id,
        destination_url: trackingEvent.destination_url,
        source_attribution: trackingEvent.source_attribution,
        client_ip: trackingEvent.client_ip
      });
    })
    .catch(async (error) => {
      // Log tracking errors but don't fail the redirect
      logger.error('Failed to record tracking event', error, {
        tracking_id: trackingEvent.tracking_id,
        destination_url: trackingEvent.destination_url,
        source_attribution: trackingEvent.source_attribution,
        client_ip: trackingEvent.client_ip,
        retry_attempt: 'initial',
        error_type: error.name || 'Unknown',
        error_code: error.code || 'UNKNOWN_ERROR'
      });
      
      // Send to dead letter queue for retry processing
      try {
        await sendToDeadLetterQueue(trackingEvent, error, logger);
        logger.info('Tracking event sent to DLQ for retry', {
          tracking_id: trackingEvent.tracking_id,
          error_type: error.name || 'Unknown'
        });
      } catch (dlqError) {
        logger.error('Failed to send tracking event to dead letter queue', dlqError as Error, {
          tracking_id: trackingEvent.tracking_id,
          original_error: error.message,
          dlq_error: (dlqError as Error).message,
          destination_url: trackingEvent.destination_url
        });
        
        // As a last resort, log the complete tracking event for manual recovery
        logger.error('Tracking event completely failed - manual recovery required', error, {
          tracking_event: trackingEvent,
          failure_reason: 'Both DynamoDB write and DLQ send failed'
        });
      }
    });
}

/**
 * Sends failed tracking event to dead letter queue for retry processing
 * @param trackingEvent - The tracking event that failed to be written
 * @param error - The original error that occurred
 * @param logger - Logger instance for structured logging
 */
async function sendToDeadLetterQueue(
  trackingEvent: import('../../shared/types').TrackingEvent,
  error: Error,
  logger: import('../../shared/logger').Logger
): Promise<void> {
  // Import SQS client dynamically to avoid cold start penalty
  const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
  
  const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
  
  const dlqUrl = process.env.TRACKING_DLQ_URL;
  if (!dlqUrl) {
    logger.warn('Dead letter queue URL not configured, skipping DLQ send', {
      tracking_id: trackingEvent.tracking_id
    });
    return;
  }

  const dlqMessage = {
    tracking_event: trackingEvent,
    error_details: {
      message: error.message,
      name: error.name,
      stack: error.stack
    },
    retry_count: 0,
    failed_at: new Date().toISOString(),
    correlation_id: logger.getCorrelationId()
  };

  const command = new SendMessageCommand({
    QueueUrl: dlqUrl,
    MessageBody: JSON.stringify(dlqMessage),
    MessageAttributes: {
      'tracking_id': {
        DataType: 'String',
        StringValue: trackingEvent.tracking_id
      },
      'error_type': {
        DataType: 'String',
        StringValue: error.name
      },
      'correlation_id': {
        DataType: 'String',
        StringValue: logger.getCorrelationId()
      }
    }
  });

  await sqsClient.send(command);
  
  logger.info('Tracking event sent to dead letter queue', {
    tracking_id: trackingEvent.tracking_id,
    dlq_url: dlqUrl,
    error_type: error.name
  });
}