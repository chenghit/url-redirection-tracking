import React, { type ReactNode } from 'react';
import { LoadingSpinner, LoadingInline, Skeleton, CardSkeleton } from './Loading';

interface LoadingWrapperProps {
  isLoading: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  loadingComponent?: ReactNode;
  errorComponent?: ReactNode;
  emptyComponent?: ReactNode;
  children: ReactNode;
  className?: string;
  loadingType?: 'spinner' | 'inline' | 'skeleton' | 'card' | 'custom';
  loadingMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
  retryButton?: ReactNode;
}

const LoadingWrapper: React.FC<LoadingWrapperProps> = ({
  isLoading,
  error,
  isEmpty = false,
  loadingComponent,
  errorComponent,
  emptyComponent,
  children,
  className = '',
  loadingType = 'spinner',
  loadingMessage = 'Loading...',
  errorMessage = 'An error occurred while loading data.',
  emptyMessage = 'No data available.',
  retryButton
}) => {
  // Render loading state
  if (isLoading) {
    if (loadingComponent) {
      return <div className={className}>{loadingComponent}</div>;
    }

    switch (loadingType) {
      case 'inline':
        return (
          <div className={`flex items-center justify-center p-8 ${className}`}>
            <LoadingInline message={loadingMessage} />
          </div>
        );
      
      case 'skeleton':
        return (
          <div className={className}>
            <Skeleton lines={3} className="mb-4" />
            <Skeleton lines={2} />
          </div>
        );
      
      case 'card':
        return (
          <div className={className}>
            <CardSkeleton />
          </div>
        );
      
      case 'custom':
        return <div className={className}>{loadingComponent}</div>;
      
      case 'spinner':
      default:
        return (
          <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
            <LoadingSpinner size="lg" className="mb-4" />
            <p className="text-gray-600 text-center">{loadingMessage}</p>
          </div>
        );
    }
  }

  // Render error state
  if (error) {
    if (errorComponent) {
      return <div className={className}>{errorComponent}</div>;
    }

    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
        <div className="text-red-500 text-4xl mb-4">⚠️</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Data</h3>
        <p className="text-gray-600 mb-4 max-w-md">{errorMessage}</p>
        {retryButton && (
          <div className="mt-4">
            {retryButton}
          </div>
        )}
      </div>
    );
  }

  // Render empty state
  if (isEmpty) {
    if (emptyComponent) {
      return <div className={className}>{emptyComponent}</div>;
    }

    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
        <div className="text-gray-400 text-4xl mb-4">📭</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Found</h3>
        <p className="text-gray-600 max-w-md">{emptyMessage}</p>
      </div>
    );
  }

  // Render children (success state)
  return <div className={className}>{children}</div>;
};

export default LoadingWrapper;