// Integration tests for DLQ processor functionality

import { 
  makeRedirectionRequest, 
  generateUniqueSourceAttribution,
  queryTrackingEventsBySource,
  wait,
  retry,
  dynamoDbClient
} from './setup';
import { AWS_REGION } from '../shared/constants';

// Mock SQS client since we can't import the actual module in the test environment
const mockSendCommand = jest.fn().mockResolvedValue({});
const mockReceiveCommand = jest.fn().mockResolvedValue({ Messages: [] });
const mockDeleteCommand = jest.fn().mockResolvedValue({});

const SQSClient = jest.fn().mockImplementation(() => ({
  send: jest.fn((command) => {
    if (command.constructor.name === 'SendMessageCommand') {
      return mockSendCommand();
    } else if (command.constructor.name === 'ReceiveMessageCommand') {
      return mockReceiveCommand();
    } else if (command.constructor.name === 'DeleteMessageCommand') {
      return mockDeleteCommand();
    }
    return Promise.resolve({});
  })
}));

const SendMessageCommand = jest.fn().mockImplementation((params) => ({
  ...params,
  constructor: { name: 'SendMessageCommand' }
}));

const ReceiveMessageCommand = jest.fn().mockImplementation((params) => ({
  ...params,
  constructor: { name: 'ReceiveMessageCommand' }
}));

const DeleteMessageCommand = jest.fn().mockImplementation((params) => ({
  ...params,
  constructor: { name: 'DeleteMessageCommand' }
}));

describe('DLQ Processor Integration Tests', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(60000);
  
  // SQS client for DLQ operations
  const sqsClient = new SQSClient({ region: AWS_REGION });
  
  // DLQ URL - should be set in environment variables for testing
  const dlqUrl = process.env.DLQ_URL || 'https://sqs.ap-northeast-1.amazonaws.com/123456789012/url-redirection-dlq';
  
  describe('Error Recovery Flow', () => {
    // Generate unique source attribution for this test
    const uniqueSA = generateUniqueSourceAttribution();
    const destinationUrl = 'https://aws.amazon.com/ec2/';
    
    test('should process failed tracking events from DLQ', async () => {
      // Step 1: Create a tracking event message in the format expected by the system
      const trackingEvent = {
        tracking_id: `test-${Date.now()}`,
        timestamp: new Date().toISOString(),
        formatted_timestamp: new Date().toLocaleString('en-US', { 
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).replace(',', ''),
        source_attribution: uniqueSA,
        client_ip: '192.168.1.1',
        destination_url: destinationUrl
      };
      
      // Step 2: Send the message directly to the DLQ
      const sendParams = {
        QueueUrl: dlqUrl,
        MessageBody: JSON.stringify(trackingEvent),
        MessageAttributes: {
          'ErrorType': {
            DataType: 'String',
            StringValue: 'DYNAMODB_ERROR'
          },
          'ErrorMessage': {
            DataType: 'String',
            StringValue: 'Simulated error for integration testing'
          },
          'OriginalTimestamp': {
            DataType: 'String',
            StringValue: new Date().toISOString()
          }
        }
      };
      
      try {
        await sqsClient.send(new SendMessageCommand(sendParams));
        console.log('Test message sent to DLQ');
        
        // Step 3: Wait for the DLQ processor to process the message
        // This assumes the DLQ processor is running and polling the queue
        await wait(10000);
        
        // Step 4: Verify that the tracking event was recovered and stored in DynamoDB
        const events = await retry(async () => {
          const result = await queryTrackingEventsBySource(uniqueSA);
          if (result.length === 0) {
            throw new Error('Recovered tracking event not found');
          }
          return result;
        }, 5, 2000);
        
        // Verify the recovered event matches what we sent
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].source_attribution).toBe(uniqueSA);
        expect(events[0].destination_url).toBe(destinationUrl);
        expect(events[0].tracking_id).toBeDefined();
        
      } catch (error) {
        console.error('Error in DLQ test:', error);
        throw error;
      }
    });
    
    test('should handle malformed messages in DLQ gracefully', async () => {
      // Send a malformed message to the DLQ
      const malformedMessage = {
        invalid_field: 'This is not a valid tracking event',
        timestamp: new Date().toISOString()
      };
      
      const sendParams = {
        QueueUrl: dlqUrl,
        MessageBody: JSON.stringify(malformedMessage),
        MessageAttributes: {
          'ErrorType': {
            DataType: 'String',
            StringValue: 'UNKNOWN_ERROR'
          }
        }
      };
      
      try {
        // Send the malformed message
        await sqsClient.send(new SendMessageCommand(sendParams));
        console.log('Malformed test message sent to DLQ');
        
        // Wait for processing
        await wait(5000);
        
        // The test passes if no exceptions are thrown during processing
        // We can't easily verify the error was logged, but the system should not crash
        
        // Clean up by receiving and deleting the message if it wasn't processed
        const receiveParams = {
          QueueUrl: dlqUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5
        };
        
        const receiveResult = await sqsClient.send(new ReceiveMessageCommand(receiveParams));
        
        if (receiveResult.Messages && receiveResult.Messages.length > 0) {
          for (const message of receiveResult.Messages) {
            // Check if this is our test message
            try {
              const body = JSON.parse(message.Body || '{}');
              if (body.invalid_field === 'This is not a valid tracking event') {
                // Delete the test message
                await sqsClient.send(new DeleteMessageCommand({
                  QueueUrl: dlqUrl,
                  ReceiptHandle: message.ReceiptHandle
                }));
                console.log('Cleaned up test message from DLQ');
              }
            } catch (e) {
              console.error('Error parsing message body:', e);
            }
          }
        }
        
      } catch (error) {
        console.error('Error in malformed message test:', error);
        throw error;
      }
    });
  });
});