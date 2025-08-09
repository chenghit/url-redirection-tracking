import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingWrapper from '../LoadingWrapper';

describe('LoadingWrapper', () => {
  const mockChildren = <div data-testid="content">Test Content</div>;

  it('should render children when not loading, no error, and not empty', () => {
    render(
      <LoadingWrapper isLoading={false}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('should show loading spinner by default', () => {
    render(
      <LoadingWrapper isLoading={true}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByRole('img', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('should show custom loading message', () => {
    render(
      <LoadingWrapper isLoading={true} loadingMessage="Fetching data...">
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByText('Fetching data...')).toBeInTheDocument();
  });

  it('should show inline loading type', () => {
    render(
      <LoadingWrapper isLoading={true} loadingType="inline" loadingMessage="Loading data...">
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('should show skeleton loading type', () => {
    render(
      <LoadingWrapper isLoading={true} loadingType="skeleton">
        {mockChildren}
      </LoadingWrapper>
    );
    
    // Skeleton creates multiple divs with animate-pulse class
    const skeletonElements = document.querySelectorAll('.animate-pulse');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('should show card skeleton loading type', () => {
    render(
      <LoadingWrapper isLoading={true} loadingType="card">
        {mockChildren}
      </LoadingWrapper>
    );
    
    // Card skeleton should have animate-pulse class
    const cardSkeleton = document.querySelector('.animate-pulse');
    expect(cardSkeleton).toBeInTheDocument();
  });

  it('should show custom loading component', () => {
    const customLoading = <div data-testid="custom-loading">Custom Loading</div>;
    
    render(
      <LoadingWrapper isLoading={true} loadingComponent={customLoading}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('should show error state', () => {
    const error = new Error('Test error');
    
    render(
      <LoadingWrapper isLoading={false} error={error}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByText('Error Loading Data')).toBeInTheDocument();
    expect(screen.getByText('An error occurred while loading data.')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('should show custom error message', () => {
    const error = new Error('Test error');
    
    render(
      <LoadingWrapper 
        isLoading={false} 
        error={error} 
        errorMessage="Failed to load user data"
      >
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByText('Failed to load user data')).toBeInTheDocument();
  });

  it('should show custom error component', () => {
    const error = new Error('Test error');
    const customError = <div data-testid="custom-error">Custom Error</div>;
    
    render(
      <LoadingWrapper isLoading={false} error={error} errorComponent={customError}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByTestId('custom-error')).toBeInTheDocument();
    expect(screen.queryByText('Error Loading Data')).not.toBeInTheDocument();
  });

  it('should show retry button in error state', () => {
    const error = new Error('Test error');
    const retryButton = <button data-testid="retry-button">Retry</button>;
    
    render(
      <LoadingWrapper isLoading={false} error={error} retryButton={retryButton}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  it('should show empty state', () => {
    render(
      <LoadingWrapper isLoading={false} isEmpty={true}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByText('No Data Found')).toBeInTheDocument();
    expect(screen.getByText('No data available.')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('should show custom empty message', () => {
    render(
      <LoadingWrapper 
        isLoading={false} 
        isEmpty={true} 
        emptyMessage="No users found"
      >
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('should show custom empty component', () => {
    const customEmpty = <div data-testid="custom-empty">No Data</div>;
    
    render(
      <LoadingWrapper isLoading={false} isEmpty={true} emptyComponent={customEmpty}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
    expect(screen.queryByText('No Data Found')).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <LoadingWrapper isLoading={false} className="custom-wrapper">
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(container.firstChild).toHaveClass('custom-wrapper');
  });

  it('should prioritize loading over error and empty states', () => {
    const error = new Error('Test error');
    
    render(
      <LoadingWrapper isLoading={true} error={error} isEmpty={true}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByRole('img', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Error Loading Data')).not.toBeInTheDocument();
    expect(screen.queryByText('No Data Found')).not.toBeInTheDocument();
  });

  it('should prioritize error over empty state', () => {
    const error = new Error('Test error');
    
    render(
      <LoadingWrapper isLoading={false} error={error} isEmpty={true}>
        {mockChildren}
      </LoadingWrapper>
    );
    
    expect(screen.getByText('Error Loading Data')).toBeInTheDocument();
    expect(screen.queryByText('No Data Found')).not.toBeInTheDocument();
  });
});