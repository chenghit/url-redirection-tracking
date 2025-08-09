import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import FilterPanel from '../FilterPanel';
import type { FilterState } from '../../types';

const mockFilters: FilterState = {
  dateRange: {
    start: null,
    end: null
  },
  sourceAttribution: '',
  destinationUrl: '',
  pagination: {
    limit: 50,
    offset: 0
  }
};

const mockFiltersWithData: FilterState = {
  dateRange: {
    start: new Date('2025-01-01'),
    end: new Date('2025-01-31')
  },
  sourceAttribution: 'google',
  destinationUrl: 'example.com',
  pagination: {
    limit: 50,
    offset: 0
  }
};

describe('FilterPanel', () => {
  const mockOnFiltersChange = vi.fn();
  const mockOnRefresh = vi.fn();
  const mockAvailableSources = ['google', 'facebook', 'twitter', 'direct'];

  const defaultProps = {
    filters: mockFilters,
    onFiltersChange: mockOnFiltersChange,
    onRefresh: mockOnRefresh,
    loading: false,
    availableSources: mockAvailableSources
  };

  beforeEach(() => {
    mockOnFiltersChange.mockClear();
    mockOnRefresh.mockClear();
  });

  it('renders filter panel with collapsed state by default', () => {
    render(<FilterPanel {...defaultProps} />);
    
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expand filters')).toBeInTheDocument();
  });

  it('shows active indicator when filters are applied', () => {
    render(
      <FilterPanel
        {...defaultProps}
        filters={mockFiltersWithData}
      />
    );
    
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('expands and collapses filter content', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    expect(screen.getByText('Date Range')).toBeInTheDocument();
    expect(screen.getByLabelText('Source Attribution')).toBeInTheDocument();
    expect(screen.getByLabelText('Destination URL')).toBeInTheDocument();
    
    // Click again to collapse
    const collapseButton = screen.getByLabelText('Collapse filters');
    await user.click(collapseButton);
    
    expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
  });

  it('renders date range picker when expanded', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
  });

  it('renders source attribution dropdown with available sources', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const sourceSelect = screen.getByLabelText('Source Attribution');
    expect(sourceSelect).toBeInTheDocument();
    
    // Check that all sources are available as options
    expect(screen.getByText('All sources')).toBeInTheDocument();
    mockAvailableSources.forEach(source => {
      expect(screen.getByText(source)).toBeInTheDocument();
    });
  });

  it('renders destination URL input', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const destinationInput = screen.getByLabelText('Destination URL');
    expect(destinationInput).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filter by destination URL...')).toBeInTheDocument();
  });

  it('calls onFiltersChange when source attribution changes', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const sourceSelect = screen.getByLabelText('Source Attribution');
    await user.selectOptions(sourceSelect, 'google');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...mockFilters,
      sourceAttribution: 'google'
    });
  });

  it('calls onFiltersChange when destination URL changes', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const destinationInput = screen.getByLabelText('Destination URL');
    await user.type(destinationInput, 'example.com');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...mockFilters,
      destinationUrl: 'example.com'
    });
  });

  it('calls onRefresh when refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const refreshButton = screen.getByText('Refresh Data');
    await user.click(refreshButton);
    
    expect(mockOnRefresh).toHaveBeenCalled();
  });

  it('clears all filters when clear button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilterPanel
        {...defaultProps}
        filters={mockFiltersWithData}
      />
    );
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const clearButton = screen.getByText('Clear Filters');
    await user.click(clearButton);
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      dateRange: {
        start: null,
        end: null
      },
      sourceAttribution: '',
      destinationUrl: '',
      pagination: {
        limit: 50,
        offset: 0
      }
    });
  });

  it('disables inputs when loading', async () => {
    const user = userEvent.setup();
    render(
      <FilterPanel
        {...defaultProps}
        loading={true}
      />
    );
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    expect(screen.getByLabelText('Source Attribution')).toBeDisabled();
    expect(screen.getByLabelText('Destination URL')).toBeDisabled();
    expect(screen.getByLabelText('Start Date')).toBeDisabled();
    expect(screen.getByLabelText('End Date')).toBeDisabled();
  });

  it('disables buttons when loading', async () => {
    const user = userEvent.setup();
    render(
      <FilterPanel
        {...defaultProps}
        loading={true}
      />
    );
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const refreshButton = screen.getByRole('button', { name: /refresh data/i });
    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    
    expect(refreshButton).toBeDisabled();
    expect(clearButton).toBeDisabled();
  });

  it('disables clear button when no active filters', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    expect(clearButton).toBeDisabled();
  });

  it('enables clear button when filters are active', async () => {
    const user = userEvent.setup();
    render(
      <FilterPanel
        {...defaultProps}
        filters={mockFiltersWithData}
      />
    );
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });

  it('shows loading spinner in refresh button when loading', async () => {
    const user = userEvent.setup();
    render(
      <FilterPanel
        {...defaultProps}
        loading={true}
      />
    );
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    expect(refreshButton.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('updates local state when filters prop changes', () => {
    const { rerender } = render(<FilterPanel {...defaultProps} />);
    
    rerender(
      <FilterPanel
        {...defaultProps}
        filters={mockFiltersWithData}
      />
    );
    
    // The component should update its internal state
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    expect(expandButton).toHaveAttribute('aria-controls', 'filter-content');
    
    await user.click(expandButton);
    
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Filter controls' })).toBeInTheDocument();
  });

  it('shows responsive button text', async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...defaultProps} />);
    
    const expandButton = screen.getByLabelText('Expand filters');
    await user.click(expandButton);
    
    // Check for responsive text (hidden on small screens, visible on larger)
    expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    expect(screen.getAllByText('Refresh')[0]).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
    expect(screen.getAllByText('Clear')[1]).toBeInTheDocument(); // Skip the DateRangePicker Clear button
  });
});