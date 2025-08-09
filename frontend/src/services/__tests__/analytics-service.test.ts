import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AnalyticsService } from '../analytics-service';
import { apiClient } from '../api-client';
import type { QueryFilters, AggregateFilters, QueryResponse, AggregateResponse } from '../../types';

// Mock data
const mockQueryResponse: QueryResponse = {
  data: {
    events: [
      {
        tracking_id: 'test-id-1',
        timestamp: '2024-01-01T10:00:00Z',
        source_attribution: 'email',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.1',
        ttl: 1704110400,
        formatted_timestamp: '2024-01-01 10:00:00 UTC'
      },
      {
        tracking_id: 'test-id-2',
        timestamp: '2024-01-01T11:00:00Z',
        source_attribution: 'social',
        destination_url: 'https://example.org',
        client_ip: '192.168.1.2',
        ttl: 1704114000,
        formatted_timestamp: '2024-01-01 11:00:00 UTC'
      }
    ],
    total_count: 2,
    has_more: false
  },
  timestamp: '2024-01-01T12:00:00Z'
};

const mockAggregateResponse: AggregateResponse = {
  data: [
    {
      source_attribution: 'email',
      count: 10,
      unique_ips: 8,
      destinations: ['https://example.com', 'https://test.com']
    },
    {
      source_attribution: 'social',
      count: 5,
      unique_ips: 4,
      destinations: ['https://example.org']
    }
  ],
  timestamp: '2024-01-01T12:00:00Z'
};

