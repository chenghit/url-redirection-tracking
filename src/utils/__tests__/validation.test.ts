import { isValidUrl, isValidSourceAttribution } from '../validation';

describe('URL Validation', () => {
  describe('isValidUrl', () => {
    it('should return true for valid amazonaws.cn URLs', () => {
      expect(isValidUrl('https://amazonaws.cn')).toBe(true);
      expect(isValidUrl('https://www.amazonaws.cn')).toBe(true);
      expect(isValidUrl('https://docs.amazonaws.cn/path')).toBe(true);
      expect(isValidUrl('http://amazonaws.cn')).toBe(true);
    });

    it('should return true for valid amazonaws.com URLs', () => {
      expect(isValidUrl('https://amazonaws.com')).toBe(true);
      expect(isValidUrl('https://aws.amazonaws.com')).toBe(true);
      expect(isValidUrl('https://docs.amazonaws.com/path')).toBe(true);
      expect(isValidUrl('http://amazonaws.com')).toBe(true);
    });

    it('should return true for valid amazon.com URLs', () => {
      expect(isValidUrl('https://amazon.com')).toBe(true);
      expect(isValidUrl('https://www.amazon.com')).toBe(true);
      expect(isValidUrl('https://aws.amazon.com/path')).toBe(true);
      expect(isValidUrl('http://amazon.com')).toBe(true);
    });

    it('should return false for invalid domains', () => {
      expect(isValidUrl('https://google.com')).toBe(false);
      expect(isValidUrl('https://example.com')).toBe(false);
      expect(isValidUrl('https://malicious.amazonaws.cn.evil.com')).toBe(false);
      expect(isValidUrl('https://notamazonaws.com')).toBe(false);
    });

    it('should return false for malformed URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('://invalid')).toBe(false);
      expect(isValidUrl('https://')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });

    it('should return false for null, undefined, or non-string inputs', () => {
      expect(isValidUrl(null as any)).toBe(false);
      expect(isValidUrl(undefined as any)).toBe(false);
      expect(isValidUrl(123 as any)).toBe(false);
      expect(isValidUrl({} as any)).toBe(false);
    });
  });

  describe('isValidSourceAttribution', () => {
    it('should return true for valid EdgeUp + 3 digits format', () => {
      expect(isValidSourceAttribution('EdgeUp001')).toBe(true);
      expect(isValidSourceAttribution('EdgeUp123')).toBe(true);
      expect(isValidSourceAttribution('EdgeUp999')).toBe(true);
      expect(isValidSourceAttribution('EdgeUp000')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidSourceAttribution('EdgeUp12')).toBe(false); // Only 2 digits
      expect(isValidSourceAttribution('EdgeUp1234')).toBe(false); // 4 digits
      expect(isValidSourceAttribution('EdgeUpABC')).toBe(false); // Letters instead of digits
      expect(isValidSourceAttribution('edgeup123')).toBe(false); // Wrong case
      expect(isValidSourceAttribution('EdgeUp 123')).toBe(false); // Space
      expect(isValidSourceAttribution('EdgeUp-123')).toBe(false); // Dash
    });

    it('should return false for completely different formats', () => {
      expect(isValidSourceAttribution('Source001')).toBe(false);
      expect(isValidSourceAttribution('Edge123')).toBe(false);
      expect(isValidSourceAttribution('Up123')).toBe(false);
      expect(isValidSourceAttribution('123EdgeUp')).toBe(false);
    });

    it('should return false for null, undefined, or non-string inputs', () => {
      expect(isValidSourceAttribution(null as any)).toBe(false);
      expect(isValidSourceAttribution(undefined as any)).toBe(false);
      expect(isValidSourceAttribution(123 as any)).toBe(false);
      expect(isValidSourceAttribution({} as any)).toBe(false);
      expect(isValidSourceAttribution('')).toBe(false);
    });
  });
});