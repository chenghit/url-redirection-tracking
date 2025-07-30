/**
 * Integration tests for the URL redirection tracking system
 * Tests end-to-end flows including redirection, SQS to DynamoDB persistence, and analytics queries
 */

import { APIGatewayProxyEvent, SQSEvent, SQSRecord } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Import handlers
import { handler as redirectionHandler } from '../lambdas/redirection/index';
import { handler as trackingHandler } from '../lambdas/tracking/index';
import { handler as analyticsHandler } from '../lambdas/analytics/index';

// Import types
import { TrackingEvent } from '../types';

// Create mocks for AWS SDK clients
const sqsClientMock = mockClient(SQSClient);
const dynamoClientMock = mockClient(DynamoDBClient);
const dynamoDocClientMock = mockClient(DynamoDBDocumentClient);

// Mock the crypto module's randomUUID function
jest.mock('crypto', () => ({
  randomUUID: jest.fn()
}));

// Import the mocked randomUUID for type safety
import { randomUUID } from 'crypto';

describe('Integration Tests - URL Redirection Tracking System', () => {
  const mockTrackingId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTimestamp = '2024-01-15T10:30:45.123Z';
  const mockFormattedTimestamp = '2024-01-15 18:30:45';
  
  beforeAll(() => {
    // Set environment variables
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.TRACKING_QUEUE_URL = 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/test-queue';
    process.env.DYNAMODB_TABLE_NAME = 'test-tracking-table';
  });

  beforeEach(() => {
    // Reset all mocks
    sqsClientMock.reset();
    dynamoClientMock.reset();
    dynamoDocClientMock.reset();
    jest.clearAllMocks();
    
    // Mock randomUUID to return consistent value
    (randomUUID as jest.Mock).mockReturnValue(mockTrackingId);
    
    // Mock Date.now for consistent timestamps
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockTimestamp);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('End-to-End Redirection Flow', () => {
    it('should complete full redirection flow with tracking', async () => {
      // Mock SQS send success
      sqsClientMock.on(SendMessageCommand).resolves({
        MessageId: 'test-message-id'
      } as any);

      // Create redirection request event
      const redirectionEvent: APIGatewayProxyEvent = createRedirectionEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'EdgeUp001'
      });

      // Execute redirection handler
      const redirectionResult = await redirectionHandler(redirectionEvent);

      // Verify redirection response
      expect(redirectionResult.statusCode).toBe(302);
      expect(redirectionResult.headers?.Location).toBe('https://aws.amazon.com/cn/blogs/china/test/');
      expect(redirectionResult.body).toBe('');

      // Verify SQS message was sent
      expect(sqsClientMock.commandCalls(SendMessageCommand)).toHaveLength(1);
      const sqsCall = sqsClientMock.commandCalls(SendMessageCommand)[0];
      const messageBody = JSON.parse(sqsCall.args[0].input.MessageBody!);
      
      expect(messageBody).toEqual({
        tracking_id: mockTrackingId,
        timestamp: mockTimestamp,
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/china/test/'
      });
    });

    it('should handle redirection without source attribution', async () => {
      // Mock SQS send success
      sqsClientMock.on(SendMessageCommand).resolves({
        MessageId: 'test-message-id'
      } as any);

      // Create redirection request event without SA
      const redirectionEvent: APIGatewayProxyEvent = createRedirectionEvent({
        url: 'https://amazonaws.cn/products/lambda/'
      });

      // Execute redirection handler
      const redirectionResult = await redirectionHandler(redirectionEvent);

      // Verify redirection response
      expect(redirectionResult.statusCode).toBe(302);
      expect(redirectionResult.headers?.Location).toBe('https://amazonaws.cn/products/lambda/');

      // Verify SQS message was sent without source attribution
      const sqsCall = sqsClientMock.commandCalls(SendMessageCommand)[0];
      const messageBody = JSON.parse(sqsCall.args[0].input.MessageBody!);
      
      expect(messageBody.source_attribution).toBeUndefined();
      expect(messageBody.destination_url).toBe('https://amazonaws.cn/products/lambda/');
    });

    it('should reject invalid URLs', async () => {
      // Create redirection request with invalid URL
      const redirectionEvent: APIGatewayProxyEvent = createRedirectionEvent({
        url: 'https://malicious-site.com/phishing',
        sa: 'EdgeUp001'
      });

      // Execute redirection handler
      const redirectionResult = await redirectionHandler(redirectionEvent);

      // Verify error response
      expect(redirectionResult.statusCode).toBe(400);
      expect(JSON.parse(redirectionResult.body)).toEqual({ error: 'Bad request' });

      // Verify no SQS message was sent
      expect(sqsClientMock.commandCalls(SendMessageCommand)).toHaveLength(0);
    });

    it('should reject invalid source attribution format', async () => {
      // Create redirection request with invalid SA
      const redirectionEvent: APIGatewayProxyEvent = createRedirectionEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'InvalidFormat123'
      });

      // Execute redirection handler
      const redirectionResult = await redirectionHandler(redirectionEvent);

      // Verify error response
      expect(redirectionResult.statusCode).toBe(400);
      expect(JSON.parse(redirectionResult.body)).toEqual({ error: 'Bad request' });

      // Verify no SQS message was sent
      expect(sqsClientMock.commandCalls(SendMessageCommand)).toHaveLength(0);
    });
  });

  describe('SQS to DynamoDB Data Persistence', () => {
    it('should successfully persist tracking data from SQS to DynamoDB', async () => {
      // Mock DynamoDB batch write success
      dynamoDocClientMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: {}
      });

      // Create SQS event with tracking message
      const trackingMessage = {
        tracking_id: mockTrackingId,
        timestamp: mockTimestamp,
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/china/test/'
      };

      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', trackingMessage)]
      };

      // Execute tracking handler
      const trackingResult = await trackingHandler(sqsEvent);

      // Verify successful processing
      expect(trackingResult.batchItemFailures).toHaveLength(0);

      // Verify DynamoDB write was called with correct data
      expect(dynamoDocClientMock.commandCalls(BatchWriteCommand)).toHaveLength(1);
      const dynamoCall = dynamoDocClientMock.commandCalls(BatchWriteCommand)[0];
      const putRequest = dynamoCall.args[0].input.RequestItems!['test-tracking-table'][0].PutRequest!;
      
      expect(putRequest.Item).toEqual(expect.objectContaining({
        tracking_id: mockTrackingId,
        timestamp: mockTimestamp,
        formatted_timestamp: expect.any(String),
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/china/test/',
        ttl: expect.any(Number)
      }));
    });

    it('should handle multiple messages in a batch', async () => {
      // Mock DynamoDB batch write success
      dynamoDocClientMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: {}
      });

      // Create multiple tracking messages
      const messages = [
        {
          tracking_id: 'uuid-1',
          timestamp: '2024-01-15T10:30:45.123Z',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test1/'
        },
        {
          tracking_id: 'uuid-2',
          timestamp: '2024-01-15T10:31:45.123Z',
          source_attribution: 'EdgeUp002',
          client_ip: '192.168.1.2',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test2/'
        },
        {
          tracking_id: 'uuid-3',
          timestamp: '2024-01-15T10:32:45.123Z',
          client_ip: '192.168.1.3',
          destination_url: 'https://amazonaws.cn/products/lambda/'
        }
      ];

      const sqsEvent: SQSEvent = {
        Records: messages.map((msg, index) => createSQSRecord(`msg-${index + 1}`, msg))
      };

      // Execute tracking handler
      const trackingResult = await trackingHandler(sqsEvent);

      // Verify successful processing
      expect(trackingResult.batchItemFailures).toHaveLength(0);

      // Verify all messages were written to DynamoDB
      const dynamoCall = dynamoDocClientMock.commandCalls(BatchWriteCommand)[0];
      const putRequests = dynamoCall.args[0].input.RequestItems!['test-tracking-table'];
      
      expect(putRequests).toHaveLength(3);
      expect(putRequests[0].PutRequest!.Item!.tracking_id).toBe('uuid-1');
      expect(putRequests[1].PutRequest!.Item!.tracking_id).toBe('uuid-2');
      expect(putRequests[2].PutRequest!.Item!.tracking_id).toBe('uuid-3');
    });

    it('should handle partial DynamoDB failures', async () => {
      // Mock DynamoDB partial failure
      dynamoDocClientMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: {
          'test-tracking-table': [
            {
              PutRequest: {
                Item: { tracking_id: 'uuid-1' }
              }
            }
          ]
        }
      });

      const messages = [
        {
          tracking_id: 'uuid-1',
          timestamp: '2024-01-15T10:30:45.123Z',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test1/'
        },
        {
          tracking_id: 'uuid-2',
          timestamp: '2024-01-15T10:31:45.123Z',
          source_attribution: 'EdgeUp002',
          client_ip: '192.168.1.2',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test2/'
        }
      ];

      const sqsEvent: SQSEvent = {
        Records: messages.map((msg, index) => createSQSRecord(`msg-${index + 1}`, msg))
      };

      // Execute tracking handler
      const trackingResult = await trackingHandler(sqsEvent);

      // Verify partial failure handling
      expect(trackingResult.batchItemFailures).toHaveLength(1);
      expect(trackingResult.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should skip invalid messages and continue processing', async () => {
      // Mock DynamoDB batch write success
      dynamoDocClientMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: {}
      });

      const validMessage = {
        tracking_id: 'uuid-valid',
        timestamp: '2024-01-15T10:30:45.123Z',
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/china/test/'
      };

      const invalidMessage = {
        tracking_id: 'uuid-invalid'
        // Missing required fields
      };

      const sqsEvent: SQSEvent = {
        Records: [
          createSQSRecord('msg-valid', validMessage),
          createSQSRecord('msg-invalid', invalidMessage)
        ]
      };

      // Execute tracking handler
      const trackingResult = await trackingHandler(sqsEvent);

      // Verify processing continues despite invalid message
      expect(trackingResult.batchItemFailures).toHaveLength(0);

      // Verify only valid message was written to DynamoDB
      const dynamoCall = dynamoDocClientMock.commandCalls(BatchWriteCommand)[0];
      const putRequests = dynamoCall.args[0].input.RequestItems!['test-tracking-table'];
      
      expect(putRequests).toHaveLength(1);
      expect(putRequests[0].PutRequest!.Item!.tracking_id).toBe('uuid-valid');
    });
  });

  describe('Analytics Query Functionality', () => {
    it('should query tracking events successfully', async () => {
      // Mock DynamoDB scan response
      const mockEvents: TrackingEvent[] = [
        {
          tracking_id: 'uuid-1',
          timestamp: '2024-01-15T10:30:45.123Z',
          formatted_timestamp: '2024-01-15 18:30:45',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test1/'
        },
        {
          tracking_id: 'uuid-2',
          timestamp: '2024-01-15T10:31:45.123Z',
          formatted_timestamp: '2024-01-15 18:31:45',
          source_attribution: 'EdgeUp002',
          client_ip: '192.168.1.2',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test2/'
        }
      ];

      dynamoDocClientMock.on(ScanCommand).resolves({
        Items: mockEvents,
        Count: 2
      });

      // Create analytics query event
      const analyticsEvent: APIGatewayProxyEvent = createAnalyticsEvent('/analytics/query', {
        limit: '10',
        sort_order: 'desc'
      });

      // Execute analytics handler
      const analyticsResult = await analyticsHandler(analyticsEvent);

      // Verify successful response
      expect(analyticsResult.statusCode).toBe(200);
      const response = JSON.parse(analyticsResult.body);
      
      expect(response.data.events).toHaveLength(2);
      expect(response.data.total_count).toBe(2);
      expect(response.data.has_more).toBe(false);
      expect(response.timestamp).toBeDefined();
    });

    it('should query by source attribution using GSI1', async () => {
      // Mock DynamoDB query response for GSI1
      const mockEvents: TrackingEvent[] = [
        {
          tracking_id: 'uuid-1',
          timestamp: '2024-01-15T10:30:45.123Z',
          formatted_timestamp: '2024-01-15 18:30:45',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test1/'
        }
      ];

      dynamoDocClientMock.on(QueryCommand).resolves({
        Items: mockEvents,
        Count: 1
      });

      // Create analytics query event with source attribution filter
      const analyticsEvent: APIGatewayProxyEvent = createAnalyticsEvent('/analytics/query', {
        source_attribution: 'EdgeUp001'
      });

      // Execute analytics handler
      const analyticsResult = await analyticsHandler(analyticsEvent);

      // Verify successful response
      expect(analyticsResult.statusCode).toBe(200);
      const response = JSON.parse(analyticsResult.body);
      
      expect(response.data.events).toHaveLength(1);
      expect(response.data.events[0].source_attribution).toBe('EdgeUp001');

      // Verify GSI1 query was used
      expect(dynamoDocClientMock.commandCalls(QueryCommand)).toHaveLength(1);
      const queryCall = dynamoDocClientMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.IndexName).toBe('GSI1-SourceAttribution');
    });

    it('should handle pagination correctly', async () => {
      // Mock DynamoDB response with more data than limit
      const mockEvents: TrackingEvent[] = Array.from({ length: 5 }, (_, i) => ({
        tracking_id: `uuid-${i + 1}`,
        timestamp: `2024-01-15T10:3${i}:45.123Z`,
        formatted_timestamp: `2024-01-15 18:3${i}:45`,
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: `https://aws.amazon.com/cn/blogs/china/test${i + 1}/`
      }));

      dynamoDocClientMock.on(ScanCommand).resolves({
        Items: mockEvents,
        Count: 5
      });

      // Create analytics query event with pagination
      const analyticsEvent: APIGatewayProxyEvent = createAnalyticsEvent('/analytics/query', {
        limit: '3',
        offset: '1'
      });

      // Execute analytics handler
      const analyticsResult = await analyticsHandler(analyticsEvent);

      // Verify pagination
      expect(analyticsResult.statusCode).toBe(200);
      const response = JSON.parse(analyticsResult.body);
      
      expect(response.data.events).toHaveLength(3);
      expect(response.data.total_count).toBe(5);
      expect(response.data.has_more).toBe(true);
      // Verify pagination is working (should skip first item due to offset=1)
      expect(response.data.events[0].tracking_id).not.toBe('uuid-1');
    });

    it('should aggregate statistics by source attribution', async () => {
      // Mock DynamoDB response for aggregation
      const mockEvents: TrackingEvent[] = [
        {
          tracking_id: 'uuid-1',
          timestamp: '2024-01-15T10:30:45.123Z',
          formatted_timestamp: '2024-01-15 18:30:45',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test1/'
        },
        {
          tracking_id: 'uuid-2',
          timestamp: '2024-01-15T10:31:45.123Z',
          formatted_timestamp: '2024-01-15 18:31:45',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.2',
          destination_url: 'https://aws.amazon.com/cn/blogs/china/test2/'
        },
        {
          tracking_id: 'uuid-3',
          timestamp: '2024-01-15T10:32:45.123Z',
          formatted_timestamp: '2024-01-15 18:32:45',
          source_attribution: 'EdgeUp002',
          client_ip: '192.168.1.3',
          destination_url: 'https://amazonaws.cn/products/lambda/'
        }
      ];

      dynamoDocClientMock.on(ScanCommand).resolves({
        Items: mockEvents,
        Count: 3
      });

      // Create analytics aggregate event
      const analyticsEvent: APIGatewayProxyEvent = createAnalyticsEvent('/analytics/aggregate');

      // Execute analytics handler
      const analyticsResult = await analyticsHandler(analyticsEvent);

      // Verify aggregation response
      expect(analyticsResult.statusCode).toBe(200);
      const response = JSON.parse(analyticsResult.body);
      
      expect(response.data).toHaveLength(2); // Two source attributions
      
      // Find EdgeUp001 aggregate
      const edgeUp001 = response.data.find((item: any) => item.source_attribution === 'EdgeUp001');
      expect(edgeUp001).toBeDefined();
      expect(edgeUp001.count).toBe(2);
      expect(edgeUp001.unique_ips).toBe(2);
      expect(edgeUp001.destinations).toHaveLength(2);
      
      // Find EdgeUp002 aggregate
      const edgeUp002 = response.data.find((item: any) => item.source_attribution === 'EdgeUp002');
      expect(edgeUp002).toBeDefined();
      expect(edgeUp002.count).toBe(1);
      expect(edgeUp002.unique_ips).toBe(1);
      expect(edgeUp002.destinations).toHaveLength(1);
    });

    // Note: API key authentication is handled by API Gateway, not Lambda
    // Invalid API keys will be rejected by API Gateway before reaching the Lambda function

    it('should validate query parameters', async () => {
      // Create analytics event with invalid parameters
      const analyticsEvent: APIGatewayProxyEvent = createAnalyticsEvent('/analytics/query', {
        limit: '2000', // Exceeds maximum
        start_date: 'invalid-date-format'
      });

      // Execute analytics handler
      const analyticsResult = await analyticsHandler(analyticsEvent);

      // Verify validation error
      expect(analyticsResult.statusCode).toBe(400);
      expect(JSON.parse(analyticsResult.body)).toEqual({ error: 'Bad request' });
    });
  });

  describe('Complete End-to-End Flow', () => {
    it('should complete full flow from redirection to analytics query', async () => {
      // Step 1: Mock successful redirection with SQS message
      sqsClientMock.on(SendMessageCommand).resolves({
        MessageId: 'test-message-id'
      } as any);

      const redirectionEvent: APIGatewayProxyEvent = createRedirectionEvent({
        url: 'https://aws.amazon.com/cn/blogs/china/test/',
        sa: 'EdgeUp001'
      });

      const redirectionResult = await redirectionHandler(redirectionEvent);
      expect(redirectionResult.statusCode).toBe(302);

      // Step 2: Mock successful tracking persistence
      dynamoDocClientMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: {}
      });

      const trackingMessage = {
        tracking_id: mockTrackingId,
        timestamp: mockTimestamp,
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/china/test/'
      };

      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', trackingMessage)]
      };

      const trackingResult = await trackingHandler(sqsEvent);
      expect(trackingResult.batchItemFailures).toHaveLength(0);

      // Step 3: Mock analytics query returning the persisted data
      const persistedEvent: TrackingEvent = {
        tracking_id: mockTrackingId,
        timestamp: mockTimestamp,
        formatted_timestamp: mockFormattedTimestamp,
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/china/test/',
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
      };

      dynamoDocClientMock.on(QueryCommand).resolves({
        Items: [persistedEvent],
        Count: 1
      });

      const analyticsEvent: APIGatewayProxyEvent = createAnalyticsEvent('/analytics/query', {
        source_attribution: 'EdgeUp001'
      });

      const analyticsResult = await analyticsHandler(analyticsEvent);
      expect(analyticsResult.statusCode).toBe(200);

      const analyticsResponse = JSON.parse(analyticsResult.body);
      expect(analyticsResponse.data.events).toHaveLength(1);
      expect(analyticsResponse.data.events[0].tracking_id).toBe(mockTrackingId);
      expect(analyticsResponse.data.events[0].source_attribution).toBe('EdgeUp001');
      expect(analyticsResponse.data.events[0].destination_url).toBe('https://aws.amazon.com/cn/blogs/china/test/');
    });
  });

  // Helper functions
  function createRedirectionEvent(queryParams: Record<string, string>): APIGatewayProxyEvent {
    return {
      resource: '/{proxy+}',
      path: '/url',
      httpMethod: 'GET',
      headers: {
        'X-Forwarded-For': '192.168.1.1',
        'User-Agent': 'test-user-agent'
      },
      multiValueHeaders: {},
      queryStringParameters: queryParams,
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
    };
  }

  function createAnalyticsEvent(path: string, queryParams: Record<string, string> = {}): APIGatewayProxyEvent {
    return {
      resource: path,
      path,
      httpMethod: 'GET',
      headers: {
        'x-api-key': 'test-api-key',
        'User-Agent': 'test-user-agent'
      },
      multiValueHeaders: {},
      queryStringParameters: Object.keys(queryParams).length > 0 ? queryParams : null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {
        resourceId: 'test',
        resourcePath: path,
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
        path: `/test${path}`,
        domainName: 'test.execute-api.ap-northeast-1.amazonaws.com',
        domainPrefix: 'test'
      },
      body: null,
      isBase64Encoded: false
    };
  }

  function createSQSRecord(messageId: string, body: any): SQSRecord {
    return {
      messageId,
      receiptHandle: `receipt-${messageId}`,
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '1640995200000',
        SenderId: 'test-sender',
        ApproximateFirstReceiveTimestamp: '1640995200000'
      },
      messageAttributes: {},
      md5OfBody: 'test-md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:ap-northeast-1:123456789012:test-queue',
      awsRegion: 'ap-northeast-1'
    };
  }
});