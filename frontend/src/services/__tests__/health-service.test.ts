import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HealthService } from '../health-service';
import { apiClient } from '../api-client';
import type { HealthResponse, DeepHealthResponse } from '../../types';

// Mock data
const mockHealthResponse: HealthResponse = {
  status: 'healthy',
  timestamp: '2024-01-01T12:00:00Z',
  service: 'url-redirection-tracking',
  version: '1.0.0',
  region: 'us-east-1',
  environment: 'production'
};

const mockDeepHealthResponse: DeepHealthResponse = {
  status: 'healthy',
  timestamp: '2024-01-01T12:00:00Z',
  service: 'url-redirection-tracking',
  version: '1.0.0',
  region: 'us-east-1',
  environment: 'production',
  checks: {
    dynamodb: {
      status: 'healthy',
      responseTime: 45,
      tableName: 'tracking-events'
    },
    memory: {
      status: 'healthy',
      usage: {
        rss: 128,
        heapTotal: 512,
        heapUsed: 128,
        external: 32
      },
      heapUsagePercent: 25
    },
    environment: {
      status: 'healthy',
      requiredVariables: ['TABLE_NAME', 'AWS_REGION'],
      missingVariables: []
    },
    runtime: {
      status: 'healthy',
      nodeVersion: '18.x',
      platform: 'linux',
      arch: 'x64',
      uptime: 3600,
      lambdaVersion: '$LATEST',
      lambdaName: 'analytics-function'
    }
  },
  responseTime: 45
};

const mockUnhealthyResponse: HealthResponse = {
  status: 'unhealthy',
  timestamp: '2024-01-01T12:00:00Z',
  service: 'url-redirection-tracking',
  version: '1.0.0',
  region: 'us-east-1',
  environment: 'production'
};

