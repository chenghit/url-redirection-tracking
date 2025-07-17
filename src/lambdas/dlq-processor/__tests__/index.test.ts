// Unit tests for DLQ processor Lambda function

import { SQSEvent, SQSRecord, Context, SQSBatchResponse } from 'aws-lambda';
import { handler, DLQMessage } from '../index';
import { writeTrackingEvent, batchWriteTrackingEvents } from '../../../shared/dynamodb';
import { TrackingEvent } from '../../../shared/types';
import { sendToDLQ } from '../../../shared/error-handler';

// Mock the DynamoDB module
jest.mock('../../../shared/dynamodb', () => ({
  writeTrackingEvent: jest.fn(),
  batchWriteTrackingEvents: jest.fn()
}));

// Mock error-handler module
jest.mock('../../../shared/error-handler', () => ({
  AppError: jest.requireActual('../../../shared/error-handler').AppError,
  DynamoDBError: jest.requireActual('../../../shared/error-handler').DynamoDBError,
  ConfigurationError: jest.requireActual('../../../shared/error-handler').ConfigurationError,
  wrapDynamoDBOperation: jest.fn().mockImplementation((fn) => fn()),
  sendToDLQ: jest.fn()
}));

// Mock AWS SDK
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

const mockWriteTrackingEvent = writeTrackingEvent as jest.MockedFunction<typeof writeTrackingEvent>;
const mockBatchWriteTrackingEvents = batchWriteTrackingEvents as jest.MockedFunction<typeof batchWriteTrackingEvents>;
const mockSendToDLQ = sendToDLQ as jest.MockedFunction<typeof sendToDLQ>;

// Mock console methods to avoid noise in tests
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {})
};

