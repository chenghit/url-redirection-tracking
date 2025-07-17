// Comprehensive error handling utilities with structured responses

import { APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse } from './types';
import { HTTP_STATUS_CODES, ERROR_MESSAGES, ERROR_CODES } from './constants';
import { Logger } from './logger';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { AWS_REGION } from './constants';

export interface ErrorDetails {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly isOperational: boolean;
  public readonly correlationId?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
    details?: Record<string, any>,
    isOperational: boolean = true,
    correlationId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    this.correlationId = correlationId;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, AppError);
  }

  /**
   * Creates a new AppError with correlation ID
   */
  withCorrelationId(correlationId: string): AppError {
    return new AppError(
      this.message,
      this.code,
      this.statusCode,
      this.details,
      this.isOperational,
      correlationId
    );
  }

  /**
   * Converts error to a plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      isOperational: this.isOperational,
      correlationId: this.correlationId,
      stack: this.stack
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>, correlationId?: string) {
    super(
      message, 
      ERROR_CODES.URL_VALIDATION_FAILED, 
      HTTP_STATUS_CODES.BAD_REQUEST, 
      details, 
      true, 
      correlationId
    );
    this.name = 'ValidationError';
  }
}

export class DynamoDBError extends AppError {
  constructor(
    message: string, 
    originalError?: Error, 
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(
      message,
      ERROR_CODES.DYNAMODB_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      { ...details, originalError: originalError?.message },
      false, // DynamoDB errors are considered non-operational
      correlationId
    );
    this.name = 'DynamoDBError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED, correlationId?: string) {
    super(
      message, 
      ERROR_CODES.RATE_LIMIT_ERROR, 
      HTTP_STATUS_CODES.FORBIDDEN, 
      undefined, 
      true, 
      correlationId
    );
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: Record<string, any>, correlationId?: string) {
    super(
      message,
      ERROR_CODES.NETWORK_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      details,
      true, // Network errors are usually transient
      correlationId
    );
    this.name = 'NetworkError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: Record<string, any>, correlationId?: string) {
    super(
      message,
      ERROR_CODES.CONFIGURATION_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      details,
      false, // Configuration errors are not operational
      correlationId
    );
    this.name = 'ConfigurationError';
  }
}

/**
 * Creates a structured error response for API Gateway
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  correlationId: string,
  errorCode?: string,
  details?: Record<string, any>
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error: message,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    error_code: errorCode,
    details
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Correlation-ID': correlationId
    },
    body: JSON.stringify(errorResponse)
  };
}

/**
 * Creates error response from AppError instance
 */
export function createErrorResponseFromAppError(
  error: AppError,
  correlationId: string
): APIGatewayProxyResult {
  return createErrorResponse(
    error.statusCode,
    error.message,
    correlationId,
    error.code,
    error.details
  );
}

/**
 * Handles and logs errors, returning appropriate API Gateway response
 */
export function handleError(
  error: unknown,
  logger: Logger,
  operation: string
): APIGatewayProxyResult {
  const correlationId = logger.getCorrelationId();

  if (error instanceof AppError) {
    // Add correlation ID if not already present
    const errorWithCorrelation = error.correlationId ? 
      error : 
      error.withCorrelationId(correlationId);

    // Log operational errors as warnings
    if (errorWithCorrelation.isOperational) {
      logger.warn(`Operational error in ${operation}`, {
        error_code: errorWithCorrelation.code,
        error_message: errorWithCorrelation.message,
        error_name: errorWithCorrelation.name,
        details: errorWithCorrelation.details
      });
    } else {
      logger.error(`Non-operational error in ${operation}`, errorWithCorrelation, {
        error_code: errorWithCorrelation.code,
        error_name: errorWithCorrelation.name,
        details: errorWithCorrelation.details
      });
    }

    return createErrorResponseFromAppError(errorWithCorrelation, correlationId);
  }

  // Handle unknown errors
  const unknownError = error as Error;
  logger.error(`Unexpected error in ${operation}`, unknownError, {
    error_type: typeof error,
    error_name: unknownError.name || 'UnknownError'
  });

  return createErrorResponse(
    HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
    ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    correlationId,
    ERROR_CODES.INTERNAL_ERROR,
    { 
      originalError: unknownError.message,
      errorName: unknownError.name || 'UnknownError'
    }
  );
}

