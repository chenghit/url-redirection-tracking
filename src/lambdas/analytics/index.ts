import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { TrackingEvent, AnalyticsQuery, QueryResponse, AggregateResponse, ErrorResponse } from '../../types';
import { createLogger, extractRequestContext, StructuredLogger } from '../../utils/logger';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || '';
const GSI1_NAME = 'GSI1-SourceAttribution'; // source_attribution + timestamp
const GSI2_NAME = 'GSI2-FormattedTimestamp'; // formatted_timestamp

/**
 * Main Lambda handler for analytics endpoints
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Initialize structured logger with request context
  const requestContext = extractRequestContext(event);
  const logger = createLogger(requestContext);
  
  logger.logRequestStart('Processing analytics request', {
    path: event.path,
    method: event.httpMethod,
    queryStringParameters: event.queryStringParameters,
    sourceIp: requestContext.clientIp,
    userAgent: requestContext.userAgent
  });

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Route to appropriate handler based on path
    // API key validation is handled by API Gateway for analytics endpoints
    if (path === '/analytics/query' && method === 'GET') {
      return await handleQuery(event, logger);
    } else if (path === '/analytics/aggregate' && method === 'GET') {
      return await handleAggregate(event, logger);
    } else if (path === '/health' && method === 'GET') {
      return await handleHealthCheck(event, logger);
    } else if (path === '/health/deep' && method === 'GET') {
      return await handleDeepHealthCheck(event, logger);
    } else {
      logger.warn('Invalid endpoint requested', { path, method });
      return createErrorResponse(404, 'Not found');
    }
  } catch (error) {
    logger.error('Analytics Lambda error', error, {
      path: event.path,
      method: event.httpMethod
    });
    return createErrorResponse(500, 'Internal server error');
  }
};

/**
 * Handle /analytics/query endpoint
 * Implements DynamoDB query operations with filtering and pagination
 */
async function handleQuery(event: APIGatewayProxyEvent, logger: StructuredLogger): Promise<APIGatewayProxyResult> {
  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const analyticsQuery: AnalyticsQuery = {
      start_date: queryParams.start_date,
      end_date: queryParams.end_date,
      source_attribution: queryParams.source_attribution,
      destination_url: queryParams.destination_url,
      limit: queryParams.limit ? parseInt(queryParams.limit) : 100,
      sort_order: (queryParams.sort_order as 'asc' | 'desc') || 'desc',
      offset: queryParams.offset ? parseInt(queryParams.offset) : 0
    };

    logger.debug('Parsed analytics query parameters', { analyticsQuery });

    // Validate limit parameter
    if (queryParams.limit) {
      const limit = parseInt(queryParams.limit);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        logger.warn('Invalid limit parameter', { limit: queryParams.limit });
        return createErrorResponse(400, 'Bad request');
      }
    }

    // Validate offset parameter
    if (queryParams.offset) {
      const offset = parseInt(queryParams.offset);
      if (isNaN(offset) || offset < 0) {
        logger.warn('Invalid offset parameter', { offset: queryParams.offset });
        return createErrorResponse(400, 'Bad request');
      }
    }

    // Validate date format if provided
    if (analyticsQuery.start_date && !isValidISODate(analyticsQuery.start_date)) {
      logger.warn('Invalid start_date format', { start_date: analyticsQuery.start_date });
      return createErrorResponse(400, 'Bad request');
    }
    if (analyticsQuery.end_date && !isValidISODate(analyticsQuery.end_date)) {
      logger.warn('Invalid end_date format', { end_date: analyticsQuery.end_date });
      return createErrorResponse(400, 'Bad request');
    }

    // Validate source attribution format if provided
    if (analyticsQuery.source_attribution && !isValidSourceAttribution(analyticsQuery.source_attribution)) {
      logger.warn('Invalid source_attribution format', { source_attribution: analyticsQuery.source_attribution });
      return createErrorResponse(400, 'Bad request');
    }

    let events: TrackingEvent[] = [];
    let totalCount = 0;

    // Choose query strategy based on available filters
    const queryStartTime = Date.now();
    if (analyticsQuery.source_attribution) {
      // Use GSI1 for source attribution queries
      logger.info('Using GSI1 for source attribution query', { source_attribution: analyticsQuery.source_attribution });
      const result = await queryBySourceAttribution(analyticsQuery, logger);
      events = result.events;
      totalCount = result.totalCount;
    } else if (analyticsQuery.start_date || analyticsQuery.end_date) {
      // Use GSI2 for time-based queries
      logger.info('Using GSI2 for time-based query', { start_date: analyticsQuery.start_date, end_date: analyticsQuery.end_date });
      const result = await queryByTimeRange(analyticsQuery, logger);
      events = result.events;
      totalCount = result.totalCount;
    } else {
      // Use scan for general queries
      logger.info('Using table scan for general query');
      const result = await scanWithFilters(analyticsQuery, logger);
      events = result.events;
      totalCount = result.totalCount;
    }
    const queryDuration = Date.now() - queryStartTime;

    // Apply additional filtering if needed
    events = applyAdditionalFilters(events, analyticsQuery);

    // Apply pagination
    const paginatedEvents = events.slice(analyticsQuery.offset || 0, (analyticsQuery.offset || 0) + (analyticsQuery.limit || 100));
    const hasMore = (analyticsQuery.offset || 0) + paginatedEvents.length < events.length;

    const response: QueryResponse = {
      data: {
        events: paginatedEvents,
        total_count: totalCount,
        has_more: hasMore
      },
      timestamp: new Date().toISOString()
    };

    logger.logRequestEnd('Query completed successfully', {
      totalEvents: totalCount,
      returnedEvents: paginatedEvents.length,
      hasMore,
      queryDuration,
      queryStrategy: analyticsQuery.source_attribution ? 'GSI1' : 
                    (analyticsQuery.start_date || analyticsQuery.end_date) ? 'GSI2' : 'SCAN'
    });

    return createSuccessResponse(response);

  } catch (error) {
    logger.error('Query handler error', error, { 
      queryParams: event.queryStringParameters 
    });
    return createErrorResponse(500, 'Internal server error');
  }
}

