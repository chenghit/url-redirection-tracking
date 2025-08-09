import React, { useState } from 'react';
import type { Chart } from 'chart.js';
import { 
  exportChartAsPNG, 
  exportChartWithDimensions,
  validateChartForExport,
  generateChartFilename,
  EXPORT_PRESETS,
  type ExportPreset
} from '../utils/chart-export';

interface ChartExportButtonProps {
  chartRef: React.RefObject<any>;
  chartTitle?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'minimal';
  preset?: ExportPreset;
  customDimensions?: { width: number; height: number };
  backgroundColor?: string;
}

const ChartExportButton: React.FC<ChartExportButtonProps> = ({
  chartRef,
  chartTitle = 'chart',
  disabled = false,
  className = '',
  size = 'sm',
  variant = 'minimal',
  preset,
  customDimensions,
  backgroundColor = '#ffffff'
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Size classes
  const sizeClasses = {
    sm: 'p-1.5 text-xs',
    md: 'p-2 text-sm',
    lg: 'p-3 text-base'
  };

  // Variant classes
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    minimal: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500 border border-gray-300'
  };

  // Icon size based on button size
  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }[size];

  // Get chart instance from ref
  const getChartInstance = (): Chart | null => {
    if (!chartRef.current) {
      return null;
    }

    // For react-chartjs-2 components, try different ways to access the chart instance
    return chartRef.current.chartInstance || 
           chartRef.current.chart || 
           chartRef.current;
  };

  // Handle export action
  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const chart = getChartInstance();
      const validation = validateChartForExport(chart);
      
      if (!validation.isValid) {
        throw new Error(validation.message || 'Chart is not ready for export');
      }

      const filename = generateChartFilename(
        chartTitle.toLowerCase().replace(/\s+/g, '-'),
        'png'
      );

      // Export with custom dimensions if specified
      if (customDimensions) {
        exportChartWithDimensions(
          chart,
          customDimensions.width,
          customDimensions.height,
          filename,
          backgroundColor
        );
      } else if (preset) {
        const dimensions = EXPORT_PRESETS[preset];
        exportChartWithDimensions(
          chart,
          dimensions.width,
          dimensions.height,
          filename,
          backgroundColor
        );
      } else {
        // Export with original dimensions
        exportChartAsPNG(chart, filename, backgroundColor);
      }

      // Show success feedback briefly
      setTimeout(() => {
        setIsExporting(false);
      }, 1000);

    } catch (error) {
      console.error('Chart export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
      setIsExporting(false);
    }
  };

  // Determine if button should be disabled
  const isDisabled = disabled || isExporting;

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center rounded-md font-medium
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          ${sizeClasses[size]}
          ${variantClasses[variant]}
          ${className}
        `}
        title={isDisabled ? 'Chart not ready for export' : `Export ${chartTitle} as PNG`}
        aria-label={`Export ${chartTitle} chart as PNG image`}
      >
        {isExporting ? (
          <div className={`animate-spin rounded-full border-2 border-current border-t-transparent ${iconSize}`} />
        ) : (
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
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

export default ChartExportButton;