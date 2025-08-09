import { 
  calculateKPIsFromAggregate, 
  calculateKPIsFromEvents, 
  formatKPIValue, 
  getTrendIndicator 
} from '../kpi-calculations';
import type { AggregateStats, TrackingEvent } from '../../types';

describe('KPI Calculations', () => {
  describe('calculateKPIsFromAggregate', () => {
    it('should calculate KPIs correctly from aggregate stats', () => {
      const mockAggregateStats: AggregateStats[] = [
        {
          source_attribution: 'google.com',
          count: 150,
          unique_ips: 75,
          destinations: ['https://example.com', 'https://test.com']
        },
        {
          source_attribution: 'facebook.com',
          count: 100,
          unique_ips: 50,
          destinations: ['https://example.com']
        },
        {
          source_attribution: 'twitter.com',
          count: 50,
          unique_ips: 25,
          destinations: ['https://example.com']
        }
      ];

      const result = calculateKPIsFromAggregate(mockAggregateStats);

      expect(result.totalRedirections).toBe(300);
      expect(result.uniqueIPs).toBe(150);
      expect(result.topSource).toBe('google.com');
      expect(result.topSourceCount).toBe(150);
      expect(result.totalSources).toBe(3);
      expect(result.averageRedirectionsPerSource).toBe(100);
    });

    it('should handle empty aggregate stats', () => {
      const result = calculateKPIsFromAggregate([]);

      expect(result.totalRedirections).toBe(0);
      expect(result.uniqueIPs).toBe(0);
      expect(result.topSource).toBe('No data');
      expect(result.topSourceCount).toBe(0);
      expect(result.totalSources).toBe(0);
      expect(result.averageRedirectionsPerSource).toBe(0);
    });

    it('should handle null/undefined aggregate stats', () => {
      const result = calculateKPIsFromAggregate(null as any);

      expect(result.totalRedirections).toBe(0);
      expect(result.uniqueIPs).toBe(0);
      expect(result.topSource).toBe('No data');
    });
  });

  describe('calculateKPIsFromEvents', () => {
    it('should calculate KPIs correctly from tracking events', () => {
      const mockEvents: TrackingEvent[] = [
        {
          tracking_id: '1',
          timestamp: new Date().toISOString(),
          source_attribution: 'google.com',
          destination_url: 'https://example.com',
          client_ip: '192.168.1.1',
          ttl: 3600,
          formatted_timestamp: '2024-01-01 12:00:00'
        },
        {
          tracking_id: '2',
          timestamp: new Date().toISOString(),
          source_attribution: 'facebook.com',
          destination_url: 'https://test.com',
          client_ip: '192.168.1.2',
          ttl: 3600,
          formatted_timestamp: '2024-01-01 12:01:00'
        },
        {
          tracking_id: '3',
          timestamp: new Date().toISOString(),
          source_attribution: 'twitter.com',
          destination_url: 'https://example.com',
          client_ip: '192.168.1.1',
          ttl: 3600,
          formatted_timestamp: '2024-01-01 12:02:00'
        }
      ];

      const result = calculateKPIsFromEvents(mockEvents);

      expect(result.uniqueDestinations).toBe(2);
      expect(result.uniqueClientIPs).toBe(2);
      expect(result.recentActivityCount).toBe(3); // All events are recent
    });

    it('should handle empty events array', () => {
      const result = calculateKPIsFromEvents([]);

      expect(result.uniqueDestinations).toBe(0);
      expect(result.uniqueClientIPs).toBe(0);
      expect(result.recentActivityCount).toBe(0);
    });

    it('should filter recent activity correctly', () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago
      const recentDate = new Date().toISOString(); // Now

      const mockEvents: TrackingEvent[] = [
        {
          tracking_id: '1',
          timestamp: oldDate,
          source_attribution: 'google.com',
          destination_url: 'https://example.com',
          client_ip: '192.168.1.1',
          ttl: 3600,
          formatted_timestamp: '2024-01-01 12:00:00'
        },
        {
          tracking_id: '2',
          timestamp: recentDate,
          source_attribution: 'facebook.com',
          destination_url: 'https://test.com',
          client_ip: '192.168.1.2',
          ttl: 3600,
          formatted_timestamp: '2024-01-01 12:01:00'
        }
      ];

      const result = calculateKPIsFromEvents(mockEvents);

      expect(result.recentActivityCount).toBe(1); // Only recent event
    });
  });

  describe('formatKPIValue', () => {
    it('should format count values correctly', () => {
      expect(formatKPIValue(1000)).toBe('1,000');
      expect(formatKPIValue(1000, 'count')).toBe('1,000');
      expect(formatKPIValue(1234567)).toBe('1,234,567');
    });

    it('should format percentage values correctly', () => {
      expect(formatKPIValue(75.5, 'percentage')).toBe('75.5%');
      expect(formatKPIValue(100, 'percentage')).toBe('100.0%');
    });

    it('should format currency values correctly', () => {
      expect(formatKPIValue(1000, 'currency')).toBe('$1,000');
      expect(formatKPIValue(1234.56, 'currency')).toBe('$1,234.56');
    });
  });

  describe('getTrendIndicator', () => {
    it('should calculate upward trend correctly', () => {
      const result = getTrendIndicator(120, 100);
      expect(result.trend).toBe('up');
      expect(result.percentage).toBe(20);
    });

    it('should calculate downward trend correctly', () => {
      const result = getTrendIndicator(80, 100);
      expect(result.trend).toBe('down');
      expect(result.percentage).toBe(20);
    });

    it('should handle stable trend', () => {
      const result = getTrendIndicator(100, 100);
      expect(result.trend).toBe('stable');
      expect(result.percentage).toBe(0);
    });

    it('should handle small changes as stable', () => {
      const result = getTrendIndicator(100.5, 100);
      expect(result.trend).toBe('stable');
      expect(result.percentage).toBe(0);
    });

    it('should handle zero previous value', () => {
      const result = getTrendIndicator(100, 0);
      expect(result.trend).toBe('stable');
      expect(result.percentage).toBe(0);
    });
  });
});