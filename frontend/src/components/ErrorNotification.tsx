import { useEffect, useState } from 'react';
import { type ProcessedError, ErrorSeverity } from '../services/error-service';

interface ErrorNotificationProps {
  error: ProcessedError;
  onClose: () => void;
  autoClose?: boolean;
  autoCloseDelay?: number;
}

const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  error,
  onClose,
  autoClose = true,
  autoCloseDelay = 5000
}) => {
  const [isVisible, setIsVisible] = useState(true);

  // Auto-close functionality
  useEffect(() => {
    if (!autoClose) return;

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, autoCloseDelay);

    return () => clearTimeout(timer);
  }, [autoClose, autoCloseDelay, onClose]);

  // Get styling based on error severity
  const getSeverityStyles = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return {
          bg: 'bg-red-50 border-red-200',
          icon: '🚨',
          iconColor: 'text-red-600',
          textColor: 'text-red-800',
          buttonColor: 'text-red-600 hover:text-red-800'
        };
      case ErrorSeverity.HIGH:
        return {
          bg: 'bg-red-50 border-red-200',
          icon: '⚠️',
          iconColor: 'text-red-500',
          textColor: 'text-red-700',
          buttonColor: 'text-red-500 hover:text-red-700'
        };
      case ErrorSeverity.MEDIUM:
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          icon: '⚠️',
          iconColor: 'text-yellow-600',
          textColor: 'text-yellow-800',
          buttonColor: 'text-yellow-600 hover:text-yellow-800'
        };
      case ErrorSeverity.LOW:
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: 'ℹ️',
          iconColor: 'text-blue-600',
          textColor: 'text-blue-800',
          buttonColor: 'text-blue-600 hover:text-blue-800'
        };
      default:
        return {
          bg: 'bg-gray-50 border-gray-200',
          icon: '❓',
          iconColor: 'text-gray-600',
          textColor: 'text-gray-800',
          buttonColor: 'text-gray-600 hover:text-gray-800'
        };
    }
  };

  const styles = getSeverityStyles(error.severity);

  const handleRetry = () => {
    // This would typically trigger a retry of the failed operation
    // For now, we'll just close the notification
    onClose();
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={`
        fixed top-4 right-4 max-w-md w-full z-50 transform transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
      role="alert"
      aria-live="polite"
    >
      <div className={`rounded-lg border p-4 shadow-lg ${styles.bg}`}>
        <div className="flex items-start">
          <div className={`flex-shrink-0 ${styles.iconColor}`}>
            <span className="text-lg" role="img" aria-label="Error icon">
              {styles.icon}
            </span>
          </div>
          
          <div className="ml-3 flex-1">
            <h3 className={`text-sm font-medium ${styles.textColor}`}>
              Error Occurred
            </h3>
            <p className={`mt-1 text-sm ${styles.textColor}`}>
              {error.userMessage}
            </p>
            
            {/* Suggestions */}
            {error.suggestions.length > 0 && (
              <div className="mt-2">
                <p className={`text-xs font-medium ${styles.textColor}`}>
                  Suggestions:
                </p>
                <ul className={`mt-1 text-xs ${styles.textColor} list-disc list-inside`}>
                  {error.suggestions.slice(0, 2).map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex space-x-2">
              {error.canRetry && (
                <button
                  onClick={handleRetry}
                  className={`text-xs font-medium ${styles.buttonColor} hover:underline focus:outline-none focus:underline`}
                >
                  Try Again
                </button>
              )}
              <button
                onClick={handleClose}
                className={`text-xs font-medium ${styles.buttonColor} hover:underline focus:outline-none focus:underline`}
              >
                Dismiss
              </button>
            </div>
          </div>

          {/* Close button */}
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={handleClose}
              className={`inline-flex ${styles.buttonColor} hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-current rounded`}
              aria-label="Close notification"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar for auto-close */}
        {autoClose && (
          <div className="mt-3 w-full bg-gray-200 rounded-full h-1">
            <div
              className="bg-current h-1 rounded-full transition-all ease-linear"
              style={{
                width: '100%',
                animation: `shrink ${autoCloseDelay}ms linear forwards`,
                opacity: 0.3
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};

export default ErrorNotification;