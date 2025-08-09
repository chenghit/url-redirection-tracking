import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useErrorHandler, useAsyncError } from '../useErrorHandler';
import { APIError, NetworkError } from '../../services/api-client';

// Mock the error service
vi.mock('../../services/error-service', () => ({
  errorService: {
    handleError: vi.fn((error) => ({
      id: `error_${Date.now()}`,
      message: error.message,
      userMessage: `User friendly: ${error.message}`,
      category: 'client',
      severity: 'medium',
      timestamp: new Date(),
      originalError: error,
      suggestions: ['Try again'],
      canRetry: true
    })),
    onError: vi.fn(() => vi.fn()) // Return unsubscribe function
  }
}));

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty errors', () => {
    const { result } = renderHook(() => useErrorHandler());

    expect(result.current.errors).toEqual([]);
    expect(result.current.hasErrors).toBe(false);
    expect(result.current.latestError).toBeNull();
  });

  it('should handle errors and add them to state', () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      const error = new Error('Test error');
      result.current.handleError(error);
    });

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.hasErrors).toBe(true);
    expect(result.current.latestError).toBeTruthy();
    expect(result.current.latestError?.message).toBe('Test error');
  });

  it('should handle errors with context', () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      const error = new Error('Test error');
      const processedError = result.current.handleError(error, 'Loading data');
      expect(processedError).toBeTruthy();
    });

    expect(result.current.errors).toHaveLength(1);
  });

  it('should limit number of errors based on maxErrors option', () => {
    const { result } = renderHook(() => useErrorHandler({ maxErrors: 2 }));

    act(() => {
      result.current.handleError(new Error('Error 1'));
      result.current.handleError(new Error('Error 2'));
      result.current.handleError(new Error('Error 3'));
    });

    expect(result.current.errors).toHaveLength(2);
    expect(result.current.errors[0].message).toBe('Error 3'); // Most recent first
    expect(result.current.errors[1].message).toBe('Error 2');
  });

  it('should clear all errors', () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error('Error 1'));
      result.current.handleError(new Error('Error 2'));
    });

    expect(result.current.errors).toHaveLength(2);

    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.errors).toHaveLength(0);
    expect(result.current.hasErrors).toBe(false);
  });

  it('should clear specific error by ID', () => {
    const { result } = renderHook(() => useErrorHandler());

    let errorId: string;

    act(() => {
      const processedError = result.current.handleError(new Error('Error 1'));
      errorId = processedError.id;
      result.current.handleError(new Error('Error 2'));
    });

    expect(result.current.errors).toHaveLength(2);

    act(() => {
      result.current.clearError(errorId);
    });

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].message).toBe('Error 2');
  });

  it('should call custom onError handler', () => {
    const onError = vi.fn();
    renderHook(() => useErrorHandler({ onError }));

    // The onError handler should be registered with the error service
    expect(require('../../services/error-service').errorService.onError).toHaveBeenCalledWith(onError);
  });

  it('should auto-remove errors after specified time', async () => {
    vi.useFakeTimers();
    
    const { result } = renderHook(() => useErrorHandler({ autoRemoveAfter: 1000 }));

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(result.current.errors).toHaveLength(1);

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.errors).toHaveLength(0);

    vi.useRealTimers();
  });
});

describe('useAsyncError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute async function successfully', async () => {
    const { result } = renderHook(() => useAsyncError());

    const asyncFn = vi.fn().mockResolvedValue('success');

    const response = await act(async () => {
      return await result.current.executeAsync(asyncFn);
    });

    expect(response).toBe('success');
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should handle async function errors', async () => {
    const { result } = renderHook(() => useAsyncError());

    const error = new Error('Async error');
    const asyncFn = vi.fn().mockRejectedValue(error);

    const response = await act(async () => {
      return await result.current.executeAsync(asyncFn, 'Loading data');
    });

    expect(response).toBeNull();
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should handle different error types', async () => {
    const { result } = renderHook(() => useAsyncError());

    // Test NetworkError
    const networkError = new NetworkError('Connection failed');
    const networkAsyncFn = vi.fn().mockRejectedValue(networkError);

    const networkResponse = await act(async () => {
      return await result.current.executeAsync(networkAsyncFn);
    });

    expect(networkResponse).toBeNull();

    // Test APIError
    const apiError = new APIError('Server error', 500);
    const apiAsyncFn = vi.fn().mockRejectedValue(apiError);

    const apiResponse = await act(async () => {
      return await result.current.executeAsync(apiAsyncFn);
    });

    expect(apiResponse).toBeNull();
  });
});