import { APIError, NetworkError } from './api-client';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error categories for better handling
export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  SERVER = 'server',
  CLIENT = 'client',
  UNKNOWN = 'unknown'
}

// Processed error interface
export interface ProcessedError {
  id: string;
  message: string;
  userMessage: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: Date;
  originalError: Error;
  suggestions: string[];
  canRetry: boolean;
  statusCode?: number;
}

// Error handler callback type
export type ErrorHandler = (error: ProcessedError) => void;

// Global error handling service
class ErrorService {
  private errorHandlers: ErrorHandler[] = [];
  private errorHistory: ProcessedError[] = [];
  private maxHistorySize = 100;

  // Register error handler
  public onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    
    // Return unsubscribe function
    return () => {
      const index = this.errorHandlers.indexOf(handler);
      if (index > -1) {
        this.errorHandlers.splice(index, 1);
      }
    };
  }

  // Process and handle error
  public handleError(error: Error, context?: string): ProcessedError {
    const processedError = this.processError(error, context);
    
    // Add to history
    this.addToHistory(processedError);
    
    // Notify all handlers
    this.errorHandlers.forEach(handler => {
      try {
        handler(processedError);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    });

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorService:', processedError);
    }

    return processedError;
  }

  // Process error into standardized format
  private processError(error: Error, context?: string): ProcessedError {
    const id = this.generateErrorId();
    const timestamp = new Date();
    
    let category: ErrorCategory;
    let severity: ErrorSeverity;
    let userMessage: string;
    let suggestions: string[] = [];
    let canRetry = false;
    let statusCode: number | undefined;

    if (error instanceof NetworkError) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.HIGH;
      userMessage = 'Unable to connect to the server. Please check your internet connection.';
      suggestions = [
        'Check your internet connection',
        'Try refreshing the page',
        'Contact support if the problem persists'
      ];
      canRetry = true;
    } else if (error instanceof APIError) {
      statusCode = error.status;
      
      switch (error.status) {
        case 400:
          category = ErrorCategory.VALIDATION;
          severity = ErrorSeverity.MEDIUM;
          userMessage = 'Invalid request. Please check your input and try again.';
          suggestions = [
            'Verify your input data',
            'Check date ranges and filters',
            'Try refreshing the page'
          ];
          break;
          
        case 401:
          category = ErrorCategory.AUTHENTICATION;
          severity = ErrorSeverity.HIGH;
          userMessage = 'Authentication failed. Please try refreshing the page.';
          suggestions = [
            'Refresh the page to re-authenticate',
            'Clear your browser cache',
            'Contact support if the problem persists'
          ];
          canRetry = true;
          break;
          
        case 403:
          category = ErrorCategory.AUTHORIZATION;
          severity = ErrorSeverity.HIGH;
          userMessage = 'Access denied. You don\'t have permission to access this resource.';
          suggestions = [
            'Contact your administrator for access',
            'Verify you\'re using the correct account'
          ];
          break;
          
        case 404:
          category = ErrorCategory.CLIENT;
          severity = ErrorSeverity.MEDIUM;
          userMessage = 'The requested resource was not found.';
          suggestions = [
            'Check if the URL is correct',
            'Try navigating back and trying again',
            'Contact support if you believe this is an error'
          ];
          break;
          
        case 429:
          category = ErrorCategory.CLIENT;
          severity = ErrorSeverity.MEDIUM;
          userMessage = 'Too many requests. Please wait a moment before trying again.';
          suggestions = [
            'Wait a few seconds before retrying',
            'Reduce the frequency of your requests'
          ];
          canRetry = true;
          break;
          
        case 500:
        case 502:
        case 503:
        case 504:
          category = ErrorCategory.SERVER;
          severity = ErrorSeverity.HIGH;
          userMessage = 'Server error. Our team has been notified and is working on a fix.';
          suggestions = [
            'Try again in a few minutes',
            'Check our status page for updates',
            'Contact support if the problem persists'
          ];
          canRetry = true;
          break;
          
        default:
          category = ErrorCategory.UNKNOWN;
          severity = ErrorSeverity.MEDIUM;
          userMessage = 'An unexpected error occurred. Please try again.';
          suggestions = [
            'Try refreshing the page',
            'Contact support if the problem persists'
          ];
          canRetry = true;
      }
    } else {
      // Generic JavaScript error
      category = ErrorCategory.CLIENT;
      severity = ErrorSeverity.MEDIUM;
      userMessage = 'An unexpected error occurred. Please try again.';
      suggestions = [
        'Try refreshing the page',
        'Clear your browser cache',
        'Contact support if the problem persists'
      ];
      canRetry = true;
    }

    // Add context to user message if provided
    if (context) {
      userMessage = `${context}: ${userMessage}`;
    }

    return {
      id,
      message: error.message,
      userMessage,
      category,
      severity,
      timestamp,
      originalError: error,
      suggestions,
      canRetry,
      ...(statusCode !== undefined && { statusCode })
    };
  }

  // Generate unique error ID
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Add error to history
  private addToHistory(error: ProcessedError): void {
    this.errorHistory.unshift(error);
    
    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  // Get error history
  public getErrorHistory(): ProcessedError[] {
    return [...this.errorHistory];
  }

  // Clear error history
  public clearErrorHistory(): void {
    this.errorHistory = [];
  }

  // Get errors by category
  public getErrorsByCategory(category: ErrorCategory): ProcessedError[] {
    return this.errorHistory.filter(error => error.category === category);
  }

  // Get errors by severity
  public getErrorsBySeverity(severity: ErrorSeverity): ProcessedError[] {
    return this.errorHistory.filter(error => error.severity === severity);
  }

  // Check if there are recent critical errors
  public hasRecentCriticalErrors(timeWindowMs: number = 60000): boolean {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.errorHistory.some(
      error => error.severity === ErrorSeverity.CRITICAL && error.timestamp > cutoff
    );
  }

  // Get user-friendly error message for display
  public getUserFriendlyMessage(error: Error, context?: string): string {
    const processedError = this.processError(error, context);
    return processedError.userMessage;
  }

  // Check if error is retryable
  public isRetryable(error: Error): boolean {
    const processedError = this.processError(error);
    return processedError.canRetry;
  }

  // Get suggestions for error
  public getSuggestions(error: Error): string[] {
    const processedError = this.processError(error);
    return processedError.suggestions;
  }
}

// Create and export singleton instance
export const errorService = new ErrorService();

// Export service class
export { ErrorService };