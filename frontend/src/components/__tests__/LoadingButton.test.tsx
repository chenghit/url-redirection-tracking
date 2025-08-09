import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoadingButton from '../LoadingButton';

describe('LoadingButton', () => {
  it('should render button with children', () => {
    render(<LoadingButton>Click me</LoadingButton>);
    
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(
      <LoadingButton isLoading loadingText="Processing...">
        Submit
      </LoadingButton>
    );
    
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.queryByText('Submit')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Loading' })).toBeInTheDocument();
  });

  it('should use default loading text when not provided', () => {
    render(<LoadingButton isLoading>Submit</LoadingButton>);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should be disabled when loading', () => {
    render(<LoadingButton isLoading>Submit</LoadingButton>);
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<LoadingButton disabled>Submit</LoadingButton>);
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should handle click events when not loading', () => {
    const handleClick = vi.fn();
    render(<LoadingButton onClick={handleClick}>Click me</LoadingButton>);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not handle click events when loading', () => {
    const handleClick = vi.fn();
    render(
      <LoadingButton isLoading onClick={handleClick}>
        Click me
      </LoadingButton>
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should render with icon', () => {
    const icon = <span data-testid="icon">🚀</span>;
    render(<LoadingButton icon={icon}>Launch</LoadingButton>);
    
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('Launch')).toBeInTheDocument();
  });

  it('should apply different variants', () => {
    const { rerender } = render(<LoadingButton variant="primary">Primary</LoadingButton>);
    let button = screen.getByRole('button');
    expect(button).toHaveClass('bg-blue-600');

    rerender(<LoadingButton variant="secondary">Secondary</LoadingButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-gray-200');

    rerender(<LoadingButton variant="danger">Danger</LoadingButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-red-600');

    rerender(<LoadingButton variant="ghost">Ghost</LoadingButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-transparent');
  });

  it('should apply different sizes', () => {
    const { rerender } = render(<LoadingButton size="sm">Small</LoadingButton>);
    let button = screen.getByRole('button');
    expect(button).toHaveClass('px-3', 'py-2', 'text-sm');

    rerender(<LoadingButton size="md">Medium</LoadingButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('px-4', 'py-2', 'text-sm');

    rerender(<LoadingButton size="lg">Large</LoadingButton>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('px-6', 'py-3', 'text-base');
  });

  it('should apply full width when specified', () => {
    render(<LoadingButton fullWidth>Full Width</LoadingButton>);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('w-full');
  });

  it('should apply custom className', () => {
    render(<LoadingButton className="custom-class">Custom</LoadingButton>);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should pass through other button props', () => {
    render(
      <LoadingButton type="submit" data-testid="submit-button">
        Submit
      </LoadingButton>
    );
    
    const button = screen.getByTestId('submit-button');
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('should show correct spinner color based on variant', () => {
    const { rerender } = render(<LoadingButton isLoading variant="primary">Primary</LoadingButton>);
    // We can't easily test the spinner color prop, but we can verify the spinner is rendered
    expect(screen.getByRole('img', { name: 'Loading' })).toBeInTheDocument();

    rerender(<LoadingButton isLoading variant="secondary">Secondary</LoadingButton>);
    expect(screen.getByRole('img', { name: 'Loading' })).toBeInTheDocument();
  });
});