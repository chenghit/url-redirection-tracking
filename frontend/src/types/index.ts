// Type definitions for the analytics dashboard

// API Response Types
export interface TrackingEvent {
  tracking_id: string;
  timestamp: string;
  source_attribution: string;
  destination_url: string;
  client_ip: string;
  ttl: number;
  formatted_timestamp: string;
}

export interface QueryResponse {
  data: {
    events: TrackingEvent[];
    total_count: number;
    has_more: boolean;
  };
  timestamp: string;
}

export interface AggregateStats {
  source_attribution: string;
  count: number;
  unique_ips: number;
  destinations: string[];
}

export interface AggregateResponse {
  data: AggregateStats[];
  timestamp: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  region: string;
  environment: string;
}

export interface DeepHealthResponse extends HealthResponse {
  checks: {
    dynamodb: {
      status: string;
      responseTime: number;
      tableName: string;
    };
    memory: {
      status: string;
      usage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
      };
      heapUsagePercent: number;
    };
    environment: {
      status: string;
      requiredVariables: string[];
      missingVariables: string[];
    };
    runtime: {
      status: string;
      nodeVersion: string;
      platform: string;
      arch: string;
      uptime: number;
      lambdaVersion: string;
      lambdaName: string;
    };
  };
  responseTime: number;
}

// Filter Types
export interface QueryFilters {
  start_date?: string;
  end_date?: string;
  source_attribution?: string;
  destination_url?: string;
  limit?: number;
  offset?: number;
  sort_order?: 'asc' | 'desc';
}

export interface AggregateFilters {
  start_date?: string;
  end_date?: string;
  source_attribution?: string;
}

// Chart Data Types
export interface ChartData {
  labels: string[];
  datasets: Dataset[];
}

export interface Dataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
}

// Application State Types
export interface FilterState {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  sourceAttribution: string;
  destinationUrl: string;
  pagination: {
    limit: number;
    offset: number;
  };
}

export interface AnalyticsState {
  events: TrackingEvent[];
  aggregateStats: AggregateStats[];
  filters: FilterState;
  loading: boolean;
  error: string | null;
  lastUpdated: string;
}