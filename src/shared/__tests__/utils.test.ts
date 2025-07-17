// Unit tests for shared utility functions

import {
  validateUrl,
  validateSourceAttribution,
  isValidUrl,
  isValidSourceAttribution,
  extractClientIp,
  formatTimestamp,
  generateTrackingId
} from '../utils';

describe('URL Validation', () => {
  describe('validateUrl function', () => {
    test('should validate allowed domains with detailed results', () => {
      const result1 = validateUrl('https://aws.amazon.com/products');
      expect(result1.isValid).toBe(true);
      expect(result1.normalizedUrl).toBe('https://aws.amazon.com/products');
      expect(result1.error).toBeUndefined();

      const result2 = validateUrl('https://docs.amazonaws.com/lambda');
      expect(result2.isValid).toBe(true);
      expect(result2.normalizedUrl).toBe('https://docs.amazonaws.com/lambda');

      const result3 = validateUrl('https://console.amazonaws.cn/ec2');
      expect(result3.isValid).toBe(true);
      expect(result3.normalizedUrl).toBe('https://console.amazonaws.cn/ec2');
    });

    test('should validate subdomains of allowed domains', () => {
      const result1 = validateUrl('https://subdomain.amazon.com/path');
      expect(result1.isValid).toBe(true);
      expect(result1.normalizedUrl).toBe('https://subdomain.amazon.com/path');

      const result2 = validateUrl('https://api.amazonaws.com/service');
      expect(result2.isValid).toBe(true);

      const result3 = validateUrl('https://console.amazonaws.cn/dashboard');
      expect(result3.isValid).toBe(true);
    });

    test('should reject disallowed domains with error messages', () => {
      const result1 = validateUrl('https://google.com');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('URL must point to amazonaws.cn, amazonaws.com, or amazon.com domains');
      expect(result1.normalizedUrl).toBeUndefined();

      const result2 = validateUrl('https://malicious-site.com');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('URL must point to amazonaws.cn, amazonaws.com, or amazon.com domains');
    });

    test('should handle invalid URL formats', () => {
      const result1 = validateUrl('invalid-url');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('Invalid URL format');

      const result2 = validateUrl('not-a-url-at-all');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Invalid URL format');

      const result3 = validateUrl('://missing-protocol.com');
      expect(result3.isValid).toBe(false);
      expect(result3.error).toBe('Invalid URL format');
    });

    test('should reject non-HTTP/HTTPS protocols', () => {
      const result1 = validateUrl('ftp://amazonaws.com/file');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('URL must use HTTP or HTTPS protocol');

      const result2 = validateUrl('file://amazonaws.com/path');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('URL must use HTTP or HTTPS protocol');
    });

    test('should handle edge cases and malformed inputs', () => {
      const result1 = validateUrl('');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('URL parameter cannot be empty');

      const result2 = validateUrl('   ');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('URL parameter cannot be empty');

      const result3 = validateUrl(null as any);
      expect(result3.isValid).toBe(false);
      expect(result3.error).toBe('URL parameter is required and must be a string');

      const result4 = validateUrl(undefined as any);
      expect(result4.isValid).toBe(false);
      expect(result4.error).toBe('URL parameter is required and must be a string');
    });

    test('should normalize URLs with whitespace', () => {
      const result = validateUrl('  https://aws.amazon.com/products  ');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('https://aws.amazon.com/products');
    });

    test('should handle URLs with query parameters and fragments', () => {
      const result1 = validateUrl('https://aws.amazon.com/products?param=value&other=test');
      expect(result1.isValid).toBe(true);
      expect(result1.normalizedUrl).toBe('https://aws.amazon.com/products?param=value&other=test');

      const result2 = validateUrl('https://docs.amazonaws.com/lambda#section');
      expect(result2.isValid).toBe(true);
      expect(result2.normalizedUrl).toBe('https://docs.amazonaws.com/lambda#section');
    });

    test('should reject similar but invalid domains', () => {
      const result1 = validateUrl('https://amazonaws.com.evil.com');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('URL must point to amazonaws.cn, amazonaws.com, or amazon.com domains');

      const result2 = validateUrl('https://amazon.com.malicious.org');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('URL must point to amazonaws.cn, amazonaws.com, or amazon.com domains');
    });
  });

  describe('legacy isValidUrl function', () => {
    test('should validate allowed domains', () => {
      expect(isValidUrl('https://aws.amazon.com/products')).toBe(true);
      expect(isValidUrl('https://docs.amazonaws.com/lambda')).toBe(true);
      expect(isValidUrl('https://console.amazonaws.cn/ec2')).toBe(true);
    });

    test('should reject disallowed domains', () => {
      expect(isValidUrl('https://google.com')).toBe(false);
      expect(isValidUrl('https://malicious-site.com')).toBe(false);
      expect(isValidUrl('invalid-url')).toBe(false);
    });
  });
});

