// Tests for monitoring and observability utilities
import { 
  createCorrelationHeaders,
  extractCorrelationId
} from '../monitoring';
import { Logger } from '../logger';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch', () => {
  return {
    CloudWatchClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({})
    })),
    PutMetricAlarmCommand: jest.fn().mockImplementation((params) => params),
    ComparisonOperator: {
      GreaterThanThreshold: 'GreaterThanThreshold',
      LessThanThreshold: 'LessThanThreshold'
    },
    Statistic: {
      Average: 'Average',
      Sum: 'Sum',
      Maximum: 'Maximum',
      p95: 'p95'
    }
  };
});

describe('Monitoring Utilities', () => {
  let mockLogger: Logger;
  
  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    } as unknown as Logger;
    
    jest.clearAllMocks();
  });

  describe('createCorrelationHeaders', () => {
    it('should create headers with correlation ID', () => {
      // Act
      const headers = createCorrelationHeaders('test-correlation-id');
      
      // Assert
      expect(headers).toEqual({
        'X-Correlation-ID': 'test-correlation-id'
      });
    });
  });
  
  describe('extractCorrelationId', () => {
    it('should extract correlation ID from headers', () => {
      // Arrange
      const headers = {
        'X-Correlation-ID': 'test-correlation-id',
        'Content-Type': 'application/json'
      };
      
      // Act
      const correlationId = extractCorrelationId(headers, 'default-id');
      
      // Assert
      expect(correlationId).toBe('test-correlation-id');
    });
    
    it('should use default ID if correlation ID not in headers', () => {
      // Arrange
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Act
      const correlationId = extractCorrelationId(headers, 'default-id');
      
      // Assert
      expect(correlationId).toBe('default-id');
    });
    
    it('should handle lowercase header name', () => {
      // Arrange
      const headers = {
        'x-correlation-id': 'test-correlation-id',
        'Content-Type': 'application/json'
      };
      
      // Act
      const correlationId = extractCorrelationId(headers, 'default-id');
      
      // Assert
      expect(correlationId).toBe('test-correlation-id');
    });
  });
});