// Enhanced structured logging utility with correlation IDs, performance metrics, and CloudWatch integration

import { generateTrackingId } from './utils';

export interface LogContext {
  correlation_id: string;
  function_name?: string;
  request_id?: string;
  user_ip?: string;
  operation?: string;
  service?: string;
  environment?: string;
  region?: string;
  version?: string;
  resource_id?: string;
  trace_id?: string;
  span_id?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'METRIC';
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    details?: Record<string, any>;
  };
  performance?: {
    duration_ms: number;
    operation: string;
    start_time?: string;
    end_time?: string;
    resource_utilization?: {
      memory_used_mb?: number;
      cpu_percent?: number;
    };
  };
  metrics?: {
    name: string;
    value: number;
    unit: string;
    dimensions?: Record<string, string>;
    timestamp?: string;
  }[];
}

export class Logger {
  private context: LogContext;
  private startTime: number;
  private memoryUsageAtStart: number;

  constructor(context: Partial<LogContext> = {}) {
    this.startTime = Date.now();
    this.memoryUsageAtStart = this.getCurrentMemoryUsage();
    
    // Enhanced context with more observability fields
    this.context = {
      correlation_id: context.correlation_id || generateTrackingId(),
      function_name: process.env.AWS_LAMBDA_FUNCTION_NAME,
      service: process.env.SERVICE_NAME || 'url-redirection-service',
      environment: process.env.NODE_ENV || 'production',
      region: process.env.AWS_REGION || 'ap-northeast-1',
      version: process.env.SERVICE_VERSION || '1.0.0',
      resource_id: process.env.AWS_LAMBDA_FUNCTION_NAME,
      ...context
    };
  }

