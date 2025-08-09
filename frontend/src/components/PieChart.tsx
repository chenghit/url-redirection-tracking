import { useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartOptions, TooltipItem, ChartEvent, ActiveElement } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import type { AggregateStats } from '../types';
import ChartExportButton from './ChartExportButton';

// Register Chart.js components
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend
);

interface PieChartProps {
  aggregateStats: AggregateStats[];
  loading?: boolean;
  className?: string;
  onDestinationClick?: (destinationUrl: string) => void;
  showExportButton?: boolean;
}

export interface PieChartRef {
  exportChart: () => void;
}

interface DestinationData {
  url: string;
  count: number;
  percentage: number;
}

// Generate colors for pie slices
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
    'rgba(168, 85, 247, 0.8)',   // purple-500
    'rgba(251, 146, 60, 0.8)',   // orange-500
    'rgba(14, 165, 233, 0.8)',   // sky-500
    'rgba(244, 63, 94, 0.8)',    // rose-500
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
    'rgb(168, 85, 247)',   // purple-500
    'rgb(251, 146, 60)',   // orange-500
    'rgb(14, 165, 233)',   // sky-500
    'rgb(244, 63, 94)',    // rose-500
  ];

  const backgroundColor: string[] = [];
  const borderColor: string[] = [];

  for (let i = 0; i < count; i++) {
    backgroundColor.push(baseColors[i % baseColors.length]);
    borderColor.push(borderColors[i % borderColors.length]);
  }

  return { backgroundColor, borderColor };
};

// Transform aggregate stats to destination distribution data
const transformToDestinationData = (aggregateStats: AggregateStats[]): DestinationData[] => {
  if (!aggregateStats || aggregateStats.length === 0) {
    return [];
  }

  // Collect all destinations with their counts
  const destinationCounts = new Map<string, number>();

  aggregateStats.forEach(stat => {
    stat.destinations.forEach(destination => {
      const currentCount = destinationCounts.get(destination) || 0;
      destinationCounts.set(destination, currentCount + stat.count);
    });
  });

  // Convert to array and calculate percentages
  const totalCount = Array.from(destinationCounts.values()).reduce((sum, count) => sum + count, 0);
  
  if (totalCount === 0) {
    return [];
  }

  const destinationData: DestinationData[] = Array.from(destinationCounts.entries())
    .map(([url, count]) => ({
      url,
      count,
      percentage: (count / totalCount) * 100
    }))
    .sort((a, b) => b.count - a.count); // Sort by count descending

  // Limit to top 10 destinations for better readability
  const topDestinations = destinationData.slice(0, 10);
  
  // If there are more than 10 destinations, group the rest as "Others"
  if (destinationData.length > 10) {
    const othersCount = destinationData.slice(10).reduce((sum, item) => sum + item.count, 0);
    const othersPercentage = (othersCount / totalCount) * 100;
    
    topDestinations.push({
      url: 'Others',
      count: othersCount,
      percentage: othersPercentage
    });
  }

  return topDestinations;
};

// Format URL for display (truncate long URLs)
const formatUrlLabel = (url: string, maxLength: number = 30): string => {
  if (url === 'Others') return url;
  if (url.length <= maxLength) return url;
  
  // Try to keep the domain and truncate the path
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search;
    
    if (domain.length + 3 >= maxLength) {
      return domain.substring(0, maxLength - 3) + '...';
    }
    
    const availablePathLength = maxLength - domain.length - 3; // 3 for "..."
    if (path.length > availablePathLength) {
      return domain + path.substring(0, availablePathLength) + '...';
    }
    
    return url;
  } catch {
    // If URL parsing fails, just truncate the string
    return url.substring(0, maxLength - 3) + '...';
  }
};

