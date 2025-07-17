// Unit tests for redirection Lambda function

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../index';

// Mock the shared utilities
jest.mock('../../../shared/utils', () => ({
  validateUrl: jest.fn(),
  validateSourceAttribution: jest.fn(),
  extractClientIp: jest.fn(),
  createTrackingEvent: jest.fn()
}));

// Mock the DynamoDB module
jest.mock('../../../shared/dynamodb', () => ({
  writeTrackingEvent: jest.fn()
}));

import { validateUrl, validateSourceAttribution, extractClientIp, createTrackingEvent } from '../../../shared/utils';
import { writeTrackingEvent } from '../../../shared/dynamodb';

const mockValidateUrl = validateUrl as jest.MockedFunction<typeof validateUrl>;
const mockValidateSourceAttribution = validateSourceAttribution as jest.MockedFunction<typeof validateSourceAttribution>;
const mockExtractClientIp = extractClientIp as jest.MockedFunction<typeof extractClientIp>;
const mockCreateTrackingEvent = createTrackingEvent as jest.MockedFunction<typeof createTrackingEvent>;
const mockWriteTrackingEvent = writeTrackingEvent as jest.MockedFunction<typeof writeTrackingEvent>;

describe('Redirection Lambda Handler', () => {
  let mockEvent: APIGatewayProxyEvent;
  let mockContext: Context;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockValidateUrl.mockReturnValue({
      isValid: true,
      normalizedUrl: 'https://aws.amazon.com/products'
    });
    
    mockValidateSourceAttribution.mockReturnValue({
      isValid: true,
      extractedSA: 'EdgeUp001'
    });
    
    mockExtractClientIp.mockReturnValue('192.168.1.1');
    
    // Setup tracking event mock
    mockCreateTrackingEvent.mockReturnValue({
      tracking_id: 'test-uuid-123',
      timestamp: '2024-01-15T10:30:45.123Z',
      formatted_timestamp: '2024-01-15 18:30:45',
      source_attribution: 'EdgeUp001',
      client_ip: '192.168.1.1',
      destination_url: 'https://aws.amazon.com/products'
    });
    
    // Setup DynamoDB write mock to resolve successfully
    mockWriteTrackingEvent.mockResolvedValue(undefined);

    // Create base mock event
    mockEvent = {
      resource: '/url',
      path: '/url',
      httpMethod: 'GET',
      headers: {
        'X-Forwarded-For': '192.168.1.1'
      },
      multiValueHeaders: {},
      queryStringParameters: {
        url: 'https://aws.amazon.com/products',
        sa: 'EdgeUp001'
      },
      multiValueQueryStringParameters: {},
      pathParameters: null,
      stageVariables: null,
      requestContext: {
        resourceId: 'test',
        resourcePath: '/url',
        httpMethod: 'GET',
        requestId: 'test-request-id',
        protocol: 'HTTP/1.1',
        path: '/test/url',
        stage: 'test',
        requestTimeEpoch: 1640995200000,
        requestTime: '31/Dec/2021:12:00:00 +0000',
        authorizer: {},
        identity: {
          cognitoIdentityPoolId: null,
          accountId: null,
          cognitoIdentityId: null,
          caller: null,
          sourceIp: '192.168.1.1',
          principalOrgId: null,
          accessKey: null,
          cognitoAuthenticationType: null,
          cognitoAuthenticationProvider: null,
          userArn: null,
          userAgent: 'test-agent',
          user: null,
          apiKey: null,
          apiKeyId: null,
          clientCert: null
        },
        accountId: 'test-account',
        apiId: 'test-api'
      },
      body: null,
      isBase64Encoded: false
    };

    mockContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      memoryLimitInMB: '128',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test-function',
      logStreamName: '2021/12/31/[$LATEST]test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn()
    };
  });

  describe('Successful Redirections', () => {
    test('should redirect with valid URL and SA parameters', async () => {
      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://aws.amazon.com/products');
      expect(result.headers?.['Cache-Control']).toBe('no-cache, no-store, must-revalidate');
      expect(result.headers?.['Pragma']).toBe('no-cache');
      expect(result.headers?.['Expires']).toBe('0');
      expect(result.body).toBe('');

      // Verify validation functions were called
      expect(mockValidateUrl).toHaveBeenCalledWith('https://aws.amazon.com/products');
      expect(mockValidateSourceAttribution).toHaveBeenCalledWith('EdgeUp001');
      expect(mockExtractClientIp).toHaveBeenCalledWith(
        mockEvent.headers,
        '192.168.1.1'
      );
    });

    test('should redirect with valid URL but no SA parameter', async () => {
      mockEvent.queryStringParameters = {
        url: 'https://docs.amazonaws.com/lambda'
      };

      mockValidateUrl.mockReturnValue({
        isValid: true,
        normalizedUrl: 'https://docs.amazonaws.com/lambda'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://docs.amazonaws.com/lambda');
      expect(result.body).toBe('');

      // Verify URL validation was called but SA validation was not
      expect(mockValidateUrl).toHaveBeenCalledWith('https://docs.amazonaws.com/lambda');
      expect(mockValidateSourceAttribution).not.toHaveBeenCalled();
      expect(mockExtractClientIp).toHaveBeenCalled();
    });

    test('should handle normalized URLs correctly', async () => {
      mockValidateUrl.mockReturnValue({
        isValid: true,
        normalizedUrl: 'https://aws.amazon.com/products?normalized=true'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://aws.amazon.com/products?normalized=true');
    });
  });

  describe('URL Validation Errors', () => {
    test('should return 400 when URL parameter is missing', async () => {
      mockEvent.queryStringParameters = { sa: 'EdgeUp001' };

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.headers?.['Content-Type']).toBe('application/json');
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');
      expect(responseBody.timestamp).toBeDefined();

      // Verify validation functions were not called
      expect(mockValidateUrl).not.toHaveBeenCalled();
      expect(mockValidateSourceAttribution).not.toHaveBeenCalled();
    });

    test('should return 400 when URL parameter is null', async () => {
      mockEvent.queryStringParameters = { url: null as any, sa: 'EdgeUp001' };

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');
    });

    test('should return 400 when URL validation fails', async () => {
      mockValidateUrl.mockReturnValue({
        isValid: false,
        error: 'URL must point to amazonaws.cn, amazonaws.com, or amazon.com domains'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateUrl).toHaveBeenCalledWith('https://aws.amazon.com/products');
    });

    test('should return 400 for invalid URL format', async () => {
      mockEvent.queryStringParameters = {
        url: 'invalid-url',
        sa: 'EdgeUp001'
      };

      mockValidateUrl.mockReturnValue({
        isValid: false,
        error: 'Invalid URL format'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateUrl).toHaveBeenCalledWith('invalid-url');
    });

    test('should return 400 for disallowed domains', async () => {
      mockEvent.queryStringParameters = {
        url: 'https://google.com',
        sa: 'EdgeUp001'
      };

      mockValidateUrl.mockReturnValue({
        isValid: false,
        error: 'URL must point to amazonaws.cn, amazonaws.com, or amazon.com domains'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateUrl).toHaveBeenCalledWith('https://google.com');
    });
  });

  describe('Source Attribution Validation Errors', () => {
    test('should return 400 when SA validation fails', async () => {
      mockValidateSourceAttribution.mockReturnValue({
        isValid: false,
        error: 'Source attribution must start with "EdgeUp" followed by exactly 3 digits'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateUrl).toHaveBeenCalled();
      expect(mockValidateSourceAttribution).toHaveBeenCalledWith('EdgeUp001');
    });

    test('should return 400 for invalid SA format', async () => {
      mockEvent.queryStringParameters = {
        url: 'https://aws.amazon.com/products',
        sa: 'InvalidSA'
      };

      mockValidateSourceAttribution.mockReturnValue({
        isValid: false,
        error: 'Source attribution must start with "EdgeUp" followed by exactly 3 digits'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateSourceAttribution).toHaveBeenCalledWith('InvalidSA');
    });

    test('should return 400 for SA with wrong number of digits', async () => {
      mockEvent.queryStringParameters = {
        url: 'https://aws.amazon.com/products',
        sa: 'EdgeUp1'
      };

      mockValidateSourceAttribution.mockReturnValue({
        isValid: false,
        error: 'Source attribution must start with "EdgeUp" followed by exactly 3 digits'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateSourceAttribution).toHaveBeenCalledWith('EdgeUp1');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing query parameters object', async () => {
      mockEvent.queryStringParameters = null;

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');
    });

    test('should handle missing headers', async () => {
      mockEvent.headers = null as any;

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(mockExtractClientIp).toHaveBeenCalledWith({}, '192.168.1.1');
    });

    test('should handle missing request context identity', async () => {
      mockEvent.requestContext.identity = null as any;

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(mockExtractClientIp).toHaveBeenCalledWith(mockEvent.headers, 'unknown');
    });

    test('should handle missing source IP', async () => {
      mockEvent.requestContext.identity.sourceIp = null as any;

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(mockExtractClientIp).toHaveBeenCalledWith(mockEvent.headers, 'unknown');
    });

    test('should return 500 for unexpected errors', async () => {
      mockValidateUrl.mockImplementation(() => {
        throw new Error('Unexpected validation error');
      });

      // Mock console.error to avoid test output noise
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(500);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Internal server error');
      expect(responseBody.timestamp).toBeDefined();

      expect(consoleSpy).toHaveBeenCalledWith('Error processing redirection request:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    test('should handle empty string URL parameter', async () => {
      mockEvent.queryStringParameters = { url: '', sa: 'EdgeUp001' };

      mockValidateUrl.mockReturnValue({
        isValid: false,
        error: 'URL parameter cannot be empty'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateUrl).toHaveBeenCalledWith('');
    });

    test('should handle empty string SA parameter', async () => {
      mockEvent.queryStringParameters = {
        url: 'https://aws.amazon.com/products',
        sa: ''
      };

      mockValidateSourceAttribution.mockReturnValue({
        isValid: false,
        error: 'Source attribution parameter cannot be empty'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad request');

      expect(mockValidateSourceAttribution).toHaveBeenCalledWith('');
    });
  });

  describe('Response Headers', () => {
    test('should include proper cache control headers in redirect response', async () => {
      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(result.headers).toEqual({
        Location: 'https://aws.amazon.com/products',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    });

    test('should include proper headers in error response', async () => {
      mockEvent.queryStringParameters = null;

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    });
  });

  describe('Client IP Extraction', () => {
    test('should extract client IP from various sources', async () => {
      await handler(mockEvent, mockContext);

      expect(mockExtractClientIp).toHaveBeenCalledWith(
        mockEvent.headers,
        '192.168.1.1'
      );
    });

    test('should handle different header configurations', async () => {
      mockEvent.headers = {
        'X-Forwarded-For': '10.0.0.1, 192.168.1.1',
        'User-Agent': 'test-agent'
      };

      await handler(mockEvent, mockContext);

      expect(mockExtractClientIp).toHaveBeenCalledWith(
        mockEvent.headers,
        '192.168.1.1'
      );
    });
  });

  describe('Asynchronous Tracking Functionality', () => {
    test('should create and store tracking event for successful redirect with SA', async () => {
      const result = await handler(mockEvent, mockContext);

      // Verify redirect response is returned immediately
      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://aws.amazon.com/products');
      expect(result.headers?.['X-Correlation-ID']).toBeDefined();

      // Verify tracking event was created with correct parameters
      expect(mockCreateTrackingEvent).toHaveBeenCalledWith(
        'https://aws.amazon.com/products',
        '192.168.1.1',
        'EdgeUp001'
      );

      // Allow async operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify tracking event was written to DynamoDB
      expect(mockWriteTrackingEvent).toHaveBeenCalledWith({
        tracking_id: 'test-uuid-123',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products'
      });
    });

    test('should create tracking event without SA parameter', async () => {
      mockEvent.queryStringParameters = {
        url: 'https://docs.amazonaws.com/lambda'
      };

      mockValidateUrl.mockReturnValue({
        isValid: true,
        normalizedUrl: 'https://docs.amazonaws.com/lambda'
      });

      mockCreateTrackingEvent.mockReturnValue({
        tracking_id: 'test-uuid-456',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        client_ip: '192.168.1.1',
        destination_url: 'https://docs.amazonaws.com/lambda'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);

      // Verify tracking event was created without SA
      expect(mockCreateTrackingEvent).toHaveBeenCalledWith(
        'https://docs.amazonaws.com/lambda',
        '192.168.1.1',
        undefined
      );

      // Allow async operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockWriteTrackingEvent).toHaveBeenCalledWith({
        tracking_id: 'test-uuid-456',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        client_ip: '192.168.1.1',
        destination_url: 'https://docs.amazonaws.com/lambda'
      });
    });

    test('should not block redirect response when tracking fails', async () => {
      // Mock DynamoDB write to fail
      mockWriteTrackingEvent.mockRejectedValue(new Error('DynamoDB error'));

      // Mock console.log to capture structured logging
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await handler(mockEvent, mockContext);

      // Verify redirect still works despite tracking failure
      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://aws.amazon.com/products');
      expect(result.headers?.['X-Correlation-ID']).toBeDefined();

      // Verify tracking was attempted
      expect(mockCreateTrackingEvent).toHaveBeenCalled();

      // Allow async operation to complete and fail
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify structured error logging occurred
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"ERROR"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Failed to record tracking event"')
      );

      consoleSpy.mockRestore();
    });

    test('should log successful tracking events', async () => {
      // Mock console.log to capture success logging
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);

      // Allow async operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify success was logged
      expect(consoleSpy).toHaveBeenCalledWith('Tracking event recorded: test-uuid-123');

      consoleSpy.mockRestore();
    });

    test('should not create tracking event for validation errors', async () => {
      mockEvent.queryStringParameters = { sa: 'EdgeUp001' }; // Missing URL

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);

      // Verify tracking functions were not called for invalid requests
      expect(mockCreateTrackingEvent).not.toHaveBeenCalled();
      expect(mockWriteTrackingEvent).not.toHaveBeenCalled();
    });

    test('should handle different client IP sources in tracking', async () => {
      mockEvent.headers = {
        'X-Forwarded-For': '10.0.0.1, 192.168.1.1'
      };
      mockExtractClientIp.mockReturnValue('10.0.0.1');

      mockCreateTrackingEvent.mockReturnValue({
        tracking_id: 'test-uuid-789',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        source_attribution: 'EdgeUp001',
        client_ip: '10.0.0.1',
        destination_url: 'https://aws.amazon.com/products'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);

      // Verify tracking event uses the extracted IP
      expect(mockCreateTrackingEvent).toHaveBeenCalledWith(
        'https://aws.amazon.com/products',
        '10.0.0.1',
        'EdgeUp001'
      );
    });

    test('should handle normalized URLs in tracking', async () => {
      mockValidateUrl.mockReturnValue({
        isValid: true,
        normalizedUrl: 'https://aws.amazon.com/products?normalized=true'
      });

      mockCreateTrackingEvent.mockReturnValue({
        tracking_id: 'test-uuid-normalized',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products?normalized=true'
      });

      const result = await handler(mockEvent, mockContext);

      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://aws.amazon.com/products?normalized=true');

      // Verify tracking uses normalized URL
      expect(mockCreateTrackingEvent).toHaveBeenCalledWith(
        'https://aws.amazon.com/products?normalized=true',
        '192.168.1.1',
        'EdgeUp001'
      );
    });
  });
});