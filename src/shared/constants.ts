// Application constants and configuration

export const ALLOWED_DOMAINS = [
  'amazonaws.cn',
  'amazonaws.com', 
  'amazon.com'
] as const;

export const AWS_REGION = 'ap-northeast-1'; // Tokyo region

export const DYNAMODB_TABLE_NAME = 'url-redirection-tracking';

export const HTTP_STATUS_CODES = {
  OK: 200,
  FOUND: 302,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500
} as const;

export const ERROR_MESSAGES = {
  BAD_REQUEST: 'Bad request',
  FORBIDDEN: 'Forbidden',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  URL_REQUIRED: 'URL parameter is required',
  URL_INVALID_FORMAT: 'Invalid URL format',
  URL_INVALID_DOMAIN: 'URL must point to allowed domains',
  SA_INVALID_FORMAT: 'Source attribution must start with EdgeUp followed by 3 digits',
  DYNAMODB_WRITE_FAILED: 'Failed to write tracking data',
  DYNAMODB_READ_FAILED: 'Failed to read tracking data',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded'
} as const;

export const ERROR_CODES = {
  URL_VALIDATION_FAILED: 'URL_VALIDATION_FAILED',
  SA_VALIDATION_FAILED: 'SA_VALIDATION_FAILED',
  DYNAMODB_ERROR: 'DYNAMODB_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DLQ_ERROR: 'DLQ_ERROR'
} as const;

export const RATE_LIMIT = {
  REQUESTS_PER_WINDOW: 10,
  WINDOW_MINUTES: 5
} as const;

// Monitoring and observability constants
export const MONITORING = {
  // CloudWatch metric namespaces
  NAMESPACES: {
    URL_REDIRECTION: 'URLRedirection',
    URL_REDIRECTION_API: 'URLRedirection/API',
    URL_REDIRECTION_LAMBDA: 'URLRedirection/Lambda',
    URL_REDIRECTION_DYNAMODB: 'URLRedirection/DynamoDB',
    URL_REDIRECTION_SQS: 'URLRedirection/SQS'
  },
  
  // CloudWatch alarm thresholds
  ALARM_THRESHOLDS: {
    LAMBDA_ERROR_COUNT: 5,
    LAMBDA_DURATION_MS: 300,
    API_4XX_ERROR_COUNT: 10,
    API_5XX_ERROR_COUNT: 1,
    DYNAMODB_THROTTLED_COUNT: 1,
    DLQ_MESSAGE_COUNT: 10,
    WAF_BLOCKED_REQUEST_COUNT: 10
  },
  
  // Performance thresholds
  PERFORMANCE: {
    REDIRECTION_TARGET_MS: 200,
    ANALYTICS_TARGET_MS: 1000,
    DLQ_PROCESSING_TARGET_MS: 5000
  },
  
  // Metric dimensions
  DIMENSIONS: {
    SERVICE: 'url-redirection-service',
    ENVIRONMENT: process.env.NODE_ENV || 'production',
    REGION: AWS_REGION
  },
  
  // Log levels
  LOG_LEVELS: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    METRIC: 'METRIC'
  },
  
  // Metric flush interval (ms)
  METRIC_FLUSH_INTERVAL_MS: 60000 // 1 minute
} as const;