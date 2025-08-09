// Service layer exports
// Centralized exports for all API services

export { APIClient, apiClient, APIError, NetworkError } from './api-client';
export { AnalyticsService } from './analytics-service';
export { HealthService } from './health-service';
export { 
  errorService, 
  ErrorService, 
  ErrorCategory, 
  ErrorSeverity 
} from './error-service';

// Re-export types for convenience
export type { RequestOptions } from './api-client';
export type { ProcessedError, ErrorHandler } from './error-service';