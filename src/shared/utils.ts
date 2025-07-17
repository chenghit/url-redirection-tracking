// Shared utility functions for URL validation and data processing

import { URLValidationResult, SAValidationResult } from './types';

/**
 * Validates if a URL is properly formatted and points to allowed domains
 * @param url - The URL to validate
 * @returns URLValidationResult with validation status and normalized URL
 */
export function validateUrl(url: string): URLValidationResult {
  if (typeof url !== 'string') {
    return {
      isValid: false,
      error: 'URL parameter is required and must be a string'
    };
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return {
      isValid: false,
      error: 'URL parameter cannot be empty'
    };
  }

  try {
    const urlObj = new URL(url.trim());
    
    // Check protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return {
        isValid: false,
        error: 'URL must use HTTP or HTTPS protocol'
      };
    }

    // Check allowed domains
    const allowedDomains = ['amazonaws.cn', 'amazonaws.com', 'amazon.com'];
    const isAllowedDomain = allowedDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );

    if (!isAllowedDomain) {
      return {
        isValid: false,
        error: 'URL must point to amazonaws.cn, amazonaws.com, or amazon.com domains'
      };
    }

    return {
      isValid: true,
      normalizedUrl: urlObj.toString()
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid URL format'
    };
  }
}

/**
 * Validates source attribution parameter format
 * @param sa - Source attribution parameter
 * @returns SAValidationResult with validation status and extracted SA
 */
export function validateSourceAttribution(sa: string): SAValidationResult {
  if (typeof sa !== 'string') {
    return {
      isValid: false,
      error: 'Source attribution parameter is required and must be a string'
    };
  }

  if (sa.trim().length === 0) {
    return {
      isValid: false,
      error: 'Source attribution parameter cannot be empty'
    };
  }

  // SA parameter MUST start with 'EdgeUp' and followed by 3 digits
  const saPattern = /^EdgeUp\d{3}$/;
  const trimmedSa = sa.trim();
  
  if (!saPattern.test(trimmedSa)) {
    return {
      isValid: false,
      error: 'Source attribution must start with "EdgeUp" followed by exactly 3 digits (e.g., EdgeUp001)'
    };
  }

  return {
    isValid: true,
    extractedSA: trimmedSa
  };
}

/**
 * Legacy function for backward compatibility
 * @param url - The URL to validate
 * @returns boolean indicating if URL is valid
 */
export function isValidUrl(url: string): boolean {
  return validateUrl(url).isValid;
}

/**
 * Legacy function for backward compatibility
 * @param sa - Source attribution parameter
 * @returns boolean indicating if SA format is valid
 */
export function isValidSourceAttribution(sa: string): boolean {
  return validateSourceAttribution(sa).isValid;
}

/**
 * Extracts client IP from request headers or context
 * @param headers - Request headers
 * @param sourceIp - Source IP from request context
 * @returns Client IP address
 */
export function extractClientIp(headers: Record<string, string | undefined>, sourceIp: string): string {
  return headers['X-Forwarded-For']?.split(',')[0]?.trim() || sourceIp;
}

/**
 * Formats timestamp to UTC+8 timezone in "yyyy-MM-dd HH:mm:ss" format
 * @param date - Date object to format
 * @returns Formatted timestamp string
 */
export function formatTimestamp(date: Date): string {
  // Convert to UTC+8 (Beijing time)
  const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return utc8Date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Generates a UUID v4 string
 * @returns UUID v4 string
 */
export function generateTrackingId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Creates a tracking event with all required fields
 * @param destinationUrl - The validated destination URL
 * @param clientIp - Client IP address
 * @param sourceAttribution - Optional source attribution parameter
 * @returns TrackingEvent object ready for storage
 */
export function createTrackingEvent(
  destinationUrl: string,
  clientIp: string,
  sourceAttribution?: string
): import('./types').TrackingEvent {
  const now = new Date();
  
  return {
    tracking_id: generateTrackingId(),
    timestamp: now.toISOString(),
    formatted_timestamp: formatTimestamp(now),
    source_attribution: sourceAttribution,
    client_ip: clientIp,
    destination_url: destinationUrl
  };
}