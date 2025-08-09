
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExportButton from '../ExportButton';
import type { TrackingEvent, AggregateStats } from '../../types';
import * as csvExport from '../../utils/csv-export';

// Mock the CSV export utilities
vi.mock('../../utils/csv-export', () => ({
  exportEventsToCSV: vi.fn(),
  exportAggregateStatsToCSV: vi.fn(),
  exportCombinedAnalyticsToCSV: vi.fn(),
  validateExportData: vi.fn(),
  generateCSVFilename: vi.fn()
}));

// Mock data
const mockTrackingEvents: TrackingEvent[] = [
  {
    tracking_id: 'test-id-1',
    timestamp: '2024-01-01T10:00:00Z',
    formatted_timestamp: '2024-01-01 10:00:00',
    source_attribution: 'email',
    destination_url: 'https://example.com/page1',
    client_ip: '192.168.1.1',
    ttl: 3600
  }
];

const mockAggregateStats: AggregateStats[] = [
  {
    source_attribution: 'email',
    count: 100,
    unique_ips: 50,
    destinations: ['https://example.com/page1']
  }
];

describe('ExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    (csvExport.validateExportData as any).mockReturnValue({ isValid: true });
    (csvExport.generateCSVFilename as any).mockReturnValue('test-export.csv');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button', { name: /export events/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('should render with custom label', () => {
      render(
        <ExportButton 
          type="events" 
          events={mockTrackingEvents} 
          label="Custom Export Label" 
        />
      );
      
      expect(screen.getByRole('button', { name: /custom export label/i })).toBeInTheDocument();
    });

    it('should render different labels for different types', () => {
      const { rerender } = render(<ExportButton type="events" events={mockTrackingEvents} />);
      expect(screen.getByRole('button', { name: /export events/i })).toBeInTheDocument();

      rerender(<ExportButton type="aggregate" aggregateStats={mockAggregateStats} />);
      expect(screen.getByRole('button', { name: /export stats/i })).toBeInTheDocument();

      rerender(<ExportButton type="combined" events={mockTrackingEvents} aggregateStats={mockAggregateStats} />);
      expect(screen.getByRole('button', { name: /export all/i })).toBeInTheDocument();
    });

    it('should apply size classes correctly', () => {
      const { rerender } = render(<ExportButton type="events" events={mockTrackingEvents} size="sm" />);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('px-3', 'py-1.5', 'text-sm');

      rerender(<ExportButton type="events" events={mockTrackingEvents} size="lg" />);
      button = screen.getByRole('button');
      expect(button).toHaveClass('px-6', 'py-3', 'text-base');
    });

    it('should apply variant classes correctly', () => {
      const { rerender } = render(<ExportButton type="events" events={mockTrackingEvents} variant="primary" />);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('bg-green-600', 'text-white');

      rerender(<ExportButton type="events" events={mockTrackingEvents} variant="secondary" />);
      button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-600', 'text-white');
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when explicitly disabled', () => {
      render(<ExportButton type="events" events={mockTrackingEvents} disabled />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when events array is empty for events type', () => {
      render(<ExportButton type="events" events={[]} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when aggregateStats array is empty for aggregate type', () => {
      render(<ExportButton type="aggregate" aggregateStats={[]} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when both arrays are empty for combined type', () => {
      render(<ExportButton type="combined" events={[]} aggregateStats={[]} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should not be disabled for combined type when one array has data', () => {
      render(<ExportButton type="combined" events={mockTrackingEvents} aggregateStats={[]} />);
      
      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('Export Functionality', () => {
    it('should call exportEventsToCSV for events type', async () => {
      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(csvExport.exportEventsToCSV).toHaveBeenCalledWith(
          mockTrackingEvents,
          'test-export.csv'
        );
      });
    });

    it('should call exportAggregateStatsToCSV for aggregate type', async () => {
      render(<ExportButton type="aggregate" aggregateStats={mockAggregateStats} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(csvExport.exportAggregateStatsToCSV).toHaveBeenCalledWith(
          mockAggregateStats,
          'test-export.csv'
        );
      });
    });

    it('should call exportCombinedAnalyticsToCSV for combined type', async () => {
      render(
        <ExportButton 
          type="combined" 
          events={mockTrackingEvents} 
          aggregateStats={mockAggregateStats} 
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(csvExport.exportCombinedAnalyticsToCSV).toHaveBeenCalledWith(
          mockTrackingEvents,
          mockAggregateStats,
          'test-export.csv'
        );
      });
    });

    it('should show loading state during export', async () => {
      // Mock a delayed export function
      (csvExport.exportEventsToCSV as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 50))
      );

      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Should show loading state immediately
      expect(screen.getByText(/exporting/i)).toBeInTheDocument();
      expect(button).toBeDisabled();

      // Wait for export to complete (including the 1 second success delay)
      await waitFor(() => {
        expect(screen.queryByText(/exporting/i)).not.toBeInTheDocument();
      }, { timeout: 1500 });
    });
  });

  describe('Error Handling', () => {
    it('should display error when validation fails', async () => {
      (csvExport.validateExportData as any).mockReturnValue({
        isValid: false,
        message: 'No data available'
      });

      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('No data available')).toBeInTheDocument();
      });
    });

    it('should display error when export function throws', async () => {
      (csvExport.exportEventsToCSV as any).mockImplementation(() => {
        throw new Error('Export failed');
      });

      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Export failed')).toBeInTheDocument();
      });
    });

    it('should allow dismissing error message', async () => {
      (csvExport.validateExportData as any).mockReturnValue({
        isValid: false,
        message: 'Test error'
      });

      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Test error')).toBeInTheDocument();
      });

      // Click the dismiss button
      const dismissButton = screen.getByRole('button', { name: '' }); // Close icon button
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Test error')).not.toBeInTheDocument();
      });
    });

    it('should handle unknown export type', async () => {
      render(<ExportButton type={'unknown' as any} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Invalid export type')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<ExportButton type="events" events={[]} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'No data available to export');
    });

    it('should have proper title when data is available', () => {
      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Export data as CSV');
    });

    it('should be keyboard accessible', () => {
      render(<ExportButton type="events" events={mockTrackingEvents} />);
      
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      render(
        <ExportButton 
          type="events" 
          events={mockTrackingEvents} 
          className="custom-class" 
        />
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should maintain base classes with custom className', () => {
      render(
        <ExportButton 
          type="events" 
          events={mockTrackingEvents} 
          className="custom-class" 
        />
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class', 'inline-flex', 'items-center');
    });
  });
});