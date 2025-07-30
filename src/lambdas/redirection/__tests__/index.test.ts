import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the utilities
jest.mock('../../../utils/validation', () => ({
  isValidUrl: jest.fn(),
  isValidSourceAttribution: jest.fn()
}));

jest.mock('../../../utils/ip-extraction', () => ({
  extractClientIP: jest.fn()
}));

jest.mock('../../../utils/timestamp', () => ({
  getCurrentISOTimestamp: jest.fn()
}));

// Mock crypto module
jest.mock('crypto', () => ({
  randomUUID: jest.fn()
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  SendMessageCommand: jest.fn()
}));

import { isValidUrl, isValidSourceAttribution } from '../../../utils/validation';
import { extractClientIP } from '../../../utils/ip-extraction';
import { getCurrentISOTimestamp } from '../../../utils/timestamp';
import { randomUUID } from 'crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const mockIsValidUrl = isValidUrl as jest.MockedFunction<typeof isValidUrl>;
const mockIsValidSourceAttribution = isValidSourceAttribution as jest.MockedFunction<typeof isValidSourceAttribution>;
const mockExtractClientIP = extractClientIP as jest.MockedFunction<typeof extractClientIP>;
const mockGetCurrentISOTimestamp = getCurrentISOTimestamp as jest.MockedFunction<typeof getCurrentISOTimestamp>;
const mockRandomUUID = randomUUID as jest.MockedFunction<typeof randomUUID>;

const mockSQSClient = SQSClient as jest.MockedClass<typeof SQSClient>;
const mockSendMessageCommand = SendMessageCommand as jest.MockedClass<typeof SendMessageCommand>;
const mockSend = jest.fn();

