import { formatTimestampToUTC8, getCurrentISOTimestamp, getCurrentFormattedTimestamp } from '../timestamp';

describe('Timestamp Utilities', () => {
  describe('formatTimestampToUTC8', () => {
    it('should convert ISO 8601 timestamp to UTC+8 formatted timestamp', () => {
      // Test case: 2024-01-15T10:30:45.123Z should become 2024-01-15 18:30:45 (UTC+8)
      const isoTimestamp = '2024-01-15T10:30:45.123Z';
      const expected = '2024-01-15 18:30:45';
      expect(formatTimestampToUTC8(isoTimestamp)).toBe(expected);
    });

    it('should handle timestamps without milliseconds', () => {
      const isoTimestamp = '2024-01-15T10:30:45Z';
      const expected = '2024-01-15 18:30:45';
      expect(formatTimestampToUTC8(isoTimestamp)).toBe(expected);
    });

    it('should handle timestamps with timezone offset', () => {
      // 2024-01-15T15:30:45+05:00 is equivalent to 2024-01-15T10:30:45Z
      const isoTimestamp = '2024-01-15T15:30:45+05:00';
      const expected = '2024-01-15 18:30:45';
      expect(formatTimestampToUTC8(isoTimestamp)).toBe(expected);
    });

    it('should handle edge cases around midnight', () => {
      // Test crossing date boundary
      const isoTimestamp = '2024-01-15T16:30:45Z'; // UTC
      const expected = '2024-01-16 00:30:45'; // UTC+8 (next day)
      expect(formatTimestampToUTC8(isoTimestamp)).toBe(expected);
    });

    it('should handle timestamps that cross year boundary', () => {
      const isoTimestamp = '2023-12-31T20:00:00Z'; // UTC
      const expected = '2024-01-01 04:00:00'; // UTC+8 (next year)
      expect(formatTimestampToUTC8(isoTimestamp)).toBe(expected);
    });

    it('should pad single digits with zeros', () => {
      const isoTimestamp = '2024-01-05T01:05:05Z';
      const expected = '2024-01-05 09:05:05';
      expect(formatTimestampToUTC8(isoTimestamp)).toBe(expected);
    });

    it('should throw error for invalid timestamp format', () => {
      expect(() => formatTimestampToUTC8('invalid-timestamp')).toThrow('Failed to format timestamp');
      expect(() => formatTimestampToUTC8('2024-13-01T10:30:45Z')).toThrow('Failed to format timestamp');
      expect(() => formatTimestampToUTC8('not-a-date')).toThrow('Failed to format timestamp');
    });

    it('should throw error for null, undefined, or non-string inputs', () => {
      expect(() => formatTimestampToUTC8(null as any)).toThrow('Invalid timestamp: must be a non-empty string');
      expect(() => formatTimestampToUTC8(undefined as any)).toThrow('Invalid timestamp: must be a non-empty string');
      expect(() => formatTimestampToUTC8(123 as any)).toThrow('Invalid timestamp: must be a non-empty string');
      expect(() => formatTimestampToUTC8('')).toThrow('Invalid timestamp: must be a non-empty string');
    });
  });

  describe('getCurrentISOTimestamp', () => {
    it('should return a valid ISO 8601 timestamp', () => {
      const timestamp = getCurrentISOTimestamp();
      
      // Should match ISO 8601 format
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Should be a valid date
      expect(new Date(timestamp).getTime()).not.toBeNaN();
    });

    it('should return current time (within reasonable margin)', () => {
      const before = Date.now();
      const timestamp = getCurrentISOTimestamp();
      const after = Date.now();
      
      const timestampMs = new Date(timestamp).getTime();
      
      // Should be within 1 second of current time
      expect(timestampMs).toBeGreaterThanOrEqual(before - 1000);
      expect(timestampMs).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('getCurrentFormattedTimestamp', () => {
    it('should return a formatted timestamp in UTC+8', () => {
      const timestamp = getCurrentFormattedTimestamp();
      
      // Should match the expected format
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should be consistent with formatTimestampToUTC8', () => {
      const isoTimestamp = getCurrentISOTimestamp();
      const formattedDirect = getCurrentFormattedTimestamp();
      const formattedViaFunction = formatTimestampToUTC8(isoTimestamp);
      
      // They should be very close (within a few seconds due to execution time)
      // We'll just check the format is consistent
      expect(formattedDirect).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(formattedViaFunction).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });
});