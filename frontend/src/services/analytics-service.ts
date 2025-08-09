import { apiClient } from './api-client';
import type { 
  QueryResponse, 
  AggregateResponse, 
  QueryFilters, 
  AggregateFilters 
} from '../types';

/**
 * Analytics API Service
 * Handles all analytics-related API calls using CloudFront distribution routing
 */
export class AnalyticsService {
  /**
   * Query tracking events with optional filtering and pagination
   * Uses relative path /analytics/query that works with CloudFront routing
   */
  static async queryEvents(filters: QueryFilters = {}): Promise<QueryResponse> {
    try {
      const response = await apiClient.get<QueryResponse>('/analytics/query', filters);
      return response;
    } catch (error) {
      console.error('Analytics query failed:', error);
      throw error;
    }
  }

  /**
   * Get aggregate statistics grouped by source attribution
   * Uses relative path /analytics/aggregate that works with CloudFront routing
   * Supports datetime filtering with start_date and end_date parameters
   */
  static async getAggregateStats(filters: AggregateFilters = {}): Promise<AggregateResponse> {
    try {
      const response = await apiClient.get<AggregateResponse>('/analytics/aggregate', filters);
      return response;
    } catch (error) {
      console.error('Analytics aggregate query failed:', error);
      throw error;
    }
  }

  /**
   * Query events with custom retry settings for better reliability
   */
  static async queryEventsWithRetry(
    filters: QueryFilters = {},
    retries: number = 2,
    retryDelay: number = 1000
  ): Promise<QueryResponse> {
    try {
      const response = await apiClient.get<QueryResponse>('/analytics/query', filters, {
        retries,
        retryDelay
      });
      return response;
    } catch (error) {
      console.error('Analytics query with retry failed:', error);
      throw error;
    }
  }

  /**
   * Get aggregate stats with custom retry settings
   * Supports datetime filtering with start_date and end_date parameters
   */
  static async getAggregateStatsWithRetry(
    filters: AggregateFilters = {},
    retries: number = 2,
    retryDelay: number = 1000
  ): Promise<AggregateResponse> {
    try {
      const response = await apiClient.get<AggregateResponse>('/analytics/aggregate', filters, {
        retries,
        retryDelay
      });
      return response;
    } catch (error) {
      console.error('Analytics aggregate query with retry failed:', error);
      throw error;
    }
  }
}

export default AnalyticsService;