const PieChart = forwardRef<PieChartRef, PieChartProps>(({ 
  aggregateStats, 
  loading = false, 
  className = '',
  onDestinationClick,
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
    const destinationData = transformToDestinationData(aggregateStats);
    
    if (destinationData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = destinationData.map(item => formatUrlLabel(item.url));
    const data = destinationData.map(item => item.count);
    const colors = generateColors(destinationData.length);

    return {
      labels,
      datasets: [
        {
          label: 'Redirections',
          data,
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          borderWidth: 2,
          hoverBorderWidth: 3,
          hoverOffset: 4,
        }
      ]
    };
  }, [aggregateStats]);

  // Get destination data for click handling
  const destinationData = useMemo(() => transformToDestinationData(aggregateStats), [aggregateStats]);

  // Handle pie slice click for filtering
  const handleSliceClick = useCallback((_event: ChartEvent, elements: ActiveElement[]) => {
    if (elements.length > 0 && onDestinationClick) {
      const elementIndex = elements[0].index;
      const destination = destinationData[elementIndex];
      
      // Don't filter on 'Others' group
      if (destination && destination.url !== 'Others') {
        onDestinationClick(destination.url);
      }
    }
  }, [destinationData, onDestinationClick]);

  // Chart configuration with accessibility and responsive features
  const chartOptions: ChartOptions<'pie'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleSliceClick,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 11,
          },
          generateLabels: (chart) => {
            const data = chart.data;
            if (data.labels && data.datasets.length > 0) {
              return data.labels.map((label, index) => {
                const dataset = data.datasets[0];
                const destination = destinationData[index];
                const percentage = destination ? destination.percentage.toFixed(1) : '0.0';
                
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: Array.isArray(dataset.backgroundColor) 
                    ? dataset.backgroundColor[index] 
                    : dataset.backgroundColor,
                  strokeStyle: Array.isArray(dataset.borderColor)
                    ? dataset.borderColor[index]
                    : dataset.borderColor,
                  lineWidth: typeof dataset.borderWidth === 'number' ? dataset.borderWidth : 2,
                  hidden: false,
                  index: index,
                  pointStyle: 'circle' as const
                };
              });
            }
            return [];
          },
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: 'rgba(59, 130, 246, 0.8)',
        borderWidth: 1,
        cornerRadius: 6,
        displayColors: true,
        callbacks: {
          title: (tooltipItems: TooltipItem<'pie'>[]) => {
            if (tooltipItems.length > 0) {
              const index = tooltipItems[0].dataIndex;
              const destination = destinationData[index];
              return destination ? destination.url : '';
            }
            return '';
          },
          label: (context: TooltipItem<'pie'>) => {
            const index = context.dataIndex;
            const destination = destinationData[index];
            if (!destination) return '';
            
            const count = destination.count.toLocaleString();
            const percentage = destination.percentage.toFixed(1);
            return `${count} redirections (${percentage}%)`;
          },
          afterBody: (tooltipItems: TooltipItem<'pie'>[]) => {
            if (tooltipItems.length > 0 && onDestinationClick) {
              const index = tooltipItems[0].dataIndex;
              const destination = destinationData[index];
              if (destination && destination.url !== 'Others') {
                return ['', 'Click to filter by this destination'];
              }
            }
            return [];
          },
        },
      },
    },
    // Accessibility features
    onHover: (event, activeElements) => {
      if (event.native?.target) {
        const target = event.native.target as HTMLElement;
        const isClickable = activeElements.length > 0 && onDestinationClick;
        const destination = activeElements.length > 0 ? destinationData[activeElements[0].index] : null;
        const canClick = isClickable && destination && destination.url !== 'Others';
        target.style.cursor = canClick ? 'pointer' : 'default';
      }
    },
    // Animation configuration
    animation: {
      animateRotate: true,
      animateScale: false,
      duration: 1000,
    },
    // Interaction configuration
    interaction: {
      intersect: true,
    },
  }), [destinationData, handleSliceClick, onDestinationClick]);

  // Loading state
  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="w-48 h-48 bg-gray-200 rounded-full mx-auto mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded w-24"></div>
            <div className="h-3 bg-gray-200 rounded w-20"></div>
            <div className="h-3 bg-gray-200 rounded w-28"></div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!aggregateStats || aggregateStats.length === 0 || destinationData.length === 0) {
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
              d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" 
            />
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" 
            />
          </svg>
          <p className="text-gray-500">No destination data available</p>
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
      aria-label="Pie chart showing destination URL distribution"
      tabIndex={0}
    >
      {showExportButton && (
        <div className="absolute top-2 right-2 z-10">
          <ChartExportButton
            chartRef={chartRef}
            chartTitle="Destination Distribution Chart"
            preset="square"
          />
        </div>
      )}
      <Pie 
        ref={chartRef}
        data={chartData} 
        options={chartOptions}
        aria-label="Interactive pie chart displaying destination URL distribution. Click slices to filter data."
        role="application"
      />
      {/* Screen reader description */}
      <div className="sr-only">
        Chart showing {destinationData.length} destination URLs. 
        {onDestinationClick && 'Click on chart slices to filter data by destination URL. '}
        Use the export button to download chart data.
      </div>
    </div>
  );
});

PieChart.displayName = 'PieChart';

export default PieChart;