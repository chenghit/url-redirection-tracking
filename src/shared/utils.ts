// Utility functions for URL redirection and tracking
import { v4 as uuidv4 } from 'uuid';
import { TrackingEvent } from './types';

/**
 * Extract client IP from request headers
 * Prioritizes X-Forwarded-For header, falls back to source IP from request context
 */
export function extractClientIp(headers: Record<string, string | undefined>, fallbackIp: string): string {
  const xForwardedFor = headers['X-Forwarded-For'] || headers['x-forwarded-for'];
  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one (client IP)
    return xForwardedFor.split(',')[0].trim();
  }
  return fallbackIp;
}

/**
 * Create a tracking event object
 */
export function createTrackingEvent(
  destinationUrl: string,
  clientIp: string,
  sourceAttribution?: string
): TrackingEvent {
  const now = new Date();
  const timestamp = now.toISOString();
  const formattedTimestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  return {
    tracking_id: uuidv4(),
    timestamp,
    formatted_timestamp: formattedTimestamp,
    destination_url: destinationUrl,
    client_ip: clientIp,
    source_attribution: sourceAttribution || null,
    ttl: Math.floor(now.getTime() / 1000) + 60 * 60 * 24 * 365 // 1 year TTL
  };
}

/**
 * Format error for logging and response
 */
export function formatError(error: Error, correlationId: string): Record<string, any> {
  return {
    error: error.message,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    error_code: error.name
  };
}