describe('Redirection Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockIsValidUrl.mockReturnValue(true);
    mockIsValidSourceAttribution.mockReturnValue(true);
    mockExtractClientIP.mockReturnValue('192.168.1.1');
    mockGetCurrentISOTimestamp.mockReturnValue('2024-01-15T10:30:45.123Z');
    mockRandomUUID.mockReturnValue('550e8400-e29b-41d4-a716-446655440000');
    
    // Mock SQS client
    mockSend.mockResolvedValue({});
    mockSQSClient.mockImplementation(() => ({
      send: mockSend
    } as any));
    
    // Set environment variable for tests
    process.env.TRACKING_QUEUE_URL = 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/test-queue';
  });

  const createMockEvent = (queryStringParameters: Record<string, string> | null = null): APIGatewayProxyEvent => ({
    resource: '/{proxy+}',
    path: '/url',
    httpMethod: 'GET',
    headers: {
      'X-Forwarded-For': '192.168.1.1'
    },
    multiValueHeaders: {},
    queryStringParameters,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      resourceId: 'test',
      resourcePath: '/{proxy+}',
      httpMethod: 'GET',
      requestId: 'test-request-id',
      protocol: 'HTTP/1.1',
      accountId: '123456789012',
      apiId: 'test-api-id',
      stage: 'test',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200,
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
        userAgent: 'test-user-agent',
        user: null,
        apiKey: null,
        apiKeyId: null,
        clientCert: null
      },
      path: '/test/url',
      domainName: 'test.execute-api.ap-northeast-1.amazonaws.com',
      domainPrefix: 'test'
    },
    body: null,
    isBase64Encoded: false
  });

  describe('Query Parameter Extraction', () => {
    it('should extract url and sa parameters correctly', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'EdgeUp001'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(302);
      expect(mockIsValidUrl).toHaveBeenCalledWith('https://aws.amazon.com/cn/blogs/china/test/');
      expect(mockIsValidSourceAttribution).toHaveBeenCalledWith('EdgeUp001');
    });

    it('should handle missing sa parameter', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(302);
      expect(mockIsValidUrl).toHaveBeenCalledWith('https://aws.amazon.com/cn/blogs/china/test/');
      expect(mockIsValidSourceAttribution).not.toHaveBeenCalled();
    });

    it('should handle null query parameters', async () => {
      const event = createMockEvent(null);

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'Bad request' });
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when url parameter is missing', async () => {
      const event = createMockEvent({
        sa: 'EdgeUp001'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toEqual({ error: 'Bad request' });
    });

    it('should return 400 when url is invalid', async () => {
      mockIsValidUrl.mockReturnValue(false);
      
      const event = createMockEvent({
        url: 'https://invalid-domain.com/test'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'Bad request' });
    });

    it('should return 400 when source attribution format is invalid', async () => {
      mockIsValidSourceAttribution.mockReturnValue(false);
      
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'InvalidFormat'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'Bad request' });
    });

    it('should pass validation with valid parameters', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'EdgeUp001'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://aws.amazon.com/cn/blogs/china/test/');
    });
  });

  describe('Tracking Data Generation', () => {
    it('should generate tracking data with all required fields', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'EdgeUp001'
      });

      await handler(event);

      expect(mockRandomUUID).toHaveBeenCalled();
      expect(mockGetCurrentISOTimestamp).toHaveBeenCalled();
      expect(mockExtractClientIP).toHaveBeenCalledWith(event);
    });

    it('should generate tracking data without source attribution', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      await handler(event);

      expect(mockRandomUUID).toHaveBeenCalled();
      expect(mockGetCurrentISOTimestamp).toHaveBeenCalled();
      expect(mockExtractClientIP).toHaveBeenCalledWith(event);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when an unexpected error occurs', async () => {
      mockIsValidUrl.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
    });

    it('should log errors appropriately', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockIsValidUrl.mockImplementation(() => {
        throw new Error('Test error');
      });

      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      await handler(event);

      // Check that structured error logging was called
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"ERROR"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Error processing redirection request"')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('SQS Integration', () => {
    it('should send tracking message to SQS with correct parameters', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'EdgeUp001'
      });

      await handler(event);

      expect(mockSendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/test-queue',
        MessageBody: JSON.stringify({
          tracking_id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: '2024-01-15T10:30:45.123Z',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test/'
        }),
        MessageAttributes: {
          'tracking_id': {
            DataType: 'String',
            StringValue: '550e8400-e29b-41d4-a716-446655440000'
          },
          'source_attribution': {
            DataType: 'String',
            StringValue: 'EdgeUp001'
          },
          'client_ip': {
            DataType: 'String',
            StringValue: '192.168.1.1'
          },
          'destination_url': {
            DataType: 'String',
            StringValue: 'https://aws.amazon.com/cn/blogs/china/test/'
          }
        },
        MessageGroupId: expect.any(String),
        MessageDeduplicationId: expect.any(String)
      });
    });

    it('should send tracking message without source attribution', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      await handler(event);

      expect(mockSendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/test-queue',
        MessageBody: JSON.stringify({
          tracking_id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: '2024-01-15T10:30:45.123Z',
          source_attribution: undefined,
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test/'
        }),
        MessageAttributes: {
          'tracking_id': {
            DataType: 'String',
            StringValue: '550e8400-e29b-41d4-a716-446655440000'
          },
          'source_attribution': {
            DataType: 'String',
            StringValue: 'none'
          },
          'client_ip': {
            DataType: 'String',
            StringValue: '192.168.1.1'
          },
          'destination_url': {
            DataType: 'String',
            StringValue: 'https://aws.amazon.com/cn/blogs/china/test/'
          }
        },
        MessageGroupId: expect.any(String),
        MessageDeduplicationId: expect.any(String)
      });
    });

    it('should handle missing TRACKING_QUEUE_URL environment variable', async () => {
      delete process.env.TRACKING_QUEUE_URL;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      // Check that structured warning logging was called
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"WARN"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"TRACKING_QUEUE_URL environment variable not set, skipping tracking message"')
      );
      expect(result.statusCode).toBe(302); // Should still redirect
      expect(mockSendMessageCommand).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      process.env.TRACKING_QUEUE_URL = 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/test-queue';
    });

    it('should handle SQS send failures gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValue(new Error('SQS send failed'));

      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      // Should still return successful redirect despite SQS failure
      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBe('https://aws.amazon.com/cn/blogs/china/test/');

      // Wait a bit for the async error handling
      await new Promise(resolve => setTimeout(resolve, 10));

      consoleSpy.mockRestore();
    });

    it('should use fire-and-forget pattern for SQS messages', async () => {
      // Mock a slow SQS response
      mockSend.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({}), 100)));

      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const startTime = Date.now();
      const result = await handler(event);
      const endTime = Date.now();

      // Should return quickly without waiting for SQS
      expect(endTime - startTime).toBeLessThan(100);
      expect(result.statusCode).toBe(302);
    });
  });

  describe('HTTP Redirect Response Generation', () => {
    it('should return 302 redirect response with proper headers', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 302,
        headers: {
          'Location': 'https://aws.amazon.com/cn/blogs/china/test/',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: ''
      });
    });

    it('should redirect to different valid URLs', async () => {
      const testUrls = [
        'https://amazonaws.cn/products/',
        'https://aws.amazon.com/solutions/',
        'https://docs.aws.amazon.com/lambda/'
      ];

      for (const url of testUrls) {
        const event = createMockEvent({ url });
        const result = await handler(event);

        expect(result.statusCode).toBe(302);
        expect(result.headers?.Location).toBe(url);
        expect(result.body).toBe('');
      }
    });

    it('should include cache control headers to prevent caching', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      expect(result.headers).toEqual(expect.objectContaining({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }));
    });

    it('should return empty body for redirect responses', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      expect(result.body).toBe('');
    });
  });

  describe('Error Response Generation', () => {
    it('should return 400 error with proper JSON format for missing URL', async () => {
      const event = createMockEvent({
        sa: 'EdgeUp001' // Missing url parameter
      });

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Bad request' })
      });
    });

    it('should return 400 error for invalid URL domain', async () => {
      mockIsValidUrl.mockReturnValue(false);
      
      const event = createMockEvent({
        url: 'https://malicious-site.com/phishing'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toEqual({ error: 'Bad request' });
    });

    it('should return 400 error for invalid source attribution format', async () => {
      mockIsValidSourceAttribution.mockReturnValue(false);
      
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'InvalidSA123'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toEqual({ error: 'Bad request' });
    });

    it('should return 500 error for internal server errors', async () => {
      mockIsValidUrl.mockImplementation(() => {
        throw new Error('Internal validation error');
      });

      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Response Format Validation', () => {
    it('should always return valid API Gateway response structure', async () => {
      const event = createMockEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });

      const result = await handler(event);

      // Validate response structure
      expect(result).toHaveProperty('statusCode');
      expect(result).toHaveProperty('headers');
      expect(result).toHaveProperty('body');
      expect(typeof result.statusCode).toBe('number');
      expect(typeof result.headers).toBe('object');
      expect(typeof result.body).toBe('string');
    });

    it('should handle edge cases in URL formatting', async () => {
      const edgeCaseUrls = [
        'https://aws.amazon.com/cn/blogs/china/test/?param=value&other=123',
        'https://amazonaws.cn/products/lambda/#features',
        'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html'
      ];

      for (const url of edgeCaseUrls) {
        const event = createMockEvent({ url });
        const result = await handler(event);

        expect(result.statusCode).toBe(302);
        expect(result.headers?.Location).toBe(url);
      }
    });
  });
});