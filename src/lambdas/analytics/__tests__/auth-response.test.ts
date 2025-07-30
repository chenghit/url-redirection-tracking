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

describe('Analytics Lambda - Authentication and Response Formatting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Note: API key authentication is now handled by AWS API Gateway
  // Invalid API keys will be rejected by API Gateway before reaching the Lambda function

  describe('Response Formatting', () => {
    const createEvent = (queryStringParameters: any = {}, path: string = '/analytics/query'): APIGatewayProxyEvent => ({
      path,
      httpMethod: 'GET',
      queryStringParameters,
      headers: {},
      multiValueHeaders: {},
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: null,
      isBase64Encoded: false
    });

    it('should include proper CORS headers in success response', async () => {
      mockSend.mockResolvedValue({
        Items: [],
        Count: 0
      });

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        })
      );
    });

    it('should include proper CORS headers in error response', async () => {
      const event = createEvent({ limit: '2000' }); // Invalid limit
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(result.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,OPTIONS'
        })
      );
    });

    it('should format query response according to interface specification', async () => {
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

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      
      // Verify response structure matches QueryResponse interface
      expect(response).toHaveProperty('data');
      expect(response.data).toHaveProperty('events');
      expect(response.data).toHaveProperty('total_count');
      expect(response.data).toHaveProperty('has_more');
      expect(response).toHaveProperty('timestamp');
      
      expect(Array.isArray(response.data.events)).toBe(true);
      expect(typeof response.data.total_count).toBe('number');
      expect(typeof response.data.has_more).toBe('boolean');
      expect(typeof response.timestamp).toBe('string');
    });

    it('should format aggregate response according to interface specification', async () => {
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

      const event = createEvent({}, '/analytics/aggregate');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      
      // Verify response structure matches AggregateResponse interface
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('timestamp');
      
      expect(Array.isArray(response.data)).toBe(true);
      expect(typeof response.timestamp).toBe('string');
      
      if (response.data.length > 0) {
        const aggregate = response.data[0];
        expect(aggregate).toHaveProperty('source_attribution');
        expect(aggregate).toHaveProperty('count');
        expect(aggregate).toHaveProperty('unique_ips');
        expect(aggregate).toHaveProperty('destinations');
        
        expect(typeof aggregate.source_attribution).toBe('string');
        expect(typeof aggregate.count).toBe('number');
        expect(typeof aggregate.unique_ips).toBe('number');
        expect(Array.isArray(aggregate.destinations)).toBe(true);
      }
    });

    it('should format error response consistently', async () => {
      const event = createEvent({ limit: 'invalid' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      
      // Verify error response structure matches ErrorResponse interface
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
      expect(response.error).toBe('Bad request');
    });
  });
});