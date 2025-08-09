import React, { useState, useMemo } from 'react';
import type { TrackingEvent } from '../types';

export interface SortConfig {
  key: keyof TrackingEvent;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  searchTerm: string;
  sourceAttribution: string;
  destinationUrl: string;
  clientIp: string;
}

export interface DataTableProps {
  data: TrackingEvent[];
  loading?: boolean;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showFilters?: boolean;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const DataTable: React.FC<DataTableProps> = ({
  data,
  loading = false,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  showFilters = true,
  className = ''
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [localPageSize, setLocalPageSize] = useState(pageSize);
  const [filters, setFilters] = useState<FilterConfig>({
    searchTerm: '',
    sourceAttribution: '',
    destinationUrl: '',
    clientIp: ''
  });

  // Filter data based on current filter configuration
  const filteredData = useMemo(() => {
    return data.filter(event => {
      // Global search term - searches across all text fields
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const searchableText = [
          event.source_attribution,
          event.destination_url,
          event.client_ip,
          event.tracking_id,
          event.formatted_timestamp || event.timestamp
        ].join(' ').toLowerCase();
        
        if (!searchableText.includes(searchLower)) {
          return false;
        }
      }

      // Specific field filters
      if (filters.sourceAttribution && 
          !event.source_attribution.toLowerCase().includes(filters.sourceAttribution.toLowerCase())) {
        return false;
      }

      if (filters.destinationUrl && 
          !event.destination_url.toLowerCase().includes(filters.destinationUrl.toLowerCase())) {
        return false;
      }

      if (filters.clientIp && 
          !event.client_ip.toLowerCase().includes(filters.clientIp.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [data, filters]);

  // Sort filtered data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Paginate sorted data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * localPageSize;
    const endIndex = startIndex + localPageSize;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage, localPageSize]);

  const totalPages = Math.ceil(sortedData.length / localPageSize);
  const totalFilteredResults = sortedData.length;

  const handleSort = (key: keyof TrackingEvent) => {
    let direction: 'asc' | 'desc' = 'asc';
    
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    setSortConfig({ key, direction });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    onPageChange?.(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setLocalPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
    onPageSizeChange?.(newPageSize);
  };

  const handleFilterChange = (filterKey: keyof FilterConfig, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      sourceAttribution: '',
      destinationUrl: '',
      clientIp: ''
    });
    setCurrentPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(value => value.length > 0);

  const getSortIcon = (columnKey: keyof TrackingEvent) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    
    return sortConfig.direction === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const truncateUrl = (url: string, maxLength: number = 50) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow ${className}`}>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Table Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">
            <span className="hidden sm:inline">Tracking Events ({totalFilteredResults} of {data.length} total)</span>
            <span className="sm:hidden">Events ({totalFilteredResults}/{data.length})</span>
          </h3>
          <div className="flex items-center space-x-2">
            <label htmlFor="pageSize" className="text-sm text-gray-700 hidden sm:inline">
              Show:
            </label>
            <select
              id="pageSize"
              value={localPageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-sm text-gray-700 hidden sm:inline">entries</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Global Search */}
            <div>
              <label htmlFor="globalSearch" className="block text-sm font-medium text-gray-700 mb-1">
                Search All Fields
              </label>
              <input
                id="globalSearch"
                type="text"
                value={filters.searchTerm}
                onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                placeholder="Search events..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Source Attribution Filter */}
            <div>
              <label htmlFor="sourceFilter" className="block text-sm font-medium text-gray-700 mb-1">
                Source Attribution
              </label>
              <input
                id="sourceFilter"
                type="text"
                value={filters.sourceAttribution}
                onChange={(e) => handleFilterChange('sourceAttribution', e.target.value)}
                placeholder="Filter by source..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Destination URL Filter */}
            <div>
              <label htmlFor="destinationFilter" className="block text-sm font-medium text-gray-700 mb-1">
                Destination URL
              </label>
              <input
                id="destinationFilter"
                type="text"
                value={filters.destinationUrl}
                onChange={(e) => handleFilterChange('destinationUrl', e.target.value)}
                placeholder="Filter by URL..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Client IP Filter */}
            <div>
              <label htmlFor="clientIpFilter" className="block text-sm font-medium text-gray-700 mb-1">
                Client IP
              </label>
              <input
                id="clientIpFilter"
                type="text"
                value={filters.clientIp}
                onChange={(e) => handleFilterChange('clientIp', e.target.value)}
                placeholder="Filter by IP..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filter Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="text-sm text-gray-600">
              {hasActiveFilters && (
                <span>
                  Active filters: {Object.entries(filters).filter(([_, value]) => value.length > 0).length}
                </span>
              )}
            </div>
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto" role="region" aria-label="Tracking events data table">
        <table className="min-w-full divide-y divide-gray-200" role="table">
          <thead className="bg-gray-50">
            <tr role="row">
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                onClick={() => handleSort('formatted_timestamp')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('formatted_timestamp');
                  }
                }}
                tabIndex={0}
                role="columnheader"
                aria-sort={
                  sortConfig?.key === 'formatted_timestamp' 
                    ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                    : 'none'
                }
                aria-label="Sort by timestamp"
              >
                <div className="flex items-center space-x-1">
                  <span>Timestamp</span>
                  {getSortIcon('formatted_timestamp')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                onClick={() => handleSort('source_attribution')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('source_attribution');
                  }
                }}
                tabIndex={0}
                role="columnheader"
                aria-sort={
                  sortConfig?.key === 'source_attribution' 
                    ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                    : 'none'
                }
                aria-label="Sort by source attribution"
              >
                <div className="flex items-center space-x-1">
                  <span>Source Attribution</span>
                  {getSortIcon('source_attribution')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                onClick={() => handleSort('destination_url')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('destination_url');
                  }
                }}
                tabIndex={0}
                role="columnheader"
                aria-sort={
                  sortConfig?.key === 'destination_url' 
                    ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                    : 'none'
                }
                aria-label="Sort by destination URL"
              >
                <div className="flex items-center space-x-1">
                  <span>Destination URL</span>
                  {getSortIcon('destination_url')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                onClick={() => handleSort('client_ip')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('client_ip');
                  }
                }}
                tabIndex={0}
                role="columnheader"
                aria-sort={
                  sortConfig?.key === 'client_ip' 
                    ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                    : 'none'
                }
                aria-label="Sort by client IP address"
              >
                <div className="flex items-center space-x-1">
                  <span>Client IP</span>
                  {getSortIcon('client_ip')}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                onClick={() => handleSort('tracking_id')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('tracking_id');
                  }
                }}
                tabIndex={0}
                role="columnheader"
                aria-sort={
                  sortConfig?.key === 'tracking_id' 
                    ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                    : 'none'
                }
                aria-label="Sort by tracking ID"
              >
                <div className="flex items-center space-x-1">
                  <span>Tracking ID</span>
                  {getSortIcon('tracking_id')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.length === 0 ? (
              <tr role="row">
                <td 
                  colSpan={5} 
                  className="px-6 py-12 text-center text-gray-500"
                  role="cell"
                  aria-label="No tracking events found in current view"
                >
                  No tracking events found
                </td>
              </tr>
            ) : (
              paginatedData.map((event, index) => (
                <tr 
                  key={event.tracking_id} 
                  className="hover:bg-gray-50"
                  role="row"
                  aria-rowindex={index + 1}
                >
                  <td 
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                    role="cell"
                    aria-label={`Timestamp: ${formatTimestamp(event.formatted_timestamp || event.timestamp)}`}
                  >
                    {formatTimestamp(event.formatted_timestamp || event.timestamp)}
                  </td>
                  <td 
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                    role="cell"
                    aria-label={`Source attribution: ${event.source_attribution}`}
                  >
                    <span 
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      role="status"
                    >
                      {event.source_attribution}
                    </span>
                  </td>
                  <td 
                    className="px-6 py-4 text-sm text-gray-900"
                    role="cell"
                    aria-label={`Destination URL: ${event.destination_url}`}
                  >
                    <a
                      href={event.destination_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                      title={event.destination_url}
                      aria-label={`Open destination URL: ${event.destination_url} in new tab`}
                    >
                      {truncateUrl(event.destination_url)}
                    </a>
                  </td>
                  <td 
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono"
                    role="cell"
                    aria-label={`Client IP address: ${event.client_ip}`}
                  >
                    {event.client_ip}
                  </td>
                  <td 
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono"
                    role="cell"
                    aria-label={`Tracking ID: ${event.tracking_id}`}
                  >
                    <span title={event.tracking_id}>
                      {event.tracking_id.substring(0, 8)}...
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-gray-700">
              <span className="hidden sm:inline">
                Showing {((currentPage - 1) * localPageSize) + 1} to{' '}
                {Math.min(currentPage * localPageSize, totalFilteredResults)} of{' '}
                {totalFilteredResults} results
                {totalFilteredResults !== data.length && (
                  <span className="text-gray-500"> (filtered from {data.length} total)</span>
                )}
              </span>
              <span className="sm:hidden">
                {((currentPage - 1) * localPageSize) + 1}-{Math.min(currentPage * localPageSize, totalFilteredResults)} of {totalFilteredResults}
              </span>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-2 sm:px-3 py-1 text-xs sm:text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="hidden sm:inline">Previous</span>
                <span className="sm:hidden">Prev</span>
              </button>
              
              <div className="flex items-center space-x-1">
                {[...Array(Math.min(3, totalPages))].map((_, i) => {
                  let pageNum;
                  if (totalPages <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage <= 2) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 1) {
                    pageNum = totalPages - 2 + i;
                  } else {
                    pageNum = currentPage - 1 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-2 sm:px-3 py-1 text-xs sm:text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="hidden sm:inline">Next</span>
                <span className="sm:hidden">Next</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;