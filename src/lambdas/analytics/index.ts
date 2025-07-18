// Analytics Lambda function for querying and aggregating tracking data with enhanced monitoring

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { 
  AnalyticsEvent, 
  AnalyticsResult, 
  AnalyticsQuery, 
  AnalyticsQueryResult,
  AnalyticsAggregation,
  TrackingEvent,
  SuccessResponse,
  ErrorResponse
} from '../../shared/types';
import { 
  dynamoDbClient
} from '../../shared/dynamodb';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DYNAMODB_TABLE_NAME, HTTP_STATUS_CODES, ERROR_MESSAGES, MONITORING } from '../../shared/constants';
import { createLoggerFromEvent } from '../../shared/logger';
import { handleError, AppError } from '../../shared/error-handler';
import { MetricBatcher, MetricUnits } from '../../shared/metrics';

/**
 * Main Lambda handler for analytics API with enhanced monitoring
 */
export const handler = async (
  event: AnalyticsEvent,
  context: Context
): Promise<AnalyticsResult> => {
  const startTime = Date.now();
  const logger = createLoggerFromEvent(event, context);
  
  // Extract client IP from X-Forwarded-For header
  const headers = event.headers || {};
  const xForwardedFor = headers['X-Forwarded-For'] || headers['x-forwarded-for'];
  const clientIp = xForwardedFor ? xForwardedFor.split(',')[0].trim() : '0.0.0.0';
  
  logger.info('Client IP extracted:', clientIp);
  
  // Initialize metrics batcher for CloudWatch metrics
  const metricBatcher = new MetricBatcher(
    MONITORING.NAMESPACES.URL_REDIRECTION_LAMBDA,
    logger,
    MONITORING.METRIC_FLUSH_INTERVAL_MS
  );
  
  // Log request start with enhanced context
  logger.logRequestStart(event, context);
  
  try {
    const path = event.path || '';
    const httpMethod = event.httpMethod || 'GET';
    
    // Record request metric
    metricBatcher.addMetric(
      'analytics_request_count',
      1,
      MetricUnits.COUNT,
      {
        path: path.includes('/query') ? 'query' : path.includes('/aggregate') ? 'aggregate' : 'unknown',
        method: httpMethod
      }
    );

    // Route requests based on path and method
    let result: AnalyticsResult;
    if (path.includes('/analytics/query') && httpMethod === 'GET') {
      result = await logger.timeOperation('analytics_query_request', async () => {
        return await handleQueryRequest(event, logger);
      });
      
      // Record query-specific metrics
      const queryParams = event.queryStringParameters || {};
      metricBatcher.addMetric(
        'analytics_query_result_count',
        JSON.parse(result.body).data.total_count || 0,
        MetricUnits.COUNT,
        {
          has_source_filter: queryParams.source_attribution ? 'true' : 'false',
          has_date_filter: (queryParams.start_date || queryParams.end_date) ? 'true' : 'false'
        }
      );
    } else if (path.includes('/analytics/aggregate') && httpMethod === 'GET') {
      result = await logger.timeOperation('analytics_aggregate_request', async () => {
        return await handleAggregateRequest(event, logger);
      });
      
      // Record aggregation-specific metrics
      const aggregations = JSON.parse(result.body).data;
      metricBatcher.addMetric(
        'analytics_aggregation_count',
        aggregations.length || 0,
        MetricUnits.COUNT
      );
    } else {
      throw new AppError(
        'Invalid endpoint',
        'INVALID_ENDPOINT',
        HTTP_STATUS_CODES.BAD_REQUEST,
        { path, httpMethod }
      );
    }
    
    // Calculate response time
    const duration = Date.now() - startTime;
    
    // Log request completion with performance metrics
    logger.logRequestEnd(result.statusCode, duration);
    
    // Add response time header for client-side monitoring
    result.headers = {
      ...result.headers,
      'X-Response-Time': `${duration}ms`
    };
    
    // Flush metrics before returning
    await metricBatcher.flush();
    
    return result;
  } catch (error) {
    // Record error metric
    metricBatcher.addMetric(
      'analytics_error_count',
      1,
      MetricUnits.COUNT,
      {
        error_type: (error as any)?.name || 'UnknownError',
        error_code: (error as any)?.code || 'UNKNOWN_ERROR'
      }
    );
    
    const errorResponse = handleError(error, logger, 'analytics');
    
    // Log request completion with error status
    const duration = Date.now() - startTime;
    logger.logRequestEnd(errorResponse.statusCode, duration);
    
    // Add response time header for client-side monitoring
    errorResponse.headers = {
      ...errorResponse.headers,
      'X-Response-Time': `${duration}ms`
    };
    
    // Flush metrics before returning
    await metricBatcher.flush();
    
    return errorResponse;
  }
};

