import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

// Mock utilities
jest.mock('../../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    logRequestStart: jest.fn(),
    logRequestEnd: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  extractRequestContext: jest.fn(() => ({
    correlationId: 'test-correlation-id',
    requestId: 'test-request-id',
    clientIp: '192.168.1.1',
    userAgent: 'test-user-agent'
  }))
}));

import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const mockSend = jest.fn();
const mockDocClient = {
  send: mockSend
} as any;

// Mock the DynamoDB client
(DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue(mockDocClient);
(DynamoDBClient as jest.Mock) = jest.fn();

// Import handler after mocking
import { handler } from '../index';

const createMockEvent = (queryStringParameters: any = {}, path: string = '/analytics/query'): APIGatewayProxyEvent => ({
  body: null,
  headers: {
    'x-api-key': 'test-api-key'
  },
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path,
  pathParameters: null,
  queryStringParameters,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: 'test-account',
    apiId: 'test-api',
    authorizer: null,
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    path,
    stage: 'test',
    requestId: 'test-request-id',
    requestTime: '2024-01-01T00:00:00.000Z',
    requestTimeEpoch: 1704067200000,
    resourceId: 'test-resource',
    resourcePath: path,
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
      sourceIp: '192.168.1.1',
      user: null,
      userAgent: 'test-user-agent',
      userArn: null
    }
  },
  resource: path
} as any);

describe('Analytics Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set environment variables for testing
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.DYNAMODB_TABLE_NAME = 'test-tracking-table';
    process.env.API_KEY = 'test-api-key';
    
    // Reset mock implementation
    mockSend.mockReset();
    
    // Default mock response for DynamoDB operations
    mockSend.mockResolvedValue({
      Items: [],
      Count: 0,
      ScannedCount: 0
    });
  });

  describe('Query Endpoint Handler', () => {
    it('should handle basic query without filters', async () => {
      const event = createMockEvent();
      
      mockSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        ScannedCount: 0
      });

      const result = await handler(event);

      if (result.statusCode !== 200) {
        console.log('Error response:', result.body);
      }
      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response).toHaveProperty('data');
      expect(response.data).toHaveProperty('events');
      expect(response.data).toHaveProperty('total_count');
      expect(response.data).toHaveProperty('has_more');
    });

    it('should handle query with source attribution filter', async () => {
      const event = createMockEvent({ source_attribution: 'EdgeUp001' });
      
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            tracking_id: 'test-id',
            timestamp: '2024-01-01T00:00:00.000Z',
            source_attribution: 'EdgeUp001',
            client_ip: '192.168.1.1',
            destination_url: 'https://aws.amazon.com'
          }
        ],
        Count: 1
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.events).toHaveLength(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
    });

    // Note: API key authentication is handled by API Gateway, not Lambda

    it('should handle invalid endpoint', async () => {
      const event = createMockEvent({}, '/invalid/path');

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
    });
  });

  describe('Aggregate Endpoint Handler', () => {
    it('should handle basic aggregation', async () => {
      const event = createMockEvent({}, '/analytics/aggregate');
      
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            tracking_id: 'test-id-1',
            timestamp: '2024-01-01T00:00:00.000Z',
            source_attribution: 'EdgeUp001',
            client_ip: '192.168.1.1',
            destination_url: 'https://aws.amazon.com'
          },
          {
            tracking_id: 'test-id-2',
            timestamp: '2024-01-01T00:01:00.000Z',
            source_attribution: 'EdgeUp001',
            client_ip: '192.168.1.2',
            destination_url: 'https://aws.amazon.com'
          }
        ],
        Count: 2
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data).toBeInstanceOf(Array);
      expect(response.data.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check Endpoints', () => {
    it('should handle basic health check', async () => {
      const event = createMockEvent({}, '/health');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.status).toBe('healthy');
      expect(response.service).toBe('url-redirection-analytics');
      expect(response.timestamp).toBeDefined();
      expect(response.version).toBe('1.0.0');
    });

    it('should handle deep health check', async () => {
      const event = createMockEvent({}, '/health/deep');
      
      // Mock successful DynamoDB scan for health check
      mockSend.mockResolvedValueOnce({
        Items: [],
        Count: 0
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.status).toBe('healthy');
      expect(response.service).toBe('url-redirection-analytics');
      expect(response.checks).toBeDefined();
      expect(response.checks.dynamodb).toBeDefined();
      expect(response.checks.memory).toBeDefined();
      expect(response.checks.environment).toBeDefined();
      expect(response.checks.runtime).toBeDefined();
      expect(response.responseTime).toBeDefined();
    });

    it('should handle deep health check with DynamoDB failure', async () => {
      const event = createMockEvent({}, '/health/deep');
      
      // Mock DynamoDB failure
      mockSend.mockRejectedValueOnce(new Error('DynamoDB connection failed'));

      const result = await handler(event);

      expect(result.statusCode).toBe(503);
      const response = JSON.parse(result.body);
      expect(response.status).toBe('unhealthy');
      expect(response.checks.dynamodb.status).toBe('unhealthy');
    });
  });

  describe('Error Handling', () => {
    it('should handle DynamoDB errors', async () => {
      const event = createMockEvent();
      
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });
});