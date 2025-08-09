import { http, HttpResponse } from 'msw';
import type { QueryResponse, AggregateResponse, HealthResponse, DeepHealthResponse } from '../../types';

// Mock data
const mockEvents = [
  {
    tracking_id: 'test-id-1',
    timestamp: '2024-01-01T10:00:00Z',
    source_attribution: 'email',
    destination_url: 'https://example.com',
    client_ip: '192.168.1.1',
    ttl: 1704110400,
    formatted_timestamp: '2024-01-01 10:00:00 UTC'
  },
  {
    tracking_id: 'test-id-2',
    timestamp: '2024-01-01T11:00:00Z',
    source_attribution: 'social',
    destination_url: 'https://example.org',
    client_ip: '192.168.1.2',
    ttl: 1704114000,
    formatted_timestamp: '2024-01-01 11:00:00 UTC'
  }
];

const mockAggregateStats = [
  {
    source_attribution: 'email',
    count: 10,
    unique_ips: 8,
    destinations: ['https://example.com', 'https://test.com']
  },
  {
    source_attribution: 'social',
    count: 5,
    unique_ips: 4,
    destinations: ['https://example.org']
  }
];

// Mock health data
const mockHealthResponse: HealthResponse = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  service: 'url-redirection-tracking',
  version: '1.0.0',
  region: 'us-east-1',
  environment: 'test'
};

const mockDeepHealthResponse: DeepHealthResponse = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  service: 'url-redirection-tracking',
  version: '1.0.0',
  region: 'us-east-1',
  environment: 'test',
  responseTime: 45,
  checks: {
    dynamodb: {
      status: 'healthy',
      responseTime: 45,
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
  }
};

export const handlers = [
  // Analytics query endpoint
  http.get('/analytics/query', ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    const response: QueryResponse = {
      data: {
        events: mockEvents.slice(offset, offset + limit),
        total_count: mockEvents.length,
        has_more: offset + limit < mockEvents.length
      },
      timestamp: new Date().toISOString()
    };
    
    return HttpResponse.json(response);
  }),

  // Analytics aggregate endpoint
  http.get('/analytics/aggregate', () => {
    const response: AggregateResponse = {
      data: mockAggregateStats,
      timestamp: new Date().toISOString()
    };
    
    return HttpResponse.json(response);
  }),

  // Health endpoints
  http.get('/health', () => {
    return HttpResponse.json(mockHealthResponse);
  }),

  http.get('/health/deep', () => {
    return HttpResponse.json(mockDeepHealthResponse);
  }),

  // Error simulation endpoints for testing error handling
  http.get('/analytics/query-error', () => {
    return HttpResponse.json(
      { message: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }),

  http.get('/analytics/aggregate-error', () => {
    return HttpResponse.json(
      { message: 'Bad request', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }),

  http.get('/health-error', () => {
    return HttpResponse.json(
      { message: 'Health check failed', code: 'HEALTH_ERROR' },
      { status: 500 }
    );
  }),

  http.get('/health/deep-error', () => {
    return HttpResponse.json(
      { message: 'Deep health check failed', code: 'DEEP_HEALTH_ERROR' },
      { status: 500 }
    );
  })
];