import { useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartOptions, TooltipItem, ChartEvent, ActiveElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { AggregateStats } from '../types';
import ChartExportButton from './ChartExportButton';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface BarChartProps {
  aggregateStats: AggregateStats[];
  loading?: boolean;
  className?: string;
  onSourceClick?: (sourceAttribution: string) => void;
  showExportButton?: boolean;
}

export interface BarChartRef {
  exportChart: () => void;
}

// Generate colors for bars
const generateColors = (count: number): { backgroundColor: string[]; borderColor: string[] } => {
  const baseColors = [
    'rgba(59, 130, 246, 0.8)',   // blue-500
    'rgba(16, 185, 129, 0.8)',   // emerald-500
    'rgba(245, 158, 11, 0.8)',   // amber-500
    'rgba(239, 68, 68, 0.8)',    // red-500
    'rgba(139, 92, 246, 0.8)',   // violet-500
    'rgba(236, 72, 153, 0.8)',   // pink-500
    'rgba(6, 182, 212, 0.8)',    // cyan-500
    'rgba(34, 197, 94, 0.8)',    // green-500
  ];

  const borderColors = [
    'rgb(59, 130, 246)',   // blue-500
    'rgb(16, 185, 129)',   // emerald-500
    'rgb(245, 158, 11)',   // amber-500
    'rgb(239, 68, 68)',    // red-500
    'rgb(139, 92, 246)',   // violet-500
    'rgb(236, 72, 153)',   // pink-500
    'rgb(6, 182, 212)',    // cyan-500
    'rgb(34, 197, 94)',    // green-500
  ];

  const backgroundColor: string[] = [];
  const borderColor: string[] = [];

  for (let i = 0; i < count; i++) {
    backgroundColor.push(baseColors[i % baseColors.length]);
    borderColor.push(borderColors[i % borderColors.length]);
  }

  return { backgroundColor, borderColor };
};

// Transform aggregate stats for bar chart
const transformAggregateData = (aggregateStats: AggregateStats[]) => {
  if (!aggregateStats || aggregateStats.length === 0) {
    return {
      labels: [],
      datasets: []
    };
  }

  // Sort by count descending to show most active sources first
  const sortedStats = [...aggregateStats].sort((a, b) => b.count - a.count);
  
  const labels = sortedStats.map(stat => stat.source_attribution || 'Unknown');
  const counts = sortedStats.map(stat => stat.count);
  const uniqueIps = sortedStats.map(stat => stat.unique_ips);
  
  const colors = generateColors(sortedStats.length);

  return {
    labels,
    datasets: [
      {
        label: 'Total Redirections',
        data: counts,
        backgroundColor: colors.backgroundColor,
        borderColor: colors.borderColor,
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: 'Unique IPs',
        data: uniqueIps,
        backgroundColor: colors.backgroundColor.map(color => color.replace('0.8', '0.4')),
        borderColor: colors.borderColor.map(color => color.replace('rgb', 'rgba').replace(')', ', 0.6)')),
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  };
};

const BarChart = forwardRef<BarChartRef, BarChartProps>(({ 
  aggregateStats, 
  loading = false, 
  className = '',
  onSourceClick,
  showExportButton = true
}, ref) => {
  const chartRef = useRef<any>(null);

  // Expose export functionality through ref
  useImperativeHandle(ref, () => ({
    exportChart: () => {
      if (chartRef.current) {
        // Trigger export through the export button
        const exportButton = chartRef.current.parentElement?.querySelector('[aria-label*="Export"]');
        if (exportButton) {
          (exportButton as HTMLButtonElement).click();
        }
      }
    }
  }));
  // Transform data for Chart.js
  const chartData = useMemo(() => transformAggregateData(aggregateStats), [aggregateStats]);

  // Handle bar click for filtering
  const handleBarClick = useCallback((_event: ChartEvent, elements: ActiveElement[]) => {
    if (elements.length > 0 && onSourceClick) {
      const elementIndex = elements[0].index;
      const sourceAttribution = chartData.labels[elementIndex] as string;
      
      // Don't filter on 'Unknown' sources
      if (sourceAttribution && sourceAttribution !== 'Unknown') {
        onSourceClick(sourceAttribution);
      }
    }
  }, [chartData.labels, onSourceClick]);

  // Chart configuration with accessibility and responsive features
  const chartOptions: ChartOptions<'bar'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleBarClick,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
          },
        },
      },
      title: {
        display: false, // Title is handled by parent component
      },
      tooltip: {
        enabled: true,
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: 'rgba(59, 130, 246, 0.8)',
        borderWidth: 1,
        cornerRadius: 6,
        displayColors: true,
        callbacks: {
          title: (tooltipItems: TooltipItem<'bar'>[]) => {
            if (tooltipItems.length > 0) {
              const index = tooltipItems[0].dataIndex;
              const sourceAttribution = chartData.labels[index] as string;
              return `Source: ${sourceAttribution}`;
            }
            return '';
          },
          label: (context: TooltipItem<'bar'>) => {
            const value = context.parsed.y;
            const datasetLabel = context.dataset.label;
            return `${datasetLabel}: ${value.toLocaleString()}`;
          },
          afterBody: (tooltipItems: TooltipItem<'bar'>[]) => {
            if (tooltipItems.length > 0 && onSourceClick) {
              const index = tooltipItems[0].dataIndex;
              const sourceAttribution = chartData.labels[index] as string;
              if (sourceAttribution && sourceAttribution !== 'Unknown') {
                return ['', 'Click to filter by this source'];
              }
            }
            return [];
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Source Attribution',
          font: {
            size: 12,
            weight: 'bold',
          },
        },
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 0,
          font: {
            size: 11,
          },
          callback: function(value, _index) {
            const label = this.getLabelForValue(value as number);
            // Truncate long labels for better display
            return label && label.length > 15 ? label.substring(0, 12) + '...' : label;
          },
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Count',
          font: {
            size: 12,
            weight: 'bold',
          },
        },
        beginAtZero: true,
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)',
        },
        ticks: {
          callback: function(value) {
            return typeof value === 'number' ? value.toLocaleString() : value;
          },
          font: {
            size: 11,
          },
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
    elements: {
      bar: {
        borderWidth: 2,
      },
    },
    // Accessibility features
    onHover: (event, activeElements) => {
      if (event.native?.target) {
        const target = event.native.target as HTMLElement;
        const isClickable = activeElements.length > 0 && onSourceClick;
        target.style.cursor = isClickable ? 'pointer' : 'default';
      }
    },
  }), [chartData.labels, handleBarClick, onSourceClick]);

  // Loading state
  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-6 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            <div className="h-2 bg-gray-200 rounded w-3/6"></div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!aggregateStats || aggregateStats.length === 0) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <svg 
            className="w-12 h-12 text-gray-400 mx-auto mb-2" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
            />
          </svg>
          <p className="text-gray-500">No source attribution data available</p>
          <p className="text-xs text-gray-400 mt-1">
            Try adjusting your filters or date range
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`h-full ${className} relative`} 
      role="img" 
      aria-label="Bar chart showing source attribution statistics"
      tabIndex={0}
    >
      {showExportButton && (
        <div className="absolute top-2 right-2 z-10">
          <ChartExportButton
            chartRef={chartRef}
            chartTitle="Source Attribution Chart"
            preset="medium"
          />
        </div>
      )}
      <Bar 
        ref={chartRef}
        data={chartData} 
        options={chartOptions}
        aria-label="Interactive bar chart displaying source attribution comparison. Click bars to filter data."
        role="application"
      />
      {/* Screen reader description */}
      <div className="sr-only">
        Chart showing {chartData.labels?.length || 0} source attributions. 
        {onSourceClick && 'Click on bars to filter data by source attribution. '}
        Use the export button to download chart data.
      </div>
    </div>
  );
});

BarChart.displayName = 'BarChart';

export default BarChart;