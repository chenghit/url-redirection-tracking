import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import PieChart from '../PieChart';
import type { AggregateStats } from '../../types';

// Mock Chart.js and react-chartjs-2
vi.mock('react-chartjs-2', () => ({
  Pie: ({ data, options, ...props }: any) => (
    <div 
      data-testid="pie-chart" 
      data-chart-data={JSON.stringify(data)}
      data-chart-options={JSON.stringify(options)}
      {...props}
    >
      <div data-testid="chart-labels">
        {data.labels?.map((label: string, index: number) => (
          <div 
            key={index} 
            data-testid={`chart-label-${index}`}
            onClick={() => options?.onClick?.(null, [{ index }])}
            style={{ cursor: 'pointer' }}
          >
            {label}: {data.datasets[0]?.data[index]}
          </div>
        ))}
      </div>
    </div>
  ),
}));

vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
  },
  ArcElement: {},
  Tooltip: {},
  Legend: {},
}));

describe('PieChart', () => {
  const mockAggregateStats: AggregateStats[] = [
    {
      source_attribution: 'google.com',
      count: 100,
      unique_ips: 50,
      destinations: ['https://example.com/page1', 'https://example.com/page2']
    },
    {
      source_attribution: 'facebook.com',
      count: 75,
      unique_ips: 40,
      destinations: ['https://example.com/page1', 'https://example.com/page3']
    },
    {
      source_attribution: 'twitter.com',
      count: 50,
      unique_ips: 30,
      destinations: ['https://example.com/page2']
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pie chart with correct data', () => {
    render(<PieChart aggregateStats={mockAggregateStats} />);
    
    const chart = screen.getByTestId('pie-chart');
    expect(chart).toBeInTheDocument();
    
    // Check that container has accessibility attributes
    const container = screen.getByRole('img');
    expect(container).toHaveAttribute('aria-label', 'Pie chart showing destination URL distribution');
  });

  it('displays loading state correctly', () => {
    render(<PieChart aggregateStats={[]} loading={true} />);
    
    // Should show loading animation
    const loadingElement = document.querySelector('.animate-pulse');
    expect(loadingElement).toBeInTheDocument();
  });

  it('displays empty state when no data is available', () => {
    render(<PieChart aggregateStats={[]} />);
    
    expect(screen.getByText('No destination data available')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters or date range')).toBeInTheDocument();
  });

  it('transforms aggregate stats to destination data correctly', () => {
    render(<PieChart aggregateStats={mockAggregateStats} />);
    
    const chart = screen.getByTestId('pie-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Should have labels for each unique destination
    expect(chartData.labels).toContain('https://example.com/page1');
    expect(chartData.labels).toContain('https://example.com/page2');
    expect(chartData.labels).toContain('https://example.com/page3');
    
    // Should have data values
    expect(chartData.datasets[0].data).toHaveLength(3);
    expect(chartData.datasets[0].data.every((value: number) => value > 0)).toBe(true);
  });

  it('handles click events correctly', async () => {
    const mockOnDestinationClick = vi.fn();
    render(
      <PieChart 
        aggregateStats={mockAggregateStats} 
        onDestinationClick={mockOnDestinationClick}
      />
    );
    
    // Click on the first chart segment
    const firstLabel = screen.getByTestId('chart-label-0');
    fireEvent.click(firstLabel);
    
    await waitFor(() => {
      expect(mockOnDestinationClick).toHaveBeenCalledWith('https://example.com/page1');
    });
  });

  it('does not trigger click for "Others" group', async () => {
    // Create data that will result in "Others" group
    const manyDestinations: AggregateStats[] = Array.from({ length: 12 }, (_, i) => ({
      source_attribution: `source${i}`,
      count: 10,
      unique_ips: 5,
      destinations: [`https://example.com/page${i}`]
    }));

    const mockOnDestinationClick = vi.fn();
    render(
      <PieChart 
        aggregateStats={manyDestinations} 
        onDestinationClick={mockOnDestinationClick}
      />
    );
    
    const chart = screen.getByTestId('pie-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Should have "Others" as the last label
    expect(chartData.labels).toContain('Others');
    
    // Find and click the "Others" label
    const othersIndex = chartData.labels.indexOf('Others');
    if (othersIndex !== -1) {
      const othersLabel = screen.getByTestId(`chart-label-${othersIndex}`);
      fireEvent.click(othersLabel);
      
      await waitFor(() => {
        expect(mockOnDestinationClick).not.toHaveBeenCalled();
      });
    }
  });

  it('formats long URLs correctly', () => {
    const longUrlStats: AggregateStats[] = [
      {
        source_attribution: 'google.com',
        count: 100,
        unique_ips: 50,
        destinations: ['https://very-long-domain-name.example.com/very/long/path/with/many/segments/and/parameters?param1=value1&param2=value2']
      }
    ];

    render(<PieChart aggregateStats={longUrlStats} />);
    
    const chart = screen.getByTestId('pie-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Should truncate long URLs
    expect(chartData.labels[0]).toMatch(/\.\.\./);
    expect(chartData.labels[0].length).toBeLessThanOrEqual(33); // 30 + "..."
  });

  it('calculates percentages correctly', () => {
    render(<PieChart aggregateStats={mockAggregateStats} />);
    
    const chart = screen.getByTestId('pie-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Check that chart has data
    expect(chartData.datasets[0].data).toBeDefined();
    expect(chartData.datasets[0].data.length).toBeGreaterThan(0);
    
    // Check that all data values are positive numbers
    chartData.datasets[0].data.forEach((value: number) => {
      expect(value).toBeGreaterThan(0);
      expect(typeof value).toBe('number');
    });
  });

  it('applies custom className', () => {
    render(<PieChart aggregateStats={mockAggregateStats} className="custom-class" />);
    
    const container = screen.getByRole('img');
    expect(container).toHaveClass('custom-class');
  });

  it('handles empty destinations array', () => {
    const emptyDestinationsStats: AggregateStats[] = [
      {
        source_attribution: 'google.com',
        count: 100,
        unique_ips: 50,
        destinations: []
      }
    ];

    render(<PieChart aggregateStats={emptyDestinationsStats} />);
    
    expect(screen.getByText('No destination data available')).toBeInTheDocument();
  });

  it('sorts destinations by count in descending order', () => {
    const unsortedStats: AggregateStats[] = [
      {
        source_attribution: 'source1',
        count: 10,
        unique_ips: 5,
        destinations: ['https://example.com/low']
      },
      {
        source_attribution: 'source2',
        count: 100,
        unique_ips: 50,
        destinations: ['https://example.com/high']
      },
      {
        source_attribution: 'source3',
        count: 50,
        unique_ips: 25,
        destinations: ['https://example.com/medium']
      }
    ];

    render(<PieChart aggregateStats={unsortedStats} />);
    
    const chart = screen.getByTestId('pie-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // First label should be the highest count destination
    expect(chartData.labels[0]).toBe('https://example.com/high');
    expect(chartData.datasets[0].data[0]).toBe(100);
  });
});