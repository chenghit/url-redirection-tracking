import React, { useState } from 'react';
import type { TrackingEvent, AggregateStats } from '../types';
import { 
  exportEventsToCSV, 
  exportAggregateStatsToCSV, 
  exportCombinedAnalyticsToCSV,
  validateExportData,
  generateCSVFilename
} from '../utils/csv-export';

export type ExportType = 'events' | 'aggregate' | 'combined';

interface ExportButtonProps {
  type: ExportType;
  events?: TrackingEvent[];
  aggregateStats?: AggregateStats[];
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary';
  label?: string;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  type,
  events = [],
  aggregateStats = [],
  disabled = false,
  className = '',
  size = 'md',
  variant = 'primary',
  label
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  // Variant classes
  const variantClasses = {
    primary: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500'
  };

  // Icon size based on button size
  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }[size];

  // Get appropriate label
  const getLabel = () => {
    if (label) return label;
    
    switch (type) {
      case 'events':
        return 'Export Events';
      case 'aggregate':
        return 'Export Stats';
      case 'combined':
        return 'Export All';
      default:
        return 'Export';
    }
  };

  // Handle export action
  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      switch (type) {
        case 'events':
          const eventsValidation = validateExportData(events);
          if (!eventsValidation.isValid) {
            throw new Error(eventsValidation.message);
          }
          exportEventsToCSV(events, generateCSVFilename('tracking-events'));
          break;

        case 'aggregate':
          const statsValidation = validateExportData(aggregateStats);
          if (!statsValidation.isValid) {
            throw new Error(statsValidation.message);
          }
          exportAggregateStatsToCSV(aggregateStats, generateCSVFilename('aggregate-stats'));
          break;

        case 'combined':
          const eventsValid = validateExportData(events);
          const statsValid = validateExportData(aggregateStats);
          
          if (!eventsValid.isValid && !statsValid.isValid) {
            throw new Error('No data available to export');
          }
          
          exportCombinedAnalyticsToCSV(
            events, 
            aggregateStats, 
            generateCSVFilename('analytics-combined')
          );
          break;

        default:
          throw new Error('Invalid export type');
      }

      // Show success feedback briefly
      setTimeout(() => {
        setIsExporting(false);
      }, 1000);

    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
      setIsExporting(false);
    }
  };

  // Determine if button should be disabled
  const isDisabled = disabled || isExporting || (
    type === 'events' && events.length === 0
  ) || (
    type === 'aggregate' && aggregateStats.length === 0
  ) || (
    type === 'combined' && events.length === 0 && aggregateStats.length === 0
  );

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={isDisabled}
        className={`
          inline-flex items-center gap-2 rounded-md font-medium
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          ${sizeClasses[size]}
          ${variantClasses[variant]}
          ${className}
        `}
        title={isDisabled ? 'No data available to export' : `Export data as CSV`}
      >
        {isExporting ? (
          <>
            <div className={`animate-spin rounded-full border-2 border-white border-t-transparent ${iconSize}`} />
            Exporting...
          </>
        ) : (
          <>
            <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
              />
            </svg>
            {getLabel()}
          </>
        )}
      </button>

      {/* Error tooltip */}
      {exportError && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-red-100 border border-red-200 rounded-md shadow-lg z-10 min-w-max">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-red-700">{exportError}</span>
            <button
              onClick={() => setExportError(null)}
              className="text-red-500 hover:text-red-700 ml-2"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportButton;