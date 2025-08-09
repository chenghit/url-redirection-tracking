import { useErrorHandler } from '../hooks/useErrorHandler';
import ErrorNotification from './ErrorNotification';

interface ErrorNotificationContainerProps {
  maxVisible?: number;
  autoClose?: boolean;
  autoCloseDelay?: number;
}

const ErrorNotificationContainer: React.FC<ErrorNotificationContainerProps> = ({
  maxVisible = 3,
  autoClose = true,
  autoCloseDelay = 5000
}) => {
  const { errors, clearError } = useErrorHandler({
    maxErrors: maxVisible,
    ...(autoClose && { autoRemoveAfter: autoCloseDelay + 1000 })
  });

  // Show only the most recent errors up to maxVisible
  const visibleErrors = errors.slice(0, maxVisible);

  return (
    <div className="fixed top-0 right-0 z-50 p-4 space-y-2 pointer-events-none">
      {visibleErrors.map((error, index) => (
        <div
          key={error.id}
          className="pointer-events-auto"
          style={{
            transform: `translateY(${index * 10}px)`,
            zIndex: 1000 - index
          }}
        >
          <ErrorNotification
            error={error}
            onClose={() => clearError(error.id)}
            autoClose={autoClose}
            autoCloseDelay={autoCloseDelay}
          />
        </div>
      ))}
    </div>
  );
};

export default ErrorNotificationContainer;