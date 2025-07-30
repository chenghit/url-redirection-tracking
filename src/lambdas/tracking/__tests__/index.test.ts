import { SQSEvent, SQSRecord } from 'aws-lambda';

// Mock AWS SDK before importing the handler
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: mockSend
    })
  },
  BatchWriteCommand: jest.fn().mockImplementation((params) => ({ input: params }))
}));

// Import handler after mocks are set up
import { handler } from '../index';

// Mock timestamp utility
jest.mock('../../../utils/timestamp', () => ({
  formatTimestampToUTC8: jest.fn((timestamp: string) => {
    // Mock implementation that adds 8 hours and formats
    const date = new Date(timestamp);
    const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    return utc8Date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  })
}));

describe('Tracking Lambda Handler', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-tracking-table';
    process.env.AWS_REGION = 'ap-northeast-1';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createSQSRecord = (messageId: string, body: any): SQSRecord => ({
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
  });

  const createValidTrackingMessage = () => ({
    tracking_id: 'test-uuid-123',
    timestamp: '2024-01-15T10:30:45.123Z',
    source_attribution: 'EdgeUp001',
    client_ip: '192.168.1.1',
    destination_url: 'https://aws.amazon.com/cn/blogs/'
  });

  describe('Message Validation', () => {
    it('should process valid tracking messages successfully', async () => {
      const validMessage = createValidTrackingMessage();
      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', validMessage)]
      };

      mockSend.mockResolvedValueOnce({
        UnprocessedItems: {}
      });

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            RequestItems: {
              'test-tracking-table': [
                {
                  PutRequest: {
                    Item: expect.objectContaining({
                      tracking_id: 'test-uuid-123',
                      timestamp: '2024-01-15T10:30:45.123Z',
                      source_attribution: 'EdgeUp001',
                      client_ip: '192.168.1.1',
                      destination_url: 'https://aws.amazon.com/cn/blogs/',
                      formatted_timestamp: expect.any(String),
                      ttl: expect.any(Number)
                    })
                  }
                }
              ]
            }
          })
        })
      );
    });

    it('should handle messages without source_attribution', async () => {
      const messageWithoutSA = {
        tracking_id: 'test-uuid-123',
        timestamp: '2024-01-15T10:30:45.123Z',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/'
      };

      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', messageWithoutSA)]
      };

      mockSend.mockResolvedValueOnce({
        UnprocessedItems: {}
      });

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            RequestItems: {
              'test-tracking-table': [
                {
                  PutRequest: {
                    Item: expect.objectContaining({
                      tracking_id: 'test-uuid-123',
                      source_attribution: undefined
                    })
                  }
                }
              ]
            }
          })
        })
      );
    });

    it('should skip invalid messages with missing required fields', async () => {
      const invalidMessage = {
        tracking_id: 'test-uuid-123',
        // Missing timestamp, client_ip, destination_url
      };

      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', invalidMessage)]
      };

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should skip messages with invalid timestamp format', async () => {
      const invalidMessage = {
        tracking_id: 'test-uuid-123',
        timestamp: 'invalid-timestamp',
        client_ip: '192.168.1.1',
        destination_url: 'https://aws.amazon.com/cn/blogs/'
      };

      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', invalidMessage)]
      };

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should skip messages with malformed JSON', async () => {
      const sqsRecord = createSQSRecord('msg-1', {});
      sqsRecord.body = 'invalid-json{';

      const sqsEvent: SQSEvent = {
        Records: [sqsRecord]
      };

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('DynamoDB Integration', () => {
    it('should handle DynamoDB write success', async () => {
      const validMessage = createValidTrackingMessage();
      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', validMessage)]
      };

      mockSend.mockResolvedValueOnce({
        UnprocessedItems: {}
      });

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle partial DynamoDB failures', async () => {
      const validMessage1 = createValidTrackingMessage();
      const validMessage2 = { ...createValidTrackingMessage(), tracking_id: 'test-uuid-456' };

      const sqsEvent: SQSEvent = {
        Records: [
          createSQSRecord('msg-1', validMessage1),
          createSQSRecord('msg-2', validMessage2)
        ]
      };

      // Mock partial failure response
      mockSend.mockResolvedValueOnce({
        UnprocessedItems: {
          'test-tracking-table': [
            {
              PutRequest: {
                Item: expect.any(Object)
              }
            }
          ]
        }
      });

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should handle complete DynamoDB failure', async () => {
      const validMessage = createValidTrackingMessage();
      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', validMessage)]
      };

      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple valid messages in a batch', async () => {
      const messages = [
        createValidTrackingMessage(),
        { ...createValidTrackingMessage(), tracking_id: 'test-uuid-456' },
        { ...createValidTrackingMessage(), tracking_id: 'test-uuid-789' }
      ];

      const sqsEvent: SQSEvent = {
        Records: messages.map((msg, index) => createSQSRecord(`msg-${index + 1}`, msg))
      };

      mockSend.mockResolvedValueOnce({
        UnprocessedItems: {}
      });

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            RequestItems: {
              'test-tracking-table': expect.arrayContaining([
                expect.objectContaining({
                  PutRequest: {
                    Item: expect.objectContaining({
                      tracking_id: 'test-uuid-123'
                    })
                  }
                }),
                expect.objectContaining({
                  PutRequest: {
                    Item: expect.objectContaining({
                      tracking_id: 'test-uuid-456'
                    })
                  }
                }),
                expect.objectContaining({
                  PutRequest: {
                    Item: expect.objectContaining({
                      tracking_id: 'test-uuid-789'
                    })
                  }
                })
              ])
            }
          })
        })
      );
    });

    it('should handle mixed valid and invalid messages', async () => {
      const validMessage = createValidTrackingMessage();
      const invalidMessage = { tracking_id: 'invalid' }; // Missing required fields

      const sqsEvent: SQSEvent = {
        Records: [
          createSQSRecord('msg-1', validMessage),
          createSQSRecord('msg-2', invalidMessage)
        ]
      };

      mockSend.mockResolvedValueOnce({
        UnprocessedItems: {}
      });

      const result = await handler(sqsEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            RequestItems: {
              'test-tracking-table': [
                expect.objectContaining({
                  PutRequest: {
                    Item: expect.objectContaining({
                      tracking_id: 'test-uuid-123'
                    })
                  }
                })
              ]
            }
          })
        })
      );
    });
  });

  describe('Environment Configuration', () => {
    it('should throw error when DYNAMODB_TABLE_NAME is not set', async () => {
      const originalTableName = process.env.DYNAMODB_TABLE_NAME;
      delete process.env.DYNAMODB_TABLE_NAME;

      const validMessage = createValidTrackingMessage();
      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', validMessage)]
      };

      await expect(handler(sqsEvent)).rejects.toThrow('Missing required environment variable: DYNAMODB_TABLE_NAME');
      
      // Restore the environment variable
      process.env.DYNAMODB_TABLE_NAME = originalTableName;
    });
  });

  describe('TTL Calculation', () => {
    it('should add TTL field to DynamoDB items', async () => {
      const validMessage = createValidTrackingMessage();
      const sqsEvent: SQSEvent = {
        Records: [createSQSRecord('msg-1', validMessage)]
      };

      mockSend.mockResolvedValueOnce({
        UnprocessedItems: {}
      });

      const beforeTime = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
      
      await handler(sqsEvent);

      const afterTime = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            RequestItems: {
              'test-tracking-table': [
                {
                  PutRequest: {
                    Item: expect.objectContaining({
                      ttl: expect.any(Number)
                    })
                  }
                }
              ]
            }
          })
        })
      );

      // Verify TTL is approximately 1 year from now
      const call = mockSend.mock.calls[0][0];
      const ttl = call.input.RequestItems['test-tracking-table'][0].PutRequest.Item.ttl;
      expect(ttl).toBeGreaterThanOrEqual(beforeTime - 1);
      expect(ttl).toBeLessThanOrEqual(afterTime + 1);
    });
  });
});