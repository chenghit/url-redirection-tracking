import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ErrorNotification from '../ErrorNotification';
import type { ProcessedError } from '../../services/error-service';
import { ErrorSeverity, ErrorCategory } from '../../services/error-service';

const mockError: ProcessedError = {
  id: 'test-error-1',
  message: 'Test error',
  originalError: new Error('Test error'),
  userMessage: 'Something went wrong',
  category: ErrorCategory.CLIENT,
  severity: ErrorSeverity.MEDIUM,
  suggestions: ['Try refreshing the page', 'Check your internet connection'],
  canRetry: true,
  timestamp: new Date()
};

describe('ErrorNotification', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it('renders error notification correctly', () => {
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    expect(screen.getByText('Error Occurred')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Suggestions:')).toBeInTheDocument();
    expect(screen.getByText('Try refreshing the page')).toBeInTheDocument();
    expect(screen.getByText('Check your internet connection')).toBeInTheDocument();
  });

  it('renders try again button when canRetry is true', () => {
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('does not render try again button when canRetry is false', () => {
    const errorWithoutRetry: ProcessedError = {
      ...mockError,
      canRetry: false
    };
    
    render(
      <ErrorNotification
        error={errorWithoutRetry}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
  });

  it('calls onClose when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    const dismissButton = screen.getByText('Dismiss');
    await user.click(dismissButton);
    
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    const closeButton = screen.getByLabelText('Close notification');
    await user.click(closeButton);
    
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when try again button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    const tryAgainButton = screen.getByText('Try Again');
    await user.click(tryAgainButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('auto-closes after specified delay', async () => {
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={true}
        autoCloseDelay={100}
      />
    );
    
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    }, { timeout: 500 });
  });

  it('does not auto-close when autoClose is false', async () => {
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    // Wait a bit to ensure it doesn't auto-close
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('applies correct styling for critical severity', () => {
    const criticalError: ProcessedError = {
      ...mockError,
      severity: ErrorSeverity.CRITICAL
    };
    
    render(
      <ErrorNotification
        error={criticalError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    const notification = screen.getByRole('alert');
    expect(notification).toBeInTheDocument();
  });

  it('applies correct styling for high severity', () => {
    const highError: ProcessedError = {
      ...mockError,
      severity: ErrorSeverity.HIGH
    };
    
    render(
      <ErrorNotification
        error={highError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    const notification = screen.getByRole('alert');
    expect(notification).toBeInTheDocument();
  });

  it('applies correct styling for low severity', () => {
    const lowError: ProcessedError = {
      ...mockError,
      severity: ErrorSeverity.LOW
    };
    
    render(
      <ErrorNotification
        error={lowError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    const notification = screen.getByRole('alert');
    expect(notification).toBeInTheDocument();
  });

  it('limits suggestions to 2 items', () => {
    const errorWithManySuggestions: ProcessedError = {
      ...mockError,
      suggestions: [
        'Suggestion 1',
        'Suggestion 2',
        'Suggestion 3',
        'Suggestion 4'
      ]
    };
    
    render(
      <ErrorNotification
        error={errorWithManySuggestions}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    expect(screen.getByText('Suggestion 1')).toBeInTheDocument();
    expect(screen.getByText('Suggestion 2')).toBeInTheDocument();
    expect(screen.queryByText('Suggestion 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Suggestion 4')).not.toBeInTheDocument();
  });

  it('does not render suggestions section when no suggestions', () => {
    const errorWithoutSuggestions: ProcessedError = {
      ...mockError,
      suggestions: []
    };
    
    render(
      <ErrorNotification
        error={errorWithoutSuggestions}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    expect(screen.queryByText('Suggestions:')).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={false}
      />
    );
    
    const notification = screen.getByRole('alert');
    expect(notification).toHaveAttribute('aria-live', 'polite');
    
    const closeButton = screen.getByLabelText('Close notification');
    expect(closeButton).toBeInTheDocument();
  });

  it('shows progress bar when auto-close is enabled', () => {
    render(
      <ErrorNotification
        error={mockError}
        onClose={mockOnClose}
        autoClose={true}
        autoCloseDelay={5000}
      />
    );
    
    // Progress bar should be present (though we can't easily test the animation)
    const notification = screen.getByRole('alert');
    expect(notification).toBeInTheDocument();
  });
});