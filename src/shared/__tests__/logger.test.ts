// Tests for enhanced logger with monitoring capabilities
import { Logger, createLogger, createLoggerFromEvent } from '../logger';

describe('Enhanced Logger', () => {
  // Spy on console.log to verify structured logging
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    consoleLogSpy.mockRestore();
  });
  
  describe('Logger class', () => {
    it('should create a logger with default context', () => {
      // Act
      const logger = new Logger();
      
      // Assert
      expect(logger.getCorrelationId()).toBeDefined();
      expect(logger.getContext()).toHaveProperty('correlation_id');
      expect(logger.getContext()).toHaveProperty('service');
      expect(logger.getContext()).toHaveProperty('environment');
      expect(logger.getContext()).toHaveProperty('region');
    });
    
    it('should create a logger with custom context', () => {
      // Act
      const logger = new Logger({
        correlation_id: 'test-correlation-id',
        user_ip: '127.0.0.1',
        operation: 'test-operation'
      });
      
      // Assert
      expect(logger.getCorrelationId()).toBe('test-correlation-id');
      expect(logger.getContext()).toHaveProperty('user_ip', '127.0.0.1');
      expect(logger.getContext()).toHaveProperty('operation', 'test-operation');
    });
    
    it('should log messages with different levels', () => {
      // Arrange
      const logger = new Logger({ correlation_id: 'test-correlation-id' });
      
      // Act
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
      
      // Check debug log
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"DEBUG"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"Debug message"'));
      
      // Check info log
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"INFO"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"Info message"'));
      
      // Check warn log
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"WARN"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"Warning message"'));
      
      // Check error log
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"ERROR"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"Error message"'));
    });
    
    it('should log errors with details', () => {
      // Arrange
      const logger = new Logger();
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      // Act
      logger.error('An error occurred', error, { additional: 'context' });
      
      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logCall = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logCall).toHaveProperty('level', 'ERROR');
      expect(logCall).toHaveProperty('message', 'An error occurred');
      expect(logCall).toHaveProperty('error.name', 'Error');
      expect(logCall).toHaveProperty('error.message', 'Test error');
      expect(logCall).toHaveProperty('error.stack', 'Error: Test error\n    at test.js:1:1');
      expect(logCall).toHaveProperty('context.additional', 'context');
    });
    
    it('should log performance metrics', () => {
      // Arrange
      const logger = new Logger();
      
      // Act
      logger.performance('test-operation', 123);
      
      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logCall = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logCall).toHaveProperty('level', 'METRIC');
      expect(logCall).toHaveProperty('message', 'Performance metric: test-operation');
      expect(logCall).toHaveProperty('performance.duration_ms', 123);
      expect(logCall).toHaveProperty('performance.operation', 'test-operation');
      expect(logCall).toHaveProperty('performance.start_time');
      expect(logCall).toHaveProperty('performance.end_time');
      expect(logCall).toHaveProperty('performance.resource_utilization.memory_used_mb');
      expect(logCall).toHaveProperty('metrics');
      expect(logCall.metrics).toHaveLength(2);
      expect(logCall.metrics[0]).toHaveProperty('name', 'test-operation_duration');
      expect(logCall.metrics[0]).toHaveProperty('value', 123);
      expect(logCall.metrics[0]).toHaveProperty('unit', 'Milliseconds');
    });
    
    it('should log custom metrics', () => {
      // Arrange
      const logger = new Logger();
      
      // Act
      logger.metric('test_metric', 42, 'Count', { dimension1: 'value1' });
      
      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logCall = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logCall).toHaveProperty('level', 'METRIC');
      expect(logCall).toHaveProperty('message', 'Custom metric: test_metric');
      expect(logCall).toHaveProperty('metrics');
      expect(logCall.metrics).toHaveLength(1);
      expect(logCall.metrics[0]).toHaveProperty('name', 'test_metric');
      expect(logCall.metrics[0]).toHaveProperty('value', 42);
      expect(logCall.metrics[0]).toHaveProperty('unit', 'Count');
      expect(logCall.metrics[0]).toHaveProperty('dimensions.dimension1', 'value1');
    });
    
    it('should time async operations', async () => {
      // Arrange
      const logger = new Logger();
      const mockFn = jest.fn().mockResolvedValue('result');
      
      // Act
      const result = await logger.timeOperation('test-operation', mockFn);
      
      // Assert
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3); // debug start, performance, debug end
      
      // Check for performance log
      const performanceLog = consoleLogSpy.mock.calls.find(call => 
        call[0].includes('"level":"METRIC"')
      );
      expect(performanceLog).toBeDefined();
      
      const logCall = JSON.parse(performanceLog[0]);
      expect(logCall).toHaveProperty('performance.operation', 'test-operation');
      expect(logCall).toHaveProperty('performance.duration_ms');
    });
    
    it('should handle errors in timed operations', async () => {
      // Arrange
      const logger = new Logger();
      const mockError = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(mockError);
      
      // Act & Assert
      await expect(logger.timeOperation('test-operation', mockFn)).rejects.toThrow('Test error');
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      // Check for error log
      const errorLog = consoleLogSpy.mock.calls.find(call => 
        call[0].includes('"level":"ERROR"')
      );
      expect(errorLog).toBeDefined();
      
      const logCall = JSON.parse(errorLog[0]);
      expect(logCall).toHaveProperty('message', 'Failed operation: test-operation');
      expect(logCall).toHaveProperty('error.message', 'Test error');
      expect(logCall).toHaveProperty('context.duration_ms');
    });
    
    it('should time synchronous operations', () => {
      // Arrange
      const logger = new Logger();
      const mockFn = jest.fn().mockReturnValue('result');
      
      // Act
      const result = logger.timeSyncOperation('test-operation', mockFn);
      
      // Assert
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3); // debug start, performance, debug end
      
      // Check for performance log
      const performanceLog = consoleLogSpy.mock.calls.find(call => 
        call[0].includes('"level":"METRIC"')
      );
      expect(performanceLog).toBeDefined();
      
      const logCall = JSON.parse(performanceLog[0]);
      expect(logCall).toHaveProperty('performance.operation', 'test-operation');
      expect(logCall).toHaveProperty('performance.duration_ms');
    });
    
    it('should log request start and end', () => {
      // Arrange
      const logger = new Logger();
      const mockEvent = {
        httpMethod: 'GET',
        path: '/test',
        queryStringParameters: { param: 'value' },
        headers: { 'user-agent': 'test-agent' }
      };
      const mockContext = {
        awsRequestId: 'test-request-id',
        getRemainingTimeInMillis: () => 30000
      };
      
      // Act
      logger.logRequestStart(mockEvent, mockContext);
      logger.logRequestEnd(200, 123);
      
      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(3); // info start, info end, metric
      
      // Check request start log
      const startLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(startLog).toHaveProperty('message', 'Request started');
      expect(startLog).toHaveProperty('context.http_method', 'GET');
      expect(startLog).toHaveProperty('context.path', '/test');
      expect(startLog).toHaveProperty('context.query_params.param', 'value');
      expect(startLog).toHaveProperty('context.request_id', 'test-request-id');
      
      // Check request end log
      const endLog = JSON.parse(consoleLogSpy.mock.calls[1][0]);
      expect(endLog).toHaveProperty('message', 'Request completed');
      expect(endLog).toHaveProperty('context.status_code', 200);
      expect(endLog).toHaveProperty('context.duration_ms', 123);
      expect(endLog).toHaveProperty('context.success', true);
      
      // Check metric log
      const metricLog = JSON.parse(consoleLogSpy.mock.calls[2][0]);
      expect(metricLog).toHaveProperty('metrics[0].name', 'request_duration');
      expect(metricLog).toHaveProperty('metrics[0].value', 123);
      expect(metricLog).toHaveProperty('metrics[0].dimensions.status_code', '200');
      expect(metricLog).toHaveProperty('metrics[0].dimensions.success', 'true');
    });
  });
  
  describe('createLogger', () => {
    it('should create a logger from Lambda context', () => {
      // Arrange
      const mockContext = {
        awsRequestId: 'test-request-id',
        functionName: 'test-function'
      };
      
      // Act
      const logger = createLogger(mockContext, { user_ip: '127.0.0.1' });
      
      // Assert
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getContext()).toHaveProperty('request_id', 'test-request-id');
      expect(logger.getContext()).toHaveProperty('function_name', 'test-function');
      expect(logger.getContext()).toHaveProperty('user_ip', '127.0.0.1');
    });
  });
  
  describe('createLoggerFromEvent', () => {
    it('should create a logger from API Gateway event', () => {
      // Arrange
      const mockEvent = {
        httpMethod: 'GET',
        path: '/test',
        headers: {
          'X-Correlation-ID': 'event-correlation-id'
        },
        requestContext: {
          identity: {
            sourceIp: '127.0.0.1'
          }
        }
      };
      
      const mockContext = {
        awsRequestId: 'test-request-id',
        functionName: 'test-function'
      };
      
      // Act
      const logger = createLoggerFromEvent(mockEvent, mockContext);
      
      // Assert
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getCorrelationId()).toBe('event-correlation-id');
      expect(logger.getContext()).toHaveProperty('user_ip', '127.0.0.1');
      expect(logger.getContext()).toHaveProperty('operation', 'GET /test');
    });
    
    it('should generate correlation ID if not in headers', () => {
      // Arrange
      const mockEvent = {
        httpMethod: 'GET',
        path: '/test',
        headers: {},
        requestContext: {}
      };
      
      // Act
      const logger = createLoggerFromEvent(mockEvent);
      
      // Assert
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getCorrelationId()).toBeDefined();
      expect(logger.getCorrelationId()).not.toBe('');
    });
  });
});