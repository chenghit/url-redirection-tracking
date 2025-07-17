// Tests for error handling in redirection Lambda function

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../index';
import { ValidationError, DynamoDBError, sendToDLQ } from '../../../shared/error-handler';
import { writeTrackingEventAsync } from '../../../shared/dynamodb';

// Mock the dynamodb module
jest.mock('../../../shared/dynamodb', () => ({
  writeTrackingEventAsync: jest.fn(),
  writeTrackingEvent: jest.fn()
}));

// Mock the error-handler module
jest.mock('../../../shared/error-handler', () => {
  const originalModule = jest.requireActual('../../../shared/error-handler');
  return {
    ...originalModule,
    sendToDLQ: jest.fn(),
    validateUrlOrThrow: jest.fn(),
    validateSourceAttributionOrThrow: jest.fn()
  };
});

const mockWriteTrackingEventAsync = writeTrackingEventAsync as jest.MockedFunction<typeof writeTrackingEventAsync>;
const mockSendToDLQ = sendToDLQ as jest.MockedFunction<typeof sendToDLQ>;
const mockValidateUrlOrThrow = jest.requireMock('../../../shared/error-handler').validateUrlOrThrow;
const mockValidateSourceAttributionOrThrow = jest.requireMock('../../../shared/error-handler').validateSourceAttributionOrThrow;

// Mock console methods to avoid noise in tests
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {})
};

describe('Redirection Lambda Error Handling', () => {
  let mockEvent: APIGatewayProxyEvent;
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mock event
    mockEvent = {
      httpMethod: 'GET',
      path: '/url',
      queryStringParameters: {
        url: 'https://aws.amazon.com/products',
        sa: 'EdgeUp001'
      },
      headers: {
        'X-Forwarded-For': '192.168.1.1'
      },
      requestContext: {
        requestId: 'test-request-id',
        identity: {
          sourceIp: '192.168.1.1'
        }
      }
    } as any;

    // Set up mock context
    mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'redirection-function',
      getRemainingTimeInMillis: () => 30000
    } as any;

    // Set up environment variables
    process.env.TRACKING_DLQ_URL = 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/url-redirection-tracking-dlq';
    
    // Set up default mock implementations
    mockValidateUrlOrThrow.mockImplementation((url) => url);
    mockValidateSourceAttributionOrThrow.mockImplementation((sa) => sa);
    mockWriteTrackingEventAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.TRACKING_DLQ_URL;
  });

  afterAll(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  test('should handle URL validation errors with proper status code', async () => {
    // Mock URL validation to throw error
    mockValidateUrlOrThrow.mockImplementation(() => {
      throw new ValidationError('Invalid URL format', { field: 'url' });
    });

    const response = await handler(mockEvent, mockContext);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Invalid URL format');
    expect(JSON.parse(response.body).correlation_id).toBeDefined();
    expect(mockSendToDLQ).not.toHaveBeenCalled(); // Validation errors don't go to DLQ
  });

  test('should handle source attribution validation errors', async () => {
    // Mock SA validation to throw error
    mockValidateSourceAttributionOrThrow.mockImplementation(() => {
      throw new ValidationError('Invalid source attribution format', { field: 'sa' });
    });

    const response = await handler(mockEvent, mockContext);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Invalid source attribution format');
  });

  test('should handle missing URL parameter', async () => {
    // Remove URL from query parameters
    mockEvent.queryStringParameters = { sa: 'EdgeUp001' };

    const response = await handler(mockEvent, mockContext);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('URL parameter is required');
  });

  test('should handle DynamoDB errors and send to DLQ', async () => {
    // Mock tracking write to throw error
    const dbError = new DynamoDBError('Failed to write tracking data', new Error('Connection error'));
    mockWriteTrackingEventAsync.mockRejectedValue(dbError);

    const response = await handler(mockEvent, mockContext);

    // Should still redirect despite tracking error
    expect(response.statusCode).toBe(302);
    expect(response.headers?.Location).toBe('https://aws.amazon.com/products');
    
    // Should have attempted to send to DLQ
    expect(mockSendToDLQ).toHaveBeenCalledWith(
      expect.objectContaining({
        destination_url: 'https://aws.amazon.com/products',
        source_attribution: 'EdgeUp001'
      }),
      expect.any(Object),
      expect.any(Object),
      expect.any(String)
    );
  });

  test('should include correlation ID in all responses', async () => {
    const response = await handler(mockEvent, mockContext);

    expect(response.headers?.['X-Correlation-ID']).toBeDefined();
    
    // Error responses should also include correlation ID
    mockValidateUrlOrThrow.mockImplementation(() => {
      throw new ValidationError('Invalid URL');
    });
    
    const errorResponse = await handler(mockEvent, mockContext);
    
    expect(errorResponse.headers?.['X-Correlation-ID']).toBeDefined();
    expect(JSON.parse(errorResponse.body).correlation_id).toBeDefined();
  });

  test('should handle unexpected errors gracefully', async () => {
    // Simulate unexpected error
    mockValidateUrlOrThrow.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const response = await handler(mockEvent, mockContext);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toBe('Internal server error');
  });
});