describe('HealthService', () => {
  beforeEach(() => {
    // Clear any console.error calls between tests
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBasicHealth', () => {
    it('should successfully get basic health status', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.getBasicHealth();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeTypeOf('string');
      expect(result.service).toBeTypeOf('string');
      expect(result.version).toBeTypeOf('string');
      expect(result.region).toBeTypeOf('string');
      expect(result.environment).toBeTypeOf('string');
      
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('Health check failed');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      await expect(HealthService.getBasicHealth()).rejects.toThrow('Health check failed');
      expect(console.error).toHaveBeenCalledWith('Basic health check failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(networkError);

      await expect(HealthService.getBasicHealth()).rejects.toThrow('Network error');
      expect(console.error).toHaveBeenCalledWith('Basic health check failed:', networkError);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should handle server errors (5xx)', async () => {
      const serverError = new Error('Internal server error');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(serverError);

      await expect(HealthService.getBasicHealth()).rejects.toThrow('Internal server error');
      expect(console.error).toHaveBeenCalledWith('Basic health check failed:', serverError);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should return unhealthy status when service is down', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockUnhealthyResponse);
      
      const result = await HealthService.getBasicHealth();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('unhealthy');
      expect(getSpy).toHaveBeenCalledWith('/health');
    });
  });

  describe('getDeepHealth', () => {
    it('should successfully get deep health status', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockDeepHealthResponse);
      
      const result = await HealthService.getDeepHealth();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeTypeOf('string');
      expect(result.service).toBeTypeOf('string');
      expect(result.version).toBeTypeOf('string');
      expect(result.region).toBeTypeOf('string');
      expect(result.environment).toBeTypeOf('string');
      
      // Check deep health specific properties
      expect(result.checks).toBeDefined();
      expect(result.checks.dynamodb).toBeDefined();
      expect(result.checks.dynamodb.status).toBe('healthy');
      expect(result.checks.dynamodb.responseTime).toBeTypeOf('number');
      expect(result.checks.memory).toBeDefined();
      expect(result.checks.memory.usage.heapUsed).toBeTypeOf('number');
      expect(result.checks.memory.usage.heapTotal).toBeTypeOf('number');
      expect(result.checks.memory.heapUsagePercent).toBeTypeOf('number');
      
      expect(getSpy).toHaveBeenCalledWith('/health/deep');
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('Deep health check failed');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      await expect(HealthService.getDeepHealth()).rejects.toThrow('Deep health check failed');
      expect(console.error).toHaveBeenCalledWith('Deep health check failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/health/deep');
    });

    it('should handle database connectivity issues', async () => {
      const unhealthyDeepResponse: DeepHealthResponse = {
        ...mockDeepHealthResponse,
        status: 'unhealthy',
        checks: {
          dynamodb: {
            status: 'unhealthy',
            responseTime: 5000,
            tableName: 'tracking-events'
          },
          memory: {
            status: 'healthy',
            usage: {
              rss: 450,
              heapTotal: 512,
              heapUsed: 450,
              external: 32
            },
            heapUsagePercent: 88
          },
          environment: {
            status: 'healthy',
            requiredVariables: ['TABLE_NAME', 'AWS_REGION'],
            missingVariables: []
          },
          runtime: {
            status: 'healthy',
            nodeVersion: '18.x',
            platform: 'linux',
            arch: 'x64',
            uptime: 3600,
            lambdaVersion: '$LATEST',
            lambdaName: 'analytics-function'
          }
        }
      };
      
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(unhealthyDeepResponse);
      
      const result = await HealthService.getDeepHealth();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('unhealthy');
      expect(result.checks.dynamodb.status).toBe('unhealthy');
      expect(result.checks.dynamodb.responseTime).toBe(5000);
      expect(getSpy).toHaveBeenCalledWith('/health/deep');
    });

    it('should handle high memory usage scenarios', async () => {
      const highMemoryResponse: DeepHealthResponse = {
        ...mockDeepHealthResponse,
        checks: {
          ...mockDeepHealthResponse.checks,
          memory: {
      status: 'healthy',
      usage: {
        rss: 480,
        heapTotal: 512,
        heapUsed: 480,
        external: 32
      },
      heapUsagePercent: 94
    }
        }
      };
      
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(highMemoryResponse);
      
      const result = await HealthService.getDeepHealth();
      
      expect(result).toBeDefined();
      expect(result.checks.memory.heapUsagePercent).toBe(94);
      expect(getSpy).toHaveBeenCalledWith('/health/deep');
    });
  });

  describe('getBasicHealthWithRetry', () => {
    it('should successfully get basic health with custom retry settings', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.getBasicHealthWithRetry(1, 500);
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(getSpy).toHaveBeenCalledWith('/health', undefined, { retries: 1, retryDelay: 500 });
    });

    it('should use default retry settings when not specified', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.getBasicHealthWithRetry();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(getSpy).toHaveBeenCalledWith('/health', undefined, { retries: 2, retryDelay: 1000 });
    });

    it('should handle retry failures gracefully', async () => {
      const error = new Error('Health check failed after retries');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      await expect(HealthService.getBasicHealthWithRetry(1, 100)).rejects.toThrow('Health check failed after retries');
      expect(console.error).toHaveBeenCalledWith('Basic health check with retry failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/health', undefined, { retries: 1, retryDelay: 100 });
    });
  });

  describe('getDeepHealthWithRetry', () => {
    it('should successfully get deep health with custom retry settings', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockDeepHealthResponse);
      
      const result = await HealthService.getDeepHealthWithRetry(1, 500);
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(result.checks).toBeDefined();
      expect(getSpy).toHaveBeenCalledWith('/health/deep', undefined, { retries: 1, retryDelay: 500 });
    });

    it('should use default retry settings when not specified', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockDeepHealthResponse);
      
      const result = await HealthService.getDeepHealthWithRetry();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(getSpy).toHaveBeenCalledWith('/health/deep', undefined, { retries: 2, retryDelay: 1000 });
    });

    it('should handle retry failures gracefully', async () => {
      const error = new Error('Deep health check failed after retries');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      await expect(HealthService.getDeepHealthWithRetry(1, 100)).rejects.toThrow('Deep health check failed after retries');
      expect(console.error).toHaveBeenCalledWith('Deep health check with retry failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/health/deep', undefined, { retries: 1, retryDelay: 100 });
    });
  });

  describe('isSystemHealthy', () => {
    it('should return true when system is healthy', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.isSystemHealthy();
      
      expect(result).toBe(true);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should return false when system is unhealthy', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockUnhealthyResponse);
      
      const result = await HealthService.isSystemHealthy();
      
      expect(result).toBe(false);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should return false when health check fails', async () => {
      const error = new Error('Health check failed');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      const result = await HealthService.isSystemHealthy();
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('System health check failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should handle network errors and return false', async () => {
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(networkError);

      const result = await HealthService.isSystemHealthy();
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('System health check failed:', networkError);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });
  });

  describe('getSystemStatus', () => {
    it('should return healthy status with details when system is healthy', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.getSystemStatus();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(result.details).toBeDefined();
      expect(result.details).toEqual(mockHealthResponse);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should return unhealthy status with details when system is unhealthy', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockUnhealthyResponse);
      
      const result = await HealthService.getSystemStatus();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('unhealthy');
      expect(result.details).toBeDefined();
      expect(result.details).toEqual(mockUnhealthyResponse);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should return unhealthy status with error details when health check fails', async () => {
      const error = new Error('Health check failed');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      const result = await HealthService.getSystemStatus();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('unhealthy');
      expect(result.details).toBeDefined();
      expect(result.details).toEqual(error);
      expect(console.error).toHaveBeenCalledWith('System status check failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should handle API errors and return unhealthy status', async () => {
      const apiError = new Error('API Error');
      apiError.name = 'APIError';
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(apiError);

      const result = await HealthService.getSystemStatus();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('unhealthy');
      expect(result.details).toEqual(apiError);
      expect(console.error).toHaveBeenCalledWith('System status check failed:', apiError);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });
  });

  describe('Type Safety', () => {
    it('should return properly typed HealthResponse', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.getBasicHealth();
      
      // TypeScript should enforce these properties exist
      expect(result.status).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.service).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.region).toBeDefined();
      expect(result.environment).toBeDefined();
      
      // Verify the structure matches the expected types
      expect(result.status).toBeTypeOf('string');
      expect(result.timestamp).toBeTypeOf('string');
      expect(result.service).toBeTypeOf('string');
      expect(result.version).toBeTypeOf('string');
      expect(result.region).toBeTypeOf('string');
      expect(result.environment).toBeTypeOf('string');
    });

    it('should return properly typed DeepHealthResponse', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(mockDeepHealthResponse);
      
      const result = await HealthService.getDeepHealth();
      
      // TypeScript should enforce these properties exist
      expect(result.status).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.service).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.region).toBeDefined();
      expect(result.environment).toBeDefined();
      expect(result.checks).toBeDefined();
      
      // Verify the structure matches the expected types
      expect(result.status).toBeTypeOf('string');
      expect(result.timestamp).toBeTypeOf('string');
      expect(result.service).toBeTypeOf('string');
      expect(result.version).toBeTypeOf('string');
      expect(result.region).toBeTypeOf('string');
      expect(result.environment).toBeTypeOf('string');
      
      // Verify checks structure
      expect(result.checks.dynamodb).toBeDefined();
      expect(result.checks.dynamodb.status).toBeTypeOf('string');
      expect(result.checks.dynamodb.responseTime).toBeTypeOf('number');
      expect(result.checks.memory).toBeDefined();
      expect(result.checks.memory.usage.heapUsed).toBeTypeOf('number');
      expect(result.checks.memory.usage.heapTotal).toBeTypeOf('number');
      expect(result.checks.memory.heapUsagePercent).toBeTypeOf('number');
    });

    it('should handle boolean return type for isSystemHealthy', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.isSystemHealthy();
      
      expect(result).toBeTypeOf('boolean');
      expect(result).toBe(true);
    });

    it('should handle system status return type', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(mockHealthResponse);
      
      const result = await HealthService.getSystemStatus();
      
      expect(result).toBeDefined();
      expect(result.status).toBeTypeOf('string');
      expect(result.details).toBeDefined();
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed health response', async () => {
      const malformedResponse = {
        status: 'healthy',
        // Missing required fields
      };
      
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(malformedResponse);
      
      const result = await HealthService.getBasicHealth();
      
      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(timeoutError);

      await expect(HealthService.getBasicHealth()).rejects.toThrow('Request timeout');
      expect(console.error).toHaveBeenCalledWith('Basic health check failed:', timeoutError);
      expect(getSpy).toHaveBeenCalledWith('/health');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Unauthorized');
      authError.name = 'AuthenticationError';
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(authError);

      await expect(HealthService.getDeepHealth()).rejects.toThrow('Unauthorized');
      expect(console.error).toHaveBeenCalledWith('Deep health check failed:', authError);
      expect(getSpy).toHaveBeenCalledWith('/health/deep');
    });

    it('should handle partial deep health response', async () => {
      const partialDeepResponse = {
        ...mockHealthResponse,
        checks: {
          dynamodb: {
        status: 'healthy',
        responseTime: 45,
        tableName: 'tracking-events'
      }
          // Missing memory check
        }
      };
      
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(partialDeepResponse);
      
      const result = await HealthService.getDeepHealth();
      
      expect(result).toBeDefined();
      expect(result.checks.dynamodb).toBeDefined();
      expect(getSpy).toHaveBeenCalledWith('/health/deep');
    });
  });
});