import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { 
  useLoading, 
  useLoadingManager, 
  useProgressLoading, 
  useDebouncedLoading 
} from '../useLoading';

describe('useLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with no loading states', () => {
    const { result } = renderHook(() => useLoading());

    expect(result.current.isLoading()).toBe(false);
    expect(result.current.isAnyLoading).toBe(false);
    expect(result.current.loadingStates).toEqual({});
  });

  it('should start and stop loading for default key', () => {
    const { result } = renderHook(() => useLoading());

    act(() => {
      result.current.startLoading();
    });

    expect(result.current.isLoading()).toBe(true);
    expect(result.current.isAnyLoading).toBe(true);

    act(() => {
      result.current.stopLoading();
    });

    expect(result.current.isLoading()).toBe(false);
    expect(result.current.isAnyLoading).toBe(false);
  });

  it('should handle multiple loading keys', () => {
    const { result } = renderHook(() => useLoading());

    act(() => {
      result.current.startLoading('key1');
      result.current.startLoading('key2');
    });

    expect(result.current.isLoading('key1')).toBe(true);
    expect(result.current.isLoading('key2')).toBe(true);
    expect(result.current.isAnyLoading).toBe(true);

    act(() => {
      result.current.stopLoading('key1');
    });

    expect(result.current.isLoading('key1')).toBe(false);
    expect(result.current.isLoading('key2')).toBe(true);
    expect(result.current.isAnyLoading).toBe(true);
  });

  it('should toggle loading state', () => {
    const { result } = renderHook(() => useLoading());

    act(() => {
      result.current.toggleLoading('test');
    });

    expect(result.current.isLoading('test')).toBe(true);

    act(() => {
      result.current.toggleLoading('test');
    });

    expect(result.current.isLoading('test')).toBe(false);
  });

  it('should handle async operations with withLoading', async () => {
    const { result } = renderHook(() => useLoading());

    const asyncFn = vi.fn().mockResolvedValue('success');

    let response: string;
    await act(async () => {
      response = await result.current.withLoading(asyncFn, 'async');
    });

    expect(response!).toBe('success');
    expect(result.current.isLoading('async')).toBe(false);
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should handle async errors with withLoading', async () => {
    const { result } = renderHook(() => useLoading());

    const error = new Error('Async error');
    const asyncFn = vi.fn().mockRejectedValue(error);

    let thrownError: Error;
    await act(async () => {
      try {
        await result.current.withLoading(asyncFn, 'async');
      } catch (e) {
        thrownError = e as Error;
      }
    });

    expect(thrownError!).toBe(error);
    expect(result.current.isLoading('async')).toBe(false);
  });

  it('should use initial key as default', () => {
    const { result } = renderHook(() => useLoading('initial'));

    act(() => {
      result.current.startLoading();
    });

    expect(result.current.isLoading('initial')).toBe(true);
    expect(result.current.isLoading()).toBe(true);
  });
});

describe('useLoadingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should manage multiple loading states', () => {
    const { result } = renderHook(() => useLoadingManager());

    act(() => {
      result.current.setLoading('key1', true);
      result.current.setLoading('key2', true);
    });

    expect(result.current.getLoading('key1')).toBe(true);
    expect(result.current.getLoading('key2')).toBe(true);
    expect(result.current.isAnyLoading).toBe(true);

    act(() => {
      result.current.setLoading('key1', false);
    });

    expect(result.current.getLoading('key1')).toBe(false);
    expect(result.current.getLoading('key2')).toBe(true);
  });

  it('should handle timeout for loading states', () => {
    const { result } = renderHook(() => useLoadingManager());

    act(() => {
      result.current.setLoading('test', true, 1000);
    });

    expect(result.current.getLoading('test')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.getLoading('test')).toBe(false);
  });

  it('should clear all loading states', () => {
    const { result } = renderHook(() => useLoadingManager());

    act(() => {
      result.current.setLoading('key1', true);
      result.current.setLoading('key2', true);
    });

    expect(result.current.isAnyLoading).toBe(true);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.isAnyLoading).toBe(false);
    expect(result.current.getLoading('key1')).toBe(false);
    expect(result.current.getLoading('key2')).toBe(false);
  });
});

describe('useProgressLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track progress loading', () => {
    const { result } = renderHook(() => useProgressLoading());

    act(() => {
      result.current.startProgressLoading('test', 25);
    });

    expect(result.current.isLoading('test')).toBe(true);
    expect(result.current.getProgress('test')).toBe(25);

    act(() => {
      result.current.updateProgress('test', 75);
    });

    expect(result.current.getProgress('test')).toBe(75);
  });

  it('should auto-complete when progress reaches 100%', () => {
    const { result } = renderHook(() => useProgressLoading());

    act(() => {
      result.current.startProgressLoading('test', 0);
      result.current.updateProgress('test', 100);
    });

    expect(result.current.getProgress('test')).toBe(100);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isLoading('test')).toBe(false);
    expect(result.current.getProgress('test')).toBe(0);
  });

  it('should clamp progress values', () => {
    const { result } = renderHook(() => useProgressLoading());

    act(() => {
      result.current.startProgressLoading('test');
      result.current.updateProgress('test', -10);
    });

    expect(result.current.getProgress('test')).toBe(0);

    act(() => {
      result.current.updateProgress('test', 150);
    });

    expect(result.current.getProgress('test')).toBe(100);
  });
});

describe('useDebouncedLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce loading state changes', () => {
    const { result } = renderHook(() => useDebouncedLoading(300));

    act(() => {
      result.current.startLoading();
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.stopLoading();
    });

    // Should still be loading immediately after stopLoading
    expect(result.current.isLoading).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should be false after debounce delay
    expect(result.current.isLoading).toBe(false);
  });

  it('should stop loading immediately when requested', () => {
    const { result } = renderHook(() => useDebouncedLoading(300));

    act(() => {
      result.current.startLoading();
      result.current.stopLoading();
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.stopLoadingImmediate();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should clear timeout on multiple stop calls', () => {
    const { result } = renderHook(() => useDebouncedLoading(300));

    act(() => {
      result.current.startLoading();
      result.current.stopLoading();
      result.current.stopLoading(); // Second call should clear previous timeout
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isLoading).toBe(false);
  });
});