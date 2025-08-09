import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportChartAsPNG,
  exportChartWithDimensions,
  generateChartFilename,
  validateChartForExport,
  exportMultipleCharts,
  EXPORT_PRESETS
} from '../chart-export';
import type { Chart } from 'chart.js';

// Mock DOM methods
const mockCreateElement = vi.fn();
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockToBlob = vi.fn();

// Mock chart instance
const createMockChart = (width = 800, height = 600): Chart => ({
  canvas: {
    width,
    height,
    toBlob: mockToBlob
  } as any,
  data: {},
  options: {},
  update: vi.fn(),
  destroy: vi.fn(),
  render: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  resize: vi.fn(),
  clear: vi.fn(),
  toBase64Image: vi.fn(),
  generateLegend: vi.fn(),
  getElementsAtEventForMode: vi.fn(),
  getElementAtEvent: vi.fn(),
  getDatasetAtEvent: vi.fn(),
  isPointInArea: vi.fn(),
  getDatasetMeta: vi.fn(),
  getVisibleDatasetCount: vi.fn(),
  isDatasetVisible: vi.fn(),
  setDatasetVisibility: vi.fn(),
  toggleDataVisibility: vi.fn(),
  getDataVisibility: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  setActiveElements: vi.fn(),
  getActiveElements: vi.fn()
} as any);

