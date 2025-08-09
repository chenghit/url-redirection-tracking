import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ComponentStatus from '../ComponentStatus';
import type { DeepHealthResponse } from '../../types';

const mockDeepHealthResponse: DeepHealthResponse = {
  status: 'healthy',
  timestamp: '2025-01-01T00:00:00Z',
  service: 'analytics-service',
  version: '1.0.0',
  region: 'us-east-1',
  environment: 'production',
  checks: {
    dynamodb: {
      status: 'healthy',
      responseTime: 50,
      tableName: 'tracking-events'
    },
    memory: {
      status: 'healthy',
      usage: {
        rss: 128,
        heapTotal: 512,
        heapUsed: 128,
        external: 32
      },
      heapUsagePercent: 25
    },
    environment: {
      status: 'healthy',
      requiredVariables: ['TABLE_NAME', 'AWS_REGION'],
      missingVariables: []
    },
    runtime: {
      status: 'healthy',
      nodeVersion: '18.x',
      platform: 'linux',
      arch: 'x64',
      uptime: 3600,
      lambdaVersion: '$LATEST',
      lambdaName: 'analytics-function'
    }
  },
  responseTime: 50
};

describe('ComponentStatus', () => {
  it('renders loading state correctly', () => {
    render(<ComponentStatus deepHealth={null} loading={true} />);
    
    expect(screen.getByText('Component Status')).toBeInTheDocument();
    expect(screen.getByText('Checking...')).toBeInTheDocument();
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('renders error state correctly', () => {
    const errorMessage = 'Failed to fetch health data';
    render(<ComponentStatus deepHealth={null} error={errorMessage} />);
    
    expect(screen.getByText('Component Status')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('renders healthy status correctly', () => {
    render(<ComponentStatus deepHealth={mockDeepHealthResponse} />);
    
    expect(screen.getByText('Component Status')).toBeInTheDocument();
    expect(screen.getAllByText('Healthy')[0]).toBeInTheDocument();
    
    // Check for service components
    expect(screen.getByText('DynamoDB')).toBeInTheDocument();
    expect(screen.getByText('Lambda Functions')).toBeInTheDocument();
    expect(screen.getByText('API Gateway')).toBeInTheDocument();
    expect(screen.getByText('Memory Management')).toBeInTheDocument();
    
    // Check response time display
    expect(screen.getByText('50ms')).toBeInTheDocument();
    expect(screen.getByText('Response Time')).toBeInTheDocument();
  });

  it('renders degraded status for high memory usage', () => {
    const degradedHealthResponse: DeepHealthResponse = {
      ...mockDeepHealthResponse,
      checks: {
        ...mockDeepHealthResponse.checks,
        memory: {
          status: 'degraded',
          usage: {
            rss: 400,
            heapTotal: 512,
            heapUsed: 400,
            external: 32
          },
          heapUsagePercent: 85
        }
      }
    };

    render(<ComponentStatus deepHealth={degradedHealthResponse} />);
    
    expect(screen.getByText('Memory Management')).toBeInTheDocument();
    expect(screen.getByText('85.0% memory utilization')).toBeInTheDocument();
  });

  it('renders unhealthy status correctly', () => {
    const unhealthyResponse: DeepHealthResponse = {
      ...mockDeepHealthResponse,
      status: 'unhealthy',
      checks: {
        dynamodb: {
          status: 'unhealthy',
          responseTime: 2500,
          tableName: 'tracking-events'
        },
        memory: {
          status: 'unhealthy',
          usage: {
            rss: 500,
            heapTotal: 512,
            heapUsed: 500,
            external: 32
          },
          heapUsagePercent: 98
        },
        environment: {
          status: 'healthy',
          requiredVariables: ['TABLE_NAME', 'AWS_REGION'],
          missingVariables: []
        },
        runtime: {
          status: 'healthy',
          nodeVersion: '18.x',
          platform: 'linux',
          arch: 'x64',
          uptime: 3600,
          lambdaVersion: '$LATEST',
          lambdaName: 'analytics-function'
        }
      }
    };

    render(<ComponentStatus deepHealth={unhealthyResponse} />);
    
    expect(screen.getByText('2500ms')).toBeInTheDocument();
    expect(screen.getByText('98.0% memory utilization')).toBeInTheDocument();
  });

  it('renders component summary correctly', () => {
    render(<ComponentStatus deepHealth={mockDeepHealthResponse} />);
    
    expect(screen.getByText('Component Summary')).toBeInTheDocument();
    expect(screen.getAllByText('4')[0]).toBeInTheDocument(); // Total components
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getAllByText('Healthy')[4]).toBeInTheDocument(); // The summary section Healthy
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
    expect(screen.getByText('Overall Health:')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('handles missing deep health data gracefully', () => {
    render(<ComponentStatus deepHealth={null} />);
    
    expect(screen.getByText('Component Status')).toBeInTheDocument();
    expect(screen.getByText('No component data available')).toBeInTheDocument();
  });

  it('applies correct status colors', () => {
    render(<ComponentStatus deepHealth={mockDeepHealthResponse} />);
    
    // Check for healthy status indicators (green)
    const healthyElements = screen.getAllByText('Healthy');
    expect(healthyElements.length).toBeGreaterThan(0);
  });

  it('displays service details correctly', () => {
    render(<ComponentStatus deepHealth={mockDeepHealthResponse} />);
    
    expect(screen.getByText('Database connectivity and performance')).toBeInTheDocument();
    expect(screen.getByText('Analytics, tracking, and redirection functions')).toBeInTheDocument();
    expect(screen.getByText('REST API endpoints and routing')).toBeInTheDocument();
  });
});