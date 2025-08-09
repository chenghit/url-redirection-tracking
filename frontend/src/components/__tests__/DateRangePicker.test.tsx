import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import DateRangePicker from '../DateRangePicker';

describe('DateRangePicker', () => {
  const mockOnDateRangeChange = vi.fn();
  const defaultProps = {
    startDate: null,
    endDate: null,
    onDateRangeChange: mockOnDateRangeChange,
  };

  beforeEach(() => {
    mockOnDateRangeChange.mockClear();
  });

  it('renders date inputs correctly', () => {
    render(<DateRangePicker {...defaultProps} />);
    
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('')).toHaveLength(2);
  });

  it('displays initial dates when provided', () => {
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-31');
    
    render(
      <DateRangePicker
        {...defaultProps}
        startDate={startDate}
        endDate={endDate}
      />
    );
    
    expect(screen.getByDisplayValue('2025-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2025-01-31')).toBeInTheDocument();
  });

  it('calls onDateRangeChange when start date changes', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker {...defaultProps} />);
    
    const startDateInput = screen.getByLabelText('Start Date');
    await user.type(startDateInput, '2025-01-01');
    
    expect(mockOnDateRangeChange).toHaveBeenCalledWith(
      new Date('2025-01-01'),
      null
    );
  });

  it('calls onDateRangeChange when end date changes', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker {...defaultProps} />);
    
    const endDateInput = screen.getByLabelText('End Date');
    await user.type(endDateInput, '2025-01-31');
    
    expect(mockOnDateRangeChange).toHaveBeenCalledWith(
      null,
      new Date('2025-01-31')
    );
  });

  it('renders quick select buttons', () => {
    render(<DateRangePicker {...defaultProps} />);
    
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getByText('Last 90 days')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('handles quick select for 7 days', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker {...defaultProps} />);
    
    const sevenDaysButton = screen.getByText('Last 7 days');
    await user.click(sevenDaysButton);
    
    expect(mockOnDateRangeChange).toHaveBeenCalled();
    const [startDate, endDate] = mockOnDateRangeChange.mock.calls[0];
    expect(startDate).toBeInstanceOf(Date);
    expect(endDate).toBeInstanceOf(Date);
    
    // Check that the date range is approximately 7 days
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBe(7);
  });

  it('handles quick select for 30 days', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker {...defaultProps} />);
    
    const thirtyDaysButton = screen.getByText('Last 30 days');
    await user.click(thirtyDaysButton);
    
    expect(mockOnDateRangeChange).toHaveBeenCalled();
    const [startDate, endDate] = mockOnDateRangeChange.mock.calls[0];
    
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBe(30);
  });

  it('handles quick select for 90 days', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker {...defaultProps} />);
    
    const ninetyDaysButton = screen.getByText('Last 90 days');
    await user.click(ninetyDaysButton);
    
    expect(mockOnDateRangeChange).toHaveBeenCalled();
    const [startDate, endDate] = mockOnDateRangeChange.mock.calls[0];
    
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBe(90);
  });

  it('handles clear button', async () => {
    const user = userEvent.setup();
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-31');
    
    render(
      <DateRangePicker
        {...defaultProps}
        startDate={startDate}
        endDate={endDate}
      />
    );
    
    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);
    
    expect(mockOnDateRangeChange).toHaveBeenCalledWith(null, null);
  });

  it('disables inputs when disabled prop is true', () => {
    render(<DateRangePicker {...defaultProps} disabled={true} />);
    
    const startDateInput = screen.getByLabelText('Start Date');
    const endDateInput = screen.getByLabelText('End Date');
    
    expect(startDateInput).toBeDisabled();
    expect(endDateInput).toBeDisabled();
  });

  it('disables buttons when disabled prop is true', () => {
    render(<DateRangePicker {...defaultProps} disabled={true} />);
    
    expect(screen.getByText('Last 7 days')).toBeDisabled();
    expect(screen.getByText('Last 30 days')).toBeDisabled();
    expect(screen.getByText('Last 90 days')).toBeDisabled();
    expect(screen.getByText('Clear')).toBeDisabled();
  });

  it('updates local state when props change', () => {
    const newStartDate = new Date('2025-02-01');
    const newEndDate = new Date('2025-02-28');
    
    render(
      <DateRangePicker
        {...defaultProps}
        startDate={newStartDate}
        endDate={newEndDate}
      />
    );
    
    const startInput = screen.getByLabelText('Start Date') as HTMLInputElement;
    const endInput = screen.getByLabelText('End Date') as HTMLInputElement;
    
    expect(startInput.value).toBe('2025-02-01');
    expect(endInput.value).toBe('2025-02-28');
  });

  it('handles empty date input correctly', async () => {
    const user = userEvent.setup();
    const startDate = new Date('2025-01-01');
    
    render(
      <DateRangePicker
        {...defaultProps}
        startDate={startDate}
      />
    );
    
    const startDateInput = screen.getByLabelText('Start Date');
    await user.clear(startDateInput);
    
    expect(mockOnDateRangeChange).toHaveBeenCalledWith(null, null);
  });
});