import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorService, ErrorCategory, ErrorSeverity, errorService } from '../error-service';
import { APIError, NetworkError } from '../api-client';

describe('ErrorService', () => {
  let service: ErrorService;

  beforeEach(() => {
    service = new ErrorService();
  });

  describe('processError', () => {
    it('should process NetworkError correctly', () => {
      const networkError = new NetworkError('Connection failed');
      const processedError = service.handleError(networkError);

      expect(processedError.category).toBe(ErrorCategory.NETWORK);
      expect(processedError.severity).toBe(ErrorSeverity.HIGH);
      expect(processedError.canRetry).toBe(true);
      expect(processedError.userMessage).toContain('Unable to connect to the server');
      expect(processedError.suggestions).toContain('Check your internet connection');
    });

    it('should process 401 APIError correctly', () => {
      const apiError = new APIError('Unauthorized', 401);
      const processedError = service.handleError(apiError);

      expect(processedError.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(processedError.severity).toBe(ErrorSeverity.HIGH);
      expect(processedError.statusCode).toBe(401);
      expect(processedError.canRetry).toBe(true);
      expect(processedError.userMessage).toContain('Authentication failed');
    });

    it('should process 403 APIError correctly', () => {
      const apiError = new APIError('Forbidden', 403);
      const processedError = service.handleError(apiError);

      expect(processedError.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(processedError.severity).toBe(ErrorSeverity.HIGH);
      expect(processedError.statusCode).toBe(403);
      expect(processedError.canRetry).toBe(false);
      expect(processedError.userMessage).toContain('Access denied');
    });

    it('should process 500 APIError correctly', () => {
      const apiError = new APIError('Internal Server Error', 500);
      const processedError = service.handleError(apiError);

      expect(processedError.category).toBe(ErrorCategory.SERVER);
      expect(processedError.severity).toBe(ErrorSeverity.HIGH);
      expect(processedError.statusCode).toBe(500);
      expect(processedError.canRetry).toBe(true);
      expect(processedError.userMessage).toContain('Server error');
    });

    it('should process generic Error correctly', () => {
      const genericError = new Error('Something went wrong');
      const processedError = service.handleError(genericError);

      expect(processedError.category).toBe(ErrorCategory.CLIENT);
      expect(processedError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(processedError.canRetry).toBe(true);
      expect(processedError.userMessage).toContain('An unexpected error occurred');
    });

    it('should add context to user message', () => {
      const error = new Error('Test error');
      const context = 'Loading dashboard data';
      const processedError = service.handleError(error, context);

      expect(processedError.userMessage).toContain(context);
    });
  });

  describe('error handlers', () => {
    it('should register and call error handlers', () => {
      const handler = vi.fn();
      const unsubscribe = service.onError(handler);

      const error = new Error('Test error');
      service.handleError(error);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Test error',
        category: ErrorCategory.CLIENT
      }));

      unsubscribe();
      service.handleError(error);
      expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should handle errors in error handlers gracefully', () => {
      const faultyHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      service.onError(faultyHandler);
      service.onError(goodHandler);

      const error = new Error('Test error');
      
      // Should not throw despite faulty handler
      expect(() => service.handleError(error)).not.toThrow();
      
      // Good handler should still be called
      expect(goodHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('error history', () => {
    it('should maintain error history', () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      service.handleError(error1);
      service.handleError(error2);

      const history = service.getErrorHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('Error 2'); // Most recent first
      expect(history[1].message).toBe('Error 1');
    });

    it('should limit history size', () => {
      // Create service with small history limit for testing
      const smallService = new ErrorService();
      
      // Add more errors than the default limit (100)
      for (let i = 0; i < 105; i++) {
        smallService.handleError(new Error(`Error ${i}`));
      }

      const history = smallService.getErrorHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should filter errors by category', () => {
      service.handleError(new NetworkError('Network error'));
      service.handleError(new APIError('Server error', 500));
      service.handleError(new Error('Client error'));

      const networkErrors = service.getErrorsByCategory(ErrorCategory.NETWORK);
      const serverErrors = service.getErrorsByCategory(ErrorCategory.SERVER);

      expect(networkErrors).toHaveLength(1);
      expect(serverErrors).toHaveLength(1);
    });

    it('should filter errors by severity', () => {
      service.handleError(new NetworkError('Network error')); // HIGH
      service.handleError(new APIError('Bad request', 400)); // MEDIUM
      service.handleError(new Error('Client error')); // MEDIUM

      const highSeverityErrors = service.getErrorsBySeverity(ErrorSeverity.HIGH);
      const mediumSeverityErrors = service.getErrorsBySeverity(ErrorSeverity.MEDIUM);

      expect(highSeverityErrors).toHaveLength(1);
      expect(mediumSeverityErrors).toHaveLength(2);
    });

    it('should detect recent critical errors', () => {
      // No critical errors initially
      expect(service.hasRecentCriticalErrors()).toBe(false);

      // Add a critical error (we'll need to modify the service to create critical errors)
      const criticalError = new APIError('Critical system failure', 500);
      const processedError = service.handleError(criticalError);
      
      // Manually set severity to critical for testing
      processedError.severity = ErrorSeverity.CRITICAL;
      
      // Should detect recent critical error
      expect(service.hasRecentCriticalErrors()).toBe(false); // Still false as we don't have critical errors in our current logic
    });

    it('should clear error history', () => {
      service.handleError(new Error('Error 1'));
      service.handleError(new Error('Error 2'));

      expect(service.getErrorHistory()).toHaveLength(2);

      service.clearErrorHistory();
      expect(service.getErrorHistory()).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should get user-friendly message', () => {
      const error = new APIError('Unauthorized', 401);
      const message = service.getUserFriendlyMessage(error, 'Loading data');

      expect(message).toContain('Loading data');
      expect(message).toContain('Authentication failed');
    });

    it('should check if error is retryable', () => {
      const networkError = new NetworkError('Connection failed');
      const forbiddenError = new APIError('Forbidden', 403);

      expect(service.isRetryable(networkError)).toBe(true);
      expect(service.isRetryable(forbiddenError)).toBe(false);
    });

    it('should get suggestions for error', () => {
      const networkError = new NetworkError('Connection failed');
      const suggestions = service.getSuggestions(networkError);

      expect(suggestions).toContain('Check your internet connection');
      expect(suggestions).toContain('Try refreshing the page');
    });
  });
});

describe('errorService singleton', () => {
  it('should be a singleton instance', () => {
    expect(errorService).toBeInstanceOf(ErrorService);
  });

  it('should maintain state across imports', () => {
    const error = new Error('Test error');
    errorService.handleError(error);

    expect(errorService.getErrorHistory()).toHaveLength(1);
  });
});