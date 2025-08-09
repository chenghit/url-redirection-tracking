import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable } from '../DataTable';
import type { TrackingEvent } from '../../types';

// Mock data for testing
const mockTrackingEvents: TrackingEvent[] = [
  {
    tracking_id: '123e4567-e89b-12d3-a456-426614174000',
    timestamp: '2024-01-15T10:30:00Z',
    formatted_timestamp: '2024-01-15T10:30:00Z',
    source_attribution: 'email',
    destination_url: 'https://example.com/page1',
    client_ip: '192.168.1.1',
    ttl: 1642248600
  },
  {
    tracking_id: '123e4567-e89b-12d3-a456-426614174001',
    timestamp: '2024-01-15T11:30:00Z',
    formatted_timestamp: '2024-01-15T11:30:00Z',
    source_attribution: 'social',
    destination_url: 'https://example.com/page2',
    client_ip: '192.168.1.2',
    ttl: 1642252200
  },
  {
    tracking_id: '123e4567-e89b-12d3-a456-426614174002',
    timestamp: '2024-01-15T09:30:00Z',
    formatted_timestamp: '2024-01-15T09:30:00Z',
    source_attribution: 'direct',
    destination_url: 'https://example.com/page3',
    client_ip: '192.168.1.3',
    ttl: 1642244800
  }
];

