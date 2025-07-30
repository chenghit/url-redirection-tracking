/**
 * Core data models for the URL redirection and tracking system
 */

export interface TrackingEvent {
  tracking_id: string;           // UUID v4
  timestamp: string;             // ISO 8601 format
  formatted_timestamp: string;   // "yyyy-MM-dd HH:mm:ss" format in UTC+8 timezone
  source_attribution?: string;   // SA parameter (EdgeUp + 3 digits format)
  client_ip: string;            // Client IP address collected from X-Forwarded-For header
  destination_url: string;      // Validated destination URL
  ttl?: number;                 // Optional TTL for data retention
}

export interface RedirectionRequest {
  url: string;                  // Required destination URL
  sa?: string;                  // Optional source attribution (EdgeUp + 3 digits format)
}

export interface AnalyticsQuery {
  start_date?: string;          // Filter start date (ISO 8601 format)
  end_date?: string;            // Filter end date (ISO 8601 format)
  source_attribution?: string;  // Filter by source (EdgeUp + 3 digits)
  destination_url?: string;     // Filter by destination URL
  limit?: number;               // Result limit (default: 100, max: 1000)
  sort_order?: 'asc' | 'desc'; // Sort order (default: 'desc')
  offset?: number;              // Pagination offset (default: 0)
}

export interface QueryResponse {
  data: {
    events: TrackingEvent[];
    total_count: number;
    has_more: boolean;
  };
  timestamp: string;
}

export interface AggregateResponse {
  data: {
    source_attribution: string;
    count: number;
    unique_ips: number;
    destinations: string[];
  }[];
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
}