describe('DLQ Processor Lambda Handler', () => {
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'dlq-processor-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:dlq-processor-function',
      memoryLimitInMB: '256',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/dlq-processor-function',
      logStreamName: '2024/01/15/[$LATEST]test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn()
    };

    // Set up environment variables
    process.env.TRACKING_DLQ_URL = 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/url-redirection-tracking-dlq';
    process.env.AWS_REGION = 'ap-northeast-1';
  });

  afterEach(() => {
    delete process.env.TRACKING_DLQ_URL;
    delete process.env.AWS_REGION;
  });

  afterAll(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  const createSampleTrackingEvent = (): TrackingEvent => ({
    tracking_id: 'test-uuid-123',
    timestamp: '2024-01-15T10:30:45.123Z',
    formatted_timestamp: '2024-01-15 18:30:45',
    source_attribution: 'EdgeUp001',
    client_ip: '192.168.1.1',
    destination_url: 'https://aws.amazon.com/products'
  });

  const createDLQMessage = (trackingEvent: TrackingEvent, retryCount: number = 0): DLQMessage => ({
    tracking_event: trackingEvent,
    error_details: {
      message: 'DynamoDB write failed',
      name: 'DynamoDBError',
      stack: 'Error stack trace',
      code: 'DYNAMODB_ERROR'
    },
    retry_count: retryCount,
    failed_at: '2024-01-15T10:30:45.123Z',
    correlation_id: 'test-correlation-id'
  });

  const createSQSRecord = (messageBody: any, messageId: string = 'test-message-id'): SQSRecord => ({
    messageId,
    receiptHandle: 'test-receipt-handle',
    body: typeof messageBody === 'string' ? messageBody : JSON.stringify(messageBody),
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '1640995200000',
      SenderId: 'test-sender',
      ApproximateFirstReceiveTimestamp: '1640995200000'
    },
    messageAttributes: {},
    md5OfBody: 'test-md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
    awsRegion: 'us-east-1'
  });

  const createSQSEvent = (records: SQSRecord[]): SQSEvent => ({
    Records: records
  });

  describe('Successful Processing', () => {
    test('should successfully process single DLQ message with batch write', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledWith(
        [trackingEvent],
        expect.any(Object) // Logger instance
      );
      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteTrackingEvent).not.toHaveBeenCalled();
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });

    test('should successfully process multiple DLQ messages with batch write', async () => {
      const trackingEvents = [
        createSampleTrackingEvent(),
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-456' },
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-789' }
      ];
      
      const sqsRecords = trackingEvents.map((event, index) => 
        createSQSRecord(createDLQMessage(event, 1), `message-${index}`)
      );
      const event = createSQSEvent(sqsRecords);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledWith(
        trackingEvents,
        expect.any(Object) // Logger instance
      );
      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });

    test('should split large batches into multiple requests', async () => {
      // Create 30 tracking events (more than batch size of 25)
      const trackingEvents = Array.from({ length: 30 }, (_, i) => ({
        ...createSampleTrackingEvent(),
        tracking_id: `test-uuid-${i}`
      }));
      
      const sqsRecords = trackingEvents.map((event, index) => 
        createSQSRecord(createDLQMessage(event, 1), `message-${index}`)
      );
      const event = createSQSEvent(sqsRecords);

      mockBatchWriteTrackingEvents.mockResolvedValue(undefined);

      const result = await handler(event, mockContext);

      // Should be called twice: 25 + 5 items
      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(2);
      expect(mockBatchWriteTrackingEvents).toHaveBeenNthCalledWith(
        1, 
        trackingEvents.slice(0, 25),
        expect.any(Object) // Logger instance
      );
      expect(mockBatchWriteTrackingEvents).toHaveBeenNthCalledWith(
        2, 
        trackingEvents.slice(25, 30),
        expect.any(Object) // Logger instance
      );
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });

    test('should fall back to individual writes when batch write fails', async () => {
      const trackingEvents = [
        createSampleTrackingEvent(),
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-456' }
      ];
      
      const sqsRecords = trackingEvents.map((event, index) => 
        createSQSRecord(createDLQMessage(event, 1), `message-${index}`)
      );
      const event = createSQSEvent(sqsRecords);

      // Mock batch write to fail, individual writes to succeed
      mockBatchWriteTrackingEvents.mockRejectedValueOnce(new Error('Batch write failed'));
      mockWriteTrackingEvent.mockResolvedValue(undefined);

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteTrackingEvent).toHaveBeenCalledTimes(2);
      expect(mockWriteTrackingEvent).toHaveBeenCalledWith(
        trackingEvents[0],
        expect.any(Object) // Logger instance
      );
      expect(mockWriteTrackingEvent).toHaveBeenCalledWith(
        trackingEvents[1],
        expect.any(Object) // Logger instance
      );
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });
  });

  describe('Retry Logic', () => {
    test('should discard messages that exceed max retry count', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 3); // Max retry count reached
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).not.toHaveBeenCalled();
      expect(mockWriteTrackingEvent).not.toHaveBeenCalled();
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });

    test('should process messages with retry count below maximum', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 2); // Below max retry count
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledWith(
        [trackingEvent],
        expect.any(Object) // Logger instance
      );
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });

    test('should handle mixed retry counts correctly', async () => {
      const trackingEvents = [
        createSampleTrackingEvent(),
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-456' },
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-789' }
      ];
      
      const sqsRecords = [
        createSQSRecord(createDLQMessage(trackingEvents[0], 1), 'message-1'), // Should retry
        createSQSRecord(createDLQMessage(trackingEvents[1], 3), 'message-2'), // Should discard
        createSQSRecord(createDLQMessage(trackingEvents[2], 2), 'message-3')  // Should retry
      ];
      const event = createSQSEvent(sqsRecords);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      const result = await handler(event, mockContext);

      // Should only process events 0 and 2 (retry counts 1 and 2)
      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledWith(
        [trackingEvents[0], trackingEvents[2]],
        expect.any(Object) // Logger instance
      );
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    test('should handle unparseable DLQ messages and report them as batch failures', async () => {
      const invalidRecord = createSQSRecord('invalid json', 'invalid-message-id');
      const event = createSQSEvent([invalidRecord]);

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).not.toHaveBeenCalled();
      expect(mockWriteTrackingEvent).not.toHaveBeenCalled();
      
      // Verify batch response includes the failed message
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: 'invalid-message-id' }
      ]);
    });

    test('should handle individual write failures with requeue', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage, 'failed-message-id');
      const event = createSQSEvent([sqsRecord]);

      // Mock batch write to fail, individual write to fail (should trigger requeue)
      mockBatchWriteTrackingEvents.mockRejectedValueOnce(new Error('Batch write failed'));
      mockWriteTrackingEvent.mockRejectedValueOnce(new Error('Individual write failed'));

      // Get the mocked SQS classes
      const mockSQS = jest.requireMock('@aws-sdk/client-sqs');
      
      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteTrackingEvent).toHaveBeenCalledTimes(1);
      expect(mockSQS.SendMessageCommand).toHaveBeenCalledTimes(1);
      
      // Verify batch response includes the failed message
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: 'test-uuid-123' } // tracking_id is used as itemIdentifier
      ]);
    });

    test('should handle individual write failures at max retry count', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 2); // One retry left
      const sqsRecord = createSQSRecord(dlqMessage, 'failed-message-id');
      const event = createSQSEvent([sqsRecord]);

      // Mock batch write to fail, individual write to fail
      mockBatchWriteTrackingEvents.mockRejectedValueOnce(new Error('Batch write failed'));
      mockWriteTrackingEvent.mockRejectedValueOnce(new Error('Individual write failed'));

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteTrackingEvent).toHaveBeenCalledTimes(1);
      // Should not requeue since it would exceed max retry count
      
      // Verify batch response includes the failed message
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: 'test-uuid-123' } // tracking_id is used as itemIdentifier
      ]);
    });

    test('should handle missing DLQ URL environment variable', async () => {
      delete process.env.TRACKING_DLQ_URL;

      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage, 'failed-message-id');
      const event = createSQSEvent([sqsRecord]);

      // Mock batch write to fail, individual write to fail
      mockBatchWriteTrackingEvents.mockRejectedValueOnce(new Error('Batch write failed'));
      mockWriteTrackingEvent.mockRejectedValueOnce(new Error('Individual write failed'));

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteTrackingEvent).toHaveBeenCalledTimes(1);
      // Should not attempt to requeue due to missing DLQ URL
      
      // Verify batch response includes the failed message
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: 'test-uuid-123' } // tracking_id is used as itemIdentifier
      ]);
    });

    test('should handle requeue failures gracefully and use sendToDLQ as fallback', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage, 'failed-message-id');
      const event = createSQSEvent([sqsRecord]);

      // Mock batch write to fail, individual write to fail
      mockBatchWriteTrackingEvents.mockRejectedValueOnce(new Error('Batch write failed'));
      mockWriteTrackingEvent.mockRejectedValueOnce(new Error('Individual write failed'));

      // Get the mocked SQS classes and make send fail
      const mockSQS = jest.requireMock('@aws-sdk/client-sqs');
      mockSQS.__mockSend.mockRejectedValueOnce(new Error('SQS send failed'));

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteTrackingEvent).toHaveBeenCalledTimes(1);
      expect(mockSQS.SendMessageCommand).toHaveBeenCalledTimes(1);
      expect(mockSendToDLQ).toHaveBeenCalledTimes(1);
      
      // Verify batch response includes the failed message
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: 'test-uuid-123' } // tracking_id is used as itemIdentifier
      ]);
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log processing start and completion with correlation IDs', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      await handler(event, mockContext);

      // Verify structured logging calls
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"DLQ processor started"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"DLQ processor completed"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"request_id":"test-request-id"')
      );
    });

    test('should log individual message processing details with correlation IDs', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      await handler(event, mockContext);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Processing DLQ message"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"tracking_id":"test-uuid-123"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"correlation_id":"test-correlation-id"')
      );
    });

    test('should log batch processing details with metrics', async () => {
      const trackingEvents = [
        createSampleTrackingEvent(),
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-456' }
      ];
      
      const sqsRecords = trackingEvents.map((event, index) => 
        createSQSRecord(createDLQMessage(event, 1), `message-${index}`)
      );
      const event = createSQSEvent(sqsRecords);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      await handler(event, mockContext);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Processing retry messages in batches"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"batch_count":1')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"total_messages":2')
      );
    });

    test('should log successful retry operations with details', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      await handler(event, mockContext);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Tracking event retry successful"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"retry_count":1')
      );
    });

    test('should log discarded messages with reason', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 3); // Max retry count reached
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      await handler(event, mockContext);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Message exceeded max retry count, discarding"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"max_retry_count":3')
      );
    });
    
    test('should log completion with success rate metrics', async () => {
      const trackingEvents = [
        createSampleTrackingEvent(),
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-456' }
      ];
      
      const sqsRecords = trackingEvents.map((event, index) => 
        createSQSRecord(createDLQMessage(event, 1), `message-${index}`)
      );
      const event = createSQSEvent(sqsRecords);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      await handler(event, mockContext);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"message":"DLQ processor completed"')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"success_rate":"100.00%"')
      );
    });
  });

  describe('Performance and Batching', () => {
    test('should respect batch size limits', async () => {
      // Create exactly 25 tracking events (batch size limit)
      const trackingEvents = Array.from({ length: 25 }, (_, i) => ({
        ...createSampleTrackingEvent(),
        tracking_id: `test-uuid-${i}`
      }));
      
      const sqsRecords = trackingEvents.map((event, index) => 
        createSQSRecord(createDLQMessage(event, 1), `message-${index}`)
      );
      const event = createSQSEvent(sqsRecords);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledTimes(1);
      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledWith(
        trackingEvents,
        expect.any(Object) // Logger instance
      );
    });

    test('should handle empty message list', async () => {
      const event = createSQSEvent([]);

      const result = await handler(event, mockContext);

      expect(mockBatchWriteTrackingEvents).not.toHaveBeenCalled();
      expect(mockWriteTrackingEvent).not.toHaveBeenCalled();
      
      // Verify batch response format
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([]);
    });

    test('should calculate exponential backoff delays correctly', async () => {
      const trackingEvent = createSampleTrackingEvent();
      const dlqMessage = createDLQMessage(trackingEvent, 1);
      const sqsRecord = createSQSRecord(dlqMessage);
      const event = createSQSEvent([sqsRecord]);

      // Mock batch write to fail, individual write to fail
      mockBatchWriteTrackingEvents.mockRejectedValueOnce(new Error('Batch write failed'));
      mockWriteTrackingEvent.mockRejectedValueOnce(new Error('Individual write failed'));

      // Get the mocked SQS classes
      const mockSQS = jest.requireMock('@aws-sdk/client-sqs');

      await handler(event, mockContext);

      // Verify DelaySeconds is calculated correctly (2^1 * 60 = 120 seconds)
      expect(mockSQS.SendMessageCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          DelaySeconds: 120
        })
      );
    });
    
    test('should return partial batch failures correctly', async () => {
      const trackingEvents = [
        createSampleTrackingEvent(),
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-456' },
        { ...createSampleTrackingEvent(), tracking_id: 'test-uuid-789' }
      ];
      
      const sqsRecords = [
        createSQSRecord(createDLQMessage(trackingEvents[0], 1), 'message-1'),
        createSQSRecord('invalid json', 'invalid-message'),
        createSQSRecord(createDLQMessage(trackingEvents[2], 1), 'message-3')
      ];
      const event = createSQSEvent(sqsRecords);

      mockBatchWriteTrackingEvents.mockResolvedValueOnce(undefined);

      const result = await handler(event, mockContext) as SQSBatchResponse;

      expect(mockBatchWriteTrackingEvents).toHaveBeenCalledWith(
        [trackingEvents[0], trackingEvents[2]],
        expect.any(Object) // Logger instance
      );
      
      // Verify batch response includes the failed message
      expect(result).toHaveProperty('batchItemFailures');
      expect(result.batchItemFailures).toEqual([
        { itemIdentifier: 'invalid-message' }
      ]);
    });
  });
});