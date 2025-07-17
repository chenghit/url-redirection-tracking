// Core TypeScript interfaces for data models and API contracts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export interface TrackingEvent {
  tracking_id: string;           // UUID v4
  timestamp: string;             // ISO 8601 format
  formatted_timestamp: string;   // "yyyy-MM-dd HH:mm:ss" format in UTC+8
  source_attribution?: string;   // SA parameter (EdgeUp + 3 digits)
  client_ip: string;            // Client IP address
  destination_url: string;      // Validated destination URL
  ttl?: number;                 // Optional TTL for data retention
}

export interface RedirectionRequest {
  url: string;                  // Required destination URL
  sa?: string;                  // Optional source attribution (EdgeUp + 3 digits)
}

export interface AnalyticsQuery {
  start_date?: string;          // Filter start date (ISO format)
  end_date?: string;            // Filter end date (ISO format)
  source_attribution?: string;  // Filter by source attribution
  destination_url?: string;     // Filter by destination URL
  limit?: number;               // Result limit (default: 100)
  sort_order?: 'asc' | 'desc'; // Sort order by timestamp
  offset?: number;              // Pagination offset
}

export interface AnalyticsQueryResult {
  events: TrackingEvent[];
  total_count: number;
  has_more: boolean;
}

export interface AnalyticsAggregation {
  source_attribution: string;
  count: number;
  unique_ips: number;
  destinations: string[];
}

// AWS Lambda event types
export type RedirectionEvent = APIGatewayProxyEvent;
export type RedirectionResult = APIGatewayProxyResult;
export type AnalyticsEvent = APIGatewayProxyEvent;
export type AnalyticsResult = APIGatewayProxyResult;

export interface ErrorResponse {
  error: string;
  message?: string;
  timestamp: string;
  correlation_id: string;
  error_code?: string;
  details?: Record<string, any>;
}

export interface SuccessResponse<T = unknown> {
  data: T;
  timestamp: string;
}

// DynamoDB item structure
export interface DynamoDBTrackingItem {
  tracking_id: string;
  timestamp: string;
  formatted_timestamp: string;
  source_attribution?: string;
  client_ip: string;
  destination_url: string;
  ttl?: number;
}

// Validation result types
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface URLValidationResult extends ValidationResult {
  normalizedUrl?: string;
}

export interface SAValidationResult extends ValidationResult {
  extractedSA?: string;
}