/**
 * Query DynamoDB using GSI1 (source_attribution + timestamp)
 */
async function queryBySourceAttribution(query: AnalyticsQuery, logger: StructuredLogger): Promise<{ events: TrackingEvent[], totalCount: number }> {
  const params: any = {
    TableName: TABLE_NAME,
    IndexName: GSI1_NAME,
    KeyConditionExpression: 'source_attribution = :sa',
    ExpressionAttributeValues: {
      ':sa': query.source_attribution
    },
    ScanIndexForward: query.sort_order === 'asc'
  };

  // Add time range filtering if provided
  if (query.start_date || query.end_date) {
    if (query.start_date && query.end_date) {
      params.KeyConditionExpression += ' AND #ts BETWEEN :start_date AND :end_date';
      params.ExpressionAttributeValues[':start_date'] = query.start_date;
      params.ExpressionAttributeValues[':end_date'] = query.end_date;
    } else if (query.start_date) {
      params.KeyConditionExpression += ' AND #ts >= :start_date';
      params.ExpressionAttributeValues[':start_date'] = query.start_date;
    } else if (query.end_date) {
      params.KeyConditionExpression += ' AND #ts <= :end_date';
      params.ExpressionAttributeValues[':end_date'] = query.end_date;
    }
    params.ExpressionAttributeNames = { '#ts': 'timestamp' };
  }

  const command = new QueryCommand(params);
  const queryStartTime = Date.now();
  const result = await docClient.send(command);
  const queryDuration = Date.now() - queryStartTime;

  logger.info('GSI1 query completed', {
    itemCount: result.Count || 0,
    scannedCount: result.ScannedCount || 0,
    duration: queryDuration,
    consumedCapacity: result.ConsumedCapacity
  });

  return {
    events: result.Items as TrackingEvent[] || [],
    totalCount: result.Count || 0
  };
}

/**
 * Query DynamoDB using GSI2 (formatted_timestamp)
 */
