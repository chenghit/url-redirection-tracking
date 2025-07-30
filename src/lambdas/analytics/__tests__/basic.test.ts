import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

const mockSend = jest.fn();

// Mock the DynamoDBDocumentClient.from method
(DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue({
  send: mockSend
});

// Import handler after mocking
import { handler } from '../index';

// Set environment variables
process.env.DYNAMODB_TABLE_NAME = 'test-table';
process.env.AWS_REGION = 'ap-northeast-1';

describe('Analytics Lambda - Basic Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set API key for most tests
    process.env.API_KEY = 'test-api-key';
  });

  describe('Query Endpoint Handler', () => {
    const createMockEvent = (queryStringParameters: any = {}): APIGatewayProxyEvent => ({
      path: '/analytics/query',
      httpMethod: 'GET',
      queryStringParameters,
      headers: { 'x-api-key': 'test-api-key' },
      multiValueHeaders: {},
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: null,
      isBase64Encoded: false
    });

    it('should handle basic query without filters', async () => {
      const mockEvents = [
        {
          tracking_id: 'test-id-1',
          timestamp: '2024-01-15T10:30:45.123Z',
          formatted_timestamp: '2024-01-15 18:30:45',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/'
        }
      ];

      mockSend.mockResolvedValue({
        Items: mockEvents,
        Count: 1
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.events).toHaveLength(1);
      expect(response.data.total_count).toBe(1);
      expect(response.data.has_more).toBe(false);
      expect(response.timestamp).toBeDefined();
    });

    it('should validate limit parameter bounds', async () => {
      const event = createMockEvent({ limit: '2000' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('Bad request');
    });

    it('should validate source attribution format', async () => {
      const event = createMockEvent({ source_attribution: 'InvalidFormat' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('Bad request');
    });
  });

  describe('Aggregate Endpoint Handler', () => {
    const createAggregateEvent = (queryStringParameters: any = {}): APIGatewayProxyEvent => ({
      path: '/analytics/aggregate',
      httpMethod: 'GET',
      queryStringParameters,
      headers: { 'x-api-key': 'test-api-key' },
      multiValueHeaders: {},
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: null,
      isBase64Encoded: false
    });

    it('should handle basic aggregation without filters', async () => {
      const mockEvents = [
        {
          tracking_id: 'test-id-1',
          timestamp: '2024-01-15T10:30:45.123Z',
          formatted_timestamp: '2024-01-15 18:30:45',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.1',
          destination_url: 'https://aws.amazon.com/cn/blogs/'
        },
        {
          tracking_id: 'test-id-2',
          timestamp: '2024-01-15T11:30:45.123Z',
          formatted_timestamp: '2024-01-15 19:30:45',
          source_attribution: 'EdgeUp001',
          client_ip: '192.168.1.2',
          destination_url: 'https://aws.amazon.com/cn/blogs/'
        }
      ];

      mockSend.mockResolvedValue({
        Items: mockEvents,
        Count: 2
      });

      const event = createAggregateEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      
      expect(response.data).toHaveLength(1);
      expect(response.data[0].source_attribution).toBe('EdgeUp001');
      expect(response.data[0].count).toBe(2);
      expect(response.data[0].unique_ips).toBe(2);
      expect(response.timestamp).toBeDefined();
    });
  });
});