/**
 * Handles query requests for tracking events
 */
async function handleQueryRequest(event: AnalyticsEvent, logger: import('../../shared/logger').Logger): Promise<AnalyticsResult> {
  try {
    const query = parseQueryParameters(event.queryStringParameters || {});
    
    // Validate query parameters
    validateQueryParameters(query);
    
    logger.info('Processing analytics query request', { 
      query,
      query_validation: 'passed'
    });
    
    const result = await logger.timeOperation('queryTrackingEventsWithFilters', async () => {
      return await queryTrackingEventsWithFilters(query, logger);
    });
    
    logger.info('Analytics query completed successfully', {
      event_count: result.events.length,
      total_count: result.total_count,
      has_more: result.has_more,
      query_parameters: query
    });
    
    return createSuccessResponse(result, logger);
  } catch (error) {
    logger.error('Analytics query request failed', error as Error, {
      query_parameters: event.queryStringParameters,
      path: event.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(
      'Failed to process analytics query',
      'ANALYTICS_QUERY_ERROR',
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      { originalError: (error as Error).message }
    );
  }
}

/**
 * Handles aggregation requests for analytics data
 */
async function handleAggregateRequest(event: AnalyticsEvent, logger: import('../../shared/logger').Logger): Promise<AnalyticsResult> {
  try {
    const query = parseQueryParameters(event.queryStringParameters || {});
    
    // Validate query parameters
    validateQueryParameters(query);
    
    logger.info('Processing analytics aggregation request', { 
      query,
      query_validation: 'passed'
    });
    
    const aggregations = await logger.timeOperation('aggregateTrackingData', async () => {
      return await aggregateTrackingData(query, logger);
    });
    
    logger.info('Analytics aggregation completed successfully', {
      aggregation_count: aggregations.length,
      query_parameters: query
    });
    
    return createSuccessResponse(aggregations, logger);
  } catch (error) {
    logger.error('Analytics aggregation request failed', error as Error, {
      query_parameters: event.queryStringParameters,
      path: event.path
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(
      'Failed to process analytics aggregation',
      'ANALYTICS_AGGREGATION_ERROR',
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      { originalError: (error as Error).message }
    );
  }
}

/**
 * Parses query string parameters into AnalyticsQuery object
 */
function parseQueryParameters(params: { [key: string]: string | undefined }): AnalyticsQuery {
  return {
    start_date: params.start_date,
    end_date: params.end_date,
    source_attribution: params.source_attribution,
    destination_url: params.destination_url,
    limit: params.limit ? parseInt(params.limit, 10) : 100,
    sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
    offset: params.offset ? parseInt(params.offset, 10) : 0
  };
}

/**
 * Validates analytics query parameters
 */
function validateQueryParameters(query: AnalyticsQuery): void {
  // Validate limit
  if (query.limit !== undefined && (query.limit < 1 || query.limit > 1000)) {
    throw new AppError(
      'Limit must be between 1 and 1000',
      'INVALID_LIMIT',
      HTTP_STATUS_CODES.BAD_REQUEST,
      { provided_limit: query.limit }
    );
  }

  // Validate offset
  if (query.offset !== undefined && query.offset < 0) {
    throw new AppError(
      'Offset must be non-negative',
      'INVALID_OFFSET',
      HTTP_STATUS_CODES.BAD_REQUEST,
      { provided_offset: query.offset }
    );
  }

  // Validate sort order
  if (query.sort_order && !['asc', 'desc'].includes(query.sort_order)) {
    throw new AppError(
      'Sort order must be "asc" or "desc"',
      'INVALID_SORT_ORDER',
      HTTP_STATUS_CODES.BAD_REQUEST,
      { provided_sort_order: query.sort_order }
    );
  }

  // Validate date format
  if (query.start_date && !isValidISODate(query.start_date)) {
    throw new AppError(
      'Start date must be in ISO 8601 format',
      'INVALID_START_DATE',
      HTTP_STATUS_CODES.BAD_REQUEST,
      { provided_start_date: query.start_date }
    );
  }

  if (query.end_date && !isValidISODate(query.end_date)) {
    throw new AppError(
      'End date must be in ISO 8601 format',
      'INVALID_END_DATE',
      HTTP_STATUS_CODES.BAD_REQUEST,
      { provided_end_date: query.end_date }
    );
  }

  // Validate date range
  if (query.start_date && query.end_date) {
    const startDate = new Date(query.start_date);
    const endDate = new Date(query.end_date);
    
    if (startDate >= endDate) {
      throw new AppError(
        'Start date must be before end date',
        'INVALID_DATE_RANGE',
        HTTP_STATUS_CODES.BAD_REQUEST,
        { start_date: query.start_date, end_date: query.end_date }
      );
    }
  }

  // Validate source attribution format
  if (query.source_attribution && !/^EdgeUp\d{3}$/.test(query.source_attribution)) {
    throw new AppError(
      'Source attribution must follow EdgeUp + 3 digits format',
      'INVALID_SOURCE_ATTRIBUTION',
      HTTP_STATUS_CODES.BAD_REQUEST,
      { provided_source_attribution: query.source_attribution }
    );
  }
}

/**
 * Validates if a string is a valid ISO 8601 date
 */
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && date.toISOString() === dateString;
}

/**
 * Queries tracking events with advanced filtering and sorting
 */
async function queryTrackingEventsWithFilters(query: AnalyticsQuery, logger: import('../../shared/logger').Logger): Promise<AnalyticsQueryResult> {
  let events: TrackingEvent[] = [];
  
  // Use GSI for efficient queries when possible
  if (query.source_attribution && !query.start_date && !query.end_date) {
    // Query by source attribution using GSI1
    logger.debug('Using GSI1 for source attribution query', { source_attribution: query.source_attribution });
    events = await queryBySourceAttribution(query.source_attribution, query.limit || 100, logger);
  } else if (query.start_date && query.end_date && !query.source_attribution) {
    // Query by time range
    logger.debug('Using time range query', { start_date: query.start_date, end_date: query.end_date });
    events = await queryByTimeRange(query.start_date, query.end_date, query.limit || 100, logger);
  } else {
    // Complex query requiring scan with filters
    logger.debug('Using complex filter query', { query });
    events = await queryWithComplexFilters(query, logger);
  }

  logger.debug('Raw query results', { event_count: events.length });

  // Apply additional filtering
  events = applyAdditionalFilters(events, query);
  
  // Apply sorting
  events = applySorting(events, query.sort_order || 'desc');
  
  // Apply pagination
  const { paginatedEvents, hasMore } = applyPagination(events, query.offset || 0, query.limit || 100);
  
  return {
    events: paginatedEvents,
    total_count: events.length,
    has_more: hasMore
  };
}

/**
 * Queries tracking events by source attribution using GSI1
 */
async function queryBySourceAttribution(sourceAttribution: string, limit: number, logger: import('../../shared/logger').Logger): Promise<TrackingEvent[]> {
  try {
    const command = new QueryCommand({
      TableName: DYNAMODB_TABLE_NAME,
      IndexName: 'GSI1', // source_attribution (PK) + timestamp (SK)
      KeyConditionExpression: 'source_attribution = :sa',
      ExpressionAttributeValues: {
        ':sa': sourceAttribution
      },
      Limit: limit,
      ScanIndexForward: false // Most recent first
    });

    const result = await dynamoDbClient.send(command);
    return (result.Items || []) as TrackingEvent[];
  } catch (error) {
    logger.error('Failed to query tracking events by source attribution', error as Error, {
      source_attribution: sourceAttribution,
      limit,
      operation: 'queryBySourceAttribution'
    });
    throw new AppError(
      'Failed to query tracking events',
      'QUERY_ERROR',
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      { source_attribution: sourceAttribution, limit }
    );
  }
}

/**
 * Queries tracking events by time range using scan with filter
 */
async function queryByTimeRange(startDate: string, endDate: string, limit: number, logger: import('../../shared/logger').Logger): Promise<TrackingEvent[]> {
  try {
    const command = new ScanCommand({
      TableName: DYNAMODB_TABLE_NAME,
      FilterExpression: '#ts BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':start': startDate,
        ':end': endDate
      },
      Limit: limit
    });

    const result = await dynamoDbClient.send(command);
    return (result.Items || []) as TrackingEvent[];
  } catch (error) {
    logger.error('Failed to query tracking events by time range', error as Error, {
      start_date: startDate,
      end_date: endDate,
      limit,
      operation: 'queryByTimeRange'
    });
    throw new AppError(
      'Failed to query tracking events by time range',
      'QUERY_ERROR',
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      { start_date: startDate, end_date: endDate, limit }
    );
  }
}

/**
 * Handles complex queries that require scanning with multiple filters
 */
async function queryWithComplexFilters(query: AnalyticsQuery, logger: import('../../shared/logger').Logger): Promise<TrackingEvent[]> {
  try {
    const filterExpressions: string[] = [];
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: { [key: string]: any } = {};

    // Build filter expression for time range
    if (query.start_date && query.end_date) {
      filterExpressions.push('#ts BETWEEN :start AND :end');
      expressionAttributeNames['#ts'] = 'timestamp';
      expressionAttributeValues[':start'] = query.start_date;
      expressionAttributeValues[':end'] = query.end_date;
    } else if (query.start_date) {
      filterExpressions.push('#ts >= :start');
      expressionAttributeNames['#ts'] = 'timestamp';
      expressionAttributeValues[':start'] = query.start_date;
    } else if (query.end_date) {
      filterExpressions.push('#ts <= :end');
      expressionAttributeNames['#ts'] = 'timestamp';
      expressionAttributeValues[':end'] = query.end_date;
    }

    // Build filter expression for source attribution
    if (query.source_attribution) {
      filterExpressions.push('source_attribution = :sa');
      expressionAttributeValues[':sa'] = query.source_attribution;
    }

    // Build filter expression for destination URL
    if (query.destination_url) {
      filterExpressions.push('contains(destination_url, :dest)');
      expressionAttributeValues[':dest'] = query.destination_url;
    }

    const command = new ScanCommand({
      TableName: DYNAMODB_TABLE_NAME,
      FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      Limit: Math.min(query.limit || 100, 1000) // Cap at 1000 for performance
    });

    const result = await dynamoDbClient.send(command);
    return (result.Items || []) as TrackingEvent[];
  } catch (error) {
    logger.error('Failed to execute complex query with filters', error as Error, {
      query,
      operation: 'queryWithComplexFilters'
    });
    throw new AppError(
      'Failed to execute complex query',
      'QUERY_ERROR',
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      { query }
    );
  }
}

/**
 * Applies additional client-side filters to events
 */
function applyAdditionalFilters(events: TrackingEvent[], query: AnalyticsQuery): TrackingEvent[] {
  return events.filter(event => {
    // Additional destination URL filtering (exact match if not handled by DynamoDB)
    if (query.destination_url && !event.destination_url.includes(query.destination_url)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Applies sorting to events array
 */
function applySorting(events: TrackingEvent[], sortOrder: 'asc' | 'desc'): TrackingEvent[] {
  return events.sort((a, b) => {
    const timestampA = new Date(a.timestamp).getTime();
    const timestampB = new Date(b.timestamp).getTime();
    
    return sortOrder === 'asc' ? timestampA - timestampB : timestampB - timestampA;
  });
}

/**
 * Applies pagination to events array
 */
function applyPagination(
  events: TrackingEvent[], 
  offset: number, 
  limit: number
): { paginatedEvents: TrackingEvent[]; hasMore: boolean } {
  const startIndex = offset;
  const endIndex = startIndex + limit;
  const paginatedEvents = events.slice(startIndex, endIndex);
  const hasMore = endIndex < events.length;
  
  return { paginatedEvents, hasMore };
}

/**
 * Aggregates tracking data for analytics
 */
async function aggregateTrackingData(query: AnalyticsQuery, logger: import('../../shared/logger').Logger): Promise<AnalyticsAggregation[]> {
  // Get all relevant events
  const events = await queryTrackingEventsWithFilters({
    ...query,
    limit: 10000, // Get more data for aggregation
    offset: 0
  }, logger);

  // Group events by source attribution
  const groupedBySource = new Map<string, TrackingEvent[]>();
  
  events.events.forEach(event => {
    const source = event.source_attribution || 'unknown';
    if (!groupedBySource.has(source)) {
      groupedBySource.set(source, []);
    }
    groupedBySource.get(source)!.push(event);
  });

  // Create aggregations
  const aggregations: AnalyticsAggregation[] = [];
  
  groupedBySource.forEach((sourceEvents, source) => {
    const uniqueIps = new Set(sourceEvents.map(e => e.client_ip));
    const destinations = [...new Set(sourceEvents.map(e => e.destination_url))];
    
    aggregations.push({
      source_attribution: source,
      count: sourceEvents.length,
      unique_ips: uniqueIps.size,
      destinations: destinations
    });
  });

  // Sort aggregations by count (descending)
  return aggregations.sort((a, b) => b.count - a.count);
}

/**
 * Creates a success response with correlation ID
 */
function createSuccessResponse<T>(data: T, logger: import('../../shared/logger').Logger): AnalyticsResult {
  const response: SuccessResponse<T> = {
    data,
    timestamp: new Date().toISOString()
  };

  return {
    statusCode: HTTP_STATUS_CODES.OK,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Correlation-ID': logger.getCorrelationId()
    },
    body: JSON.stringify(response)
  };
}

/**
 * Creates an error response with correlation ID
 */
function createErrorResponse(statusCode: number, message: string, correlationId: string, errorCode?: string): AnalyticsResult {
  const response: ErrorResponse = {
    error: message,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    error_code: errorCode
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Correlation-ID': correlationId
    },
    body: JSON.stringify(response)
  };
}