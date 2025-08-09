import type { AggregateStats, TrackingEvent } from '../types';

/**
 * KPI calculation utilities for dashboard analytics
 */

export interface KPIData {
  totalRedirections: number;
  uniqueIPs: number;
  topSource: string;
  topSourceCount: number;
  totalSources: number;
  averageRedirectionsPerSource: number;
}

/**
 * Calculate KPI metrics from aggregate statistics
 */
export const calculateKPIsFromAggregate = (aggregateStats: AggregateStats[]): KPIData => {
  if (!aggregateStats || aggregateStats.length === 0) {
    return {
      totalRedirections: 0,
      uniqueIPs: 0,
      topSource: 'No data',
      topSourceCount: 0,
      totalSources: 0,
      averageRedirectionsPerSource: 0
    };
  }

  // Calculate total redirections across all sources
  const totalRedirections = aggregateStats.reduce((sum, stat) => sum + stat.count, 0);
  
  // Calculate total unique IPs across all sources
  const uniqueIPs = aggregateStats.reduce((sum, stat) => sum + stat.unique_ips, 0);
  
  // Find the top source by count
  const topSourceStat = aggregateStats.reduce((prev, current) => 
    prev.count > current.count ? prev : current
  );
  
  const totalSources = aggregateStats.length;
  const averageRedirectionsPerSource = totalSources > 0 ? Math.round(totalRedirections / totalSources) : 0;

  return {
    totalRedirections,
    uniqueIPs,
    topSource: topSourceStat.source_attribution,
    topSourceCount: topSourceStat.count,
    totalSources,
    averageRedirectionsPerSource
  };
};

/**
 * Calculate additional KPI metrics from tracking events
 */
export const calculateKPIsFromEvents = (events: TrackingEvent[]): {
  uniqueDestinations: number;
  uniqueClientIPs: number;
  recentActivityCount: number;
} => {
  if (!events || events.length === 0) {
    return {
      uniqueDestinations: 0,
      uniqueClientIPs: 0,
      recentActivityCount: 0
    };
  }

  // Calculate unique destinations
  const uniqueDestinations = new Set(events.map(event => event.destination_url)).size;
  
  // Calculate unique client IPs
  const uniqueClientIPs = new Set(events.map(event => event.client_ip)).size;
  
  // Recent activity count (events in the last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentActivityCount = events.filter(event => 
    new Date(event.timestamp) > oneDayAgo
  ).length;

  return {
    uniqueDestinations,
    uniqueClientIPs,
    recentActivityCount
  };
};

/**
 * Format KPI values for display
 */
export const formatKPIValue = (value: number, type: 'count' | 'percentage' | 'currency' = 'count'): string => {
  switch (type) {
    case 'count':
      return value.toLocaleString();
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'currency':
      return `$${value.toLocaleString()}`;
    default:
      return value.toString();
  }
};

/**
 * Get trend indicator based on current vs previous values
 */
export const getTrendIndicator = (current: number, previous: number): {
  trend: 'up' | 'down' | 'stable';
  percentage: number;
} => {
  if (previous === 0) {
    return { trend: 'stable', percentage: 0 };
  }

  const percentage = ((current - previous) / previous) * 100;
  
  if (Math.abs(percentage) < 1) {
    return { trend: 'stable', percentage: 0 };
  }

  return {
    trend: percentage > 0 ? 'up' : 'down',
    percentage: Math.abs(percentage)
  };
};