import { useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartOptions, TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { TrackingEvent } from '../types';
import ChartExportButton from './ChartExportButton';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface LineChartProps {
  events: TrackingEvent[];
  loading?: boolean;
  className?: string;
  showExportButton?: boolean;
}

export interface LineChartRef {
  exportChart: () => void;
}

interface TimeSeriesDataPoint {
  timestamp: string;
  count: number;
  date: Date;
}

// Transform tracking events into time-series data
const transformEventsToTimeSeries = (events: TrackingEvent[]): TimeSeriesDataPoint[] => {
  if (!events || events.length === 0) {
    return [];
  }

  // Group events by date (YYYY-MM-DD format)
  const eventsByDate = events.reduce((acc, event) => {
    const date = new Date(event.timestamp);
    
    // Skip events with invalid timestamps
    if (isNaN(date.getTime())) {
      console.warn(`Invalid timestamp found: ${event.timestamp}`);
      return acc;
    }
    
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    if (!acc[dateKey]) {
      acc[dateKey] = {
        timestamp: dateKey,
        count: 0,
        date: date,
      };
    }
    
    acc[dateKey].count += 1;
    return acc;
  }, {} as Record<string, TimeSeriesDataPoint>);

  // Convert to array and sort by date
  return Object.values(eventsByDate).sort((a, b) => a.date.getTime() - b.date.getTime());
};

// Format date for display
const formatDateLabel = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const LineChart = forwardRef<LineChartRef, LineChartProps>(({ 
  events, 
  loading = false, 
  className = '',
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
  const chartData = useMemo(() => {
    const timeSeriesData = transformEventsToTimeSeries(events);
    
    return {
      labels: timeSeriesData.map(point => formatDateLabel(point.timestamp)),
      datasets: [
        {
          label: 'URL Redirections',
          data: timeSeriesData.map(point => point.count),
          borderColor: 'rgb(59, 130, 246)', // blue-500
          backgroundColor: 'rgba(59, 130, 246, 0.1)', // blue-500 with opacity
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: 'rgb(59, 130, 246)',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          tension: 0.1, // Smooth curves
          fill: true,
        },
      ],
    };
  }, [events]);

  // Chart configuration with accessibility and responsive features
  const chartOptions: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
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
          title: (tooltipItems: TooltipItem<'line'>[]) => {
            if (tooltipItems.length > 0) {
              const index = tooltipItems[0].dataIndex;
              const timeSeriesData = transformEventsToTimeSeries(events);
              if (timeSeriesData[index]) {
                const date = new Date(timeSeriesData[index].timestamp);
                return date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                });
              }
            }
            return '';
          },
          label: (context: TooltipItem<'line'>) => {
            const value = context.parsed.y;
            return `${context.dataset.label}: ${value.toLocaleString()} redirections`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Date',
          font: {
            size: 12,
            weight: 'bold',
          },
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)',
        },
        ticks: {
          maxTicksLimit: 10,
          font: {
            size: 11,
          },
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Number of Redirections',
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
      point: {
        hoverRadius: 8,
      },
    },
    // Accessibility features
    onHover: (event, activeElements) => {
      if (event.native?.target) {
        const target = event.native.target as HTMLElement;
        target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      }
    },
  }), [events]);

  // Loading state
  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-2">
            <div className="h-2 bg-gray-200 rounded"></div>
            <div className="h-2 bg-gray-200 rounded w-5/6"></div>
            <div className="h-2 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!events || events.length === 0) {
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
          <p className="text-gray-500">No data available</p>
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
      aria-label="Time series chart showing URL redirections over time"
      tabIndex={0}
    >
      {showExportButton && (
        <div className="absolute top-2 right-2 z-10">
          <ChartExportButton
            chartRef={chartRef}
            chartTitle="Time Series Chart"
            preset="medium"
          />
        </div>
      )}
      <Line 
        ref={chartRef}
        data={chartData} 
        options={chartOptions}
        aria-label="Interactive line chart displaying URL redirection trends over time. Use arrow keys to navigate data points."
        role="application"
      />
      {/* Screen reader description */}
      <div className="sr-only">
        Chart showing {chartData.datasets[0]?.data?.length || 0} data points of URL redirections over time. 
        Total redirections: {chartData.datasets[0]?.data?.reduce((a, b) => (a as number) + (b as number), 0) || 0}.
        Use the export button to download chart data.
      </div>
    </div>
  );
});

LineChart.displayName = 'LineChart';

export default LineChart;