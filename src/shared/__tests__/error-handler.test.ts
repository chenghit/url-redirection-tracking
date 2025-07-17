// Unit tests for error handler utilities

import { 
  AppError, 
  ValidationError, 
  DynamoDBError, 
  RateLimitError,
  NetworkError,
  ConfigurationError,
  createErrorResponse,
  createErrorResponseFromAppError,
  handleError,
  validateUrlOrThrow,
  validateSourceAttributionOrThrow,
  wrapDynamoDBOperation,
  sendToDLQ,
  executeWithDLQFallback
} from '../error-handler';
import { Logger } from '../logger';
import { HTTP_STATUS_CODES, ERROR_CODES } from '../constants';

// Mock SQS client
jest.mock('@aws-sdk/client-sqs', () => {
  const mockSend = jest.fn().mockResolvedValue({});
  const mockSQSClient = jest.fn().mockImplementation(() => ({
    send: mockSend
  }));
  const mockSendMessageCommand = jest.fn();
  
  return {
    SQSClient: mockSQSClient,
    SendMessageCommand: mockSendMessageCommand,
    __mockSend: mockSend
  };
});

// Mock console methods to avoid noise in tests
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {})
};

describe('Error Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TRACKING_DLQ_URL = 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/url-redirection-tracking-dlq';
  });

  afterEach(() => {
    delete process.env.TRACKING_DLQ_URL;
  });

  afterAll(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('Error Classes', () => {
    test('AppError should initialize with correct properties', () => {
      const error = new AppError(
        'Test error message',
        'TEST_ERROR',
        HTTP_STATUS_CODES.BAD_REQUEST,
        { test: 'details' },
        true,
        'test-correlation-id'
      );

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
      expect(error.details).toEqual({ test: 'details' });
      expect(error.isOperational).toBe(true);
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.name).toBe('AppError');
      expect(error.stack).toBeDefined();
    });

    test('ValidationError should initialize with correct properties', () => {
      const error = new ValidationError(
        'Invalid URL',
        { field: 'url', provided: 'invalid' },
        'test-correlation-id'
      );

      expect(error.message).toBe('Invalid URL');
      expect(error.code).toBe(ERROR_CODES.URL_VALIDATION_FAILED);
      expect(error.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
      expect(error.details).toEqual({ field: 'url', provided: 'invalid' });
      expect(error.isOperational).toBe(true);
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.name).toBe('ValidationError');
    });

    test('DynamoDBError should initialize with correct properties', () => {
      const originalError = new Error('DB connection failed');
      const error = new DynamoDBError(
        'Failed to write to DynamoDB',
        originalError,
        { operation: 'writeItem' },
        'test-correlation-id'
      );

      expect(error.message).toBe('Failed to write to DynamoDB');
      expect(error.code).toBe(ERROR_CODES.DYNAMODB_ERROR);
      expect(error.statusCode).toBe(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
      expect(error.details).toEqual({ 
        operation: 'writeItem',
        originalError: 'DB connection failed'
      });
      expect(error.isOperational).toBe(false); // DynamoDB errors are non-operational
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.name).toBe('DynamoDBError');
    });

    test('RateLimitError should initialize with correct properties', () => {
      const error = new RateLimitError('Rate limit exceeded', 'test-correlation-id');

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe(ERROR_CODES.RATE_LIMIT_ERROR);
      expect(error.statusCode).toBe(HTTP_STATUS_CODES.FORBIDDEN);
      expect(error.isOperational).toBe(true);
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.name).toBe('RateLimitError');
    });

    test('NetworkError should initialize with correct properties', () => {
      const error = new NetworkError(
        'Network connection failed',
        { endpoint: 'api.example.com' },
        'test-correlation-id'
      );

      expect(error.message).toBe('Network connection failed');
      expect(error.code).toBe(ERROR_CODES.NETWORK_ERROR);
      expect(error.statusCode).toBe(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
      expect(error.details).toEqual({ endpoint: 'api.example.com' });
      expect(error.isOperational).toBe(true);
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.name).toBe('NetworkError');
    });

    test('ConfigurationError should initialize with correct properties', () => {
      const error = new ConfigurationError(
        'Missing required environment variable',
        { variable: 'API_KEY' },
        'test-correlation-id'
      );

      expect(error.message).toBe('Missing required environment variable');
      expect(error.code).toBe(ERROR_CODES.CONFIGURATION_ERROR);
      expect(error.statusCode).toBe(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
      expect(error.details).toEqual({ variable: 'API_KEY' });
      expect(error.isOperational).toBe(false); // Configuration errors are not operational
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.name).toBe('ConfigurationError');
    });

    test('AppError.withCorrelationId should create a new error with correlation ID', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      const errorWithCorrelation = error.withCorrelationId('new-correlation-id');

      expect(errorWithCorrelation).not.toBe(error); // Should be a new instance
      expect(errorWithCorrelation.message).toBe('Test error');
      expect(errorWithCorrelation.code).toBe('TEST_ERROR');
      expect(errorWithCorrelation.correlationId).toBe('new-correlation-id');
    });

    test('AppError.toJSON should serialize error correctly', () => {
      const error = new AppError(
        'Test error',
        'TEST_ERROR',
        HTTP_STATUS_CODES.BAD_REQUEST,
        { test: 'details' },
        true,
        'test-correlation-id'
      );

      const json = error.toJSON();
      
      expect(json).toEqual({
        name: 'AppError',
        message: 'Test error',
        code: 'TEST_ERROR',
        statusCode: HTTP_STATUS_CODES.BAD_REQUEST,
        details: { test: 'details' },
        isOperational: true,
        correlationId: 'test-correlation-id',
        stack: expect.any(String)
      });
    });
  });

  describe('Error Response Functions', () => {
    test('createErrorResponse should create a properly formatted API Gateway response', () => {
      const response = createErrorResponse(
        HTTP_STATUS_CODES.BAD_REQUEST,
        'Invalid input',
        'test-correlation-id',
        'VALIDATION_ERROR',
        { field: 'email' }
      );

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Correlation-ID': 'test-correlation-id'
      });

      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: 'Invalid input',
        timestamp: expect.any(String),
        correlation_id: 'test-correlation-id',
        error_code: 'VALIDATION_ERROR',
        details: { field: 'email' }
      });
    });

    test('createErrorResponseFromAppError should create response from AppError', () => {
      const error = new AppError(
        'Test error',
        'TEST_ERROR',
        HTTP_STATUS_CODES.BAD_REQUEST,
        { test: 'details' }
      );

      const response = createErrorResponseFromAppError(error, 'test-correlation-id');

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
      
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: 'Test error',
        timestamp: expect.any(String),
        correlation_id: 'test-correlation-id',
        error_code: 'TEST_ERROR',
        details: { test: 'details' }
      });
    });

    test('handleError should handle AppError correctly', () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const error = new ValidationError('Invalid URL', { field: 'url' });
      
      const loggerInfoSpy = jest.spyOn(logger, 'info');
      const loggerWarnSpy = jest.spyOn(logger, 'warn');
      const loggerErrorSpy = jest.spyOn(logger, 'error');

      const response = handleError(error, logger, 'validateUrl');

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST);
      expect(loggerWarnSpy).toHaveBeenCalled(); // Operational errors are logged as warnings
      expect(loggerErrorSpy).not.toHaveBeenCalled();
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid URL');
      expect(body.correlation_id).toBe('test-correlation-id');
    });

    test('handleError should handle non-operational AppError as error', () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const error = new DynamoDBError('DB connection failed', new Error('Network error'));
      
      const loggerWarnSpy = jest.spyOn(logger, 'warn');
      const loggerErrorSpy = jest.spyOn(logger, 'error');

      const response = handleError(error, logger, 'writeToDb');

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalled(); // Non-operational errors are logged as errors
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('DB connection failed');
    });

    test('handleError should handle unknown errors', () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const error = new Error('Unknown error');
      
      const loggerErrorSpy = jest.spyOn(logger, 'error');

      const response = handleError(error, logger, 'unknownOperation');

      expect(response.statusCode).toBe(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
      expect(loggerErrorSpy).toHaveBeenCalled();
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
      expect(body.details.originalError).toBe('Unknown error');
    });
  });

  describe('Validation Functions', () => {
    test('validateUrlOrThrow should accept valid URLs', () => {
      const validUrls = [
        'https://aws.amazon.com/products',
        'https://console.amazonaws.com/console/home',
        'http://docs.amazonaws.cn/documentation'
      ];

      validUrls.forEach(url => {
        expect(() => validateUrlOrThrow(url)).not.toThrow();
        expect(validateUrlOrThrow(url)).toBe(url);
      });
    });

    test('validateUrlOrThrow should throw for invalid URLs', () => {
      const invalidUrls = [
        null,
        undefined,
        '',
        'not-a-url',
        'ftp://aws.amazon.com', // Invalid protocol
        'https://google.com', // Invalid domain
        'https://malicious.amazonaws.com.attacker.com' // Domain spoofing
      ];

      invalidUrls.forEach(url => {
        expect(() => validateUrlOrThrow(url as any)).toThrow(ValidationError);
      });
    });

    test('validateSourceAttributionOrThrow should accept valid source attributions', () => {
      const validSAs = [
        'EdgeUp001',
        'EdgeUp123',
        'EdgeUp999'
      ];

      validSAs.forEach(sa => {
        expect(() => validateSourceAttributionOrThrow(sa)).not.toThrow();
        expect(validateSourceAttributionOrThrow(sa)).toBe(sa);
      });
    });

    test('validateSourceAttributionOrThrow should return undefined for null/undefined', () => {
      expect(validateSourceAttributionOrThrow(null)).toBeUndefined();
      expect(validateSourceAttributionOrThrow(undefined)).toBeUndefined();
    });

    test('validateSourceAttributionOrThrow should throw for invalid source attributions', () => {
      const invalidSAs = [
        '',
        'edgeup001', // Lowercase
        'EdgeUp01', // Too few digits
        'EdgeUp1234', // Too many digits
        'OtherPrefix123', // Wrong prefix
        123 // Wrong type
      ];

      invalidSAs.forEach(sa => {
        expect(() => validateSourceAttributionOrThrow(sa as any)).toThrow(ValidationError);
      });
    });
  });

  describe('DynamoDB Operation Wrapper', () => {
    test('wrapDynamoDBOperation should execute operation successfully', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await wrapDynamoDBOperation(operation, 'testOperation', logger);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('wrapDynamoDBOperation should retry on retryable errors', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const error = new Error('Throttling');
      error.name = 'ThrottlingException';
      
      const operation = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');
      
      const loggerWarnSpy = jest.spyOn(logger, 'warn');
      
      const result = await wrapDynamoDBOperation(operation, 'testOperation', logger);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('testOperation attempt 1 failed'),
        expect.objectContaining({
          error: 'Throttling',
          errorCode: 'ThrottlingException',
          isRetryable: true
        })
      );
    });

    test('wrapDynamoDBOperation should throw after max retries', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const error = new Error('Throttling');
      error.name = 'ThrottlingException';
      
      const operation = jest.fn().mockRejectedValue(error);
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      
      await expect(wrapDynamoDBOperation(operation, 'testOperation', logger, 2))
        .rejects.toThrow(DynamoDBError);
      
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    test('wrapDynamoDBOperation should not retry on non-retryable errors', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const error = new Error('Validation failed');
      error.name = 'ValidationException';
      
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(wrapDynamoDBOperation(operation, 'testOperation', logger))
        .rejects.toThrow(DynamoDBError);
      
      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('Dead Letter Queue Functions', () => {
    test('sendToDLQ should send message to DLQ', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const payload = { tracking_id: 'test-123', data: 'test' };
      const error = new Error('Test error');
      
      await sendToDLQ(payload, error, logger, 'test-correlation-id');
      
      const mockSQS = jest.requireMock('@aws-sdk/client-sqs');
      expect(mockSQS.SendMessageCommand).toHaveBeenCalledTimes(1);
      expect(mockSQS.SendMessageCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          MessageBody: expect.stringContaining('test-123'),
          MessageAttributes: expect.objectContaining({
            'tracking_id': expect.objectContaining({
              StringValue: 'test-123'
            }),
            'correlation_id': expect.objectContaining({
              StringValue: 'test-correlation-id'
            })
          })
        })
      );
    });

    test('sendToDLQ should handle missing DLQ URL', async () => {
      delete process.env.TRACKING_DLQ_URL;
      
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const payload = { tracking_id: 'test-123', data: 'test' };
      const error = new Error('Test error');
      
      await sendToDLQ(payload, error, logger, 'test-correlation-id');
      
      const mockSQS = jest.requireMock('@aws-sdk/client-sqs');
      expect(mockSQS.SendMessageCommand).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send to DLQ'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('executeWithDLQFallback should execute operation successfully', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const payload = { tracking_id: 'test-123', data: 'test' };
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await executeWithDLQFallback(
        operation,
        payload,
        'testOperation',
        logger
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('executeWithDLQFallback should send to DLQ on failure', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const payload = { tracking_id: 'test-123', data: 'test' };
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);
      
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const mockSQS = jest.requireMock('@aws-sdk/client-sqs');
      
      const result = await executeWithDLQFallback(
        operation,
        payload,
        'testOperation',
        logger
      );
      
      expect(result).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(mockSQS.SendMessageCommand).toHaveBeenCalledTimes(1);
    });

    test('executeWithDLQFallback should throw when shouldThrow is true', async () => {
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      const payload = { tracking_id: 'test-123', data: 'test' };
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(executeWithDLQFallback(
        operation,
        payload,
        'testOperation',
        logger,
        true // shouldThrow
      )).rejects.toThrow('Operation failed');
      
      const mockSQS = jest.requireMock('@aws-sdk/client-sqs');
      expect(mockSQS.SendMessageCommand).toHaveBeenCalledTimes(1);
    });
  });
});