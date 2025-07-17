// Tests for monitoring and observability features
import { handler } from '../index';
import { createLoggerFromEvent } from '../../../shared/logger';
import * as utils from '../../../shared/utils';
import * as dynamodb from '../../../shared/dynamodb';

// Mock dependencies
jest.mock('../../../shared/logger', () => {
  const originalModule = jest.requireActual('../../../shared/logger');
  
  return {
    ...originalModule,
    createLoggerFromEvent: jest.fn().mockImplementation(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      performance: jest.fn(),
      metric: jest.fn(),
      timeOperation: jest.fn().mockImplementation((_, fn) => fn()),
      getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
      logRequestStart: jest.fn(),
      logRequestEnd: jest.fn(),
      withContext: jest.fn().mockImplementation(function() { return this; })
    }))
  };
});

jest.mock('../../../shared/dynamodb', () => ({
  writeTrackingEvent: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../shared/utils', () => ({
  extractClientIp: jest.fn().mockReturnValue('127.0.0.1'),
  createTrackingEvent: jest.fn().mockReturnValue({
    tracking_id: 'test-tracking-id',
    timestamp: '2024-01-01T00:00:00.000Z',
    formatted_timestamp: '2024-01-01 00:00:00',
    client_ip: '127.0.0.1',
    destination_url: 'https://aws.amazon.com',
    source_attribution: 'EdgeUp001'
  }),
  generateTrackingId: jest.fn().mockReturnValue('test-tracking-id')
}));

// Spy on console.log to verify structured logging
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('Monitoring and Observability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it('should include correlation ID in response headers', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/redirect',
      queryStringParameters: {
        url: 'https://aws.amazon.com',
        sa: 'EdgeUp001'
      },
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1'
        }
      }
    } as any;

    const context = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      getRemainingTimeInMillis: () => 30000
    } as any;

    // Act
    const response = await handler(event, context);

    // Assert
    expect(response.headers).toHaveProperty('X-Correlation-ID', 'test-correlation-id');
    expect(response.headers).toHaveProperty('X-Response-Time');
    expect(createLoggerFromEvent).toHaveBeenCalledWith(event, context);
  });

  it('should log request start and end with performance metrics', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/redirect',
      queryStringParameters: {
        url: 'https://aws.amazon.com',
        sa: 'EdgeUp001'
      },
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1'
        }
      }
    } as any;

    const context = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      getRemainingTimeInMillis: () => 30000
    } as any;

    const logger = createLoggerFromEvent(event, context);

    // Act
    await handler(event, context);

    // Assert
    expect(logger.logRequestStart).toHaveBeenCalledWith(event, context);
    expect(logger.logRequestEnd).toHaveBeenCalledWith(302, expect.any(Number));
    expect(logger.metric).toHaveBeenCalledWith('redirection_count', 1, 'Count', expect.any(Object));
  });

  it('should use timeOperation for performance tracking', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/redirect',
      queryStringParameters: {
        url: 'https://aws.amazon.com',
        sa: 'EdgeUp001'
      },
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1'
        }
      }
    } as any;

    const context = {} as any;
    const logger = createLoggerFromEvent(event, context);

    // Act
    await handler(event, context);

    // Assert
    expect(logger.timeOperation).toHaveBeenCalledWith('url_validation', expect.any(Function));
    expect(logger.timeOperation).toHaveBeenCalledWith('sa_validation', expect.any(Function));
    expect(logger.timeOperation).toHaveBeenCalledWith('create_tracking_event', expect.any(Function));
  });

  it('should include performance metrics in error responses', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/redirect',
      queryStringParameters: {
        // Missing URL parameter to trigger error
      },
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1'
        }
      }
    } as any;

    const context = {} as any;
    const logger = createLoggerFromEvent(event, context);

    // Act
    const response = await handler(event, context);

    // Assert
    expect(response.statusCode).toBe(400); // Bad request
    expect(response.headers).toHaveProperty('X-Correlation-ID');
    expect(response.headers).toHaveProperty('X-Response-Time');
    expect(logger.logRequestEnd).toHaveBeenCalledWith(400, expect.any(Number));
  });

  it('should log asynchronous tracking events', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/redirect',
      queryStringParameters: {
        url: 'https://aws.amazon.com',
        sa: 'EdgeUp001'
      },
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1'
        }
      }
    } as any;

    const context = {} as any;
    const logger = createLoggerFromEvent(event, context);

    // Mock successful tracking
    (dynamodb.writeTrackingEvent as jest.Mock).mockResolvedValueOnce(undefined);

    // Act
    await handler(event, context);
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Assert
    expect(dynamodb.writeTrackingEvent).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Tracking event recorded successfully'),
      expect.objectContaining({
        tracking_id: 'test-tracking-id'
      })
    );
  });
});