  /**
   * Creates a new logger instance with additional context
   */
  withContext(additionalContext: Partial<LogContext>): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext
    });
  }

  /**
   * Logs debug information
   */
  debug(message: string, additionalContext?: Record<string, any>): void {
    this.log('DEBUG', message, additionalContext);
  }

  /**
   * Logs informational messages
   */
  info(message: string, additionalContext?: Record<string, any>): void {
    this.log('INFO', message, additionalContext);
  }

  /**
   * Logs warning messages
   */
  warn(message: string, additionalContext?: Record<string, any>): void {
    this.log('WARN', message, additionalContext);
  }

  /**
   * Logs error messages
   */
  error(message: string, error?: Error, additionalContext?: Record<string, any>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
      details: (error as any).details || {}
    } : undefined;

    this.log('ERROR', message, additionalContext, errorInfo);
  }

  /**
   * Logs performance metrics
   */
  performance(operation: string, durationMs: number, additionalContext?: Record<string, any>): void {
    const currentMemoryUsage = this.getCurrentMemoryUsage();
    const memoryDelta = currentMemoryUsage - this.memoryUsageAtStart;
    
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'METRIC',
      message: `Performance metric: ${operation}`,
      context: { ...this.context, ...additionalContext },
      performance: {
        duration_ms: durationMs,
        operation,
        start_time: new Date(Date.now() - durationMs).toISOString(),
        end_time: new Date().toISOString(),
        resource_utilization: {
          memory_used_mb: Math.round(currentMemoryUsage * 100) / 100,
          cpu_percent: this.estimateCpuUsage(durationMs)
        }
      },
      metrics: [
        {
          name: `${operation}_duration`,
          value: durationMs,
          unit: 'Milliseconds',
          dimensions: {
            service: this.context.service || 'url-redirection-service',
            function: this.context.function_name || 'unknown',
            environment: this.context.environment || 'production'
          }
        },
        {
          name: `${operation}_memory`,
          value: currentMemoryUsage,
          unit: 'Megabytes',
          dimensions: {
            service: this.context.service || 'url-redirection-service',
            function: this.context.function_name || 'unknown',
            environment: this.context.environment || 'production'
          }
        }
      ]
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Logs a custom metric
   */
  metric(name: string, value: number, unit: string, dimensions?: Record<string, string>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'METRIC',
      message: `Custom metric: ${name}`,
      context: this.context,
      metrics: [
        {
          name,
          value,
          unit,
          dimensions: {
            service: this.context.service || 'url-redirection-service',
            function: this.context.function_name || 'unknown',
            environment: this.context.environment || 'production',
            ...dimensions
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Times an async operation and logs performance
   */
  async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    additionalContext?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    const startMemory = this.getCurrentMemoryUsage();
    
    try {
      this.debug(`Starting operation: ${operation}`, {
        ...additionalContext,
        start_time: new Date(startTime).toISOString(),
        initial_memory_mb: startMemory
      });
      
      const result = await fn();
      const duration = Date.now() - startTime;
      const endMemory = this.getCurrentMemoryUsage();
      
      this.performance(operation, duration, {
        ...additionalContext,
        memory_delta_mb: Math.round((endMemory - startMemory) * 100) / 100
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const endMemory = this.getCurrentMemoryUsage();
      
      this.error(`Failed operation: ${operation}`, error as Error, {
        ...additionalContext,
        duration_ms: duration,
        memory_delta_mb: Math.round((endMemory - startMemory) * 100) / 100
      });
      
      throw error;
    }
  }

  /**
   * Times a synchronous operation and logs performance
   */
  timeSyncOperation<T>(
    operation: string,
    fn: () => T,
    additionalContext?: Record<string, any>
  ): T {
    const startTime = Date.now();
    const startMemory = this.getCurrentMemoryUsage();
    
    try {
      this.debug(`Starting sync operation: ${operation}`, {
        ...additionalContext,
        start_time: new Date(startTime).toISOString(),
        initial_memory_mb: startMemory
      });
      
      const result = fn();
      const duration = Date.now() - startTime;
      const endMemory = this.getCurrentMemoryUsage();
      
      this.performance(operation, duration, {
        ...additionalContext,
        memory_delta_mb: Math.round((endMemory - startMemory) * 100) / 100
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const endMemory = this.getCurrentMemoryUsage();
      
      this.error(`Failed sync operation: ${operation}`, error as Error, {
        ...additionalContext,
        duration_ms: duration,
        memory_delta_mb: Math.round((endMemory - startMemory) * 100) / 100
      });
      
      throw error;
    }
  }

  /**
   * Gets the correlation ID for this logger instance
   */
  getCorrelationId(): string {
    return this.context.correlation_id;
  }

  /**
   * Gets all context values
   */
  getContext(): LogContext {
    return { ...this.context };
  }

  /**
   * Logs request start with correlation ID
   */
  logRequestStart(event: any, context?: any): void {
    this.info('Request started', {
      http_method: event.httpMethod,
      path: event.path,
      query_params: event.queryStringParameters,
      headers: this.sanitizeHeaders(event.headers || {}),
      request_id: context?.awsRequestId,
      remaining_time_ms: context?.getRemainingTimeInMillis?.()
    });
  }

  /**
   * Logs request end with performance metrics
   */
  logRequestEnd(statusCode: number, durationMs: number): void {
    this.info('Request completed', {
      status_code: statusCode,
      duration_ms: durationMs,
      memory_used_mb: this.getCurrentMemoryUsage(),
      success: statusCode >= 200 && statusCode < 400
    });
    
    // Log as metric for CloudWatch metrics extraction
    this.metric('request_duration', durationMs, 'Milliseconds', {
      status_code: statusCode.toString(),
      success: (statusCode >= 200 && statusCode < 400).toString()
    });
  }

  /**
   * Core logging method
   */
  private log(
    level: LogEntry['level'],
    message: string,
    additionalContext?: Record<string, any>,
    error?: LogEntry['error']
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...additionalContext },
      ...(error && { error })
    };

    // Use console.log for structured JSON logging in CloudWatch
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Gets current memory usage in MB
   */
  private getCurrentMemoryUsage(): number {
    try {
      const memoryUsage = process.memoryUsage();
      // Return RSS (Resident Set Size) in MB
      return Math.round(memoryUsage.rss / (1024 * 1024) * 100) / 100;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Estimates CPU usage based on duration
   * This is a rough approximation since Lambda doesn't expose direct CPU metrics
   */
  private estimateCpuUsage(durationMs: number): number {
    // This is a very rough approximation
    // In a real system, you might use more sophisticated methods
    const maxCpu = 100;
    const normalizedDuration = Math.min(durationMs / 1000, 1); // Cap at 1 second
    return Math.min(Math.round(normalizedDuration * maxCpu * 0.8), maxCpu);
  }

  /**
   * Sanitizes headers to remove sensitive information
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
    
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}

/**
 * Creates a logger instance from Lambda context
 */
export function createLogger(lambdaContext?: any, additionalContext?: Partial<LogContext>): Logger {
  const context: Partial<LogContext> = {
    request_id: lambdaContext?.awsRequestId,
    function_name: lambdaContext?.functionName,
    resource_id: lambdaContext?.functionName,
    trace_id: process.env._X_AMZN_TRACE_ID || lambdaContext?.clientContext?.Custom?.['x-amzn-trace-id'],
    ...additionalContext
  };

  return new Logger(context);
}

/**
 * Creates a logger with correlation ID from API Gateway event
 */
export function createLoggerFromEvent(event: any, lambdaContext?: any): Logger {
  // Extract correlation ID from headers with fallback to generated ID
  const correlationId = event.headers?.['X-Correlation-ID'] || 
                       event.headers?.['x-correlation-id'] || 
                       generateTrackingId();
  
  // Extract trace ID from AWS X-Ray
  const traceId = process.env._X_AMZN_TRACE_ID || 
                 event.headers?.['X-Amzn-Trace-Id'] || 
                 event.headers?.['x-amzn-trace-id'];
  
  // Extract request path and method
  const path = event.path || event.resource || '/';
  const method = event.httpMethod || event.requestContext?.http?.method || 'UNKNOWN';
  const operation = `${method} ${path}`;
  
  // Extract API stage if available
  const apiStage = event.requestContext?.stage;
  
  // Extract client information
  const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'];
  const referer = event.headers?.['Referer'] || event.headers?.['referer'];
  
  // Extract request ID from API Gateway
  const apiRequestId = event.requestContext?.requestId;
  
  // Create enhanced context
  return createLogger(lambdaContext, {
    correlation_id: correlationId,
    trace_id: traceId,
    span_id: apiRequestId, // Use API Gateway request ID as span ID
    user_ip: event.requestContext?.identity?.sourceIp || 
             event.requestContext?.http?.sourceIp,
    operation,
    api_stage: apiStage,
    user_agent: userAgent,
    referer: referer,
    api_request_id: apiRequestId,
    query_params: event.queryStringParameters ? 
      JSON.stringify(event.queryStringParameters) : undefined,
    path_params: event.pathParameters ? 
      JSON.stringify(event.pathParameters) : undefined,
    http_method: method
  });
}