describe('DataTable', () => {
  it('renders table with tracking events', () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    expect(screen.getByText('Tracking Events (3 of 3 total)')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('social')).toBeInTheDocument();
    expect(screen.getByText('direct')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    render(<DataTable data={[]} loading={true} />);
    
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(document.querySelector('.bg-gray-200')).toBeInTheDocument();
  });

  it('displays empty state when no data', () => {
    render(<DataTable data={[]} />);
    
    expect(screen.getByText('No tracking events found')).toBeInTheDocument();
  });

  it('sorts data by timestamp when column header is clicked', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const timestampHeader = screen.getByText('Timestamp');
    fireEvent.click(timestampHeader);
    
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // First row is header, second row should be the earliest timestamp (09:30)
      expect(rows[1]).toHaveTextContent('direct');
    });
  });

  it('sorts data by source attribution when column header is clicked', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const sourceHeaders = screen.getAllByText('Source Attribution');
    const tableHeader = sourceHeaders.find(header => 
      header.closest('th') !== null
    );
    fireEvent.click(tableHeader!);
    
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // First row is header, second row should be 'direct' (alphabetically first)
      expect(rows[1]).toHaveTextContent('direct');
    });
  });

  it('reverses sort order when clicking same column twice', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const sourceHeaders = screen.getAllByText('Source Attribution');
    const tableHeader = sourceHeaders.find(header => 
      header.closest('th') !== null
    );
    
    // First click - ascending
    fireEvent.click(tableHeader!);
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('direct');
    });
    
    // Second click - descending
    fireEvent.click(tableHeader!);
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('social');
    });
  });

  it('changes page size when dropdown is changed', async () => {
    const manyEvents = Array.from({ length: 30 }, (_, i) => ({
      ...mockTrackingEvents[0],
      tracking_id: `tracking-${i}`,
      source_attribution: `source-${i}`
    }));
    
    render(<DataTable data={manyEvents} />);
    
    const pageSizeSelect = screen.getByDisplayValue('25');
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });
  });

  it('handles pagination correctly', async () => {
    const manyEvents = Array.from({ length: 30 }, (_, i) => ({
      ...mockTrackingEvents[0],
      tracking_id: `tracking-${i}`,
      source_attribution: `source-${i}`
    }));
    
    render(<DataTable data={manyEvents} pageSize={10} />);
    
    expect(screen.getByText('Showing 1 to 10 of 30 results')).toBeInTheDocument();
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Showing 11 to 20 of 30 results')).toBeInTheDocument();
    });
  });

  it('disables Previous button on first page', () => {
    const manyEvents = Array.from({ length: 30 }, (_, i) => ({
      ...mockTrackingEvents[0],
      tracking_id: `tracking-${i}`
    }));
    
    render(<DataTable data={manyEvents} pageSize={10} />);
    
    const previousButton = screen.getByText('Previous');
    expect(previousButton).toBeDisabled();
  });

  it('disables Next button on last page', async () => {
    const manyEvents = Array.from({ length: 15 }, (_, i) => ({
      ...mockTrackingEvents[0],
      tracking_id: `tracking-${i}`
    }));
    
    render(<DataTable data={manyEvents} pageSize={10} />);
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });
  });

  it('truncates long URLs', () => {
    const longUrlEvent: TrackingEvent = {
      ...mockTrackingEvents[0],
      destination_url: 'https://example.com/very/long/path/that/should/be/truncated/because/it/is/too/long'
    };
    
    render(<DataTable data={[longUrlEvent]} />);
    
    const urlLink = screen.getByRole('link');
    expect(urlLink.textContent).toMatch(/\.\.\.$/);
    expect(urlLink).toHaveAttribute('title', longUrlEvent.destination_url);
  });

  it('formats timestamp correctly', () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    // Check that timestamps are formatted (exact format depends on locale)
    const timestampCells = screen.getAllByText(/2024/);
    expect(timestampCells.length).toBeGreaterThan(0);
  });

  it('displays tracking ID as truncated', () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    // Tracking IDs should be truncated to first 8 characters + "..."
    expect(screen.getAllByText('123e4567...').length).toBeGreaterThan(0);
  });

  it('calls onPageChange callback when page changes', async () => {
    const onPageChange = vi.fn();
    const manyEvents = Array.from({ length: 30 }, (_, i) => ({
      ...mockTrackingEvents[0],
      tracking_id: `tracking-${i}`
    }));
    
    render(<DataTable data={manyEvents} pageSize={10} onPageChange={onPageChange} />);
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(onPageChange).toHaveBeenCalledWith(2);
    });
  });

  it('calls onPageSizeChange callback when page size changes', async () => {
    const onPageSizeChange = vi.fn();
    
    render(<DataTable data={mockTrackingEvents} onPageSizeChange={onPageSizeChange} />);
    
    const pageSizeSelect = screen.getByDisplayValue('25');
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });
    
    await waitFor(() => {
      expect(onPageSizeChange).toHaveBeenCalledWith(10);
    });
  });

  it('applies custom className', () => {
    const { container } = render(<DataTable data={mockTrackingEvents} className="custom-class" />);
    
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('shows correct sort icons', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const timestampHeader = screen.getByText('Timestamp');
    
    // Before sorting, should show neutral sort icon
    expect(timestampHeader.parentElement).toContainHTML('text-gray-400');
    
    // After clicking, should show active sort icon
    fireEvent.click(timestampHeader);
    
    await waitFor(() => {
      expect(timestampHeader.parentElement).toContainHTML('text-blue-600');
    });
  });

  // Filtering and Search Tests
  it('filters data by global search term', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const searchInput = screen.getByPlaceholderText('Search events...');
    fireEvent.change(searchInput, { target: { value: 'email' } });
    
    await waitFor(() => {
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.queryByText('social')).not.toBeInTheDocument();
      expect(screen.queryByText('direct')).not.toBeInTheDocument();
    });
  });

  it('filters data by source attribution', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const sourceFilter = screen.getByPlaceholderText('Filter by source...');
    fireEvent.change(sourceFilter, { target: { value: 'social' } });
    
    await waitFor(() => {
      expect(screen.getByText('social')).toBeInTheDocument();
      expect(screen.queryByText('email')).not.toBeInTheDocument();
      expect(screen.queryByText('direct')).not.toBeInTheDocument();
    });
  });

  it('filters data by destination URL', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const urlFilter = screen.getByPlaceholderText('Filter by URL...');
    fireEvent.change(urlFilter, { target: { value: 'page2' } });
    
    await waitFor(() => {
      expect(screen.getByText('social')).toBeInTheDocument();
      expect(screen.queryByText('email')).not.toBeInTheDocument();
      expect(screen.queryByText('direct')).not.toBeInTheDocument();
    });
  });

  it('filters data by client IP', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const ipFilter = screen.getByPlaceholderText('Filter by IP...');
    fireEvent.change(ipFilter, { target: { value: '192.168.1.2' } });
    
    await waitFor(() => {
      expect(screen.getByText('social')).toBeInTheDocument();
      expect(screen.queryByText('email')).not.toBeInTheDocument();
      expect(screen.queryByText('direct')).not.toBeInTheDocument();
    });
  });

  it('combines multiple filters correctly', async () => {
    const moreEvents: TrackingEvent[] = [
      ...mockTrackingEvents,
      {
        tracking_id: '123e4567-e89b-12d3-a456-426614174003',
        timestamp: '2024-01-15T12:30:00Z',
        formatted_timestamp: '2024-01-15T12:30:00Z',
        source_attribution: 'email',
        destination_url: 'https://example.com/page4',
        client_ip: '192.168.1.4',
        ttl: 1642256000
      }
    ];
    
    render(<DataTable data={moreEvents} />);
    
    const searchInput = screen.getByPlaceholderText('Search events...');
    const sourceFilter = screen.getByPlaceholderText('Filter by source...');
    
    fireEvent.change(searchInput, { target: { value: 'email' } });
    fireEvent.change(sourceFilter, { target: { value: 'email' } });
    
    await waitFor(() => {
      const emailElements = screen.getAllByText('email');
      expect(emailElements.length).toBe(2); // Two email entries should be visible
      expect(screen.queryByText('social')).not.toBeInTheDocument();
      expect(screen.queryByText('direct')).not.toBeInTheDocument();
    });
  });

  it('clears all filters when clear button is clicked', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const searchInput = screen.getByPlaceholderText('Search events...');
    const sourceFilter = screen.getByPlaceholderText('Filter by source...');
    
    // Apply filters
    fireEvent.change(searchInput, { target: { value: 'email' } });
    fireEvent.change(sourceFilter, { target: { value: 'email' } });
    
    await waitFor(() => {
      expect(screen.getByText('Active filters: 2')).toBeInTheDocument();
    });
    
    // Clear filters
    const clearButton = screen.getByText('Clear Filters');
    fireEvent.click(clearButton);
    
    await waitFor(() => {
      expect(searchInput).toHaveValue('');
      expect(sourceFilter).toHaveValue('');
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.getByText('social')).toBeInTheDocument();
      expect(screen.getByText('direct')).toBeInTheDocument();
    });
  });

  it('updates result count when filtering', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    expect(screen.getByText('Tracking Events (3 of 3 total)')).toBeInTheDocument();
    
    const searchInput = screen.getByPlaceholderText('Search events...');
    fireEvent.change(searchInput, { target: { value: 'email' } });
    
    await waitFor(() => {
      expect(screen.getByText('Tracking Events (1 of 3 total)')).toBeInTheDocument();
    });
  });

  it('resets to first page when filtering', async () => {
    const manyEvents = Array.from({ length: 30 }, (_, i) => ({
      ...mockTrackingEvents[0],
      tracking_id: `tracking-${i}`,
      source_attribution: i < 15 ? 'email' : 'social'
    }));
    
    render(<DataTable data={manyEvents} pageSize={10} />);
    
    // Go to second page
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Showing 11 to 20 of 30 results')).toBeInTheDocument();
    });
    
    // Apply filter - should reset to page 1
    const searchInput = screen.getByPlaceholderText('Search events...');
    fireEvent.change(searchInput, { target: { value: 'email' } });
    
    await waitFor(() => {
      expect(screen.getByText('Showing 1 to 10 of 15 results')).toBeInTheDocument();
    });
  });

  it('disables clear filters button when no filters are active', () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const clearButton = screen.getByText('Clear Filters');
    expect(clearButton).toBeDisabled();
  });

  it('can hide filters when showFilters is false', () => {
    render(<DataTable data={mockTrackingEvents} showFilters={false} />);
    
    expect(screen.queryByPlaceholderText('Search events...')).not.toBeInTheDocument();
    expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument();
  });

  it('performs case-insensitive filtering', async () => {
    render(<DataTable data={mockTrackingEvents} />);
    
    const searchInput = screen.getByPlaceholderText('Search events...');
    fireEvent.change(searchInput, { target: { value: 'EMAIL' } });
    
    await waitFor(() => {
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.queryByText('social')).not.toBeInTheDocument();
    });
  });
});