describe('Source Attribution Validation', () => {
  describe('validateSourceAttribution function', () => {
    test('should validate correct SA format with detailed results', () => {
      const result1 = validateSourceAttribution('EdgeUp001');
      expect(result1.isValid).toBe(true);
      expect(result1.extractedSA).toBe('EdgeUp001');
      expect(result1.error).toBeUndefined();

      const result2 = validateSourceAttribution('EdgeUp999');
      expect(result2.isValid).toBe(true);
      expect(result2.extractedSA).toBe('EdgeUp999');

      const result3 = validateSourceAttribution('EdgeUp123');
      expect(result3.isValid).toBe(true);
      expect(result3.extractedSA).toBe('EdgeUp123');
    });

    test('should handle SA with whitespace', () => {
      const result = validateSourceAttribution('  EdgeUp456  ');
      expect(result.isValid).toBe(true);
      expect(result.extractedSA).toBe('EdgeUp456');
    });

    test('should reject incorrect SA format with error messages', () => {
      const result1 = validateSourceAttribution('EdgeUp1');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');
      expect(result1.extractedSA).toBeUndefined();

      const result2 = validateSourceAttribution('EdgeUp1234');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');

      const result3 = validateSourceAttribution('edge001');
      expect(result3.isValid).toBe(false);
      expect(result3.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');

      const result4 = validateSourceAttribution('EdgeUpABC');
      expect(result4.isValid).toBe(false);
      expect(result4.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');
    });

    test('should handle edge cases and malformed inputs', () => {
      const result1 = validateSourceAttribution('');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('Source attribution parameter cannot be empty');

      const result2 = validateSourceAttribution('   ');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Source attribution parameter cannot be empty');

      const result3 = validateSourceAttribution(null as any);
      expect(result3.isValid).toBe(false);
      expect(result3.error).toBe('Source attribution parameter is required and must be a string');

      const result4 = validateSourceAttribution(undefined as any);
      expect(result4.isValid).toBe(false);
      expect(result4.error).toBe('Source attribution parameter is required and must be a string');
    });

    test('should reject partial matches and similar patterns', () => {
      const result1 = validateSourceAttribution('EdgeUp');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');

      const result2 = validateSourceAttribution('EdgeUp12');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');

      const result3 = validateSourceAttribution('EdgeUp12a');
      expect(result3.isValid).toBe(false);
      expect(result3.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');

      const result4 = validateSourceAttribution('EdgeDown001');
      expect(result4.isValid).toBe(false);
      expect(result4.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');

      const result5 = validateSourceAttribution('EdgeUp001extra');
      expect(result5.isValid).toBe(false);
      expect(result5.error).toBe('Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)');
    });

    test('should validate boundary values', () => {
      const result1 = validateSourceAttribution('EdgeUp000');
      expect(result1.isValid).toBe(true);
      expect(result1.extractedSA).toBe('EdgeUp000');

      const result2 = validateSourceAttribution('EdgeUp999');
      expect(result2.isValid).toBe(true);
      expect(result2.extractedSA).toBe('EdgeUp999');
    });
  });

  describe('legacy isValidSourceAttribution function', () => {
    test('should validate correct SA format', () => {
      expect(isValidSourceAttribution('EdgeUp001')).toBe(true);
      expect(isValidSourceAttribution('EdgeUp999')).toBe(true);
    });

    test('should reject incorrect SA format', () => {
      expect(isValidSourceAttribution('EdgeUp1')).toBe(false);
      expect(isValidSourceAttribution('EdgeUp1234')).toBe(false);
      expect(isValidSourceAttribution('edge001')).toBe(false);
      expect(isValidSourceAttribution('EdgeUpABC')).toBe(false);
    });
  });
});

describe('Client IP Extraction', () => {
  test('should extract IP from X-Forwarded-For header', () => {
    const headers = { 'X-Forwarded-For': '192.168.1.1, 10.0.0.1' };
    expect(extractClientIp(headers, '127.0.0.1')).toBe('192.168.1.1');
  });

  test('should fallback to source IP when header is missing', () => {
    const headers = {};
    expect(extractClientIp(headers, '127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('Timestamp Formatting', () => {
  test('should format timestamp to UTC+8', () => {
    const date = new Date('2024-01-15T02:30:45.123Z'); // UTC time
    const formatted = formatTimestamp(date);
    expect(formatted).toBe('2024-01-15 10:30:45'); // UTC+8
  });
});

describe('Tracking ID Generation', () => {
  test('should generate valid UUID v4 format', () => {
    const trackingId = generateTrackingId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(trackingId).toMatch(uuidRegex);
  });

  test('should generate unique IDs', () => {
    const id1 = generateTrackingId();
    const id2 = generateTrackingId();
    expect(id1).not.toBe(id2);
  });
});

describe('Tracking Event Creation', () => {
  // Import the function for testing
  const { createTrackingEvent } = require('../utils');

  test('should create tracking event with all required fields', () => {
    const destinationUrl = 'https://aws.amazon.com/products';
    const clientIp = '192.168.1.1';
    const sourceAttribution = 'EdgeUp001';

    const trackingEvent = createTrackingEvent(destinationUrl, clientIp, sourceAttribution);

    expect(trackingEvent).toMatchObject({
      destination_url: destinationUrl,
      client_ip: clientIp,
      source_attribution: sourceAttribution
    });

    // Verify tracking_id is a valid UUID v4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(trackingEvent.tracking_id).toMatch(uuidRegex);

    // Verify timestamp is valid ISO string
    expect(trackingEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(trackingEvent.timestamp).toISOString()).toBe(trackingEvent.timestamp);

    // Verify formatted_timestamp is in correct format (UTC+8)
    expect(trackingEvent.formatted_timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test('should create tracking event without source attribution', () => {
    const destinationUrl = 'https://docs.amazonaws.com/lambda';
    const clientIp = '10.0.0.1';

    const trackingEvent = createTrackingEvent(destinationUrl, clientIp);

    expect(trackingEvent).toMatchObject({
      destination_url: destinationUrl,
      client_ip: clientIp,
      source_attribution: undefined
    });

    expect(trackingEvent.tracking_id).toBeDefined();
    expect(trackingEvent.timestamp).toBeDefined();
    expect(trackingEvent.formatted_timestamp).toBeDefined();
  });

  test('should create tracking event with undefined source attribution', () => {
    const destinationUrl = 'https://console.amazonaws.cn/ec2';
    const clientIp = '172.16.0.1';

    const trackingEvent = createTrackingEvent(destinationUrl, clientIp, undefined);

    expect(trackingEvent).toMatchObject({
      destination_url: destinationUrl,
      client_ip: clientIp,
      source_attribution: undefined
    });
  });

  test('should generate unique tracking events', () => {
    const destinationUrl = 'https://aws.amazon.com/products';
    const clientIp = '192.168.1.1';
    const sourceAttribution = 'EdgeUp001';

    const event1 = createTrackingEvent(destinationUrl, clientIp, sourceAttribution);
    const event2 = createTrackingEvent(destinationUrl, clientIp, sourceAttribution);

    expect(event1.tracking_id).not.toBe(event2.tracking_id);
    // Timestamps might be the same if called very quickly, but tracking IDs should differ
  });

  test('should handle different URL formats', () => {
    const testCases = [
      'https://aws.amazon.com/products',
      'https://docs.amazonaws.com/lambda/latest/dg/',
      'https://console.amazonaws.cn/ec2/v2/home',
      'https://subdomain.amazon.com/path?query=value#fragment'
    ];

    testCases.forEach(url => {
      const trackingEvent = createTrackingEvent(url, '192.168.1.1', 'EdgeUp001');
      expect(trackingEvent.destination_url).toBe(url);
      expect(trackingEvent.tracking_id).toBeDefined();
      expect(trackingEvent.timestamp).toBeDefined();
      expect(trackingEvent.formatted_timestamp).toBeDefined();
    });
  });

  test('should handle different IP address formats', () => {
    const testCases = [
      '192.168.1.1',
      '10.0.0.1',
      '172.16.0.1',
      '203.0.113.1',
      'unknown'
    ];

    testCases.forEach(ip => {
      const trackingEvent = createTrackingEvent('https://aws.amazon.com/products', ip, 'EdgeUp001');
      expect(trackingEvent.client_ip).toBe(ip);
      expect(trackingEvent.tracking_id).toBeDefined();
      expect(trackingEvent.timestamp).toBeDefined();
      expect(trackingEvent.formatted_timestamp).toBeDefined();
    });
  });

  test('should handle different source attribution formats', () => {
    const testCases = [
      'EdgeUp001',
      'EdgeUp999',
      'EdgeUp123',
      undefined
    ];

    testCases.forEach(sa => {
      const trackingEvent = createTrackingEvent('https://aws.amazon.com/products', '192.168.1.1', sa);
      expect(trackingEvent.source_attribution).toBe(sa);
      expect(trackingEvent.tracking_id).toBeDefined();
      expect(trackingEvent.timestamp).toBeDefined();
      expect(trackingEvent.formatted_timestamp).toBeDefined();
    });
  });

  test('should create consistent timestamp formats', () => {
    const trackingEvent = createTrackingEvent('https://aws.amazon.com/products', '192.168.1.1', 'EdgeUp001');
    
    // Parse the ISO timestamp
    const isoDate = new Date(trackingEvent.timestamp);
    
    // The formatted timestamp should be in UTC+8 format
    // Let's verify the format is correct by checking the formatTimestamp function directly
    const expectedFormatted = formatTimestamp(isoDate);
    expect(trackingEvent.formatted_timestamp).toBe(expectedFormatted);
    
    // Verify the formatted timestamp follows the correct pattern
    expect(trackingEvent.formatted_timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    
    // Verify that the formatted timestamp represents a time 8 hours ahead of UTC
    const utc8Date = new Date(isoDate.getTime() + (8 * 60 * 60 * 1000));
    const expectedFormat = utc8Date.toISOString().slice(0, 19).replace('T', ' ');
    expect(trackingEvent.formatted_timestamp).toBe(expectedFormat);
  });
});