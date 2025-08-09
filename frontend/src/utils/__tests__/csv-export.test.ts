import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportEventsToCSV,
  exportAggregateStatsToCSV,
  exportCombinedAnalyticsToCSV,
  validateExportData,
  generateCSVFilename
} from '../csv-export';
import type { TrackingEvent, AggregateStats } from '../../types';

// Mock DOM methods
const mockCreateElement = vi.fn();
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();

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
  },
  {
    tracking_id: 'test-id-2',
    timestamp: '2024-01-01T11:00:00Z',
    formatted_timestamp: '2024-01-01 11:00:00',
    source_attribution: 'social',
    destination_url: 'https://example.com/page2',
    client_ip: '192.168.1.2',
    ttl: 7200
  }
];

const mockAggregateStats: AggregateStats[] = [
  {
    source_attribution: 'email',
    count: 100,
    unique_ips: 50,
    destinations: ['https://example.com/page1', 'https://example.com/page2']
  },
  {
    source_attribution: 'social',
    count: 75,
    unique_ips: 40,
    destinations: ['https://example.com/page2', 'https://example.com/page3']
  }
];

describe('CSV Export Utilities', () => {
  beforeEach(() => {
    // Mock DOM elements and methods
    const mockLink = {
      download: '',
      setAttribute: vi.fn(),
      style: { visibility: '' },
      click: mockClick
    };

    mockCreateElement.mockReturnValue(mockLink);
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    
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

    global.Blob = vi.fn().mockImplementation((content, options) => ({
      content,
      options
    })) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateExportData', () => {
    it('should return valid for non-empty array', () => {
      const result = validateExportData([{ test: 'data' }]);
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should return invalid for empty array', () => {
      const result = validateExportData([]);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('No data available to export');
    });

    it('should return invalid for non-array input', () => {
      const result = validateExportData('not an array' as any);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Data must be an array');
    });
  });

  describe('generateCSVFilename', () => {
    it('should generate filename with default prefix', () => {
      const filename = generateCSVFilename();
      expect(filename).toMatch(/^export-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}\.csv$/);
    });

    it('should generate filename with custom prefix', () => {
      const filename = generateCSVFilename('custom-prefix');
      expect(filename).toMatch(/^custom-prefix-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}\.csv$/);
    });
  });

  describe('exportEventsToCSV', () => {
    it('should create and download CSV for tracking events', () => {
      exportEventsToCSV(mockTrackingEvents);

      // Verify DOM manipulation
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();

      // Verify Blob creation with CSV content
      expect(global.Blob).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('"Tracking ID","Timestamp","Source Attribution"')]),
        { type: 'text/csv;charset=utf-8;' }
      );
    });

    it('should use custom filename when provided', () => {
      const customFilename = 'custom-events.csv';
      exportEventsToCSV(mockTrackingEvents, customFilename);

      const mockLink = mockCreateElement.mock.results[0].value;
      expect(mockLink.setAttribute).toHaveBeenCalledWith('download', customFilename);
    });

    it('should handle empty events array', () => {
      exportEventsToCSV([]);

      // Should still create the CSV structure even with no data
      expect(global.Blob).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('"Tracking ID","Timestamp","Source Attribution"')]),
        { type: 'text/csv;charset=utf-8;' }
      );
    });
  });

  describe('exportAggregateStatsToCSV', () => {
    it('should create and download CSV for aggregate stats', () => {
      exportAggregateStatsToCSV(mockAggregateStats);

      // Verify DOM manipulation
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();

      // Verify Blob creation with CSV content
      expect(global.Blob).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('"Source Attribution","Total Count","Unique IPs"')]),
        { type: 'text/csv;charset=utf-8;' }
      );
    });

    it('should flatten destinations array in CSV output', () => {
      exportAggregateStatsToCSV(mockAggregateStats);

      const blobContent = (global.Blob as any).mock.calls[0][0][0];
      expect(blobContent).toContain('https://example.com/page1; https://example.com/page2');
    });
  });

  describe('exportCombinedAnalyticsToCSV', () => {
    it('should create combined CSV with both events and stats', () => {
      exportCombinedAnalyticsToCSV(mockTrackingEvents, mockAggregateStats);

      // Verify DOM manipulation
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();

      // Verify Blob creation with combined CSV content
      const blobContent = (global.Blob as any).mock.calls[0][0][0];
      expect(blobContent).toContain('Data Type');
      expect(blobContent).toContain('Summary');
      expect(blobContent).toContain('Event');
    });

    it('should handle empty events but valid stats', () => {
      exportCombinedAnalyticsToCSV([], mockAggregateStats);

      const blobContent = (global.Blob as any).mock.calls[0][0][0];
      expect(blobContent).toContain('Summary');
      expect(blobContent).toContain('Data Type'); // Headers should still be present
    });

    it('should handle valid events but empty stats', () => {
      exportCombinedAnalyticsToCSV(mockTrackingEvents, []);

      const blobContent = (global.Blob as any).mock.calls[0][0][0];
      expect(blobContent).toContain('Event');
      expect(blobContent).toContain('Data Type'); // Headers should still be present
    });
  });

  describe('CSV content formatting', () => {
    it('should properly escape quotes in CSV content', () => {
      const eventsWithQuotes: TrackingEvent[] = [{
        ...mockTrackingEvents[0],
        destination_url: 'https://example.com/page?param="quoted value"'
      }];

      exportEventsToCSV(eventsWithQuotes);

      const blobContent = (global.Blob as any).mock.calls[0][0][0];
      expect(blobContent).toContain('""quoted value""');
    });

    it('should handle null and undefined values', () => {
      const eventsWithNulls: TrackingEvent[] = [{
        ...mockTrackingEvents[0],
        client_ip: null as any,
        ttl: undefined as any
      }];

      exportEventsToCSV(eventsWithNulls);

      const blobContent = (global.Blob as any).mock.calls[0][0][0];
      expect(blobContent).toContain('""'); // Should contain empty quoted strings
    });
  });

  describe('Error handling', () => {
    it('should handle download not supported', () => {
      const mockLinkWithoutDownload = {
        setAttribute: vi.fn(),
        style: { visibility: '' },
        click: mockClick
      };

      mockCreateElement.mockReturnValue(mockLinkWithoutDownload);

      // Should not throw error even if download is not supported
      expect(() => exportEventsToCSV(mockTrackingEvents)).not.toThrow();
    });
  });
});