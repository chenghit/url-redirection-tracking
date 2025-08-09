import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import KPICard from '../KPICard';

describe('KPICard', () => {
  const defaultProps = {
    title: 'Total Redirections',
    value: 1234,
    subtitle: 'Last 30 days',
    color: 'blue' as const
  };

  it('renders KPI card with basic props', () => {
    render(<KPICard {...defaultProps} />);
    
    expect(screen.getByText('Total Redirections')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
  });

  it('renders string values correctly', () => {
    render(
      <KPICard
        {...defaultProps}
        value="N/A"
      />
    );
    
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('formats large numbers with commas', () => {
    render(
      <KPICard
        {...defaultProps}
        value={1234567}
      />
    );
    
    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  it('renders loading state correctly', () => {
    render(
      <KPICard
        {...defaultProps}
        loading={true}
      />
    );
    
    expect(screen.getByText('Total Redirections')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading data')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('1,234')).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const TestIcon = () => <svg data-testid="test-icon"><circle /></svg>;
    
    render(
      <KPICard
        {...defaultProps}
        icon={<TestIcon />}
      />
    );
    
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('applies correct color classes for blue', () => {
    render(<KPICard {...defaultProps} color="blue" />);
    
    const valueElement = screen.getByText('1,234');
    expect(valueElement).toHaveClass('text-blue-600');
  });

  it('applies correct color classes for green', () => {
    render(<KPICard {...defaultProps} color="green" />);
    
    const valueElement = screen.getByText('1,234');
    expect(valueElement).toHaveClass('text-green-600');
  });

  it('applies correct color classes for purple', () => {
    render(<KPICard {...defaultProps} color="purple" />);
    
    const valueElement = screen.getByText('1,234');
    expect(valueElement).toHaveClass('text-purple-600');
  });

  it('applies correct color classes for red', () => {
    render(<KPICard {...defaultProps} color="red" />);
    
    const valueElement = screen.getByText('1,234');
    expect(valueElement).toHaveClass('text-red-600');
  });

  it('applies correct color classes for yellow', () => {
    render(<KPICard {...defaultProps} color="yellow" />);
    
    const valueElement = screen.getByText('1,234');
    expect(valueElement).toHaveClass('text-yellow-600');
  });

  it('has proper accessibility attributes', () => {
    render(<KPICard {...defaultProps} />);
    
    const card = screen.getByRole('region');
    expect(card).toHaveAttribute('aria-labelledby');
    expect(card).toHaveAttribute('aria-describedby');
    
    const title = screen.getByText('Total Redirections');
    expect(title.tagName).toBe('H3');
    
    const value = screen.getByText('1,234');
    expect(value).toHaveAttribute('aria-label', 'Total Redirections value: 1,234');
  });

  it('handles long titles with truncation', () => {
    render(
      <KPICard
        {...defaultProps}
        title="Very Long Title That Might Need Truncation"
      />
    );
    
    const titleElement = screen.getByText('Very Long Title That Might Need Truncation');
    expect(titleElement).toHaveClass('truncate');
  });

  it('handles long values with proper breaking', () => {
    render(
      <KPICard
        {...defaultProps}
        value="very-long-string-value-that-might-break-layout"
      />
    );
    
    const valueElement = screen.getByText('very-long-string-value-that-might-break-layout');
    expect(valueElement).toHaveClass('break-all');
  });

  it('applies hover effects', () => {
    render(<KPICard {...defaultProps} />);
    
    const card = screen.getByRole('region');
    expect(card).toHaveClass('hover:shadow-md', 'transition-shadow');
  });

  it('applies responsive design classes', () => {
    render(<KPICard {...defaultProps} />);
    
    const card = screen.getByRole('region');
    expect(card).toHaveClass('p-4', 'sm:p-6');
    
    const title = screen.getByText('Total Redirections');
    expect(title).toHaveClass('text-base', 'sm:text-lg');
    
    const value = screen.getByText('1,234');
    expect(value).toHaveClass('text-2xl', 'sm:text-3xl');
    
    const subtitle = screen.getByText('Last 30 days');
    expect(subtitle).toHaveClass('text-xs', 'sm:text-sm');
  });

  it('generates correct IDs for accessibility', () => {
    render(<KPICard {...defaultProps} />);
    
    const title = screen.getByText('Total Redirections');
    expect(title).toHaveAttribute('id', 'kpi-total-redirections');
    
    const value = screen.getByText('1,234');
    expect(value).toHaveAttribute('id', 'kpi-total-redirections-value');
    
    const subtitle = screen.getByText('Last 30 days');
    expect(subtitle).toHaveAttribute('id', 'kpi-total-redirections-subtitle');
  });

  it('handles zero values correctly', () => {
    render(
      <KPICard
        {...defaultProps}
        value={0}
      />
    );
    
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('handles negative values correctly', () => {
    render(
      <KPICard
        {...defaultProps}
        value={-123}
      />
    );
    
    expect(screen.getByText('-123')).toBeInTheDocument();
  });

  it('handles decimal values correctly', () => {
    render(
      <KPICard
        {...defaultProps}
        value={123.45}
      />
    );
    
    expect(screen.getByText('123.45')).toBeInTheDocument();
  });

  it('provides proper loading accessibility', () => {
    render(
      <KPICard
        {...defaultProps}
        loading={true}
      />
    );
    
    const subtitle = screen.getByText('Loading...');
    expect(subtitle).toHaveAttribute('aria-label', 'Loading subtitle');
  });
});