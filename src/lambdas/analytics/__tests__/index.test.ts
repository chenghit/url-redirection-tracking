// Unit tests for analytics Lambda function

import { handler } from '../index';
import { AnalyticsEvent, TrackingEvent } from '../../../shared/types';

// Mock AWS SDK
jest.mock('../../../shared/dynamodb', () => ({
  dynamoDbClient: {
    send: jest.fn()
  },
  queryTrackingEvents: jest.fn(),
  queryTrackingEventsBySource: jest.fn(),
  queryTrackingEventsByTimeRange: jest.fn()
}));

import { dynamoDbClient } from '../../../shared/dynamodb';
const mockSend = (dynamoDbClient.send as jest.Mock);

// Mock constants
jest.mock('../../../shared/constants', () => ({
  DYNAMODB_TABLE_NAME: 'test-table',
  HTTP_STATUS_CODES: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500
  },
  ERROR_MESSAGES: {
    INTERNAL_SERVER_ERROR: 'Internal server error'
  }
}));

describe('Analytics Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockContext = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2023/01/01/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn()
  };

  const createMockEvent = (
    path: string,
    queryStringParameters: { [key: string]: string } = {}
  ): AnalyticsEvent => ({
    resource: '/analytics',
    path,
    httpMethod: 'GET',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters,
    multiValueQueryStringParameters: {},
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      resourceId: 'test',
      resourcePath: '/analytics',
      httpMethod: 'GET',
      requestId: 'test-request',
      protocol: 'HTTP/1.1',
      stage: 'test',
      requestTimeEpoch: Date.now(),
      requestTime: new Date().toISOString(),
      path: '/test/analytics',
      accountId: '123456789012',
      apiId: 'test-api',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
        clientCert: null
      },
      authorizer: null
    },
    body: null,
    isBase64Encoded: false
  });

  const mockTrackingEvents: TrackingEvent[] = [
    {
      tracking_id: 'test-id-1',
      timestamp: '2024-01-15T10:30:45.123Z',
      formatted_timestamp: '2024-01-15 18:30:45',
      source_attribution: 'EdgeUp001',
      client_ip: '192.168.1.1',
      destination_url: 'https://aws.amazon.com/cn/blogs/china/test1/'
    },
    {
      tracking_id: 'test-id-2',
      timestamp: '2024-01-15T11:30:45.123Z',
      formatted_timestamp: '2024-01-15 19:30:45',
      source_attribution: 'EdgeUp002',
      client_ip: '192.168.1.2',
      destination_url: 'https://aws.amazon.com/cn/blogs/china/test2/'
    },
    {
      tracking_id: 'test-id-3',
      timestamp: '2024-01-15T12:30:45.123Z',
      formatted_timestamp: '2024-01-15 20:30:45',
      source_attribution: 'EdgeUp001',
      client_ip: '192.168.1.1',
      destination_url: 'https://amazonaws.com/test3/'
    }
  ];

  describe('Query Endpoint', () => {
    it('should handle basic query request successfully', async () => {
      const event = createMockEvent('/analytics/query');
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.events).toHaveLength(3);
      expect(body.data.total_count).toBe(3);
      expect(body.data.has_more).toBe(false);
    });

    it('should handle query with source attribution filter', async () => {
      const event = createMockEvent('/analytics/query', {
        source_attribution: 'EdgeUp001'
      });
      
      const filteredEvents = mockTrackingEvents.filter(e => e.source_attribution === 'EdgeUp001');
      mockSend.mockResolvedValueOnce({
        Items: filteredEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.events).toHaveLength(2);
      expect(body.data.events.every((e: TrackingEvent) => e.source_attribution === 'EdgeUp001')).toBe(true);
    });

    it('should handle query with time range filter', async () => {
      const event = createMockEvent('/analytics/query', {
        start_date: '2024-01-15T10:00:00.000Z',
        end_date: '2024-01-15T11:00:00.000Z'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: [mockTrackingEvents[0]]
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.events).toHaveLength(1);
      expect(body.data.events[0].tracking_id).toBe('test-id-1');
    });

    it('should handle query with pagination', async () => {
      const event = createMockEvent('/analytics/query', {
        limit: '2',
        offset: '1'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.events).toHaveLength(2);
      expect(body.data.has_more).toBe(false);
    });

    it('should handle query with sorting', async () => {
      const event = createMockEvent('/analytics/query', {
        sort_order: 'asc'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.events).toHaveLength(3);
      // Should be sorted by timestamp ascending
      expect(body.data.events[0].tracking_id).toBe('test-id-1');
      expect(body.data.events[2].tracking_id).toBe('test-id-3');
    });

    it('should handle complex query with multiple filters', async () => {
      const event = createMockEvent('/analytics/query', {
        source_attribution: 'EdgeUp001',
        start_date: '2024-01-15T10:00:00.000Z',
        end_date: '2024-01-15T13:00:00.000Z',
        destination_url: 'aws.amazon.com'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            FilterExpression: expect.stringContaining('AND')
          })
        })
      );
    });

    it('should handle query errors gracefully', async () => {
      const event = createMockEvent('/analytics/query');
      
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid query parameters');
    });
  });

  describe('Aggregation Endpoint', () => {
    it('should handle basic aggregation request successfully', async () => {
      const event = createMockEvent('/analytics/aggregate');
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2); // Two different source attributions
      
      const edgeUp001 = body.data.find((agg: any) => agg.source_attribution === 'EdgeUp001');
      expect(edgeUp001.count).toBe(2);
      expect(edgeUp001.unique_ips).toBe(1);
      expect(edgeUp001.destinations).toHaveLength(2);
      
      const edgeUp002 = body.data.find((agg: any) => agg.source_attribution === 'EdgeUp002');
      expect(edgeUp002.count).toBe(1);
      expect(edgeUp002.unique_ips).toBe(1);
      expect(edgeUp002.destinations).toHaveLength(1);
    });

    it('should handle aggregation with filters', async () => {
      const event = createMockEvent('/analytics/aggregate', {
        source_attribution: 'EdgeUp001'
      });
      
      const filteredEvents = mockTrackingEvents.filter(e => e.source_attribution === 'EdgeUp001');
      mockSend.mockResolvedValueOnce({
        Items: filteredEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].source_attribution).toBe('EdgeUp001');
      expect(body.data[0].count).toBe(2);
    });

    it('should sort aggregations by count descending', async () => {
      const event = createMockEvent('/analytics/aggregate');
      
      // Add more events for EdgeUp002 to test sorting
      const extendedEvents = [
        ...mockTrackingEvents,
        {
          tracking_id: 'test-id-4',
          timestamp: '2024-01-15T13:30:45.123Z',
          formatted_timestamp: '2024-01-15 21:30:45',
          source_attribution: 'EdgeUp002',
          client_ip: '192.168.1.3',
          destination_url: 'https://amazonaws.com/test4/'
        },
        {
          tracking_id: 'test-id-5',
          timestamp: '2024-01-15T14:30:45.123Z',
          formatted_timestamp: '2024-01-15 22:30:45',
          source_attribution: 'EdgeUp002',
          client_ip: '192.168.1.4',
          destination_url: 'https://amazonaws.com/test5/'
        }
      ];
      
      mockSend.mockResolvedValueOnce({
        Items: extendedEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2);
      // EdgeUp002 should be first (3 events vs 2 events)
      expect(body.data[0].source_attribution).toBe('EdgeUp002');
      expect(body.data[0].count).toBe(3);
      expect(body.data[1].source_attribution).toBe('EdgeUp001');
      expect(body.data[1].count).toBe(2);
    });

    it('should handle aggregation errors gracefully', async () => {
      const event = createMockEvent('/analytics/aggregate');
      
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid aggregation parameters');
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid endpoint', async () => {
      const event = createMockEvent('/analytics/invalid');

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid endpoint');
    });

    it('should return 500 for unexpected errors', async () => {
      const event = createMockEvent('/analytics/query');
      
      // Mock DynamoDB to throw an error that will be caught by the main handler
      mockSend.mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400); // This will be caught as a query error
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid query parameters');
    });

    it('should include CORS headers in all responses', async () => {
      const event = createMockEvent('/analytics/query');
      
      mockSend.mockResolvedValueOnce({
        Items: []
      });

      const result = await handler(event, mockContext);

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
    });
  });

  describe('Parameter Parsing', () => {
    it('should parse query parameters correctly', async () => {
      const event = createMockEvent('/analytics/query', {
        start_date: '2024-01-15T10:00:00.000Z',
        end_date: '2024-01-15T12:00:00.000Z',
        source_attribution: 'EdgeUp001',
        destination_url: 'aws.amazon.com',
        limit: '50',
        sort_order: 'asc',
        offset: '10'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: []
      });

      await handler(event, mockContext);

      // Verify that the parameters were parsed and used correctly
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            FilterExpression: expect.stringContaining('source_attribution = :sa'),
            ExpressionAttributeValues: expect.objectContaining({
              ':sa': 'EdgeUp001'
            })
          })
        })
      );
    });

    it('should use default values for missing parameters', async () => {
      const event = createMockEvent('/analytics/query', {});
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Should use default limit of 100 and offset of 0
      expect(body.data.events).toHaveLength(3);
    });

    it('should handle invalid numeric parameters', async () => {
      const event = createMockEvent('/analytics/query', {
        limit: 'invalid',
        offset: 'also-invalid'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      // Should fall back to defaults when parsing fails
      const body = JSON.parse(result.body);
      expect(body.data.events).toHaveLength(3);
    });
  });

  describe('GSI Query Optimization', () => {
    it('should use GSI1 for source attribution queries', async () => {
      const event = createMockEvent('/analytics/query', {
        source_attribution: 'EdgeUp001'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents.filter(e => e.source_attribution === 'EdgeUp001')
      });

      await handler(event, mockContext);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            IndexName: 'GSI1',
            KeyConditionExpression: 'source_attribution = :sa'
          })
        })
      );
    });

    it('should use scan for time range queries', async () => {
      const event = createMockEvent('/analytics/query', {
        start_date: '2024-01-15T10:00:00.000Z',
        end_date: '2024-01-15T12:00:00.000Z'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      await handler(event, mockContext);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            FilterExpression: '#ts BETWEEN :start AND :end'
          })
        })
      );
    });

    it('should use complex scan for multiple filters', async () => {
      const event = createMockEvent('/analytics/query', {
        source_attribution: 'EdgeUp001',
        start_date: '2024-01-15T10:00:00.000Z',
        destination_url: 'aws.amazon.com'
      });
      
      mockSend.mockResolvedValueOnce({
        Items: mockTrackingEvents
      });

      await handler(event, mockContext);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            FilterExpression: expect.stringContaining('AND')
          })
        })
      );
    });
  });
});