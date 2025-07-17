// Monitoring and observability implementation for analytics Lambda
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { Logger } from '../../shared/logger';
import { MetricBatcher, MetricUnits, MetricNamespaces } from '../../shared/metrics';
import { MONITORING } from '../../shared/constants';
import { createCorrelationHeaders, extractCorrelationId } from '../../shared/monitoring';

/**
 * Initializes monitoring for the analytics Lambda
 * @param logger Logger instance for structured logging
 * @returns MetricBatcher instance for recording metrics
 */
export function initializeMonitoring(logger: Logger): MetricBatcher {
  const metricBatcher = new MetricBatcher(
    MetricNamespaces.URL_REDIRECTION_LAMBDA,
    logger,
    MONITORING.METRIC_FLUSH_INTERVAL_MS
  );
  
  // Start automatic flushing of metrics
  metricBatcher.startAutoFlush();
  
  logger.debug('Monitoring initialized for analytics Lambda', {
    namespace: MetricNamespaces.URL_REDIRECTION_LAMBDA,
    flush_interval_ms: MONITORING.METRIC_FLUSH_INTERVAL_MS
  });
  
  return metricBatcher;
}

/**
 * Records analytics query metrics
 * @param metricBatcher MetricBatcher instance
 * @param queryParams Query parameters
 * @param resultCount Number of results returned
 * @param durationMs Request duration in milliseconds
 * @param statusCode HTTP status code
 * @param logger Logger instance
 */
export function recordQueryMetrics(
  metricBatcher: MetricBatcher,
  queryParams: Record<string, any>,
  resultCount: number,
  durationMs: number,
  statusCode: number,
  logger: Logger
): void {
  try {
    // Record query count
    metricBatcher.addMetric(
      'analytics_query_count',
      1,
      MetricUnits.COUNT,
      {
        has_source_filter: queryParams.source_attribution ? 'true' : 'false',
        has_date_filter: (queryParams.start_date || queryParams.end_date) ? 'true' : 'false',
        status_code: statusCode.toString(),
        success: (statusCode >= 200 && statusCode < 400).toString()
      }
    );
    
    // Record query result count
    metricBatcher.addMetric(
      'analytics_query_result_count',
      resultCount,
      MetricUnits.COUNT,
      {
        has_source_filter: queryParams.source_attribution ? 'true' : 'false',
        has_date_filter: (queryParams.start_date || queryParams.end_date) ? 'true' : 'false'
      }
    );
    
    // Record query duration
    metricBatcher.addMetric(
      'analytics_query_duration',
      durationMs,
      MetricUnits.MILLISECONDS,
      {
        has_source_filter: queryParams.source_attribution ? 'true' : 'false',
        has_date_filter: (queryParams.start_date || queryParams.end_date) ? 'true' : 'false',
        status_code: statusCode.toString()
      }
    );
    
    // Record memory usage
    const memoryUsage = process.memoryUsage();
    metricBatcher.addMetric(
      'analytics_memory_usage',
      Math.round(memoryUsage.rss / (1024 * 1024) * 100) / 100, // RSS in MB
      MetricUnits.MEGABYTES
    );
    
    logger.debug('Recorded analytics query metrics', {
      duration_ms: durationMs,
      result_count: resultCount,
      status_code: statusCode,
      query_params: queryParams
    });
  } catch (error) {
    logger.error('Failed to record analytics query metrics', error as Error, {
      duration_ms: durationMs,
      result_count: resultCount,
      status_code: statusCode
    });
  }
}

/**
 * Records analytics aggregation metrics
 * @param metricBatcher MetricBatcher instance
 * @param queryParams Query parameters
 * @param aggregationCount Number of aggregations returned
 * @param durationMs Request duration in milliseconds
 * @param statusCode HTTP status code
 * @param logger Logger instance
 */
export function recordAggregationMetrics(
  metricBatcher: MetricBatcher,
  queryParams: Record<string, any>,
  aggregationCount: number,
  durationMs: number,
  statusCode: number,
  logger: Logger
): void {
  try {
    // Record aggregation count
    metricBatcher.addMetric(
      'analytics_aggregation_count',
      1,
      MetricUnits.COUNT,
      {
        has_source_filter: queryParams.source_attribution ? 'true' : 'false',
        has_date_filter: (queryParams.start_date || queryParams.end_date) ? 'true' : 'false',
        status_code: statusCode.toString(),
        success: (statusCode >= 200 && statusCode < 400).toString()
      }
    );
    
    // Record aggregation result count
    metricBatcher.addMetric(
      'analytics_aggregation_result_count',
      aggregationCount,
      MetricUnits.COUNT
    );
    
    // Record aggregation duration
    metricBatcher.addMetric(
      'analytics_aggregation_duration',
      durationMs,
      MetricUnits.MILLISECONDS,
      {
        status_code: statusCode.toString()
      }
    );
    
    logger.debug('Recorded analytics aggregation metrics', {
      duration_ms: durationMs,
      aggregation_count: aggregationCount,
      status_code: statusCode,
      query_params: queryParams
    });
  } catch (error) {
    logger.error('Failed to record analytics aggregation metrics', error as Error, {
      duration_ms: durationMs,
      aggregation_count: aggregationCount,
      status_code: statusCode
    });
  }
}

/**
 * Records error metrics
 * @param metricBatcher MetricBatcher instance
 * @param errorType Error type
 * @param errorCode Error code
 * @param statusCode HTTP status code
 * @param logger Logger instance
 */
export function recordErrorMetrics(
  metricBatcher: MetricBatcher,
  errorType: string,
  errorCode: string,
  statusCode: number,
  logger: Logger
): void {
  try {
    metricBatcher.addMetric(
      'analytics_error_count',
      1,
      MetricUnits.COUNT,
      {
        error_type: errorType,
        error_code: errorCode,
        status_code: statusCode.toString()
      }
    );
    
    logger.debug('Recorded error metrics', {
      error_type: errorType,
      error_code: errorCode,
      status_code: statusCode
    });
  } catch (error) {
    logger.error('Failed to record error metrics', error as Error, {
      error_type: errorType,
      error_code: errorCode
    });
  }
}