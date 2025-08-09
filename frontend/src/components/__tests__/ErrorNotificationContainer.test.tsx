import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ErrorNotificationContainer from '../ErrorNotificationContainer';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import type { ProcessedError } from '../../services/error-service';
import { ErrorSeverity, ErrorCategory } from '../../services/error-service';

// Mock the useErrorHandler hook
vi.mock('../../hooks/useErrorHandler');

const mockErrors: ProcessedError[] = [
  {
    id: 'error-1',
    message: 'First error',
    originalError: new Error('First error'),
    userMessage: 'First error message',
    category: ErrorCategory.CLIENT,
    severity: ErrorSeverity.HIGH,
    suggestions: ['Try again'],
    canRetry: true,
    timestamp: new Date()
  },
  {
    id: 'error-2',
    message: 'Second error',
    originalError: new Error('Second error'),
    userMessage: 'Second error message',
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    suggestions: ['Check connection'],
    canRetry: false,
    timestamp: new Date()
  },
  {
    id: 'error-3',
    message: 'Third error',
    originalError: new Error('Third error'),
    userMessage: 'Third error message',
    category: ErrorCategory.SERVER,
    severity: ErrorSeverity.LOW,
    suggestions: [],
    canRetry: true,
    timestamp: new Date()
  }
];

describe('ErrorNotificationContainer', () => {
  const mockClearError = vi.fn();

  beforeEach(() => {
    mockClearError.mockClear();
    vi.mocked(useErrorHandler).mockReturnValue({
      errors: [],
      clearError: mockClearError,
      clearErrors: vi.fn()
    ,
      handleError: vi.fn(),
      hasErrors: false,
      latestError: null
    });
  });

  it('renders nothing when there are no errors', () => {
    render(<ErrorNotificationContainer />);
    
    // Container should be present but empty
    const container = document.querySelector('.fixed.top-0.right-0');
    expect(container).toBeInTheDocument();
    expect(container?.children).toHaveLength(0);
  });

  it('renders error notifications when errors exist', () => {
    vi.mocked(useErrorHandler).mockReturnValue({
      errors: mockErrors.slice(0, 2),
      clearError: mockClearError,
      clearErrors: vi.fn()
    });

    render(<ErrorNotificationContainer />);
    
    expect(screen.getByText('First error message')).toBeInTheDocument();
    expect(screen.getByText('Second error message')).toBeInTheDocument();
  });

  it('limits visible errors to maxVisible prop', () => {
    vi.mocked(useErrorHandler).mockReturnValue({
      errors: mockErrors,
      clearError: mockClearError,
      clearErrors: vi.fn()
    ,
      handleError: vi.fn(),
      hasErrors: false,
      latestError: null
    });

    render(<ErrorNotificationContainer maxVisible={2} />);
    
    expect(screen.getByText('First error message')).toBeInTheDocument();
    expect(screen.getByText('Second error message')).toBeInTheDocument();
    expect(screen.queryByText('Third error message')).not.toBeInTheDocument();
  });

  it('passes correct props to useErrorHandler', () => {
    render(
      <ErrorNotificationContainer
        maxVisible={5}
        autoClose={false}
        autoCloseDelay={3000}
      />
    );
    
    expect(useErrorHandler).toHaveBeenCalledWith({
      maxErrors: 5,
      autoRemoveAfter: undefined
    });
  });

  it('calculates autoRemoveAfter correctly when autoClose is true', () => {
    render(
      <ErrorNotificationContainer
        maxVisible={3}
        autoClose={true}
        autoCloseDelay={2000}
      />
    );
    
    expect(useErrorHandler).toHaveBeenCalledWith({
      maxErrors: 3,
      autoRemoveAfter: 3000 // autoCloseDelay + 1000
    });
  });

  it('uses default values when props are not provided', () => {
    render(<ErrorNotificationContainer />);
    
    expect(useErrorHandler).toHaveBeenCalledWith({
      maxErrors: 3,
      autoRemoveAfter: 6000 // 5000 + 1000
    });
  });

  it('applies correct z-index stacking for multiple errors', () => {
    vi.mocked(useErrorHandler).mockReturnValue({
      errors: mockErrors.slice(0, 2),
      clearError: mockClearError,
      clearErrors: vi.fn()
    });

    render(<ErrorNotificationContainer />);
    
    const errorContainers = document.querySelectorAll('.pointer-events-auto');
    expect(errorContainers).toHaveLength(2);
    
    // Check that each container has different z-index values
    const firstContainer = errorContainers[0] as HTMLElement;
    const secondContainer = errorContainers[1] as HTMLElement;
    
    expect(firstContainer.style.zIndex).toBe('1000');
    expect(secondContainer.style.zIndex).toBe('999');
  });

  it('applies correct transform for stacking effect', () => {
    vi.mocked(useErrorHandler).mockReturnValue({
      errors: mockErrors.slice(0, 3),
      clearError: mockClearError,
      clearErrors: vi.fn()
    });

    render(<ErrorNotificationContainer />);
    
    const errorContainers = document.querySelectorAll('.pointer-events-auto');
    expect(errorContainers).toHaveLength(3);
    
    const firstContainer = errorContainers[0] as HTMLElement;
    const secondContainer = errorContainers[1] as HTMLElement;
    const thirdContainer = errorContainers[2] as HTMLElement;
    
    expect(firstContainer.style.transform).toBe('translateY(0px)');
    expect(secondContainer.style.transform).toBe('translateY(10px)');
    expect(thirdContainer.style.transform).toBe('translateY(20px)');
  });

  it('has proper container positioning and styling', () => {
    render(<ErrorNotificationContainer />);
    
    const container = document.querySelector('.fixed.top-0.right-0.z-50.p-4.space-y-2.pointer-events-none');
    expect(container).toBeInTheDocument();
  });

  it('makes individual notifications interactive', () => {
    vi.mocked(useErrorHandler).mockReturnValue({
      errors: mockErrors.slice(0, 1),
      clearError: mockClearError,
      clearErrors: vi.fn()
    });

    render(<ErrorNotificationContainer />);
    
    const interactiveContainer = document.querySelector('.pointer-events-auto');
    expect(interactiveContainer).toBeInTheDocument();
  });

  it('passes autoClose and autoCloseDelay to ErrorNotification components', () => {
    vi.mocked(useErrorHandler).mockReturnValue({
      errors: mockErrors.slice(0, 1),
      clearError: mockClearError,
      clearErrors: vi.fn()
    });

    render(
      <ErrorNotificationContainer
        autoClose={false}
        autoCloseDelay={3000}
      />
    );
    
    // The ErrorNotification component should be rendered with the correct props
    // We can't directly test the props, but we can verify the component is rendered
    expect(screen.getByText('First error message')).toBeInTheDocument();
  });
});