async function queryByTimeRange(query: AnalyticsQuery, logger: StructuredLogger): Promise<{ events: TrackingEvent[], totalCount: number }> {
  // Convert ISO dates to formatted timestamps for GSI2 query
  const startFormatted = query.start_date ? convertToFormattedTimestamp(query.start_date) : undefined;
  const endFormatted = query.end_date ? convertToFormattedTimestamp(query.end_date) : undefined;

  const params: any = {
    TableName: TABLE_NAME,
    IndexName: GSI2_NAME,
    ScanIndexForward: query.sort_order === 'asc'
  };

  if (startFormatted && endFormatted) {
    params.KeyConditionExpression = 'formatted_timestamp BETWEEN :start AND :end';
    params.ExpressionAttributeValues = {
      ':start': startFormatted,
      ':end': endFormatted
    };
  } else if (startFormatted) {
    params.KeyConditionExpression = 'formatted_timestamp >= :start';
    params.ExpressionAttributeValues = {
      ':start': startFormatted
    };
  } else if (endFormatted) {
    params.KeyConditionExpression = 'formatted_timestamp <= :end';
    params.ExpressionAttributeValues = {
      ':end': endFormatted
    };
  }

  const command = new QueryCommand(params);
  const queryStartTime = Date.now();
  const result = await docClient.send(command);
  const queryDuration = Date.now() - queryStartTime;

  logger.info('GSI2 query completed', {
    itemCount: result.Count || 0,
    scannedCount: result.ScannedCount || 0,
    duration: queryDuration,
    consumedCapacity: result.ConsumedCapacity
  });

  return {
    events: result.Items as TrackingEvent[] || [],
    totalCount: result.Count || 0
  };
}

/**
 * Scan DynamoDB with filters for general queries
 */
async function scanWithFilters(query: AnalyticsQuery, logger: StructuredLogger): Promise<{ events: TrackingEvent[], totalCount: number }> {
  const params: any = {
    TableName: TABLE_NAME
  };

  // Build filter expression
  const filterExpressions: string[] = [];
  const expressionAttributeValues: any = {};
  const expressionAttributeNames: any = {};

  if (query.destination_url) {
    filterExpressions.push('destination_url = :dest_url');
    expressionAttributeValues[':dest_url'] = query.destination_url;
  }

  if (query.start_date) {
    filterExpressions.push('#ts >= :start_date');
    expressionAttributeValues[':start_date'] = query.start_date;
    expressionAttributeNames['#ts'] = 'timestamp';
  }

  if (query.end_date) {
    filterExpressions.push('#ts <= :end_date');
    expressionAttributeValues[':end_date'] = query.end_date;
    expressionAttributeNames['#ts'] = 'timestamp';
  }

  if (filterExpressions.length > 0) {
    params.FilterExpression = filterExpressions.join(' AND ');
    params.ExpressionAttributeValues = expressionAttributeValues;
    if (Object.keys(expressionAttributeNames).length > 0) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }
  }

  const command = new ScanCommand(params);
  const scanStartTime = Date.now();
  const result = await docClient.send(command);
  const scanDuration = Date.now() - scanStartTime;

  let events = result.Items as TrackingEvent[] || [];

  logger.info('Table scan completed', {
    itemCount: result.Count || 0,
    scannedCount: result.ScannedCount || 0,
    duration: scanDuration,
    consumedCapacity: result.ConsumedCapacity
  });

  // Sort results
  events.sort((a, b) => {
    const comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return query.sort_order === 'asc' ? comparison : -comparison;
  });

  return {
    events,
    totalCount: events.length
  };
}

/**
 * Apply additional filters that couldn't be handled by DynamoDB queries
 */
function applyAdditionalFilters(events: TrackingEvent[], query: AnalyticsQuery): TrackingEvent[] {
  let filtered = events;

  if (query.destination_url) {
    filtered = filtered.filter(event => event.destination_url === query.destination_url);
  }

  return filtered;
}

/**
 * Handle /analytics/aggregate endpoint
 * Implements aggregation logic for statistics by source attribution
 */
