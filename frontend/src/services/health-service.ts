import { apiClient } from './api-client';
import type { HealthResponse, DeepHealthResponse } from '../types';

/**
 * Health API Service
 * Handles all health monitoring API calls using CloudFront distribution routing
 */
export class HealthService {
  /**
   * Get basic health status
   * Uses relative path /health that works with CloudFront routing
   */
  static async getBasicHealth(): Promise<HealthResponse> {
    try {
      const response = await apiClient.get<HealthResponse>('/health');
      return response;
    } catch (error) {
      console.error('Basic health check failed:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive health check including DynamoDB connectivity
   * Uses relative path /health/deep that works with CloudFront routing
   */
  static async getDeepHealth(): Promise<DeepHealthResponse> {
    try {
      const response = await apiClient.get<DeepHealthResponse>('/health/deep');
      return response;
    } catch (error) {
      console.error('Deep health check failed:', error);
      throw error;
    }
  }

  /**
   * Get basic health with custom retry settings for better reliability
   */
  static async getBasicHealthWithRetry(
    retries: number = 2,
    retryDelay: number = 1000
  ): Promise<HealthResponse> {
    try {
      const response = await apiClient.get<HealthResponse>('/health', undefined, {
        retries,
        retryDelay
      });
      return response;
    } catch (error) {
      console.error('Basic health check with retry failed:', error);
      throw error;
    }
  }

  /**
   * Get deep health with custom retry settings
   */
  static async getDeepHealthWithRetry(
    retries: number = 2,
    retryDelay: number = 1000
  ): Promise<DeepHealthResponse> {
    try {
      const response = await apiClient.get<DeepHealthResponse>('/health/deep', undefined, {
        retries,
        retryDelay
      });
      return response;
    } catch (error) {
      console.error('Deep health check with retry failed:', error);
      throw error;
    }
  }

  /**
   * Utility method to check if the system is healthy
   */
  static async isSystemHealthy(): Promise<boolean> {
    try {
      const health = await this.getBasicHealth();
      return health.status === 'healthy';
    } catch (error) {
      console.error('System health check failed:', error);
      return false;
    }
  }

  /**
   * Utility method to get system status with fallback
   */
  static async getSystemStatus(): Promise<{ status: string; details?: any }> {
    try {
      const health = await this.getBasicHealth();
      return { status: health.status, details: health };
    } catch (error) {
      console.error('System status check failed:', error);
      return { status: 'unhealthy', details: error };
    }
  }
}

export default HealthService;