describe('AnalyticsService', () => {
  beforeEach(() => {
    // Clear any console.error calls between tests
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('queryEvents', () => {
    it('should successfully query events with default parameters', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockQueryResponse);
      
      const result = await AnalyticsService.queryEvents();
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.data.events).toBeInstanceOf(Array);
      expect(result.data.total_count).toBeTypeOf('number');
      expect(result.data.has_more).toBeTypeOf('boolean');
      expect(result.timestamp).toBeTypeOf('string');
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', {});
    });

    it('should query events with custom filters', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockQueryResponse);
      
      const filters: QueryFilters = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        source_attribution: 'email',
        limit: 5,
        offset: 0,
        sort_order: 'desc'
      };

      const result = await AnalyticsService.queryEvents(filters);
      
      expect(result).toBeDefined();
      expect(result.data.events).toBeInstanceOf(Array);
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', filters);
    });

    it('should handle pagination parameters correctly', async () => {
      const paginatedResponse = {
        ...mockQueryResponse,
        data: {
          ...mockQueryResponse.data,
          events: [mockQueryResponse.data.events[0]], // Only first event
          has_more: true
        }
      };
      
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(paginatedResponse);
      
      const filters: QueryFilters = {
        limit: 1,
        offset: 0
      };

      const result = await AnalyticsService.queryEvents(filters);
      
      expect(result.data.events).toHaveLength(1);
      expect(result.data.total_count).toBeGreaterThan(0);
      expect(result.data.has_more).toBe(true);
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', filters);
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('API Error');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      await expect(AnalyticsService.queryEvents()).rejects.toThrow('API Error');
      expect(console.error).toHaveBeenCalledWith('Analytics query failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', {});
    });

    it('should pass all filter parameters to the API', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockQueryResponse);
      
      const filters: QueryFilters = {
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-01-31T23:59:59Z',
        source_attribution: 'social',
        destination_url: 'https://example.com',
        limit: 20,
        offset: 10,
        sort_order: 'asc'
      };

      await AnalyticsService.queryEvents(filters);
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', filters);
    });
  });

  describe('getAggregateStats', () => {
    it('should successfully get aggregate statistics with default parameters', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const result = await AnalyticsService.getAggregateStats();
      
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.timestamp).toBeTypeOf('string');
      
      if (result.data.length > 0) {
        const stat = result.data[0];
        expect(stat.source_attribution).toBeTypeOf('string');
        expect(stat.count).toBeTypeOf('number');
        expect(stat.unique_ips).toBeTypeOf('number');
        expect(stat.destinations).toBeInstanceOf(Array);
      }
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', {});
    });

    it('should get aggregate stats with source attribution filter', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const filters: AggregateFilters = {
        source_attribution: 'email'
      };

      const result = await AnalyticsService.getAggregateStats(filters);
      
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', filters);
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('API Error');
      const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(error);

      await expect(AnalyticsService.getAggregateStats()).rejects.toThrow('API Error');
      expect(console.error).toHaveBeenCalledWith('Analytics aggregate query failed:', error);
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', {});
    });

    it('should pass source attribution filter parameters to the API', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const filters: AggregateFilters = {
        source_attribution: 'social'
      };

      await AnalyticsService.getAggregateStats(filters);
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', filters);
    });

    it('should pass datetime filter parameters to the API', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const filters: AggregateFilters = {
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-01-31T23:59:59Z',
        source_attribution: 'email'
      };

      await AnalyticsService.getAggregateStats(filters);
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', filters);
    });

    it('should support datetime filtering without source attribution', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const filters: AggregateFilters = {
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-01-31T23:59:59Z'
      };

      await AnalyticsService.getAggregateStats(filters);
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', filters);
    });
  });

  describe('queryEventsWithRetry', () => {
    it('should successfully query events with custom retry settings', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockQueryResponse);
      
      const result = await AnalyticsService.queryEventsWithRetry({}, 1, 500);
      
      expect(result).toBeDefined();
      expect(result.data.events).toBeInstanceOf(Array);
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', {}, { retries: 1, retryDelay: 500 });
    });

    it('should pass retry options to the API client', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockQueryResponse);
      
      const filters: QueryFilters = { limit: 10 };
      await AnalyticsService.queryEventsWithRetry(filters, 3, 1000);
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', filters, { retries: 3, retryDelay: 1000 });
    });
  });

  describe('getAggregateStatsWithRetry', () => {
    it('should successfully get aggregate stats with custom retry settings', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const result = await AnalyticsService.getAggregateStatsWithRetry({}, 1, 500);
      
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', {}, { retries: 1, retryDelay: 500 });
    });

    it('should pass retry options to the API client', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const filters: AggregateFilters = { source_attribution: 'email' };
      await AnalyticsService.getAggregateStatsWithRetry(filters, 2, 800);
      
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', filters, { retries: 2, retryDelay: 800 });
    });
  });

  describe('Type Safety', () => {
    it('should enforce QueryFilters type for queryEvents', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockQueryResponse);
      
      // This test ensures TypeScript compilation catches type errors
      const validFilters: QueryFilters = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        source_attribution: 'email',
        destination_url: 'https://example.com',
        limit: 10,
        offset: 0,
        sort_order: 'desc'
      };

      const result = await AnalyticsService.queryEvents(validFilters);
      expect(result).toBeDefined();
      expect(getSpy).toHaveBeenCalledWith('/analytics/query', validFilters);
    });

    it('should enforce AggregateFilters type for getAggregateStats', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      // This test ensures TypeScript compilation catches type errors
      const validFilters: AggregateFilters = {
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-01-31T23:59:59Z',
        source_attribution: 'email'
      };

      const result = await AnalyticsService.getAggregateStats(validFilters);
      expect(result).toBeDefined();
      expect(getSpy).toHaveBeenCalledWith('/analytics/aggregate', validFilters);
    });

    it('should return properly typed QueryResponse', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(mockQueryResponse);
      
      const result = await AnalyticsService.queryEvents();
      
      // TypeScript should enforce these properties exist
      expect(result.data).toBeDefined();
      expect(result.data.events).toBeDefined();
      expect(result.data.total_count).toBeDefined();
      expect(result.data.has_more).toBeDefined();
      expect(result.timestamp).toBeDefined();
      
      // Verify the structure matches the expected types
      result.data.events.forEach(event => {
        expect(event.tracking_id).toBeTypeOf('string');
        expect(event.timestamp).toBeTypeOf('string');
        expect(event.source_attribution).toBeTypeOf('string');
        expect(event.destination_url).toBeTypeOf('string');
        expect(event.client_ip).toBeTypeOf('string');
        expect(event.ttl).toBeTypeOf('number');
        expect(event.formatted_timestamp).toBeTypeOf('string');
      });
    });

    it('should return properly typed AggregateResponse', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(mockAggregateResponse);
      
      const result = await AnalyticsService.getAggregateStats();
      
      // TypeScript should enforce these properties exist
      expect(result.data).toBeDefined();
      expect(result.timestamp).toBeDefined();
      
      // Verify the structure matches the expected types
      result.data.forEach(stat => {
        expect(stat.source_attribution).toBeTypeOf('string');
        expect(stat.count).toBeTypeOf('number');
        expect(stat.unique_ips).toBeTypeOf('number');
        expect(stat.destinations).toBeInstanceOf(Array);
        stat.destinations.forEach(dest => {
          expect(dest).toBeTypeOf('string');
        });
      });
    });
  });
});