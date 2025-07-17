// Unit tests for DynamoDB data access layer

import {
  writeTrackingEvent,
  batchWriteTrackingEvents,
  getTrackingEvent,
  queryTrackingEvents,
  queryTrackingEventsBySource,
  queryTrackingEventsByTimeRange,
  createTTL,
  validateTableConfiguration,
  DynamoDBError,
  DynamoDBRetryableError,
  dynamoDbClient
} from '../dynamodb';
import { TrackingEvent, AnalyticsQuery } from '../types';

// Store command parameters for testing
let lastPutCommandParams: any;
let lastGetCommandParams: any;
let lastScanCommandParams: any;
let lastQueryCommandParams: any;
let lastBatchWriteCommandParams: any;

// Mock the AWS SDK
const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn()
    }))
  },
  PutCommand: jest.fn().mockImplementation((params) => {
    lastPutCommandParams = params;
    return { input: params };
  }),
  GetCommand: jest.fn().mockImplementation((params) => {
    lastGetCommandParams = params;
    return { input: params };
  }),
  ScanCommand: jest.fn().mockImplementation((params) => {
    lastScanCommandParams = params;
    return { input: params };
  }),
  QueryCommand: jest.fn().mockImplementation((params) => {
    lastQueryCommandParams = params;
    return { input: params };
  }),
  BatchWriteCommand: jest.fn().mockImplementation((params) => {
    lastBatchWriteCommandParams = params;
    return { input: params };
  })
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));

// Mock console methods to avoid noise in tests
const consoleSpy = {
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {})
};

