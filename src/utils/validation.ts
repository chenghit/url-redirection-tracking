/**
 * URL validation utilities for the redirection service
 */

// Allowed domains for URL redirection
const ALLOWED_DOMAINS = ['amazonaws.cn', 'amazonaws.com', 'amazon.com'];

/**
 * Validates if a URL points to an allowed domain
 * @param url - The URL to validate
 * @returns true if the URL is valid and points to an allowed domain
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    
    // Check if the hostname ends with any of the allowed domains
    return ALLOWED_DOMAINS.some(domain => {
      return urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain);
    });
  } catch (error) {
    // Invalid URL format
    return false;
  }
}

/**
 * Validates source attribution parameter format (EdgeUp + 3 digits)
 * @param sourceAttribution - The source attribution string to validate
 * @returns true if the format matches EdgeUp + 3 digits pattern
 */
export function isValidSourceAttribution(sourceAttribution: string): boolean {
  if (!sourceAttribution || typeof sourceAttribution !== 'string') {
    return false;
  }

  // Pattern: EdgeUp followed by exactly 3 digits
  const saPattern = /^EdgeUp\d{3}$/;
  return saPattern.test(sourceAttribution);
}