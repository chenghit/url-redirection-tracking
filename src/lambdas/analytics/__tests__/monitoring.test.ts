// Tests for monitoring and observability features in analytics Lambda
import { handler } from '../index';
import { createLoggerFromEvent } from '../../../shared/logger';
import { MetricBatcher } from '../../../shared/metrics';

// Mock dependencies
jest.mock('../../../shared/logger', () => {
  const mockLogger = {
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
    withContext: jest.fn().mockReturnValue(mockLogger)
  };
  
  return {
    createLoggerFromEvent: jest.fn().mockReturnValue(mockLogger),
    Logger: jest.fn().mockImplementation(() => mockLogger)
  };
});

jest.mock('../../../shared/metrics', () => {
  const mockAddMetric = jest.fn();
  const mockFlush = jest.fn().mockResolvedValue(undefined);
  const mockStartAutoFlush = jest.fn();
  
  const MockMetricBatcher = jest.fn().mockImplementation(() => ({
    addMetric: mockAddMetric,
    flush: mockFlush,
    startAutoFlush: mockStartAutoFlush
  }));
  
  return {
    MetricBatcher: MockMetricBatcher,
    MetricUnits: {
      COUNT: 'Count',
      MILLISECONDS: 'Milliseconds'
    },
    MetricNamespaces: {
      URL_REDIRECTION: 'URLRedirection',
      URL_REDIRECTION_LAMBDA: 'URLRedirection/Lambda'
    }
  };
});

jest.mock('../../../shared/dynamodb', () => ({
  dynamoDbClient: {
    send: jest.fn().mockResolvedValue({
      Items: [
        {
          tracking_id: 'test-tracking-id',
          timestamp: '2024-01-01T00:00:00.000Z',
          formatted_timestamp: '2024-01-01 00:00:00',
          client_ip: '127.0.0.1',
          destination_url: 'https://aws.amazon.com',
          source_attribution: 'EdgeUp001'
        }
      ]
    })
  }
}));

describe('Analytics Lambda Monitoring and Observability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize metrics batcher and log request start/end for query endpoint', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/analytics/query',
      queryStringParameters: {
        start_date: '2024-01-01T00:00:00.000Z',
        end_date: '2024-01-02T00:00:00.000Z'
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
      functionName: 'test-function'
    } as any;

    const logger = createLoggerFromEvent(event, context);

    // Act
    const response = await handler(event, context);

    // Assert
    expect(MetricBatcher).toHaveBeenCalled();
    expect(logger.logRequestStart).toHaveBeenCalledWith(event, context);
    expect(logger.logRequestEnd).toHaveBeenCalled();
    expect(response.headers).toHaveProperty('X-Response-Time');
    expect(response.headers).toHaveProperty('X-Correlation-ID', 'test-correlation-id');
  });

  it('should initialize metrics batcher and log request start/end for aggregate endpoint', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/analytics/aggregate',
      queryStringParameters: {},
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1'
        }
      }
    } as any;

    const context = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function'
    } as any;

    const logger = createLoggerFromEvent(event, context);

    // Act
    const response = await handler(event, context);

    // Assert
    expect(MetricBatcher).toHaveBeenCalled();
    expect(logger.logRequestStart).toHaveBeenCalledWith(event, context);
    expect(logger.logRequestEnd).toHaveBeenCalled();
    expect(response.headers).toHaveProperty('X-Response-Time');
  });

  it('should record error metrics when an error occurs', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/invalid-path',
      queryStringParameters: {},
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1'
        }
      }
    } as any;

    const context = {} as any;
    const logger = createLoggerFromEvent(event, context);
    const metricBatcher = new MetricBatcher('test', logger);

    // Act
    const response = await handler(event, context);

    // Assert
    expect(response.statusCode).toBe(400); // Bad request for invalid endpoint
    expect(metricBatcher.addMetric).toHaveBeenCalled();
    expect(logger.logRequestEnd).toHaveBeenCalled();
    expect(response.headers).toHaveProperty('X-Response-Time');
    expect(metricBatcher.flush).toHaveBeenCalled();
  });

  it('should use timeOperation for performance tracking', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/analytics/query',
      queryStringParameters: {
        start_date: '2024-01-01T00:00:00.000Z',
        end_date: '2024-01-02T00:00:00.000Z'
      },
      headers: {},
      requestContext: {}
    } as any;

    const context = {} as any;
    const logger = createLoggerFromEvent(event, context);

    // Act
    await handler(event, context);

    // Assert
    expect(logger.timeOperation).toHaveBeenCalledWith('analytics_query_request', expect.any(Function));
  });

  it('should record specific metrics for query endpoint', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/analytics/query',
      queryStringParameters: {
        source_attribution: 'EdgeUp001'
      },
      headers: {},
      requestContext: {}
    } as any;

    const context = {} as any;
    const metricBatcher = new MetricBatcher('test', createLoggerFromEvent(event, context));

    // Act
    await handler(event, context);

    // Assert
    expect(metricBatcher.addMetric).toHaveBeenCalledWith(
      'analytics_request_count',
      1,
      'Count',
      expect.objectContaining({
        path: 'query',
        method: 'GET'
      })
    );
  });

  it('should record specific metrics for aggregate endpoint', async () => {
    // Arrange
    const event = {
      httpMethod: 'GET',
      path: '/analytics/aggregate',
      queryStringParameters: {},
      headers: {},
      requestContext: {}
    } as any;

    const context = {} as any;
    const metricBatcher = new MetricBatcher('test', createLoggerFromEvent(event, context));

    // Act
    await handler(event, context);

    // Assert
    expect(metricBatcher.addMetric).toHaveBeenCalledWith(
      'analytics_request_count',
      1,
      'Count',
      expect.objectContaining({
        path: 'aggregate',
        method: 'GET'
      })
    );
  });
});