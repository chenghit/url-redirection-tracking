// Monitoring and observability implementation for redirection Lambda
import { Logger } from '../../shared/logger';
import { MetricBatcher, MetricUnits, MetricNamespaces } from '../../shared/metrics';
import { MONITORING } from '../../shared/constants';
import { createCorrelationHeaders, extractCorrelationId } from '../../shared/monitoring';

/**
 * Initializes monitoring for the redirection Lambda
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
  
  logger.debug('Monitoring initialized for redirection Lambda', {
    namespace: MetricNamespaces.URL_REDIRECTION_LAMBDA,
    flush_interval_ms: MONITORING.METRIC_FLUSH_INTERVAL_MS
  });
  
  return metricBatcher;
}

/**
 * Records redirection metrics
 * @param metricBatcher MetricBatcher instance
 * @param sourceAttribution Source attribution parameter
 * @param destinationDomain Destination domain
 * @param durationMs Request duration in milliseconds
 * @param statusCode HTTP status code
 * @param logger Logger instance
 */
export function recordRedirectionMetrics(
  metricBatcher: MetricBatcher,
  sourceAttribution: string | undefined,
  destinationDomain: string,
  durationMs: number,
  statusCode: number,
  logger: Logger
): void {
  try {
    // Record redirection count
    metricBatcher.addMetric(
      'redirection_count',
      1,
      MetricUnits.COUNT,
      {
        has_source_attribution: sourceAttribution ? 'true' : 'false',
        destination_domain: destinationDomain,
        status_code: statusCode.toString(),
        success: (statusCode >= 200 && statusCode < 400).toString()
      }
    );
    
    // Record response time
    metricBatcher.addMetric(
      'redirection_duration',
      durationMs,
      MetricUnits.MILLISECONDS,
      {
        status_code: statusCode.toString()
      }
    );
    
    // Record memory usage
    const memoryUsage = process.memoryUsage();
    metricBatcher.addMetric(
      'redirection_memory_usage',
      Math.round(memoryUsage.rss / (1024 * 1024) * 100) / 100, // RSS in MB
      MetricUnits.MEGABYTES
    );
    
    logger.debug('Recorded redirection metrics', {
      duration_ms: durationMs,
      status_code: statusCode,
      destination_domain: destinationDomain
    });
  } catch (error) {
    logger.error('Failed to record redirection metrics', error as Error, {
      duration_ms: durationMs,
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
      'redirection_error_count',
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