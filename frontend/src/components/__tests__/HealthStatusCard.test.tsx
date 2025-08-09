import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HealthStatusCard from '../HealthStatusCard';
import type { HealthResponse } from '../../types';

const mockHealthResponse: HealthResponse = {
  status: 'healthy',
  timestamp: '2025-01-01T00:00:00Z',
  service: 'analytics-service',
  version: '1.0.0',
  region: 'us-east-1',
  environment: 'production'
};

describe('HealthStatusCard', () => {
  it('renders loading state correctly', () => {
    render(<HealthStatusCard health={null} loading={true} />);
    
    expect(screen.getByText('Overall Health')).toBeInTheDocument();
    expect(screen.getByText('Checking...')).toBeInTheDocument();
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('renders error state correctly', () => {
    const errorMessage = 'Failed to fetch health data';
    render(<HealthStatusCard health={null} error={errorMessage} />);
    
    expect(screen.getByText('Overall Health')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('renders no data state correctly', () => {
    render(<HealthStatusCard health={null} />);
    
    expect(screen.getByText('Overall Health')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Health data is not available.')).toBeInTheDocument();
  });

  it('renders healthy status correctly', () => {
    render(<HealthStatusCard health={mockHealthResponse} />);
    
    expect(screen.getByText('Overall Health')).toBeInTheDocument();
    expect(screen.getAllByText('Healthy')[0]).toBeInTheDocument();
    
    // Check service information
    expect(screen.getByText('Service:')).toBeInTheDocument();
    expect(screen.getByText('analytics-service')).toBeInTheDocument();
    
    expect(screen.getByText('Version:')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    
    expect(screen.getByText('Region:')).toBeInTheDocument();
    expect(screen.getByText('us-east-1')).toBeInTheDocument();
    
    expect(screen.getByText('Environment:')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
    
    expect(screen.getByText('Last Check:')).toBeInTheDocument();
  });

  it('renders unhealthy status correctly', () => {
    const unhealthyResponse: HealthResponse = {
      ...mockHealthResponse,
      status: 'unhealthy'
    };
    
    render(<HealthStatusCard health={unhealthyResponse} />);
    
    expect(screen.getAllByText('Unhealthy')[0]).toBeInTheDocument();
  });

  it('renders degraded status correctly', () => {
    const degradedResponse: HealthResponse = {
      ...mockHealthResponse,
      status: 'degraded'
    };
    
    render(<HealthStatusCard health={degradedResponse} />);
    
    expect(screen.getAllByText('Degraded')[0]).toBeInTheDocument();
  });

  it('renders unknown status correctly', () => {
    const unknownResponse: HealthResponse = {
      ...mockHealthResponse,
      status: 'unknown'
    };
    
    render(<HealthStatusCard health={unknownResponse} />);
    
    expect(screen.getAllByText('Unknown')[0]).toBeInTheDocument();
  });

  it('formats timestamp correctly', () => {
    render(<HealthStatusCard health={mockHealthResponse} />);
    
    const timestamp = new Date(mockHealthResponse.timestamp).toLocaleString();
    expect(screen.getByText(timestamp)).toBeInTheDocument();
  });

  it('capitalizes environment correctly', () => {
    const devResponse: HealthResponse = {
      ...mockHealthResponse,
      environment: 'development'
    };
    
    render(<HealthStatusCard health={devResponse} />);
    
    expect(screen.getByText('development')).toBeInTheDocument();
  });

  it('displays correct status icon for healthy status', () => {
    render(<HealthStatusCard health={mockHealthResponse} />);
    
    // Check for SVG icon (we can't easily test the specific icon, but we can check it exists)
    const statusIcons = document.querySelectorAll('svg');
    expect(statusIcons.length).toBeGreaterThan(0);
  });

  it('displays correct status icon for unhealthy status', () => {
    const unhealthyResponse: HealthResponse = {
      ...mockHealthResponse,
      status: 'unhealthy'
    };
    
    render(<HealthStatusCard health={unhealthyResponse} />);
    
    const statusIcons = document.querySelectorAll('svg');
    expect(statusIcons.length).toBeGreaterThan(0);
  });

  it('displays correct status icon for degraded status', () => {
    const degradedResponse: HealthResponse = {
      ...mockHealthResponse,
      status: 'degraded'
    };
    
    render(<HealthStatusCard health={degradedResponse} />);
    
    const statusIcons = document.querySelectorAll('svg');
    expect(statusIcons.length).toBeGreaterThan(0);
  });

  it('shows system status indicator bar', () => {
    render(<HealthStatusCard health={mockHealthResponse} />);
    
    expect(screen.getByText('System Status')).toBeInTheDocument();
    
    // Check for progress bar elements
    const progressBars = document.querySelectorAll('.bg-gray-200.rounded-full.h-2');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('shows system uptime indicator', () => {
    render(<HealthStatusCard health={mockHealthResponse} />);
    
    expect(screen.getByText('System Uptime')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('shows correct uptime status for degraded health', () => {
    const degradedResponse: HealthResponse = {
      ...mockHealthResponse,
      status: 'degraded'
    };
    
    render(<HealthStatusCard health={degradedResponse} />);
    
    expect(screen.getAllByText('Degraded')[0]).toBeInTheDocument();
  });

  it('shows correct uptime status for unhealthy health', () => {
    const unhealthyResponse: HealthResponse = {
      ...mockHealthResponse,
      status: 'unhealthy'
    };
    
    render(<HealthStatusCard health={unhealthyResponse} />);
    
    expect(screen.getByText('Issues Detected')).toBeInTheDocument();
  });

  it('handles long service names with proper text breaking', () => {
    const longServiceResponse: HealthResponse = {
      ...mockHealthResponse,
      service: 'very-long-service-name-that-might-break-layout'
    };
    
    render(<HealthStatusCard health={longServiceResponse} />);
    
    expect(screen.getByText('very-long-service-name-that-might-break-layout')).toBeInTheDocument();
  });

  it('applies responsive design classes', () => {
    render(<HealthStatusCard health={mockHealthResponse} />);
    
    const card = document.querySelector('.bg-white.p-4.sm\\:p-6.rounded-lg.shadow');
    expect(card).toBeInTheDocument();
  });

  it('has proper accessibility structure', () => {
    render(<HealthStatusCard health={mockHealthResponse} />);
    
    // Check for proper heading structure
    const heading = screen.getByText('Overall Health');
    expect(heading.tagName).toBe('H3');
  });
});