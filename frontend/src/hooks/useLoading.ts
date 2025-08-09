import { useState, useCallback, useRef } from 'react';

// Loading state interface
interface LoadingState {
  [key: string]: boolean;
}

// Hook return type
interface UseLoadingReturn {
  isLoading: (key?: string) => boolean;
  isAnyLoading: boolean;
  startLoading: (key?: string) => void;
  stopLoading: (key?: string) => void;
  toggleLoading: (key?: string) => void;
  withLoading: <T>(fn: () => Promise<T>, key?: string) => Promise<T>;
  loadingStates: LoadingState;
}

// Default loading key
const DEFAULT_KEY = 'default';

// Custom hook for managing loading states
export function useLoading(initialKey?: string): UseLoadingReturn {
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});
  const loadingTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Check if a specific key is loading
  const isLoading = useCallback((key: string = initialKey || DEFAULT_KEY): boolean => {
    return loadingStates[key] || false;
  }, [loadingStates, initialKey]);

  // Check if any loading state is active
  const isAnyLoading = Object.values(loadingStates).some(Boolean);

  // Start loading for a specific key
  const startLoading = useCallback((key: string = initialKey || DEFAULT_KEY) => {
    // Clear any existing timeout for this key
    if (loadingTimeouts.current[key]) {
      clearTimeout(loadingTimeouts.current[key]);
      delete loadingTimeouts.current[key];
    }

    setLoadingStates(prev => ({
      ...prev,
      [key]: true
    }));
  }, [initialKey]);

  // Stop loading for a specific key
  const stopLoading = useCallback((key: string = initialKey || DEFAULT_KEY) => {
    // Clear any existing timeout for this key
    if (loadingTimeouts.current[key]) {
      clearTimeout(loadingTimeouts.current[key]);
      delete loadingTimeouts.current[key];
    }

    setLoadingStates(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  }, [initialKey]);

  // Toggle loading state for a specific key
  const toggleLoading = useCallback((key: string = initialKey || DEFAULT_KEY) => {
    if (isLoading(key)) {
      stopLoading(key);
    } else {
      startLoading(key);
    }
  }, [isLoading, startLoading, stopLoading, initialKey]);

  // Wrapper function to automatically manage loading state for async operations
  const withLoading = useCallback(async <T>(
    fn: () => Promise<T>,
    key: string = initialKey || DEFAULT_KEY
  ): Promise<T> => {
    try {
      startLoading(key);
      const result = await fn();
      return result;
    } finally {
      stopLoading(key);
    }
  }, [startLoading, stopLoading, initialKey]);

  return {
    isLoading,
    isAnyLoading,
    startLoading,
    stopLoading,
    toggleLoading,
    withLoading,
    loadingStates
  };
}

// Hook for managing multiple loading states with automatic cleanup
export function useLoadingManager() {
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});
  const loadingTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Set loading state with optional timeout
  const setLoading = useCallback((key: string, loading: boolean, timeoutMs?: number) => {
    // Clear existing timeout
    if (loadingTimeouts.current[key]) {
      clearTimeout(loadingTimeouts.current[key]);
      delete loadingTimeouts.current[key];
    }

    if (loading) {
      setLoadingStates(prev => ({ ...prev, [key]: true }));
      
      // Set timeout to automatically stop loading
      if (timeoutMs) {
        loadingTimeouts.current[key] = setTimeout(() => {
          setLoadingStates(prev => {
            const newState = { ...prev };
            delete newState[key];
            return newState;
          });
          delete loadingTimeouts.current[key];
        }, timeoutMs);
      }
    } else {
      setLoadingStates(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    }
  }, []);

  // Get loading state for a key
  const getLoading = useCallback((key: string): boolean => {
    return loadingStates[key] || false;
  }, [loadingStates]);

  // Clear all loading states
  const clearAll = useCallback(() => {
    // Clear all timeouts
    Object.values(loadingTimeouts.current).forEach(timeout => clearTimeout(timeout));
    loadingTimeouts.current = {};
    
    setLoadingStates({});
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    Object.values(loadingTimeouts.current).forEach(timeout => clearTimeout(timeout));
    loadingTimeouts.current = {};
  }, []);

  return {
    setLoading,
    getLoading,
    clearAll,
    cleanup,
    loadingStates,
    isAnyLoading: Object.values(loadingStates).some(Boolean)
  };
}

// Hook for managing loading states with progress tracking
export function useProgressLoading() {
  const [progress, setProgress] = useState<{ [key: string]: number }>({});
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});

  // Start loading with progress tracking
  const startProgressLoading = useCallback((key: string, initialProgress: number = 0) => {
    setLoadingStates(prev => ({ ...prev, [key]: true }));
    setProgress(prev => ({ ...prev, [key]: initialProgress }));
  }, []);

  // Update progress for a key
  const updateProgress = useCallback((key: string, progressValue: number) => {
    const clampedProgress = Math.max(0, Math.min(100, progressValue));
    setProgress(prev => ({ ...prev, [key]: clampedProgress }));
    
    // Automatically stop loading when progress reaches 100%
    if (clampedProgress >= 100) {
      setTimeout(() => {
        setLoadingStates(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
        setProgress(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
      }, 500); // Small delay to show completion
    }
  }, []);

  // Stop progress loading
  const stopProgressLoading = useCallback((key: string) => {
    setLoadingStates(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    setProgress(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  }, []);

  // Get progress for a key
  const getProgress = useCallback((key: string): number => {
    return progress[key] || 0;
  }, [progress]);

  // Check if loading
  const isLoading = useCallback((key: string): boolean => {
    return loadingStates[key] || false;
  }, [loadingStates]);

  return {
    startProgressLoading,
    updateProgress,
    stopProgressLoading,
    getProgress,
    isLoading,
    progressStates: progress,
    loadingStates
  };
}

// Hook for debounced loading states (useful for search/filter operations)
export function useDebouncedLoading(delay: number = 300) {
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startLoading = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
    }, delay);
  }, [delay]);

  const stopLoadingImmediate = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsLoading(false);
  }, []);

  return {
    isLoading,
    startLoading,
    stopLoading,
    stopLoadingImmediate
  };
}