describe('DynamoDB Data Access Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockClear();
    // Mock the dynamoDbClient.send method
    (dynamoDbClient as any).send = mockSend;
    // Reset captured parameters
    lastPutCommandParams = undefined;
    lastGetCommandParams = undefined;
    lastScanCommandParams = undefined;
    lastQueryCommandParams = undefined;
    lastBatchWriteCommandParams = undefined;
  });

  afterAll(() => {
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('writeTrackingEvent', () => {
    const sampleEvent: TrackingEvent = {
      tracking_id: 'test-uuid-123',
      timestamp: '2024-01-15T10:30:45.123Z',
      formatted_timestamp: '2024-01-15 18:30:45',
      source_attribution: 'EdgeUp001',
      client_ip: '192.168.1.1',
      destination_url: 'https://aws.amazon.com/products',
      ttl: 1735689045
    };

    test('should successfully write tracking event', async () => {
      mockSend.mockResolvedValueOnce({});

      await writeTrackingEvent(sampleEvent);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastPutCommandParams.TableName).toBe('url-redirection-tracking');
      expect(lastPutCommandParams.Item).toEqual({
        tracking_id: sampleEvent.tracking_id,
        timestamp: sampleEvent.timestamp,
        formatted_timestamp: sampleEvent.formatted_timestamp,
        source_attribution: sampleEvent.source_attribution,
        client_ip: sampleEvent.client_ip,
        destination_url: sampleEvent.destination_url,
        ttl: sampleEvent.ttl
      });
    });

    test('should handle retryable errors with exponential backoff', async () => {
      const retryableError = new Error('ProvisionedThroughputExceededException');
      retryableError.name = 'ProvisionedThroughputExceededException';

      mockSend
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce({});

      await writeTrackingEvent(sampleEvent);

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(2);
    });

    test('should throw DynamoDBRetryableError after max retries', async () => {
      const retryableError = new Error('ProvisionedThroughputExceededException');
      retryableError.name = 'ProvisionedThroughputExceededException';

      mockSend.mockRejectedValue(retryableError);

      await expect(writeTrackingEvent(sampleEvent)).rejects.toThrow(DynamoDBRetryableError);
      expect(mockSend).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    test('should throw DynamoDBError for non-retryable errors', async () => {
      const nonRetryableError = new Error('ValidationException');
      nonRetryableError.name = 'ValidationException';

      mockSend.mockRejectedValueOnce(nonRetryableError);

      await expect(writeTrackingEvent(sampleEvent)).rejects.toThrow(DynamoDBError);
      expect(mockSend).toHaveBeenCalledTimes(1); // No retries for non-retryable errors
    });

    test('should handle event without optional fields', async () => {
      const minimalEvent: TrackingEvent = {
        tracking_id: 'test-uuid-456',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products'
      };

      mockSend.mockResolvedValueOnce({});

      await writeTrackingEvent(minimalEvent);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastPutCommandParams.Item.source_attribution).toBeUndefined();
      expect(lastPutCommandParams.Item.ttl).toBeUndefined();
    });
  });

  describe('batchWriteTrackingEvents', () => {
    const sampleEvents: TrackingEvent[] = [
      {
        tracking_id: 'test-uuid-1',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products'
      },
      {
        tracking_id: 'test-uuid-2',
        timestamp: '2024-01-15T10:31:45.123Z',
        formatted_timestamp: '2024-01-15 18:31:45',
        source_attribution: 'EdgeUp002',
        client_ip: '192.168.1.2',
        destination_url: 'https://docs.amazonaws.com/lambda'
      }
    ];

    test('should successfully batch write tracking events', async () => {
      mockSend.mockResolvedValueOnce({ UnprocessedItems: {} });

      await batchWriteTrackingEvents(sampleEvents);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastBatchWriteCommandParams.RequestItems['url-redirection-tracking']).toHaveLength(2);
    });

    test('should handle empty array', async () => {
      await batchWriteTrackingEvents([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('should split large batches into multiple requests', async () => {
      const largeEventArray = Array.from({ length: 30 }, (_, i) => ({
        tracking_id: `test-uuid-${i}`,
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products'
      }));

      mockSend.mockResolvedValue({ UnprocessedItems: {} });

      await batchWriteTrackingEvents(largeEventArray);

      expect(mockSend).toHaveBeenCalledTimes(2); // 25 + 5 items
    });

    test('should handle unprocessed items error', async () => {
      // Mock to always return unprocessed items to trigger retry exhaustion
      mockSend.mockResolvedValue({
        UnprocessedItems: {
          'url-redirection-tracking': [{ PutRequest: { Item: {} } }]
        }
      });

      await expect(batchWriteTrackingEvents(sampleEvents)).rejects.toThrow(DynamoDBRetryableError);
      expect(mockSend).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('getTrackingEvent', () => {
    const sampleEvent: TrackingEvent = {
      tracking_id: 'test-uuid-123',
      timestamp: '2024-01-15T10:30:45.123Z',
      formatted_timestamp: '2024-01-15 18:30:45',
      source_attribution: 'EdgeUp001',
      client_ip: '192.168.1.1',
      destination_url: 'https://aws.amazon.com/products'
    };

    test('should successfully retrieve tracking event', async () => {
      mockSend.mockResolvedValueOnce({ Item: sampleEvent });

      const result = await getTrackingEvent('test-uuid-123');

      expect(result).toEqual(sampleEvent);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastGetCommandParams.Key.tracking_id).toBe('test-uuid-123');
    });

    test('should return null when item not found', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await getTrackingEvent('non-existent-id');

      expect(result).toBeNull();
    });

    test('should handle DynamoDB errors with retry', async () => {
      const retryableError = new Error('InternalServerError');
      retryableError.name = 'InternalServerError';

      mockSend
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce({ Item: sampleEvent });

      const result = await getTrackingEvent('test-uuid-123');

      expect(result).toEqual(sampleEvent);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('queryTrackingEvents', () => {
    const sampleEvents: TrackingEvent[] = [
      {
        tracking_id: 'test-uuid-1',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products'
      }
    ];

    test('should successfully query tracking events', async () => {
      mockSend.mockResolvedValueOnce({ Items: sampleEvents });

      const query: AnalyticsQuery = { limit: 50 };
      const result = await queryTrackingEvents(query);

      expect(result).toEqual(sampleEvents);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastScanCommandParams.Limit).toBe(50);
    });

    test('should use default limit when not specified', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await queryTrackingEvents({});

      expect(lastScanCommandParams.Limit).toBe(100);
    });

    test('should handle empty results', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await queryTrackingEvents({});

      expect(result).toEqual([]);
    });
  });

  describe('queryTrackingEventsBySource', () => {
    const sampleEvents: TrackingEvent[] = [
      {
        tracking_id: 'test-uuid-1',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products'
      }
    ];

    test('should successfully query by source attribution', async () => {
      mockSend.mockResolvedValueOnce({ Items: sampleEvents });

      const result = await queryTrackingEventsBySource('EdgeUp001', 50);

      expect(result).toEqual(sampleEvents);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastQueryCommandParams.IndexName).toBe('GSI1');
      expect(lastQueryCommandParams.KeyConditionExpression).toBe('source_attribution = :sa');
      expect(lastQueryCommandParams.ExpressionAttributeValues[':sa']).toBe('EdgeUp001');
      expect(lastQueryCommandParams.Limit).toBe(50);
      expect(lastQueryCommandParams.ScanIndexForward).toBe(false);
    });

    test('should use default limit', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await queryTrackingEventsBySource('EdgeUp001');

      expect(lastQueryCommandParams.Limit).toBe(100);
    });
  });

  describe('queryTrackingEventsByTimeRange', () => {
    const sampleEvents: TrackingEvent[] = [
      {
        tracking_id: 'test-uuid-1',
        timestamp: '2024-01-15T10:30:45.123Z',
        formatted_timestamp: '2024-01-15 18:30:45',
        source_attribution: 'EdgeUp001',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/products'
      }
    ];

    test('should successfully query by time range', async () => {
      mockSend.mockResolvedValueOnce({ Items: sampleEvents });

      const startDate = '2024-01-15T00:00:00.000Z';
      const endDate = '2024-01-15T23:59:59.999Z';
      const result = await queryTrackingEventsByTimeRange(startDate, endDate, 50);

      expect(result).toEqual(sampleEvents);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastScanCommandParams.FilterExpression).toBe('#ts BETWEEN :start AND :end');
      expect(lastScanCommandParams.ExpressionAttributeNames['#ts']).toBe('timestamp');
      expect(lastScanCommandParams.ExpressionAttributeValues[':start']).toBe(startDate);
      expect(lastScanCommandParams.ExpressionAttributeValues[':end']).toBe(endDate);
      expect(lastScanCommandParams.Limit).toBe(50);
    });

    test('should use default limit', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await queryTrackingEventsByTimeRange('2024-01-15T00:00:00.000Z', '2024-01-15T23:59:59.999Z');

      expect(lastScanCommandParams.Limit).toBe(100);
    });
  });

  describe('createTTL', () => {
    test('should create TTL for default 365 days', () => {
      const now = new Date();
      const ttl = createTTL();
      const expectedDate = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
      const expectedTTL = Math.floor(expectedDate.getTime() / 1000);

      // Allow for small time differences due to execution time
      expect(Math.abs(ttl - expectedTTL)).toBeLessThan(2);
    });

    test('should create TTL for custom number of days', () => {
      const now = new Date();
      const ttl = createTTL(30);
      const expectedDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
      const expectedTTL = Math.floor(expectedDate.getTime() / 1000);

      expect(Math.abs(ttl - expectedTTL)).toBeLessThan(2);
    });

    test('should handle zero days', () => {
      const now = new Date();
      const ttl = createTTL(0);
      const expectedTTL = Math.floor(now.getTime() / 1000);

      expect(Math.abs(ttl - expectedTTL)).toBeLessThan(2);
    });
  });

  describe('validateTableConfiguration', () => {
    test('should return true when table is accessible', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await validateTableConfiguration();

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(lastScanCommandParams.Limit).toBe(1);
    });

    test('should return false when table is not accessible', async () => {
      const error = new Error('ResourceNotFoundException');
      error.name = 'ResourceNotFoundException';
      mockSend.mockRejectedValue(error);

      const result = await validateTableConfiguration();

      expect(result).toBe(false);
      expect(consoleSpy.error).toHaveBeenCalledWith('DynamoDB table validation failed:', expect.any(Error));
    });

    test('should return false after retries fail', async () => {
      const retryableError = new Error('InternalServerError');
      retryableError.name = 'InternalServerError';
      mockSend.mockRejectedValue(retryableError);

      const result = await validateTableConfiguration();

      expect(result).toBe(false);
      expect(mockSend).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('Error Handling', () => {
    test('DynamoDBError should contain operation and original error', () => {
      const originalError = new Error('Original error');
      const dbError = new DynamoDBError('Test error', 'testOperation', originalError);

      expect(dbError.message).toBe('Test error');
      expect(dbError.operation).toBe('testOperation');
      expect(dbError.originalError).toBe(originalError);
      expect(dbError.name).toBe('DynamoDBError');
    });

    test('DynamoDBRetryableError should extend DynamoDBError', () => {
      const originalError = new Error('Original error');
      const retryableError = new DynamoDBRetryableError('Test error', 'testOperation', originalError);

      expect(retryableError).toBeInstanceOf(DynamoDBError);
      expect(retryableError.name).toBe('DynamoDBRetryableError');
    });
  });
});