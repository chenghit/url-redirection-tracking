import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import { createHash } from 'node:crypto';
import { isValidUrl, isValidSourceAttribution } from '../../utils/validation';
import { extractClientIP } from '../../utils/ip-extraction';
import { getCurrentISOTimestamp } from '../../utils/timestamp';
import { createLogger, extractRequestContext } from '../../utils/logger';
import { RedirectionRequest, ErrorResponse } from '../../types';

// Initialize SQS client
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

/**
 * Lambda handler for URL redirection requests
 * Processes API Gateway events, validates parameters, and returns redirect responses
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Initialize structured logger with request context
  const requestContext = extractRequestContext(event);
  const logger = createLogger(requestContext);
  
  logger.logRequestStart('Processing redirection request', {
    path: event.path,
    queryStringParameters: event.queryStringParameters,
    method: event.httpMethod,
    sourceIp: requestContext.clientIp,
    userAgent: requestContext.userAgent
  });

  try {
    // Extract and validate query parameters
    const redirectionRequest = extractQueryParameters(event);
    
    logger.debug('Extracted query parameters', { redirectionRequest });
    
    // Validate the redirection request
    const validationResult = validateRedirectionRequest(redirectionRequest);
    if (!validationResult.isValid) {
      logger.warn('Request validation failed', { 
        error: validationResult.error,
        request: redirectionRequest 
      });
      return createErrorResponse(400, 'Bad request');
    }

    logger.info('Request validation successful', { 
      destinationUrl: redirectionRequest.url,
      sourceAttribution: redirectionRequest.sa 
    });

    // Extract client IP for tracking
    const clientIP = extractClientIP(event);
    
    // Generate tracking data
    const trackingId = randomUUID();
    const trackingData = {
      tracking_id: trackingId,
      timestamp: getCurrentISOTimestamp(),
      source_attribution: redirectionRequest.sa,
      client_ip: clientIP,
      destination_url: redirectionRequest.url
    };

    logger.debug('Generated tracking data', { trackingData });

    // Send tracking message to SQS FIFO queue
    await sendTrackingMessage(trackingData, logger);
    
    // Generate redirect response
    const response = createRedirectResponse(redirectionRequest.url);
    
    logger.logRequestEnd('Redirection completed successfully', {
      statusCode: response.statusCode,
      destinationUrl: redirectionRequest.url,
      trackingId: trackingData.tracking_id
    });
    
    return response;

  } catch (error) {
    logger.error('Error processing redirection request', error, {
      path: event.path,
      queryStringParameters: event.queryStringParameters
    });
    return createErrorResponse(500, 'Internal server error');
  }
};

/**
 * Extracts query parameters from API Gateway event
 */
function extractQueryParameters(event: APIGatewayProxyEvent): RedirectionRequest {
  const queryParams = event.queryStringParameters || {};
  
  return {
    url: queryParams.url || '',
    sa: queryParams.sa
  };
}

/**
 * Validates the redirection request parameters
 */
function validateRedirectionRequest(request: RedirectionRequest): { isValid: boolean; error?: string } {
  // URL parameter is required
  if (!request.url) {
    return { isValid: false, error: 'URL parameter is required' };
  }

  // Validate URL format and domain
  if (!isValidUrl(request.url)) {
    return { isValid: false, error: 'Invalid URL or unauthorized domain' };
  }

  // Validate source attribution if provided
  if (request.sa && !isValidSourceAttribution(request.sa)) {
    return { isValid: false, error: 'Invalid source attribution format' };
  }

  return { isValid: true };
}

/**
 * Creates a 302 redirect response with proper headers for API Gateway
 */
function createRedirectResponse(url: string): APIGatewayProxyResult {
  return {
    statusCode: 302,
    headers: {
      'Location': url,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: ''
  };
}

/**
 * Generates a message deduplication ID for FIFO queue
 * Based on client IP, destination URL, and source attribution within a time window
 */
function generateMessageDeduplicationId(
  clientIP: string,
  destinationUrl: string,
  sourceAttribution?: string,
  timeWindowSeconds: number = 300 // 5 minutes (SQS FIFO deduplication window)
): string {
  // Round timestamp to time window to group requests within the window
  const currentTime = Math.floor(Date.now() / 1000);
  const windowedTime = Math.floor(currentTime / timeWindowSeconds) * timeWindowSeconds;
  
  const keyData = `${clientIP}:${destinationUrl}:${sourceAttribution || 'none'}:${windowedTime}`;
  
  // Generate a hash for the deduplication ID
  return createHash('sha256').update(keyData).digest('hex').substring(0, 32);
}

/**
 * Generates a message group ID for FIFO queue
 * Groups messages by client IP to maintain order per client
 */
function generateMessageGroupId(clientIP: string): string {
  // Use a hash of the client IP to distribute messages across groups
  // This ensures ordered processing per client while allowing parallel processing
  return createHash('sha256').update(clientIP).digest('hex').substring(0, 16);
}

/**
 * Sends tracking message to SQS FIFO queue
 */
async function sendTrackingMessage(trackingData: any, logger: any): Promise<void> {
  const queueUrl = process.env.TRACKING_QUEUE_URL;
  
  if (!queueUrl) {
    logger.warn('TRACKING_QUEUE_URL environment variable not set, skipping tracking message');
    return;
  }

  try {
    // Generate FIFO-specific IDs
    const messageDeduplicationId = generateMessageDeduplicationId(
      trackingData.client_ip,
      trackingData.destination_url,
      trackingData.source_attribution
    );
    
    const messageGroupId = generateMessageGroupId(trackingData.client_ip);

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(trackingData),
      MessageAttributes: {
        'tracking_id': {
          DataType: 'String',
          StringValue: trackingData.tracking_id
        },
        'source_attribution': {
          DataType: 'String',
          StringValue: trackingData.source_attribution || 'none'
        },
        'client_ip': {
          DataType: 'String',
          StringValue: trackingData.client_ip
        },
        'destination_url': {
          DataType: 'String',
          StringValue: trackingData.destination_url
        }
      },
      // FIFO queue specific parameters
      MessageGroupId: messageGroupId,
      MessageDeduplicationId: messageDeduplicationId
    });

    // Send message to SQS FIFO queue with proper error handling
    try {
      const result = await sqsClient.send(command);
      
      logger.info('Tracking message sent to SQS FIFO queue', {
        queueUrl,
        trackingId: trackingData.tracking_id,
        messageSize: JSON.stringify(trackingData).length,
        clientIp: trackingData.client_ip,
        messageGroupId,
        messageDeduplicationId,
        messageId: result?.MessageId || 'unknown',
        sourceAttribution: trackingData.source_attribution
      });
    } catch (error) {
      logger.error('Failed to send tracking message to SQS FIFO queue', error, {
        queueUrl,
        trackingId: trackingData.tracking_id,
        messageGroupId,
        messageDeduplicationId,
        sourceAttribution: trackingData.source_attribution,
        clientIp: trackingData.client_ip
      });
      // Don't throw error - tracking failure should not block redirect
    }
  } catch (error) {
    logger.error('Error preparing SQS FIFO message', error, {
      queueUrl,
      trackingId: trackingData.tracking_id
    });
    // Don't throw error - tracking failure should not block redirect
  }
}

/**
 * Creates an error response
 */
function createErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error: message
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(errorResponse)
  };
}