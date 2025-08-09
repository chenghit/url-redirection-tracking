import React, { createContext, useContext, type ReactNode } from 'react';
import { useLoadingManager } from '../hooks/useLoading';

// Loading context type
interface LoadingContextType {
  setLoading: (key: string, loading: boolean, timeoutMs?: number) => void;
  getLoading: (key: string) => boolean;
  clearAll: () => void;
  isAnyLoading: boolean;
  loadingStates: { [key: string]: boolean };
}

// Create context
const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

// Provider props
interface LoadingProviderProps {
  children: ReactNode;
}

// Loading provider component
export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const loadingManager = useLoadingManager();

  return (
    <LoadingContext.Provider value={loadingManager}>
      {children}
    </LoadingContext.Provider>
  );
};

// Hook to use loading context
export const useLoadingContext = (): LoadingContextType => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoadingContext must be used within a LoadingProvider');
  }
  return context;
};

// Higher-order component for automatic loading management
interface WithLoadingProps {
  loadingKey?: string;
  showOverlay?: boolean;
  overlayMessage?: string;
}

export function withLoading<P extends object>(
  Component: React.ComponentType<P>,
  defaultLoadingKey?: string
) {
  return React.forwardRef<any, P & WithLoadingProps>((props, ref) => {
    const { loadingKey = defaultLoadingKey || 'default', showOverlay = false, overlayMessage, ...componentProps } = props;
    const { getLoading } = useLoadingContext();
    
    const isLoading = getLoading(loadingKey);

    return (
      <div className="relative">
        <Component {...(componentProps as P)} ref={ref} />
        {showOverlay && isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              {overlayMessage && (
                <span className="text-gray-600">{overlayMessage}</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  });
}