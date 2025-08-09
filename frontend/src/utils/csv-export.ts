/**
 * CSV Export Utilities
 * Provides functionality to export analytics data to CSV format
 */

import type { TrackingEvent, AggregateStats } from '../types';

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV<T extends Record<string, any>>(
  data: T[],
  headers: Array<{ key: keyof T; label: string }>
): string {
  // Create header row
  const headerRow = headers.map(header => `"${header.label}"`).join(',');
  
  if (data.length === 0) {
    return headerRow;
  }
  
  // Create data rows
  const dataRows = data.map(item => {
    return headers.map(header => {
      const value = item[header.key];
      // Handle null/undefined values
      if (value === null || value === undefined) {
        return '""';
      }
      // Convert to string and escape quotes
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    }).join(',');
  });

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Download CSV file to user's device
 */
function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export tracking events to CSV
 */
export function exportEventsToCSV(events: TrackingEvent[], filename?: string): void {
  const headers = [
    { key: 'tracking_id' as keyof TrackingEvent, label: 'Tracking ID' },
    { key: 'formatted_timestamp' as keyof TrackingEvent, label: 'Timestamp' },
    { key: 'source_attribution' as keyof TrackingEvent, label: 'Source Attribution' },
    { key: 'destination_url' as keyof TrackingEvent, label: 'Destination URL' },
    { key: 'client_ip' as keyof TrackingEvent, label: 'Client IP' },
    { key: 'ttl' as keyof TrackingEvent, label: 'TTL' }
  ];

  const csvContent = arrayToCSV(events, headers);
  const defaultFilename = `tracking-events-${new Date().toISOString().split('T')[0]}.csv`;
  
  downloadCSV(csvContent, filename || defaultFilename);
}

/**
 * Export aggregate statistics to CSV
 */
export function exportAggregateStatsToCSV(stats: AggregateStats[], filename?: string): void {
  // Transform aggregate stats to flatten destinations array
  const flattenedStats = stats.map(stat => ({
    source_attribution: stat.source_attribution,
    count: stat.count,
    unique_ips: stat.unique_ips,
    destinations: stat.destinations.join('; ') // Join destinations with semicolon
  }));

  const headers = [
    { key: 'source_attribution' as keyof typeof flattenedStats[0], label: 'Source Attribution' },
    { key: 'count' as keyof typeof flattenedStats[0], label: 'Total Count' },
    { key: 'unique_ips' as keyof typeof flattenedStats[0], label: 'Unique IPs' },
    { key: 'destinations' as keyof typeof flattenedStats[0], label: 'Destinations' }
  ];

  const csvContent = arrayToCSV(flattenedStats, headers);
  const defaultFilename = `aggregate-stats-${new Date().toISOString().split('T')[0]}.csv`;
  
  downloadCSV(csvContent, filename || defaultFilename);
}

/**
 * Export combined analytics data (events + aggregate stats) to CSV
 */
export function exportCombinedAnalyticsToCSV(
  events: TrackingEvent[], 
  stats: AggregateStats[], 
  filename?: string
): void {
  // Create a summary section with aggregate stats
  const summaryHeaders = [
    'Data Type',
    'Source Attribution', 
    'Total Count', 
    'Unique IPs', 
    'Destinations'
  ];
  
  const summaryRows = stats.map(stat => [
    'Summary',
    stat.source_attribution,
    stat.count.toString(),
    stat.unique_ips.toString(),
    stat.destinations.join('; ')
  ]);

  // Create events section
  const eventHeaders = [
    'Data Type',
    'Tracking ID',
    'Timestamp',
    'Source Attribution',
    'Destination URL',
    'Client IP',
    'TTL'
  ];

  const eventRows = events.map(event => [
    'Event',
    event.tracking_id,
    event.formatted_timestamp,
    event.source_attribution,
    event.destination_url,
    event.client_ip,
    event.ttl.toString()
  ]);

  // Combine all data
  const allRows = [
    summaryHeaders,
    ...summaryRows,
    [], // Empty row separator
    eventHeaders,
    ...eventRows
  ];

  // Convert to CSV format
  const csvContent = allRows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const defaultFilename = `analytics-export-${new Date().toISOString().split('T')[0]}.csv`;
  
  downloadCSV(csvContent, filename || defaultFilename);
}

/**
 * Generate filename with timestamp and optional prefix
 */
export function generateCSVFilename(prefix: string = 'export'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
  const date = timestamp[0];
  const time = timestamp[1].split('.')[0].replace('Z', '');
  return `${prefix}-${date}-${time}.csv`;
}

/**
 * Validate data before export
 */
export function validateExportData(data: any[]): { isValid: boolean; message?: string } {
  if (!Array.isArray(data)) {
    return { isValid: false, message: 'Data must be an array' };
  }
  
  if (data.length === 0) {
    return { isValid: false, message: 'No data available to export' };
  }
  
  return { isValid: true };
}