/**
 * Validates URL and throws ValidationError if invalid
 */
export function validateUrlOrThrow(url: string | undefined | null, correlationId?: string): string {
  if (!url) {
    throw new ValidationError(ERROR_MESSAGES.URL_REQUIRED, {
      field: 'url',
      provided: url
    }, correlationId);
  }

  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new ValidationError(ERROR_MESSAGES.URL_INVALID_FORMAT, {
      field: 'url',
      provided: url,
      type: typeof url
    }, correlationId);
  }

  try {
    const urlObj = new URL(url.trim());
    
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new ValidationError(ERROR_MESSAGES.URL_INVALID_FORMAT, {
        field: 'url',
        provided: url,
        issue: 'invalid_protocol',
        protocol: urlObj.protocol
      }, correlationId);
    }

    const allowedDomains = ['amazonaws.cn', 'amazonaws.com', 'amazon.com'];
    const isAllowedDomain = allowedDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );

    if (!isAllowedDomain) {
      throw new ValidationError(ERROR_MESSAGES.URL_INVALID_DOMAIN, {
        field: 'url',
        provided: url,
        hostname: urlObj.hostname,
        allowed_domains: allowedDomains
      }, correlationId);
    }

    return urlObj.toString();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    
    throw new ValidationError(ERROR_MESSAGES.URL_INVALID_FORMAT, {
      field: 'url',
      provided: url,
      parse_error: (error as Error).message
    }, correlationId);
  }
}

/**
 * Validates source attribution and throws ValidationError if invalid
 */
export function validateSourceAttributionOrThrow(
  sa: string | undefined | null, 
  correlationId?: string
): string | undefined {
  if (sa === undefined || sa === null) {
    return undefined;
  }

  if (typeof sa !== 'string') {
    throw new ValidationError(ERROR_MESSAGES.SA_INVALID_FORMAT, {
      field: 'sa',
      provided: sa,
      type: typeof sa
    }, correlationId);
  }

  if (sa.trim().length === 0) {
    throw new ValidationError(ERROR_MESSAGES.SA_INVALID_FORMAT, {
      field: 'sa',
      provided: sa,
      issue: 'empty_string'
    }, correlationId);
  }

  const saPattern = /^EdgeUp\d{3}$/;
  const trimmedSa = sa.trim();
  
  if (!saPattern.test(trimmedSa)) {
    throw new ValidationError(ERROR_MESSAGES.SA_INVALID_FORMAT, {
      field: 'sa',
      provided: sa,
      pattern: 'EdgeUp + 3 digits',
      example: 'EdgeUp001'
    }, correlationId);
  }

  return trimmedSa;
}

/**
 * Wraps DynamoDB operations with error handling and retry logic
 */
export async function wrapDynamoDBOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  logger: Logger,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;
  const correlationId = logger.getCorrelationId();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await logger.timeOperation(`${operationName}_attempt_${attempt + 1}`, operation);
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      if (!isRetryableError(error) || attempt === maxRetries) {
        const dynamoError = new DynamoDBError(
          `${operationName} failed after ${attempt + 1} attempts: ${lastError.message}`,
          lastError,
          { 
            operation: operationName, 
            attempts: attempt + 1,
            maxRetries,
            isRetryable: isRetryableError(error),
            errorCode: (error as any)?.code || (error as any)?.name,
            statusCode: (error as any)?.statusCode
          },
          correlationId
        );
        
        logger.error(`DynamoDB operation failed: ${operationName}`, lastError, {
          attempts: attempt + 1,
          maxRetries,
          isRetryable: isRetryableError(error),
          errorCode: (error as any)?.code || (error as any)?.name,
          statusCode: (error as any)?.statusCode,
          operation_duration_ms: Date.now() - (logger as any)._operationStartTime
        });
        throw dynamoError;
      }
      
      // Calculate exponential backoff delay with jitter
      const baseDelay = 100; // 100ms base delay
      const maxDelay = 5000; // 5 second max delay
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitteredDelay = delay + Math.random() * delay * 0.1;
      
      logger.warn(`${operationName} attempt ${attempt + 1} failed, retrying in ${Math.round(jitteredDelay)}ms`, {
        error: lastError.message,
        errorCode: (error as any)?.code || (error as any)?.name,
        statusCode: (error as any)?.statusCode,
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(jitteredDelay),
        isRetryable: true
      });
      
      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }
  
  // This should never be reached due to loop logic, but TypeScript needs assurance
  throw new DynamoDBError(
    `${operationName} failed after ${maxRetries + 1} attempts`,
    lastError!,
    { operation: operationName, attempts: maxRetries + 1 },
    correlationId
  );
}

