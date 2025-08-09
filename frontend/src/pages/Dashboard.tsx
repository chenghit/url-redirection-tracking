import React, { useState, useEffect, useCallback } from 'react';
import { AnalyticsService } from '../services/analytics-service';
import Loading from '../components/Loading';
import { KPICard } from '../components/KPICard';
import { FilterPanel } from '../components/FilterPanel';
import { ExportButton } from '../components';
import { calculateKPIsFromAggregate } from '../utils/kpi-calculations';
import type { AggregateStats, TrackingEvent, FilterState, QueryFilters, AggregateFilters } from '../types';

interface DashboardData {
  aggregateStats: AggregateStats[];
  recentEvents: TrackingEvent[];
  availableSources: string[];
  availableDestinations: string[];
}

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData>({
    aggregateStats: [],
    recentEvents: [],
    availableSources: [],
    availableDestinations: []
  });
  const [filters, setFilters] = useState<FilterState>({
    dateRange: {
      start: null,
      end: null
    },
    sourceAttribution: '',
    destinationUrl: '',
    pagination: {
      limit: 10,
      offset: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Dashboard: Starting data fetch...');
      console.log('API Base URL:', import.meta.env.VITE_CLOUDFRONT_URL || 'Using relative paths');

      // Build query filters from current filter state
      const queryFilters: QueryFilters = {
        limit: filters.pagination.limit,
        sort_order: 'desc'
      };

      const aggregateFilters: AggregateFilters = {};

      // Add date range filters if set
      if (filters.dateRange.start) {
        // Use ISO 8601 format as required by the API
        const startDate = new Date(filters.dateRange.start);
        startDate.setHours(0, 0, 0, 0); // Set to start of day
        queryFilters.start_date = startDate.toISOString();
        aggregateFilters.start_date = startDate.toISOString(); // ✅ Now supported by aggregate endpoint
      }

      if (filters.dateRange.end) {
        // Use ISO 8601 format as required by the API
        const endDate = new Date(filters.dateRange.end);
        endDate.setHours(23, 59, 59, 999); // Set to end of day
        queryFilters.end_date = endDate.toISOString();
        aggregateFilters.end_date = endDate.toISOString(); // ✅ Now supported by aggregate endpoint
      }

      // Add source attribution filter if set
      if (filters.sourceAttribution) {
        queryFilters.source_attribution = filters.sourceAttribution;
        aggregateFilters.source_attribution = filters.sourceAttribution;
      }

      // Add destination URL filter if set
      if (filters.destinationUrl) {
        queryFilters.destination_url = filters.destinationUrl;
      }

      console.log('Dashboard: Fetching aggregate stats...');
      // Fetch aggregate stats for KPI calculations
      const aggregateResponse = await AnalyticsService.getAggregateStats(aggregateFilters);
      console.log('Dashboard: Aggregate stats received:', aggregateResponse);
      
      console.log('Dashboard: Fetching recent events...');
      // Fetch recent events for activity display
      const queryResponse = await AnalyticsService.queryEvents(queryFilters);
      console.log('Dashboard: Query response received:', queryResponse);

      // Extract available sources and destinations for filter options
      const availableSources = [...new Set(aggregateResponse.data.map(stat => stat.source_attribution))].sort();
      const availableDestinations = [...new Set(queryResponse.data.events.map(event => event.destination_url))].sort();

      setData({
        aggregateStats: aggregateResponse.data,
        recentEvents: queryResponse.data.events,
        availableSources,
        availableDestinations
      });

      setLastUpdated(new Date().toLocaleString());
      console.log('Dashboard: Data fetch completed successfully');
    } catch (err) {
      console.error('Dashboard: Failed to fetch data:', err);
      const errorMessage = err instanceof Error ? 
        `${err.message} (Check browser console for details)` : 
        'Failed to load dashboard data - Check browser console for details';
      setError(errorMessage);
      
      // Set some mock data so the page isn't completely blank
      setData({
        aggregateStats: [],
        recentEvents: [],
        availableSources: [],
        availableDestinations: []
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    fetchDashboardData();
  };

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  // Calculate KPIs from data
  const kpiData = calculateKPIsFromAggregate(data.aggregateStats);

  if (loading && data.aggregateStats.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Development Mode Indicator */}
      {import.meta.env.DEV && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="text-yellow-400 mr-3">⚠️</div>
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Development Mode</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>API Base URL: {import.meta.env.VITE_CLOUDFRONT_URL || 'Using relative paths'}</p>
                <p>Check browser console for API call details.</p>
                <a href="/debug" className="underline">Go to Debug Dashboard</a>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {lastUpdated}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <ExportButton
            type="combined"
            events={data.recentEvents}
            aggregateStats={data.aggregateStats}
            disabled={loading}
            size="md"
            variant="secondary"
            label="Export Data"
          />
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-describedby="refresh-desc"
            aria-label={loading ? "Refreshing dashboard data" : "Refresh dashboard data"}
          >
            {loading && (
              <div 
                className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"
                aria-hidden="true"
              ></div>
            )}
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">Refresh Data</span>
            <span id="refresh-desc" className="sr-only">
              Click to refresh all dashboard data and statistics
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div 
          className="bg-red-50 border border-red-200 rounded-md p-4" 
          role="alert" 
          aria-live="polite"
          aria-labelledby="error-title"
        >
          <div className="flex">
            <div className="flex-shrink-0">
              <svg 
                className="h-5 w-5 text-red-400" 
                viewBox="0 0 20 20" 
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 id="error-title" className="text-sm font-medium text-red-800">Error loading dashboard data</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleRefresh}
                  className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  aria-describedby="error-retry-desc"
                >
                  Try again
                  <span id="error-retry-desc" className="sr-only">
                    Retry loading dashboard data
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Panel */}
      <FilterPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onRefresh={handleRefresh}
        loading={loading}
        availableSources={data.availableSources}

      />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KPICard
          title="Total Redirections"
          value={kpiData.totalRedirections}
          subtitle="All time redirections"
          color="blue"
          loading={loading}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        
        <KPICard
          title="Unique IPs"
          value={kpiData.uniqueIPs}
          subtitle="Unique visitors"
          color="green"
          loading={loading}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        
        <KPICard
          title="Top Source"
          value={kpiData.topSource}
          subtitle={`${kpiData.topSourceCount.toLocaleString()} redirections`}
          color="purple"
          loading={loading}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        
        <KPICard
          title="Active Sources"
          value={kpiData.totalSources}
          subtitle="Total source attributions"
          color="yellow"
          loading={loading}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loading />
          </div>
        ) : data.recentEvents && data.recentEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Destination
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.recentEvents.map((event) => (
                  <tr key={event.tracking_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {event.formatted_timestamp}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {event.source_attribution}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 truncate max-w-xs" title={event.destination_url}>
                      {event.destination_url}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {event.client_ip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No recent activity found</p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;