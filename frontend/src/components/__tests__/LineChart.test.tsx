import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LineChart from '../LineChart';
import type { TrackingEvent } from '../../types';

// Mock Chart.js to avoid canvas rendering issues in tests
vi.mock('react-chartjs-2', () => ({
  Line: ({ data, options, ...props }: any) => (
    <div 
      data-testid="line-chart" 
      data-chart-data={JSON.stringify(data)}
      data-chart-options={JSON.stringify(options)}
      {...props}
    >
      Mock Line Chart
    </div>
  ),
}));

// Mock Chart.js registration
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
  },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

describe('LineChart', () => {
  const mockEvents: TrackingEvent[] = [
    {
      tracking_id: '1',
      timestamp: '2024-01-01T10:00:00Z',
      source_attribution: 'google',
      destination_url: 'https://example.com',
      client_ip: '192.168.1.1',
      ttl: 3600,
      formatted_timestamp: '2024-01-01 10:00:00',
    },
    {
      tracking_id: '2',
      timestamp: '2024-01-01T14:00:00Z',
      source_attribution: 'facebook',
      destination_url: 'https://example.com',
      client_ip: '192.168.1.2',
      ttl: 3600,
      formatted_timestamp: '2024-01-01 14:00:00',
    },
    {
      tracking_id: '3',
      timestamp: '2024-01-02T09:00:00Z',
      source_attribution: 'twitter',
      destination_url: 'https://example.com',
      client_ip: '192.168.1.3',
      ttl: 3600,
      formatted_timestamp: '2024-01-02 09:00:00',
    },
  ];

  it('renders chart with data', () => {
    render(<LineChart events={mockEvents} />);
    
    const chart = screen.getByTestId('line-chart');
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute('aria-label', 'Line chart displaying URL redirection trends over time');
  });

  it('displays loading state', () => {
    const { container } = render(<LineChart events={[]} loading={true} />);
    
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
    expect(screen.queryByText('Mock Line Chart')).not.toBeInTheDocument();
    
    // Check for loading skeleton by finding the animate-pulse class
    const loadingElement = container.querySelector('.animate-pulse');
    expect(loadingElement).toBeInTheDocument();
  });

  it('displays empty state when no events', () => {
    render(<LineChart events={[]} />);
    
    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters or date range')).toBeInTheDocument();
  });

  it('transforms events data correctly', () => {
    render(<LineChart events={mockEvents} />);
    
    const chart = screen.getByTestId('line-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Should have 2 data points (2 different dates)
    expect(chartData.labels).toHaveLength(2);
    expect(chartData.datasets[0].data).toHaveLength(2);
    
    // First date should have 2 events, second date should have 1 event
    expect(chartData.datasets[0].data).toEqual([2, 1]);
    
    // Check dataset configuration
    expect(chartData.datasets[0].label).toBe('URL Redirections');
    expect(chartData.datasets[0].borderColor).toBe('rgb(59, 130, 246)');
    expect(chartData.datasets[0].fill).toBe(true);
  });

  it('groups events by date correctly', () => {
    const eventsOnSameDay: TrackingEvent[] = [
      {
        tracking_id: '1',
        timestamp: '2024-01-01T08:00:00Z',
        source_attribution: 'google',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.1',
        ttl: 3600,
        formatted_timestamp: '2024-01-01 08:00:00',
      },
      {
        tracking_id: '2',
        timestamp: '2024-01-01T12:00:00Z',
        source_attribution: 'facebook',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.2',
        ttl: 3600,
        formatted_timestamp: '2024-01-01 12:00:00',
      },
      {
        tracking_id: '3',
        timestamp: '2024-01-01T18:00:00Z',
        source_attribution: 'twitter',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.3',
        ttl: 3600,
        formatted_timestamp: '2024-01-01 18:00:00',
      },
    ];

    render(<LineChart events={eventsOnSameDay} />);
    
    const chart = screen.getByTestId('line-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Should have 1 data point (all events on same date)
    expect(chartData.labels).toHaveLength(1);
    expect(chartData.datasets[0].data).toEqual([3]);
  });

  it('sorts data points by date', () => {
    const unsortedEvents: TrackingEvent[] = [
      {
        tracking_id: '1',
        timestamp: '2024-01-03T10:00:00Z',
        source_attribution: 'google',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.1',
        ttl: 3600,
        formatted_timestamp: '2024-01-03 10:00:00',
      },
      {
        tracking_id: '2',
        timestamp: '2024-01-01T10:00:00Z',
        source_attribution: 'facebook',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.2',
        ttl: 3600,
        formatted_timestamp: '2024-01-01 10:00:00',
      },
      {
        tracking_id: '3',
        timestamp: '2024-01-02T10:00:00Z',
        source_attribution: 'twitter',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.3',
        ttl: 3600,
        formatted_timestamp: '2024-01-02 10:00:00',
      },
    ];

    render(<LineChart events={unsortedEvents} />);
    
    const chart = screen.getByTestId('line-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Labels should be sorted chronologically
    expect(chartData.labels).toEqual(['Jan 1', 'Jan 2', 'Jan 3']);
    expect(chartData.datasets[0].data).toEqual([1, 1, 1]);
  });

  it('handles edge cases gracefully', () => {
    // Test with null events
    const { unmount } = render(<LineChart events={null as any} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
    unmount();

    // Test with undefined events
    render(<LineChart events={undefined as any} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<LineChart events={mockEvents} className="custom-class" />);
    
    const container = screen.getByRole('img');
    expect(container).toHaveClass('custom-class');
  });

  it('has proper accessibility attributes', () => {
    render(<LineChart events={mockEvents} />);
    
    const container = screen.getByRole('img');
    expect(container).toHaveAttribute('aria-label', 'Time series chart showing URL redirections over time');
    
    const chart = screen.getByTestId('line-chart');
    expect(chart).toHaveAttribute('aria-label', 'Line chart displaying URL redirection trends over time');
  });

  it('configures chart options correctly', () => {
    render(<LineChart events={mockEvents} />);
    
    const chart = screen.getByTestId('line-chart');
    const chartOptions = JSON.parse(chart.getAttribute('data-chart-options') || '{}');
    
    // Check responsive configuration
    expect(chartOptions.responsive).toBe(true);
    expect(chartOptions.maintainAspectRatio).toBe(false);
    
    // Check scales configuration
    expect(chartOptions.scales.x.title.text).toBe('Date');
    expect(chartOptions.scales.y.title.text).toBe('Number of Redirections');
    expect(chartOptions.scales.y.beginAtZero).toBe(true);
    
    // Check interaction configuration
    expect(chartOptions.interaction.mode).toBe('nearest');
    expect(chartOptions.interaction.axis).toBe('x');
    expect(chartOptions.interaction.intersect).toBe(false);
  });
});

// Test the data transformation function separately
describe('Data Transformation Logic', () => {
  // Since the transformation function is not exported, we'll test it through the component
  it('handles events with invalid timestamps', () => {
    const eventsWithInvalidTimestamp: TrackingEvent[] = [
      {
        tracking_id: '1',
        timestamp: 'invalid-date',
        source_attribution: 'google',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.1',
        ttl: 3600,
        formatted_timestamp: 'invalid-date',
      },
      {
        tracking_id: '2',
        timestamp: '2024-01-01T10:00:00Z',
        source_attribution: 'facebook',
        destination_url: 'https://example.com',
        client_ip: '192.168.1.2',
        ttl: 3600,
        formatted_timestamp: '2024-01-01 10:00:00',
      },
    ];

    // Mock console.warn to avoid test output noise
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<LineChart events={eventsWithInvalidTimestamp} />);
    
    const chart = screen.getByTestId('line-chart');
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}');
    
    // Should only include valid timestamps (1 event)
    expect(chartData.labels).toHaveLength(1);
    expect(chartData.datasets[0].data).toEqual([1]);
    expect(chartData.labels[0]).toBe('Jan 1');
    
    // Should log warning for invalid timestamp
    expect(consoleSpy).toHaveBeenCalledWith('Invalid timestamp found: invalid-date');
    
    consoleSpy.mockRestore();
  });

  it('handles large datasets efficiently', () => {
    // Create a large dataset
    const largeDataset: TrackingEvent[] = Array.from({ length: 1000 }, (_, i) => ({
      tracking_id: `${i}`,
      timestamp: new Date(2024, 0, 1 + (i % 30)).toISOString(),
      source_attribution: `source-${i % 5}`,
      destination_url: 'https://example.com',
      client_ip: '192.168.1.1',
      ttl: 3600,
      formatted_timestamp: new Date(2024, 0, 1 + (i % 30)).toISOString(),
    }));

    const startTime = performance.now();
    render(<LineChart events={largeDataset} />);
    const endTime = performance.now();
    
    // Should render within reasonable time (less than 100ms)
    expect(endTime - startTime).toBeLessThan(100);
    
    const chart = screen.getByTestId('line-chart');
    expect(chart).toBeInTheDocument();
  });
});