/**
 * Determines if a DynamoDB error is retryable
 */
function isRetryableError(error: any): boolean {
  const errorCode = error?.name || error?.code;
  const retryableErrors = [
    'ProvisionedThroughputExceededException',
    'ThrottlingException',
    'ServiceUnavailable',
    'InternalServerError',
    'RequestTimeout',
    'NetworkingError',
    'TimeoutError',
    'AbortError'
  ];
  
  return retryableErrors.includes(errorCode) || 
         (error?.statusCode >= 500 && error?.statusCode < 600);
}

/**
 * Sends a failed tracking event to the Dead Letter Queue
 */
export async function sendToDLQ<T>(
  payload: T,
  error: Error,
  logger: Logger,
  correlationId: string,
  retryCount: number = 0
): Promise<void> {
  try {
    const dlqUrl = process.env.TRACKING_DLQ_URL;
    if (!dlqUrl) {
      logger.error('Failed to send to DLQ: Missing TRACKING_DLQ_URL environment variable', new ConfigurationError(
        'Missing TRACKING_DLQ_URL environment variable',
        { payload_type: typeof payload },
        correlationId
      ));
      return;
    }

    const sqsClient = new SQSClient({ 
      region: process.env.AWS_REGION || AWS_REGION,
      maxAttempts: 3
    });

    const dlqMessage = {
      tracking_event: payload,
      error_details: {
        message: error.message,
        name: error.name,
        stack: error.stack,
        code: (error as any).code
      },
      retry_count: retryCount,
      failed_at: new Date().toISOString(),
      correlation_id: correlationId
    };

    const command = new SendMessageCommand({
      QueueUrl: dlqUrl,
      MessageBody: JSON.stringify(dlqMessage),
      MessageAttributes: {
        'tracking_id': {
          DataType: 'String',
          StringValue: (payload as any).tracking_id || 'unknown'
        },
        'error_type': {
          DataType: 'String',
          StringValue: error.name || 'UnknownError'
        },
        'correlation_id': {
          DataType: 'String',
          StringValue: correlationId
        }
      }
    });

    await sqsClient.send(command);
    
    logger.info('Failed tracking event sent to DLQ', {
      tracking_id: (payload as any).tracking_id,
      error_name: error.name,
      correlation_id: correlationId,
      dlq_url: dlqUrl
    });
  } catch (dlqError) {
    logger.error('Failed to send tracking event to DLQ', dlqError as Error, {
      original_error: error.message,
      correlation_id: correlationId,
      payload_type: typeof payload
    });
  }
}

/**
 * Safely executes a function and sends failures to DLQ
 */
export async function executeWithDLQFallback<T, R>(
  operation: () => Promise<R>,
  payload: T,
  operationName: string,
  logger: Logger,
  shouldThrow: boolean = false
): Promise<R | undefined> {
  try {
    return await operation();
  } catch (error) {
    const correlationId = logger.getCorrelationId();
    
    logger.error(`Operation ${operationName} failed, sending to DLQ`, error as Error, {
      payload_type: typeof payload,
      correlation_id: correlationId
    });
    
    await sendToDLQ(payload, error as Error, logger, correlationId);
    
    if (shouldThrow) {
      throw error;
    }
    
    return undefined;
  }
}