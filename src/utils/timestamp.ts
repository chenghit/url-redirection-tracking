/**
 * Timestamp formatting utilities for the redirection service
 */

/**
 * Converts an ISO 8601 timestamp to UTC+8 formatted timestamp
 * @param isoTimestamp - ISO 8601 timestamp string (e.g., "2024-01-15T10:30:45.123Z")
 * @returns Formatted timestamp in "yyyy-MM-dd HH:mm:ss" format in UTC+8 timezone
 */
export function formatTimestampToUTC8(isoTimestamp: string): string {
  if (!isoTimestamp || typeof isoTimestamp !== 'string') {
    throw new Error('Invalid timestamp: must be a non-empty string');
  }

  try {
    const date = new Date(isoTimestamp);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp format');
    }

    // Convert to UTC+8 (add 8 hours)
    const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    
    // Format as "yyyy-MM-dd HH:mm:ss"
    const year = utc8Date.getUTCFullYear();
    const month = String(utc8Date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(utc8Date.getUTCDate()).padStart(2, '0');
    const hours = String(utc8Date.getUTCHours()).padStart(2, '0');
    const minutes = String(utc8Date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(utc8Date.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    throw new Error(`Failed to format timestamp: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Gets the current timestamp in ISO 8601 format
 * @returns Current timestamp as ISO 8601 string
 */
export function getCurrentISOTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Gets the current timestamp formatted for UTC+8 timezone
 * @returns Current timestamp in "yyyy-MM-dd HH:mm:ss" format in UTC+8 timezone
 */
export function getCurrentFormattedTimestamp(): string {
  return formatTimestampToUTC8(getCurrentISOTimestamp());
}