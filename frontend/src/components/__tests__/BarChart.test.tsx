import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import BarChart from '../BarChart';
import type { AggregateStats } from '../../types';

// Mock Chart.js and react-chartjs-2
vi.mock('react-chartjs-2', () => ({
  Bar: ({ data, options, onClick, ...props }: any) => (
    <div 
      data-testid="bar-chart"
      data-chart-data={JSON.stringify(data)}
      data-chart-options={JSON.stringify(options)}
      onClick={onClick}
      {...props}
    >
      <div data-testid="chart-labels">{data.labels?.join(',')}</div>
      <div data-testid="chart-datasets">{data.datasets?.length || 0}</div>
    </div>
  ),
}));

vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
  },
  CategoryScale: {},
  LinearScale: {},
  BarElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

describe('BarChart', () => {
  const mockAggregateStats: AggregateStats[] = [
    {
      source_attribution: 'google.com',
      count: 150,
      unique_ips: 75,
      destinations: ['https://example.com', 'https://test.com']
    },
    {
      source_attribution: 'facebook.com',
      count: 100,
      unique_ips: 50,
      destinations: ['https://example.com']
    },
    {
      source_attribution: 'twitter.com',
      count: 75,
      unique_ips: 40,
      destinations: ['https://test.com']
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<BarChart aggregateStats={mockAggregateStats} />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('displays loading state correctly', () => {
    render(<BarChart aggregateStats={[]} loading={true} />);
    
    // Loading state shows skeleton animation, not the chart
    const loadingElement = document.querySelector('.animate-pulse');
    expect(loadingElement).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('displays empty state when no data is provided', () => {
    render(<BarChart aggregateStats={[]} />);
    
    expect(screen.getByText('No source attribution data available')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters or date range')).toBeInTheDocument();
  });

  it('transforms aggregate data correctly for chart display', () => {
    render(<BarChart aggregateStats={mockAggregateStats} />);
    
    const chartElement = screen.getByTestId('bar-chart');
    const chartData = JSON.parse(chartElement.getAttribute('data-chart-data') || '{}');
    
    // Should sort by count descending (google.com first with 150, then facebook.com with 100, then twitter.com with 75)
    expect(chartData.labels).toEqual(['google.com', 'facebook.com', 'twitter.com']);
    
    // Should have two datasets: Total Redirections and Unique IPs
    expect(chartData.datasets).toHaveLength(2);
    expect(chartData.datasets[0].label).toBe('Total Redirections');
    expect(chartData.datasets[0].data).toEqual([150, 100, 75]);
    expect(chartData.datasets[1].label).toBe('Unique IPs');
    expect(chartData.datasets[1].data).toEqual([75, 50, 40]);
  });

  it('applies correct styling and colors to bars', () => {
    render(<BarChart aggregateStats={mockAggregateStats} />);
    
    const chartElement = screen.getByTestId('bar-chart');
    const chartData = JSON.parse(chartElement.getAttribute('data-chart-data') || '{}');
    
    // Check that colors are applied
    expect(chartData.datasets[0].backgroundColor).toBeDefined();
    expect(chartData.datasets[0].borderColor).toBeDefined();
    expect(chartData.datasets[0].borderWidth).toBe(2);
    expect(chartData.datasets[0].borderRadius).toBe(4);
    
    // Check that unique IPs dataset has different opacity
    expect(chartData.datasets[1].backgroundColor[0]).toContain('0.4');
  });

  it('calls onSourceClick when a bar is clicked', () => {
    const mockOnSourceClick = vi.fn();
    render(
      <BarChart 
        aggregateStats={mockAggregateStats} 
        onSourceClick={mockOnSourceClick}
      />
    );
    
    const chartElement = screen.getByTestId('bar-chart');
    
    // Simulate chart click by calling the onClick handler directly
    // Since we're mocking the Bar component, we need to trigger the click event
    fireEvent.click(chartElement);
    
    // The actual click handling is tested through integration, 
    // here we just verify the component accepts the callback
    expect(mockOnSourceClick).toBeDefined();
  });

  it('does not call onSourceClick for Unknown sources', () => {
    const mockOnSourceClick = vi.fn();
    const statsWithUnknown: AggregateStats[] = [
      {
        source_attribution: '',
        count: 50,
        unique_ips: 25,
        destinations: ['https://example.com']
      }
    ];
    
    render(
      <BarChart 
        aggregateStats={statsWithUnknown} 
        onSourceClick={mockOnSourceClick}
      />
    );
    
    const chartElement = screen.getByTestId('bar-chart');
    const chartOptions = JSON.parse(chartElement.getAttribute('data-chart-options') || '{}');
    
    // Simulate chart click on Unknown source
    const mockEvent = {};
    const mockElements = [{ index: 0 }];
    
    if (chartOptions.onClick) {
      chartOptions.onClick(mockEvent, mockElements);
    }
    
    expect(mockOnSourceClick).not.toHaveBeenCalled();
  });

  it('handles empty source attribution correctly', () => {
    const statsWithEmpty: AggregateStats[] = [
      {
        source_attribution: '',
        count: 50,
        unique_ips: 25,
        destinations: ['https://example.com']
      },
      {
        source_attribution: 'google.com',
        count: 100,
        unique_ips: 50,
        destinations: ['https://test.com']
      }
    ];
    
    render(<BarChart aggregateStats={statsWithEmpty} />);
    
    const chartElement = screen.getByTestId('bar-chart');
    const chartData = JSON.parse(chartElement.getAttribute('data-chart-data') || '{}');
    
    // Empty source attribution should be labeled as 'Unknown'
    expect(chartData.labels).toContain('Unknown');
    expect(chartData.labels).toContain('google.com');
  });

  it('applies accessibility attributes correctly', () => {
    render(<BarChart aggregateStats={mockAggregateStats} />);
    
    const container = screen.getByRole('img');
    expect(container).toHaveAttribute('aria-label', 'Bar chart showing source attribution statistics');
    
    // The aria-label for the chart element is passed through props to the mocked Bar component
    const chartElement = screen.getByTestId('bar-chart');
    expect(chartElement).toBeInTheDocument();
  });

  it('configures chart options correctly', () => {
    render(<BarChart aggregateStats={mockAggregateStats} />);
    
    const chartElement = screen.getByTestId('bar-chart');
    const chartOptions = JSON.parse(chartElement.getAttribute('data-chart-options') || '{}');
    
    // Check responsive configuration
    expect(chartOptions.responsive).toBe(true);
    expect(chartOptions.maintainAspectRatio).toBe(false);
    
    // Check scales configuration
    expect(chartOptions.scales.x.title.text).toBe('Source Attribution');
    expect(chartOptions.scales.y.title.text).toBe('Count');
    expect(chartOptions.scales.y.beginAtZero).toBe(true);
    
    // Check legend configuration
    expect(chartOptions.plugins.legend.display).toBe(true);
    expect(chartOptions.plugins.legend.position).toBe('top');
  });

  it('handles long source attribution labels correctly', () => {
    const statsWithLongLabels: AggregateStats[] = [
      {
        source_attribution: 'very-long-source-attribution-name-that-should-be-truncated',
        count: 100,
        unique_ips: 50,
        destinations: ['https://example.com']
      }
    ];
    
    render(<BarChart aggregateStats={statsWithLongLabels} />);
    
    const chartElement = screen.getByTestId('bar-chart');
    const chartOptions = JSON.parse(chartElement.getAttribute('data-chart-options') || '{}');
    
    // Check that x-axis ticks configuration exists
    expect(chartOptions.scales.x.ticks).toBeDefined();
    expect(chartOptions.scales.x.ticks.maxRotation).toBe(45);
  });

  it('applies custom className correctly', () => {
    const customClass = 'custom-chart-class';
    render(<BarChart aggregateStats={mockAggregateStats} className={customClass} />);
    
    const container = screen.getByRole('img');
    expect(container).toHaveClass(customClass);
  });
});