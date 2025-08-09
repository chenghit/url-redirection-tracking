import { useCallback, useEffect, useState } from 'react';
import { errorService, type ProcessedError, type ErrorHandler } from '../services/error-service';

// Hook return type
interface UseErrorHandlerReturn {
  errors: ProcessedError[];
  handleError: (error: Error, context?: string) => ProcessedError;
  clearErrors: () => void;
  clearError: (errorId: string) => void;
  hasErrors: boolean;
  latestError: ProcessedError | null;
}

// Options for the hook
interface UseErrorHandlerOptions {
  maxErrors?: number;
  autoRemoveAfter?: number; // milliseconds
  onError?: ErrorHandler;
}

// Custom hook for error handling
export function useErrorHandler(options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn {
  const { maxErrors = 5, autoRemoveAfter, onError } = options;
  const [errors, setErrors] = useState<ProcessedError[]>([]);

  // Handle new errors
  const handleError = useCallback((error: Error, context?: string): ProcessedError => {
    const processedError = errorService.handleError(error, context);
    
    setErrors(prevErrors => {
      const newErrors = [processedError, ...prevErrors];
      return maxErrors ? newErrors.slice(0, maxErrors) : newErrors;
    });

    return processedError;
  }, [maxErrors]);

  // Clear all errors
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  // Clear specific error
  const clearError = useCallback((errorId: string) => {
    setErrors(prevErrors => prevErrors.filter(error => error.id !== errorId));
  }, []);

  // Set up global error handler
  useEffect(() => {
    const unsubscribe = errorService.onError((error: ProcessedError) => {
      // Call custom onError handler if provided
      if (onError) {
        onError(error);
      }
    });

    return unsubscribe;
  }, [onError]);

  // Auto-remove errors after specified time
  useEffect(() => {
    if (!autoRemoveAfter) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setErrors(prevErrors => 
        prevErrors.filter(error => 
          now - error.timestamp.getTime() < autoRemoveAfter
        )
      );
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [autoRemoveAfter]);

  const hasErrors = errors.length > 0;
  const latestError = errors.length > 0 ? errors[0] : null;

  return {
    errors,
    handleError,
    clearErrors,
    clearError,
    hasErrors,
    latestError
  };
}

// Hook for handling async operations with error handling
export function useAsyncError() {
  const { handleError } = useErrorHandler();

  const executeAsync = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    context?: string
  ): Promise<T | null> => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error as Error, context);
      return null;
    }
  }, [handleError]);

  return { executeAsync, handleError };
}