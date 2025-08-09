// Demo file to verify API client works with CloudFront distribution routing
// This file demonstrates the new service classes and CloudFront-compatible paths
// This file can be used for manual testing and will be removed later

import { AnalyticsService } from './analytics-service';
import { HealthService } from './health-service';
import { apiClient } from './api-client';
import type { QueryResponse, AggregateResponse, HealthResponse, QueryFilters, AggregateFilters } from '../types';

// Demo functions showing how to use the new service classes with CloudFront routing
export class APIDemo {
  // Test health endpoint using HealthService
  static async testHealth(): Promise<HealthResponse> {
    try {
      const response = await HealthService.getBasicHealth();
      console.log('Health check successful:', response);
      return response;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  // Test deep health endpoint
  static async testDeepHealth(): Promise<any> {
    try {
      const response = await HealthService.getDeepHealth();
      console.log('Deep health check successful:', response);
      return response;
    } catch (error) {
      console.error('Deep health check failed:', error);
      throw error;
    }
  }

  // Test analytics query endpoint using AnalyticsService
  static async testQuery(filters?: QueryFilters): Promise<QueryResponse> {
    try {
      const response = await AnalyticsService.queryEvents(filters);
      console.log('Analytics query successful:', response);
      return response;
    } catch (error) {
      console.error('Analytics query failed:', error);
      throw error;
    }
  }

  // Test analytics aggregate endpoint
  static async testAggregate(filters?: AggregateFilters): Promise<AggregateResponse> {
    try {
      const response = await AnalyticsService.getAggregateStats(filters);
      console.log('Analytics aggregate query successful:', response);
      return response;
    } catch (error) {
      console.error('Analytics aggregate query failed:', error);
      throw error;
    }
  }

  // Test CloudFront routing with correct paths
  static async testCloudFrontRouting(): Promise<void> {
    console.log('Testing CloudFront distribution routing...');
    console.log('Base URL:', apiClient.getBaseURL());
    
    try {
      // Test health endpoint (should route to API Gateway via CloudFront)
      console.log('Testing /health endpoint...');
      const health = await HealthService.getBasicHealth();
      console.log('✓ Health endpoint working:', health.status);

      // Test analytics endpoints (should route to API Gateway via CloudFront)
      console.log('Testing /analytics/query endpoint...');
      const query = await AnalyticsService.queryEvents({ limit: 5 });
      console.log('✓ Analytics query endpoint working, events count:', query.data.events.length);

      console.log('Testing /analytics/aggregate endpoint...');
      const aggregate = await AnalyticsService.getAggregateStats();
      console.log('✓ Analytics aggregate endpoint working, stats count:', aggregate.data.length);

      console.log('✅ All CloudFront routing tests passed!');
    } catch (error) {
      console.error('❌ CloudFront routing test failed:', error);
      throw error;
    }
  }

  // Test error handling with new service classes
  static async testErrorHandling(): Promise<void> {
    try {
      // This should trigger a 404 error
      await apiClient.get('/nonexistent-endpoint');
    } catch (error) {
      console.log('Error handling test - caught expected error:', error);
    }
  }

  // Test retry logic with new service classes
  static async testRetryLogic(): Promise<void> {
    try {
      // Use custom retry settings with HealthService
      const response = await HealthService.getBasicHealthWithRetry(2, 500);
      console.log('Retry logic test successful:', response);
    } catch (error) {
      console.log('Retry logic test - final error after retries:', error);
    }
  }

  // Test all endpoints in sequence
  static async runAllTests(): Promise<void> {
    console.log('🚀 Starting API Demo Tests...');
    
    try {
      await this.testCloudFrontRouting();
      await this.testHealth();
      await this.testDeepHealth();
      await this.testQuery({ limit: 3 });
      await this.testAggregate();
      await this.testRetryLogic();
      await this.testErrorHandling();
      
      console.log('✅ All API demo tests completed successfully!');
    } catch (error) {
      console.error('❌ API demo tests failed:', error);
    }
  }
}

// Export for potential use in development
export default APIDemo;