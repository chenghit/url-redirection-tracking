import React, { useState, useEffect, useCallback } from 'react';
import { AnalyticsService } from '../services/analytics-service';
import { FilterPanel } from '../components/FilterPanel';
import { LoadingInline, CardSkeleton } from '../components/Loading';
import { ExportButton } from '../components';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';
import PieChart from '../components/PieChart';
import DataTable from '../components/DataTable';
import type { 
  TrackingEvent, 
  AggregateStats, 
  FilterState
} from '../types';

interface AnalyticsState {
  events: TrackingEvent[];
  aggregateStats: AggregateStats[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const Analytics: React.FC = () => {
  // State management for analytics data
  const [analyticsState, setAnalyticsState] = useState<AnalyticsState>({
    events: [],
    aggregateStats: [],
    loading: false,
    error: null,
    lastUpdated: null
  });

  // Filter state management
  const [filters, setFilters] = useState<FilterState>({
    dateRange: {
      start: null,
      end: null
    },
    sourceAttribution: '',
    destinationUrl: '',
    pagination: {
      limit: 100,
      offset: 0
    }
  });

  // Available sources for filter dropdown
  const [availableSources, setAvailableSources] = useState<string[]>([]);

  // Convert filter state to API parameters
  const buildQueryFilters = useCallback(() => {
    const queryFilters: any = {
      limit: filters.pagination.limit,
      offset: filters.pagination.offset,
      sort_order: 'desc' // Most recent first
    };

    if (filters.dateRange.start) {
      // Use ISO 8601 format as required by the API
      const startDate = new Date(filters.dateRange.start);
      startDate.setHours(0, 0, 0, 0); // Set to start of day
      queryFilters.start_date = startDate.toISOString();
    }
    if (filters.dateRange.end) {
      // Use ISO 8601 format as required by the API
      const endDate = new Date(filters.dateRange.end);
      endDate.setHours(23, 59, 59, 999); // Set to end of day
      queryFilters.end_date = endDate.toISOString();
    }
    if (filters.sourceAttribution) {
      queryFilters.source_attribution = filters.sourceAttribution;
    }
    if (filters.destinationUrl) {
      queryFilters.destination_url = filters.destinationUrl;
    }

    return queryFilters;
  }, [filters]);

  const buildAggregateFilters = useCallback(() => {
    const aggregateFilters: any = {};

    // ✅ Aggregate endpoint now supports datetime filters
    if (filters.dateRange.start) {
      const startDate = new Date(filters.dateRange.start);
      startDate.setHours(0, 0, 0, 0); // Set to start of day
      aggregateFilters.start_date = startDate.toISOString();
    }
    if (filters.dateRange.end) {
      const endDate = new Date(filters.dateRange.end);
      endDate.setHours(23, 59, 59, 999); // Set to end of day
      aggregateFilters.end_date = endDate.toISOString();
    }
    if (filters.sourceAttribution) {
      aggregateFilters.source_attribution = filters.sourceAttribution;
    }

    return aggregateFilters;
  }, [filters]);

  // Fetch analytics data
  const fetchAnalyticsData = useCallback(async () => {
    setAnalyticsState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch both query events and aggregate stats in parallel
      const [queryResponse, aggregateResponse] = await Promise.all([
        AnalyticsService.queryEvents(buildQueryFilters()),
        AnalyticsService.getAggregateStats(buildAggregateFilters())
      ]);

      // Extract unique sources for filter dropdown
      const sources = Array.from(
        new Set([
          ...queryResponse.data.events.map(event => event.source_attribution),
          ...aggregateResponse.data.map(stat => stat.source_attribution)
        ])
      ).filter(Boolean).sort();

      setAnalyticsState({
        events: queryResponse.data.events,
        aggregateStats: aggregateResponse.data,
        loading: false,
        error: null,
        lastUpdated: new Date().toISOString()
      });

      setAvailableSources(sources);

    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
      
      let errorMessage = 'Failed to load analytics data';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      setAnalyticsState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
    }
  }, [buildQueryFilters, buildAggregateFilters]);

  // Initial data fetch
  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Handle filter changes
  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  // Handle manual refresh
  const handleRefresh = () => {
    fetchAnalyticsData();
  };

  // Handle bar chart click-to-filter functionality
  const handleSourceClick = (sourceAttribution: string) => {
    setFilters(prev => ({
      ...prev,
      sourceAttribution: sourceAttribution,
      pagination: {
        ...prev.pagination,
        offset: 0 // Reset pagination when filtering
      }
    }));
  };

  // Handle pie chart click-to-filter functionality
  const handleDestinationClick = (destinationUrl: string) => {
    setFilters(prev => ({
      ...prev,
      destinationUrl: destinationUrl,
      pagination: {
        ...prev.pagination,
        offset: 0 // Reset pagination when filtering
      }
    }));
  };

  // Error display component
  const ErrorDisplay: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">Error loading analytics data</h3>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
        <div className="ml-3">
          <button
            onClick={onRetry}
            className="bg-red-100 text-red-800 px-3 py-1 rounded-md text-sm hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );

  // Chart container component for consistent styling
  const ChartContainer: React.FC<{ 
    title: string; 
    children: React.ReactNode; 
    loading?: boolean;
    className?: string;
  }> = ({ title, children, loading = false, className = '' }) => (
    <div className={`bg-white p-4 sm:p-6 rounded-lg shadow ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate pr-2">{title}</h3>
        {loading && <LoadingInline size="sm" message="" />}
      </div>
      <div className="h-48 sm:h-64">
        {children}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Analytics</h1>
          {analyticsState.lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {new Date(analyticsState.lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <div className="hidden sm:flex space-x-2">
            <ExportButton
              type="events"
              events={analyticsState.events}
              disabled={analyticsState.loading}
              size="md"
              variant="primary"
              label="Export Events"
            />
            <ExportButton
              type="aggregate"
              aggregateStats={analyticsState.aggregateStats}
              disabled={analyticsState.loading}
              size="md"
              variant="secondary"
              label="Export Stats"
            />
            <ExportButton
              type="combined"
              events={analyticsState.events}
              aggregateStats={analyticsState.aggregateStats}
              disabled={analyticsState.loading}
              size="md"
              variant="primary"
              label="Export All"
            />
          </div>
          {/* Mobile: Show only combined export */}
          <div className="sm:hidden">
            <ExportButton
              type="combined"
              events={analyticsState.events}
              aggregateStats={analyticsState.aggregateStats}
              disabled={analyticsState.loading}
              size="md"
              variant="primary"
              label="Export Data"
            />
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      <FilterPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onRefresh={handleRefresh}
        loading={analyticsState.loading}
        availableSources={availableSources}
      />

      {/* Error Display */}
      {analyticsState.error && (
        <ErrorDisplay error={analyticsState.error} onRetry={handleRefresh} />
      )}

      {/* Data Summary */}
      {!analyticsState.error && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <span className="text-sm text-blue-600">Total Events:</span>
                <span className="ml-2 font-semibold text-blue-800">
                  {analyticsState.loading ? '...' : analyticsState.events.length.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-sm text-blue-600">Sources:</span>
                <span className="ml-2 font-semibold text-blue-800">
                  {analyticsState.loading ? '...' : analyticsState.aggregateStats.length}
                </span>
              </div>
            </div>
            {analyticsState.loading && (
              <LoadingInline size="sm" message="Loading data..." />
            )}
          </div>
        </div>
      )}

      {/* Chart Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Time Series Chart Container */}
        {analyticsState.loading ? (
          <CardSkeleton />
        ) : (
          <ChartContainer title="Time Series Chart" loading={analyticsState.loading}>
            <LineChart 
              events={analyticsState.events} 
              loading={analyticsState.loading}
            />
          </ChartContainer>
        )}
        
        {/* Source Attribution Chart Container */}
        {analyticsState.loading ? (
          <CardSkeleton />
        ) : (
          <ChartContainer title="Source Attribution" loading={analyticsState.loading}>
            <BarChart 
              aggregateStats={analyticsState.aggregateStats}
              loading={analyticsState.loading}
              onSourceClick={handleSourceClick}
            />
          </ChartContainer>
        )}
        
        {/* Destination Distribution Chart Container */}
        {analyticsState.loading ? (
          <CardSkeleton />
        ) : (
          <ChartContainer title="Destination Distribution" loading={analyticsState.loading}>
            <PieChart 
              aggregateStats={analyticsState.aggregateStats}
              loading={analyticsState.loading}
              onDestinationClick={handleDestinationClick}
            />
          </ChartContainer>
        )}
        
        {/* Data Table Container */}
        <div className="xl:col-span-2">
          {analyticsState.loading ? (
            <CardSkeleton />
          ) : (
            <DataTable 
              data={analyticsState.events}
              loading={analyticsState.loading}
              pageSize={25}
              showFilters={true}
              className="w-full"
            />
          )}
        </div>
      </div>

      {/* Debug Information (only in development) */}
      {import.meta.env.DEV && (
        <details className="bg-gray-50 p-4 rounded-lg">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Debug Information (Development Only)
          </summary>
          <div className="mt-2 text-xs text-gray-600">
            <p><strong>API Base URL:</strong> {import.meta.env.VITE_CLOUDFRONT_URL || 'Relative paths (current domain)'}</p>
            <p><strong>Events Count:</strong> {analyticsState.events.length}</p>
            <p><strong>Aggregate Stats Count:</strong> {analyticsState.aggregateStats.length}</p>
            <p><strong>Available Sources:</strong> {availableSources.join(', ') || 'None'}</p>
            <p><strong>Current Filters:</strong> {JSON.stringify(filters, null, 2)}</p>
          </div>
        </details>
      )}
    </div>
  );
};

export default Analytics;