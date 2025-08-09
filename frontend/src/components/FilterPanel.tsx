import React, { useState, useEffect } from 'react';
import { DateRangePicker } from './DateRangePicker';
import type { FilterState } from '../types';

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onRefresh: () => void;
  loading?: boolean;
  availableSources?: string[];
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFiltersChange,
  onRefresh,
  loading = false,
  availableSources = []
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localSourceAttribution, setLocalSourceAttribution] = useState(filters.sourceAttribution);
  const [localDestinationUrl, setLocalDestinationUrl] = useState(filters.destinationUrl);

  useEffect(() => {
    setLocalSourceAttribution(filters.sourceAttribution);
    setLocalDestinationUrl(filters.destinationUrl);
  }, [filters.sourceAttribution, filters.destinationUrl]);

  const handleDateRangeChange = (startDate: Date | null, endDate: Date | null) => {
    onFiltersChange({
      ...filters,
      dateRange: {
        start: startDate,
        end: endDate
      }
    });
  };

  const handleSourceAttributionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setLocalSourceAttribution(value);
    onFiltersChange({
      ...filters,
      sourceAttribution: value
    });
  };

  const handleDestinationUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalDestinationUrl(value);
    onFiltersChange({
      ...filters,
      destinationUrl: value
    });
  };

  const handleClearFilters = () => {
    const clearedFilters: FilterState = {
      dateRange: {
        start: null,
        end: null
      },
      sourceAttribution: '',
      destinationUrl: '',
      pagination: {
        limit: 50,
        offset: 0
      }
    };
    
    setLocalSourceAttribution('');
    setLocalDestinationUrl('');
    onFiltersChange(clearedFilters);
  };

  const hasActiveFilters = 
    filters.dateRange.start || 
    filters.dateRange.end || 
    filters.sourceAttribution || 
    filters.destinationUrl;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-medium text-gray-900">Filters</h2>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Active
            </span>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
            aria-label={isExpanded ? 'Collapse filters' : 'Expand filters'}
            aria-expanded={isExpanded}
            aria-controls="filter-content"
          >
            <svg 
              className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div id="filter-content" className="space-y-6" role="region" aria-label="Filter controls">
          {/* Date Range Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Date Range</h4>
            <DateRangePicker
              startDate={filters.dateRange.start}
              endDate={filters.dateRange.end}
              onDateRangeChange={handleDateRangeChange}
              disabled={loading}
            />
          </div>

          {/* Source Attribution Filter */}
          <div>
            <label htmlFor="source-attribution" className="block text-sm font-medium text-gray-700 mb-2">
              Source Attribution
            </label>
            <select
              id="source-attribution"
              value={localSourceAttribution}
              onChange={handleSourceAttributionChange}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">All sources</option>
              {availableSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>

          {/* Destination URL Filter */}
          <div>
            <label htmlFor="destination-url" className="block text-sm font-medium text-gray-700 mb-2">
              Destination URL
            </label>
            <input
              type="text"
              id="destination-url"
              value={localDestinationUrl}
              onChange={handleDestinationUrlChange}
              placeholder="Filter by destination URL..."
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter partial URL to filter results
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Refresh Data</span>
              <span className="sm:hidden">Refresh</span>
            </button>
            
            <button
              onClick={handleClearFilters}
              disabled={loading || !hasActiveFilters}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">Clear Filters</span>
              <span className="sm:hidden">Clear</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;