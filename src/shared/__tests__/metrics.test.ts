// Tests for CloudWatch metrics utility
import { 
  createMetric, 
  batchMetrics, 
  publishMetrics, 
  MetricBatcher,
  MetricUnits,
  MetricNamespaces
} from '../metrics';
import { Logger } from '../logger';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch', () => {
  return {
    CloudWatchClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({})
    })),
    PutMetricDataCommand: jest.fn().mockImplementation((params) => params)
  };
});

describe('Metrics Utility', () => {
  let mockLogger: Logger;
  
  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getCorrelationId: jest.fn().mockReturnValue('test-correlation-id')
    } as unknown as Logger;
    
    jest.clearAllMocks();
  });

  describe('createMetric', () => {
    it('should create a metric with the correct structure', () => {
      // Act
      const metric = createMetric('test_metric', 42, MetricUnits.COUNT, {
        service: 'test-service',
        environment: 'test'
      });
      
      // Assert
      expect(metric).toEqual({
        MetricName: 'test_metric',
        Value: 42,
        Unit: 'Count',
        Dimensions: [
          { Name: 'service', Value: 'test-service' },
          { Name: 'environment', Value: 'test' }
        ]
      });
    });
    
    it('should create a metric without dimensions', () => {
      // Act
      const metric = createMetric('test_metric', 42, MetricUnits.COUNT);
      
      // Assert
      expect(metric).toEqual({
        MetricName: 'test_metric',
        Value: 42,
        Unit: 'Count',
        Dimensions: undefined
      });
    });
  });
  
  describe('batchMetrics', () => {
    it('should batch metrics into groups of 20', () => {
      // Arrange
      const metrics = Array(45).fill(null).map((_, i) => 
        createMetric(`metric_${i}`, i, MetricUnits.COUNT)
      );
      
      // Act
      const batches = batchMetrics(metrics);
      
      // Assert
      expect(batches.length).toBe(3);
      expect(batches[0].length).toBe(20);
      expect(batches[1].length).toBe(20);
      expect(batches[2].length).toBe(5);
    });
    
    it('should handle empty metrics array', () => {
      // Act
      const batches = batchMetrics([]);
      
      // Assert
      expect(batches.length).toBe(0);
    });
  });
  
  describe('publishMetrics', () => {
    it('should call CloudWatch client with correct parameters', async () => {
      // Arrange
      const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
      const metrics = [
        createMetric('test_metric', 42, MetricUnits.COUNT),
        createMetric('another_metric', 99, MetricUnits.MILLISECONDS)
      ];
      
      // Act
      await publishMetrics(MetricNamespaces.URL_REDIRECTION, metrics, mockLogger);
      
      // Assert
      expect(CloudWatchClient).toHaveBeenCalled();
      expect(PutMetricDataCommand).toHaveBeenCalledWith({
        Namespace: MetricNamespaces.URL_REDIRECTION,
        MetricData: expect.arrayContaining([
          expect.objectContaining({
            MetricName: 'test_metric',
            Value: 42,
            Unit: 'Count',
            Timestamp: expect.any(Date)
          }),
          expect.objectContaining({
            MetricName: 'another_metric',
            Value: 99,
            Unit: 'Milliseconds',
            Timestamp: expect.any(Date)
          })
        ])
      });
      expect(mockLogger.debug).toHaveBeenCalled();
    });
    
    it('should handle errors gracefully', async () => {
      // Arrange
      const { CloudWatchClient } = require('@aws-sdk/client-cloudwatch');
      const mockSend = jest.fn().mockRejectedValue(new Error('Test error'));
      CloudWatchClient.mockImplementationOnce(() => ({
        send: mockSend
      }));
      
      const metrics = [createMetric('test_metric', 42, MetricUnits.COUNT)];
      
      // Act
      await publishMetrics(MetricNamespaces.URL_REDIRECTION, metrics, mockLogger);
      
      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to publish metrics to CloudWatch',
        expect.any(Error),
        expect.objectContaining({
          namespace: MetricNamespaces.URL_REDIRECTION,
          metric_count: 1
        })
      );
    });
  });
  
  describe('MetricBatcher', () => {
    let metricBatcher: MetricBatcher;
    
    beforeEach(() => {
      metricBatcher = new MetricBatcher(
        MetricNamespaces.URL_REDIRECTION,
        mockLogger,
        1000
      );
      
      // Mock flush method
      metricBatcher.flush = jest.fn().mockResolvedValue(undefined);
    });
    
    afterEach(() => {
      metricBatcher.stopAutoFlush();
    });
    
    it('should add metrics to the batch', () => {
      // Act
      metricBatcher.addMetric('test_metric', 42, MetricUnits.COUNT);
      metricBatcher.addMetric('another_metric', 99, MetricUnits.MILLISECONDS);
      
      // Assert
      expect((metricBatcher as any).metrics.length).toBe(2);
    });
    
    it('should flush metrics on demand', async () => {
      // Arrange
      metricBatcher.addMetric('test_metric', 42, MetricUnits.COUNT);
      
      // Act
      await metricBatcher.flush();
      
      // Assert
      expect(metricBatcher.flush).toHaveBeenCalled();
    });
    
    it('should start and stop auto flush', () => {
      // Arrange
      const originalSetInterval = global.setInterval;
      const originalClearInterval = global.clearInterval;
      global.setInterval = jest.fn().mockReturnValue(123 as unknown as NodeJS.Timeout);
      global.clearInterval = jest.fn();
      
      // Act
      metricBatcher.startAutoFlush();
      
      // Assert
      expect(global.setInterval).toHaveBeenCalled();
      
      // Act again
      metricBatcher.stopAutoFlush();
      
      // Assert again
      expect(global.clearInterval).toHaveBeenCalledWith(123);
      
      // Cleanup
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
  });
});