async function handleAggregate(event: APIGatewayProxyEvent, logger: StructuredLogger): Promise<APIGatewayProxyResult> {
  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.start_date;
    const endDate = queryParams.end_date;
    const sourceAttribution = queryParams.source_attribution;

    logger.debug('Parsed aggregate query parameters', { startDate, endDate, sourceAttribution });

    // Validate date format if provided
    if (startDate && !isValidISODate(startDate)) {
      logger.warn('Invalid start_date format', { start_date: startDate });
      return createErrorResponse(400, 'Bad request');
    }
    if (endDate && !isValidISODate(endDate)) {
      logger.warn('Invalid end_date format', { end_date: endDate });
      return createErrorResponse(400, 'Bad request');
    }

    // Validate source attribution format if provided
    if (sourceAttribution && !isValidSourceAttribution(sourceAttribution)) {
      logger.warn('Invalid source_attribution format', { source_attribution: sourceAttribution });
      return createErrorResponse(400, 'Bad request');
    }

    let allEvents: TrackingEvent[] = [];

    // Query strategy based on filters
    const queryStartTime = Date.now();
    if (sourceAttribution) {
      // Use GSI1 for source attribution queries
      logger.info('Using GSI1 for source attribution aggregation', { source_attribution: sourceAttribution });
      const result = await queryBySourceAttribution({
        source_attribution: sourceAttribution,
        start_date: startDate,
        end_date: endDate
      }, logger);
      allEvents = result.events;
    } else if (startDate || endDate) {
      // Use GSI2 for time-based queries
      logger.info('Using GSI2 for time-based aggregation', { start_date: startDate, end_date: endDate });
      const result = await queryByTimeRange({
        start_date: startDate,
        end_date: endDate
      }, logger);
      allEvents = result.events;
    } else {
      // Use scan for all data
      logger.info('Using table scan for full aggregation');
      const result = await scanWithFilters({
        limit: 1000,
        sort_order: 'desc',
        offset: 0
      } as AnalyticsQuery, logger);
      allEvents = result.events;
    }
    const queryDuration = Date.now() - queryStartTime;

    // Apply additional time filtering if needed
    if (startDate || endDate) {
      allEvents = allEvents.filter(event => {
        const eventTime = new Date(event.timestamp).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).getTime() : Date.now();
        return eventTime >= start && eventTime <= end;
      });
    }

    // Group by source attribution and calculate aggregates
    const aggregationStartTime = Date.now();
    const aggregates = calculateAggregates(allEvents);
    const aggregationDuration = Date.now() - aggregationStartTime;

    const response: AggregateResponse = {
      data: aggregates,
      timestamp: new Date().toISOString()
    };

    logger.logRequestEnd('Aggregation completed successfully', {
      totalEvents: allEvents.length,
      aggregateGroups: aggregates.length,
      queryDuration,
      aggregationDuration,
      totalDuration: queryDuration + aggregationDuration
    });

    return createSuccessResponse(response);

  } catch (error) {
    logger.error('Aggregate handler error', error, { 
      queryParams: event.queryStringParameters 
    });
    return createErrorResponse(500, 'Internal server error');
  }
}

/**
 * Handle /health endpoint
 * Basic health check that returns system status
 */
async function handleHealthCheck(event: APIGatewayProxyEvent, logger: StructuredLogger): Promise<APIGatewayProxyResult> {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'url-redirection-analytics',
      version: '1.0.0',
      region: process.env.AWS_REGION || 'ap-northeast-1',
      environment: process.env.ENVIRONMENT || 'dev'
    };

    logger.info('Health check completed', { status: 'healthy' });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify(healthStatus)
    };

  } catch (error) {
    logger.error('Health check error', error);
    
    const healthStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'url-redirection-analytics',
      error: 'Health check failed'
    };

    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify(healthStatus)
    };
  }
}

/**
 * Handle /health/deep endpoint
 * Deep health check that tests DynamoDB connectivity and system resources
 */