describe('Chart Export Utilities', () => {
  beforeEach(() => {
    // Mock DOM elements and methods
    const mockCanvas = {
      width: 800,
      height: 600,
      getContext: vi.fn().mockReturnValue({
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        scale: vi.fn(),
        fillText: vi.fn(),
        textAlign: '',
        font: ''
      }),
      toBlob: mockToBlob
    };

    const mockLink = {
      href: '',
      download: '',
      style: { display: '' },
      click: mockClick
    };

    mockCreateElement.mockImplementation((tagName) => {
      if (tagName === 'canvas') return mockCanvas;
      if (tagName === 'a') return mockLink;
      return {};
    });

    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    mockToBlob.mockImplementation((callback) => {
      callback(new Blob(['mock-image-data'], { type: 'image/png' }));
    });
    
    // Mock global objects
    global.document = {
      createElement: mockCreateElement,
      body: {
        appendChild: mockAppendChild,
        removeChild: mockRemoveChild
      }
    } as any;

    global.URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateChartForExport', () => {
    it('should return valid for proper chart instance', () => {
      const chart = createMockChart();
      const result = validateChartForExport(chart);
      
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should return invalid for null chart', () => {
      const result = validateChartForExport(null);
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Chart instance is not available');
    });

    it('should return invalid for chart without canvas', () => {
      const chart = { ...createMockChart(), canvas: null } as any;
      const result = validateChartForExport(chart);
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Chart canvas is not available');
    });

    it('should return invalid for chart with zero dimensions', () => {
      const chart = createMockChart(0, 0);
      const result = validateChartForExport(chart);
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Chart has invalid dimensions');
    });
  });

  describe('generateChartFilename', () => {
    it('should generate filename with default values', () => {
      const filename = generateChartFilename();
      expect(filename).toMatch(/^chart-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}\.png$/);
    });

    it('should generate filename with custom prefix and extension', () => {
      const filename = generateChartFilename('custom-chart', 'jpg');
      expect(filename).toMatch(/^custom-chart-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}\.jpg$/);
    });
  });

  describe('exportChartAsPNG', () => {
    it('should export chart with original dimensions', () => {
      const chart = createMockChart();
      const filename = 'test-chart.png';
      
      exportChartAsPNG(chart, filename);

      // Verify DOM manipulation
      expect(mockCreateElement).toHaveBeenCalledWith('canvas');
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });

    it('should throw error for null chart', () => {
      expect(() => exportChartAsPNG(null)).toThrow('Chart instance is required for export');
    });

    it('should throw error for chart without canvas', () => {
      const chart = { ...createMockChart(), canvas: null } as any;
      expect(() => exportChartAsPNG(chart)).toThrow('Chart canvas not found');
    });
  });

  describe('exportChartWithDimensions', () => {
    it('should export chart with custom dimensions', () => {
      const chart = createMockChart();
      const width = 1200;
      const height = 800;
      const filename = 'custom-size-chart.png';
      
      exportChartWithDimensions(chart, width, height, filename);

      // Verify canvas creation with custom dimensions
      expect(mockCreateElement).toHaveBeenCalledWith('canvas');
      
      // Verify the export process
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should throw error for null chart', () => {
      expect(() => exportChartWithDimensions(null, 800, 600)).toThrow('Chart instance is required for export');
    });
  });

  describe('exportMultipleCharts', () => {
    it('should export multiple charts in vertical layout', () => {
      const chart1 = createMockChart(400, 300);
      const chart2 = createMockChart(400, 300);
      
      const charts = [
        { chart: chart1, title: 'Chart 1' },
        { chart: chart2, title: 'Chart 2' }
      ];
      
      exportMultipleCharts(charts, 'combined-charts.png', '#ffffff', 'vertical');

      // Verify combined canvas creation
      expect(mockCreateElement).toHaveBeenCalledWith('canvas');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should export multiple charts in horizontal layout', () => {
      const chart1 = createMockChart(400, 300);
      const chart2 = createMockChart(400, 300);
      
      const charts = [
        { chart: chart1, title: 'Chart 1' },
        { chart: chart2, title: 'Chart 2' }
      ];
      
      exportMultipleCharts(charts, 'combined-charts.png', '#ffffff', 'horizontal');

      expect(mockCreateElement).toHaveBeenCalledWith('canvas');
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should export multiple charts in grid layout', () => {
      const chart1 = createMockChart(400, 300);
      const chart2 = createMockChart(400, 300);
      const chart3 = createMockChart(400, 300);
      const chart4 = createMockChart(400, 300);
      
      const charts = [
        { chart: chart1, title: 'Chart 1' },
        { chart: chart2, title: 'Chart 2' },
        { chart: chart3, title: 'Chart 3' },
        { chart: chart4, title: 'Chart 4' }
      ];
      
      exportMultipleCharts(charts, 'grid-charts.png', '#ffffff', 'grid');

      expect(mockCreateElement).toHaveBeenCalledWith('canvas');
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should throw error when no valid charts provided', () => {
      const charts = [
        { chart: null, title: 'Invalid Chart' }
      ];
      
      expect(() => exportMultipleCharts(charts)).toThrow('No valid charts available for export');
    });

    it('should filter out invalid charts and export valid ones', () => {
      const validChart = createMockChart(400, 300);
      const invalidChart = null;
      
      const charts = [
        { chart: validChart, title: 'Valid Chart' },
        { chart: invalidChart, title: 'Invalid Chart' }
      ];
      
      exportMultipleCharts(charts);

      // Should still export the valid chart
      expect(mockCreateElement).toHaveBeenCalledWith('canvas');
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });

  describe('EXPORT_PRESETS', () => {
    it('should have correct preset dimensions', () => {
      expect(EXPORT_PRESETS.small).toEqual({ width: 400, height: 300 });
      expect(EXPORT_PRESETS.medium).toEqual({ width: 800, height: 600 });
      expect(EXPORT_PRESETS.large).toEqual({ width: 1200, height: 900 });
      expect(EXPORT_PRESETS.hd).toEqual({ width: 1920, height: 1080 });
      expect(EXPORT_PRESETS.square).toEqual({ width: 800, height: 800 });
      expect(EXPORT_PRESETS.wide).toEqual({ width: 1200, height: 600 });
    });
  });

  describe('Error handling', () => {
    it('should handle canvas context creation failure', () => {
      const mockCanvasWithoutContext = {
        width: 800,
        height: 600,
        getContext: vi.fn().mockReturnValue(null)
      };

      mockCreateElement.mockImplementation((tagName) => {
        if (tagName === 'canvas') return mockCanvasWithoutContext;
        return { click: mockClick, style: {} };
      });

      const chart = createMockChart();
      
      expect(() => exportChartAsPNG(chart)).toThrow('Failed to get canvas context for export');
    });

    it('should handle blob creation failure', () => {
      mockToBlob.mockImplementation((callback) => {
        callback(null); // Simulate blob creation failure
      });

      const chart = createMockChart();
      
      expect(() => exportChartAsPNG(chart)).toThrow('Failed to create image blob');
    });
  });
});