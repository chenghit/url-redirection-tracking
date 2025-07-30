/**
 * Structured logging utility for Lambda functions
 * Provides JSON-formatted logging with correlation IDs and performance metrics
 */

import { randomUUID } from 'crypto';

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  functionName?: string;
  functionVersion?: string;
  stage?: string;
  userId?: string;
  sourceAttribution?: string;
  clientIp?: string;
  userAgent?: string;
}

export interface PerformanceMetrics {
  startTime?: number;
  endTime?: number;
  duration?: number;
  memoryUsed?: number;
  coldStart?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  context?: LogContext;
  data?: any;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: PerformanceMetrics;
}

export class StructuredLogger {
  private context: LogContext;
  private startTime: number;

  constructor(context: LogContext = {}) {
    this.context = {
      functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
      stage: process.env.STAGE || 'dev',
      ...context
    };
    this.startTime = Date.now();
  }

  /**
   * Generate a correlation ID for request tracing
   */
  static generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Create a new logger instance with additional context
   */
  withContext(additionalContext: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext
    });
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    this.log('DEBUG', message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, data?: any): void {
    const errorInfo = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error ? {
      name: 'UnknownError',
      message: String(error),
      stack: undefined
    } : undefined;

    this.log('ERROR', message, data, errorInfo);
  }

  /**
   * Log performance metrics
   */
  logPerformance(message: string, metrics: Partial<PerformanceMetrics> = {}): void {
    const currentTime = Date.now();
    const performanceMetrics: PerformanceMetrics = {
      startTime: this.startTime,
      endTime: currentTime,
      duration: currentTime - this.startTime,
      memoryUsed: process.memoryUsage().heapUsed,
      coldStart: !global.lambdaWarmStart,
      ...metrics
    };

    // Mark lambda as warm for subsequent invocations
    global.lambdaWarmStart = true;

    this.log('INFO', message, undefined, undefined, performanceMetrics);
  }

  /**
   * Log request start
   */
  logRequestStart(message: string, requestData?: any): void {
    this.info(`[REQUEST_START] ${message}`, {
      request: requestData,
      coldStart: !global.lambdaWarmStart
    });
  }

  /**
   * Log request end with performance metrics
   */
  logRequestEnd(message: string, responseData?: any): void {
    this.logPerformance(`[REQUEST_END] ${message}`, {});
    if (responseData) {
      this.debug('Response data', { response: responseData });
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogEntry['level'], 
    message: string, 
    data?: any, 
    error?: LogEntry['error'],
    performance?: PerformanceMetrics
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      ...(data && { data }),
      ...(error && { error }),
      ...(performance && { performance })
    };

    // Use console methods for CloudWatch integration
    const logOutput = JSON.stringify(logEntry);
    
    switch (level) {
      case 'DEBUG':
        console.debug(logOutput);
        break;
      case 'INFO':
        console.info(logOutput);
        break;
      case 'WARN':
        console.warn(logOutput);
        break;
      case 'ERROR':
        console.error(logOutput);
        break;
    }
  }
}

/**
 * Create a logger instance with Lambda context
 */
export function createLogger(context?: LogContext): StructuredLogger {
  return new StructuredLogger(context);
}

/**
 * Extract correlation ID from API Gateway event
 */
export function extractCorrelationId(event: any): string {
  // Try to get correlation ID from headers
  const headers = event.headers || {};
  const correlationId = 
    headers['x-correlation-id'] || 
    headers['X-Correlation-ID'] ||
    headers['correlation-id'] ||
    event.requestContext?.requestId ||
    StructuredLogger.generateCorrelationId();
  
  return correlationId;
}

/**
 * Extract request context for logging
 */
export function extractRequestContext(event: any): LogContext {
  const headers = event.headers || {};
  
  return {
    correlationId: extractCorrelationId(event),
    requestId: event.requestContext?.requestId,
    clientIp: event.requestContext?.identity?.sourceIp || headers['x-forwarded-for']?.split(',')[0]?.trim(),
    userAgent: headers['user-agent'] || headers['User-Agent'],
    sourceAttribution: event.queryStringParameters?.sa
  };
}

// Global variable to track warm starts
declare global {
  var lambdaWarmStart: boolean | undefined;
}