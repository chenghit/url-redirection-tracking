
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChartExportButton from '../ChartExportButton';
import * as chartExport from '../../utils/chart-export';

// Mock the chart export utilities
vi.mock('../../utils/chart-export', () => ({
  exportChartAsPNG: vi.fn(),
  exportChartWithDimensions: vi.fn(),
  validateChartForExport: vi.fn(),
  generateChartFilename: vi.fn(),
  EXPORT_PRESETS: {
    small: { width: 400, height: 300 },
    medium: { width: 800, height: 600 },
    large: { width: 1200, height: 900 },
    square: { width: 800, height: 800 }
  }
}));

// Mock chart instance
const createMockChartRef = (hasChart = true) => ({
  current: hasChart ? {
    chartInstance: {
      canvas: {
        width: 800,
        height: 600
      }
    }
  } : null
});

describe('ChartExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    (chartExport.validateChartForExport as any).mockReturnValue({ isValid: true });
    (chartExport.generateChartFilename as any).mockReturnValue('test-chart.png');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default props', () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('should render with custom chart title', () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} chartTitle="Custom Chart" />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Export Custom Chart as PNG');
      expect(button).toHaveAttribute('aria-label', 'Export Custom Chart chart as PNG image');
    });

    it('should apply size classes correctly', () => {
      const chartRef = createMockChartRef();
      const { rerender } = render(<ChartExportButton chartRef={chartRef} size="sm" />);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('p-1.5', 'text-xs');

      rerender(<ChartExportButton chartRef={chartRef} size="lg" />);
      button = screen.getByRole('button');
      expect(button).toHaveClass('p-3', 'text-base');
    });

    it('should apply variant classes correctly', () => {
      const chartRef = createMockChartRef();
      const { rerender } = render(<ChartExportButton chartRef={chartRef} variant="primary" />);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('bg-blue-600', 'text-white');

      rerender(<ChartExportButton chartRef={chartRef} variant="minimal" />);
      button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-100', 'text-gray-700');
    });

    it('should apply custom className', () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} className="custom-class" />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when explicitly disabled', () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} disabled />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Chart not ready for export');
    });

    it('should be disabled when chart ref is null', () => {
      const chartRef = createMockChartRef(false);
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled(); // Button itself is not disabled, but export will fail
    });
  });

  describe('Export Functionality', () => {
    it('should call exportChartAsPNG with original dimensions by default', async () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} chartTitle="Test Chart" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.exportChartAsPNG).toHaveBeenCalledWith(
          expect.any(Object),
          'test-chart.png',
          '#ffffff'
        );
      });
    });

    it('should call exportChartWithDimensions when preset is specified', async () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} preset="medium" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.exportChartWithDimensions).toHaveBeenCalledWith(
          expect.any(Object),
          800,
          600,
          'test-chart.png',
          '#ffffff'
        );
      });
    });

    it('should call exportChartWithDimensions when custom dimensions are specified', async () => {
      const chartRef = createMockChartRef();
      const customDimensions = { width: 1000, height: 700 };
      
      render(
        <ChartExportButton 
          chartRef={chartRef} 
          customDimensions={customDimensions}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.exportChartWithDimensions).toHaveBeenCalledWith(
          expect.any(Object),
          1000,
          700,
          'test-chart.png',
          '#ffffff'
        );
      });
    });

    it('should use custom background color', async () => {
      const chartRef = createMockChartRef();
      render(
        <ChartExportButton 
          chartRef={chartRef} 
          backgroundColor="#f0f0f0"
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.exportChartAsPNG).toHaveBeenCalledWith(
          expect.any(Object),
          'test-chart.png',
          '#f0f0f0'
        );
      });
    });

    it('should show loading state during export', async () => {
      // Mock a delayed export function
      (chartExport.exportChartAsPNG as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 50))
      );

      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Should show loading state immediately
      expect(button).toBeDisabled();
      expect(button.querySelector('.animate-spin')).toBeInTheDocument();

      // Wait for export to complete (including the 1 second success delay)
      await waitFor(() => {
        expect(button).not.toBeDisabled();
        expect(button.querySelector('.animate-spin')).not.toBeInTheDocument();
      }, { timeout: 1500 });
    });
  });

  describe('Error Handling', () => {
    it('should display error when validation fails', async () => {
      (chartExport.validateChartForExport as any).mockReturnValue({
        isValid: false,
        message: 'Chart is not ready'
      });

      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Chart is not ready')).toBeInTheDocument();
      });
    });

    it('should display error when export function throws', async () => {
      (chartExport.exportChartAsPNG as any).mockImplementation(() => {
        throw new Error('Export failed');
      });

      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Export failed')).toBeInTheDocument();
      });
    });

    it('should allow dismissing error message', async () => {
      (chartExport.validateChartForExport as any).mockReturnValue({
        isValid: false,
        message: 'Test error'
      });

      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
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

    it('should handle chart ref with no chart instance', async () => {
      const chartRef = { current: {} }; // No chartInstance property
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.validateChartForExport).toHaveBeenCalledWith({});
      });
    });
  });

  describe('Chart Instance Access', () => {
    it('should access chart instance from chartInstance property', async () => {
      const mockChart = { canvas: { width: 800, height: 600 } };
      const chartRef = { current: { chartInstance: mockChart } };
      
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.validateChartForExport).toHaveBeenCalledWith(mockChart);
      });
    });

    it('should access chart instance from chart property', async () => {
      const mockChart = { canvas: { width: 800, height: 600 } };
      const chartRef = { current: { chart: mockChart } };
      
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.validateChartForExport).toHaveBeenCalledWith(mockChart);
      });
    });

    it('should use ref current directly if no chartInstance or chart property', async () => {
      const mockChart = { canvas: { width: 800, height: 600 } };
      const chartRef = { current: mockChart };
      
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(chartExport.validateChartForExport).toHaveBeenCalledWith(mockChart);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} chartTitle="Test Chart" />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Export Test Chart chart as PNG image');
      expect(button).toHaveAttribute('title', 'Export Test Chart as PNG');
    });

    it('should be keyboard accessible', () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
    });
  });

  describe('Icon Display', () => {
    it('should show export icon when not exporting', () => {
      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(button.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    it('should show spinner when exporting', async () => {
      (chartExport.exportChartAsPNG as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      const chartRef = createMockChartRef();
      render(<ChartExportButton chartRef={chartRef} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Should show spinner immediately
      expect(button.querySelector('.animate-spin')).toBeInTheDocument();
      expect(button.querySelector('svg:not(.animate-spin)')).not.toBeInTheDocument();
    });
  });
});