async function handleDeepHealthCheck(event: APIGatewayProxyEvent, logger: StructuredLogger): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  const checks: any = {
    timestamp: new Date().toISOString(),
    service: 'url-redirection-analytics',
    version: '1.0.0',
    region: process.env.AWS_REGION || 'ap-northeast-1',
    environment: process.env.ENVIRONMENT || 'dev',
    checks: {}
  };

  let overallStatus = 'healthy';

  try {
    // Check DynamoDB connectivity
    logger.debug('Starting DynamoDB connectivity check');
    const dynamoCheckStart = Date.now();
    
    try {
      // Perform a simple query to test DynamoDB connectivity
      const testParams = {
        TableName: TABLE_NAME,
        Limit: 1
      };
      
      const testCommand = new ScanCommand(testParams);
      await docClient.send(testCommand);
      
      checks.checks.dynamodb = {
        status: 'healthy',
        responseTime: Date.now() - dynamoCheckStart,
        tableName: TABLE_NAME
      };
      
      logger.debug('DynamoDB connectivity check passed', { 
        responseTime: checks.checks.dynamodb.responseTime 
      });
      
    } catch (dynamoError) {
      logger.error('DynamoDB connectivity check failed', dynamoError);
      checks.checks.dynamodb = {
        status: 'unhealthy',
        responseTime: Date.now() - dynamoCheckStart,
        error: 'DynamoDB connection failed',
        tableName: TABLE_NAME
      };
      overallStatus = 'unhealthy';
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024)
    };

    // Check if memory usage is concerning (>80% of heap)
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    const memoryStatus = heapUsagePercent > 80 ? 'warning' : 'healthy';
    
    if (memoryStatus === 'warning') {
      logger.warn('High memory usage detected', { heapUsagePercent, memoryUsageMB });
    }

    checks.checks.memory = {
      status: memoryStatus,
      usage: memoryUsageMB,
      heapUsagePercent: Math.round(heapUsagePercent)
    };

    // Check environment variables
    const requiredEnvVars = ['DYNAMODB_TABLE_NAME', 'AWS_REGION'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    checks.checks.environment = {
      status: missingEnvVars.length === 0 ? 'healthy' : 'unhealthy',
      requiredVariables: requiredEnvVars,
      missingVariables: missingEnvVars
    };

    if (missingEnvVars.length > 0) {
      logger.error('Missing required environment variables', { missingEnvVars });
      overallStatus = 'unhealthy';
    }

    // Check Lambda runtime information
    checks.checks.runtime = {
      status: 'healthy',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: Math.round(process.uptime()),
      lambdaVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION || 'unknown',
      lambdaName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown'
    };

    // Overall status and response time
    checks.status = overallStatus;
    checks.responseTime = Date.now() - startTime;

    logger.info('Deep health check completed', { 
      status: overallStatus, 
      responseTime: checks.responseTime,
      checksPerformed: Object.keys(checks.checks).length
    });

    const statusCode = overallStatus === 'healthy' ? 200 : 503;

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify(checks)
    };

  } catch (error) {
    logger.error('Deep health check error', error);
    
    checks.status = 'unhealthy';
    checks.error = 'Deep health check failed';
    checks.responseTime = Date.now() - startTime;

    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify(checks)
    };
  }
}

/**
 * Calculate aggregated statistics by source attribution
 */
function calculateAggregates(events: TrackingEvent[]): Array<{
  source_attribution: string;
  count: number;
  unique_ips: number;
  destinations: string[];
}> {
  // Group events by source attribution
  const groupedEvents = new Map<string, TrackingEvent[]>();
  
  events.forEach(event => {
    const sa = event.source_attribution || 'unknown';
    if (!groupedEvents.has(sa)) {
      groupedEvents.set(sa, []);
    }
    groupedEvents.get(sa)!.push(event);
  });

  // Calculate aggregates for each source attribution
  const aggregates: Array<{
    source_attribution: string;
    count: number;
    unique_ips: number;
    destinations: string[];
  }> = [];

  groupedEvents.forEach((groupEvents, sourceAttribution) => {
    // Count total events
    const count = groupEvents.length;

    // Count unique IPs
    const uniqueIps = new Set(groupEvents.map(event => event.client_ip));
    const unique_ips = uniqueIps.size;

    // Get unique destinations
    const uniqueDestinations = new Set(groupEvents.map(event => event.destination_url));
    const destinations = Array.from(uniqueDestinations).sort();

    aggregates.push({
      source_attribution: sourceAttribution,
      count,
      unique_ips,
      destinations
    });
  });

  // Sort by count descending
  aggregates.sort((a, b) => b.count - a.count);

  return aggregates;
}

/**
 * Utility functions
 */



/**
 * Create standardized error response
 */
function createErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = { error: message };
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,OPTIONS'
    },
    body: JSON.stringify(errorResponse)
  };
}

/**
 * Create standardized success response
 */
function createSuccessResponse(data: any): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify(data)
  };
}

function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString.includes('T');
}

function isValidSourceAttribution(sa: string): boolean {
  const pattern = /^EdgeUp\d{3}$/;
  return pattern.test(sa);
}

function convertToFormattedTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  // Convert to UTC+8 timezone
  const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return utc8Date.toISOString().slice(0, 19).replace('T', ' ');
}