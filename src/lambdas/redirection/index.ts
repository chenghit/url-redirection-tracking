// Redirection Lambda function entry point with enhanced monitoring and observability
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { extractClientIp, createTrackingEvent } from '../../shared/utils';
import { writeTrackingEventAsync } from '../../shared/dynamodb';
import { createLoggerFromEvent } from '../../shared/logger';
import { 
  handleError, 
  validateUrlOrThrow, 
  validateSourceAttributionOrThrow
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