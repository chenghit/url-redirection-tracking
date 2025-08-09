/**
 * Chart Image Export Utilities
 * Provides functionality to export Chart.js charts as PNG images
 */

import type { Chart } from 'chart.js';

/**
 * Export chart as PNG image
 */
export function exportChartAsPNG(
  chart: Chart | null,
  filename?: string,
  backgroundColor: string = '#ffffff'
): void {
  if (!chart) {
    throw new Error('Chart instance is required for export');
  }

  try {
    // Get the canvas element from the chart
    const canvas = chart.canvas;
    if (!canvas) {
      throw new Error('Chart canvas not found');
    }

    // Create a new canvas with white background
    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');
    
    if (!exportCtx) {
      throw new Error('Failed to get canvas context for export');
    }

    // Set canvas dimensions to match the chart
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;

    // Fill background with specified color (default white)
    exportCtx.fillStyle = backgroundColor;
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw the chart on top of the background
    exportCtx.drawImage(canvas, 0, 0);

    // Convert to blob and download
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to create image blob');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.href = url;
      link.download = filename || generateChartFilename();
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      URL.revokeObjectURL(url);
    }, 'image/png', 1.0); // High quality PNG

  } catch (error) {
    console.error('Chart export failed:', error);
    throw error;
  }
}

/**
 * Export chart with custom dimensions
 */
export function exportChartWithDimensions(
  chart: Chart | null,
  width: number,
  height: number,
  filename?: string,
  backgroundColor: string = '#ffffff'
): void {
  if (!chart) {
    throw new Error('Chart instance is required for export');
  }

  try {
    const canvas = chart.canvas;
    if (!canvas) {
      throw new Error('Chart canvas not found');
    }

    // Create export canvas with custom dimensions
    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');
    
    if (!exportCtx) {
      throw new Error('Failed to get canvas context for export');
    }

    exportCanvas.width = width;
    exportCanvas.height = height;

    // Fill background
    exportCtx.fillStyle = backgroundColor;
    exportCtx.fillRect(0, 0, width, height);

    // Scale and draw the chart
    const scaleX = width / canvas.width;
    const scaleY = height / canvas.height;
    
    exportCtx.scale(scaleX, scaleY);
    exportCtx.drawImage(canvas, 0, 0);

    // Convert to blob and download
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to create image blob');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.href = url;
      link.download = filename || generateChartFilename();
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    }, 'image/png', 1.0);

  } catch (error) {
    console.error('Chart export with dimensions failed:', error);
    throw error;
  }
}

/**
 * Generate filename for chart export
 */
export function generateChartFilename(prefix: string = 'chart', extension: string = 'png'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
  const date = timestamp[0];
  const time = timestamp[1].split('.')[0].replace('Z', '');
  return `${prefix}-${date}-${time}.${extension}`;
}

/**
 * Get chart instance from a Chart.js component ref
 */
export function getChartInstance(chartRef: React.RefObject<any>): Chart | null {
  if (!chartRef.current) {
    return null;
  }

  // For react-chartjs-2 components, the chart instance is available as chartInstance
  return chartRef.current.chartInstance || chartRef.current;
}

/**
 * Validate chart for export
 */
export function validateChartForExport(chart: Chart | null): { isValid: boolean; message?: string } {
  if (!chart) {
    return { isValid: false, message: 'Chart instance is not available' };
  }

  if (!chart.canvas) {
    return { isValid: false, message: 'Chart canvas is not available' };
  }

  if (chart.canvas.width === 0 || chart.canvas.height === 0) {
    return { isValid: false, message: 'Chart has invalid dimensions' };
  }

  return { isValid: true };
}

/**
 * Export multiple charts as a combined image
 */
export function exportMultipleCharts(
  charts: Array<{ chart: Chart | null; title?: string }>,
  filename?: string,
  backgroundColor: string = '#ffffff',
  layout: 'horizontal' | 'vertical' | 'grid' = 'vertical'
): void {
  const validCharts = charts.filter(({ chart }) => {
    const validation = validateChartForExport(chart);
    return validation.isValid;
  });

  if (validCharts.length === 0) {
    throw new Error('No valid charts available for export');
  }

  try {
    // Calculate combined canvas dimensions based on layout
    let totalWidth = 0;
    let totalHeight = 0;
    const chartDimensions = validCharts.map(({ chart }) => ({
      width: chart!.canvas.width,
      height: chart!.canvas.height
    }));

    switch (layout) {
      case 'horizontal':
        totalWidth = chartDimensions.reduce((sum, dim) => sum + dim.width, 0);
        totalHeight = Math.max(...chartDimensions.map(dim => dim.height));
        break;
      case 'vertical':
        totalWidth = Math.max(...chartDimensions.map(dim => dim.width));
        totalHeight = chartDimensions.reduce((sum, dim) => sum + dim.height, 0);
        break;
      case 'grid': {
        const cols = Math.ceil(Math.sqrt(validCharts.length));
        const rows = Math.ceil(validCharts.length / cols);
        totalWidth = cols * Math.max(...chartDimensions.map(dim => dim.width));
        totalHeight = rows * Math.max(...chartDimensions.map(dim => dim.height));
        break;
      }
    }

    // Create combined canvas
    const combinedCanvas = document.createElement('canvas');
    const combinedCtx = combinedCanvas.getContext('2d');
    
    if (!combinedCtx) {
      throw new Error('Failed to get canvas context for combined export');
    }

    combinedCanvas.width = totalWidth;
    combinedCanvas.height = totalHeight;

    // Fill background
    combinedCtx.fillStyle = backgroundColor;
    combinedCtx.fillRect(0, 0, totalWidth, totalHeight);

    // Draw charts based on layout
    let currentX = 0;
    let currentY = 0;

    validCharts.forEach(({ chart, title }, index) => {
      if (!chart?.canvas) return;

      const canvas = chart.canvas;
      
      // Add title if provided
      if (title) {
        combinedCtx.fillStyle = '#000000';
        combinedCtx.font = '16px Arial, sans-serif';
        combinedCtx.textAlign = 'center';
        combinedCtx.fillText(title, currentX + canvas.width / 2, currentY + 20);
        currentY += 30;
      }

      // Draw chart
      combinedCtx.drawImage(canvas, currentX, currentY);

      // Update position for next chart
      switch (layout) {
        case 'horizontal':
          currentX += canvas.width;
          break;
        case 'vertical':
          currentY += canvas.height + (title ? 30 : 0);
          break;
        case 'grid': {
          const cols = Math.ceil(Math.sqrt(validCharts.length));
          const maxWidth = Math.max(...chartDimensions.map(dim => dim.width));
          const maxHeight = Math.max(...chartDimensions.map(dim => dim.height));
          
          if ((index + 1) % cols === 0) {
            currentX = 0;
            currentY += maxHeight + (title ? 30 : 0);
          } else {
            currentX += maxWidth;
          }
          break;
        }
      }
      
      // Reset Y position for horizontal layout
      if (layout === 'horizontal' && title) {
        currentY = 0;
      }
    });

    // Convert to blob and download
    combinedCanvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to create combined image blob');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.href = url;
      link.download = filename || generateChartFilename('combined-charts');
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    }, 'image/png', 1.0);

  } catch (error) {
    console.error('Multiple charts export failed:', error);
    throw error;
  }
}

/**
 * Common export dimensions presets
 */
export const EXPORT_PRESETS = {
  small: { width: 400, height: 300 },
  medium: { width: 800, height: 600 },
  large: { width: 1200, height: 900 },
  hd: { width: 1920, height: 1080 },
  square: { width: 800, height: 800 },
  wide: { width: 1200, height: 600 }
} as const;

export type ExportPreset = keyof typeof EXPORT_PRESETS;