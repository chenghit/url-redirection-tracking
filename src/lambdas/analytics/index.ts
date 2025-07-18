// Analytics Lambda function entry point
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { queryTrackingEvents, aggregateTrackingEvents } from '../../shared/dynamodb';
import { createLoggerFromEvent } from '../../shared/logger';
import { handleError } from '../../shared/error-handler';
import { extractClientIp } from '../../shared/utils';

/**
 * Main Lambda handler for analytics API
 * Handles both query and aggregate endpoints
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const logger = createLoggerFromEvent(event);
  
  try {
    // Log request start with enhanced context
    logger.logRequestStart(event);
    
    // Extract path and determine operation
    const path = event.path || '';
    const isAggregate = path.endsWith('/aggregate');
    const isQuery = path.endsWith('/query');
    
    logger.info('Processing analytics request', {
      path,
      isAggregate,
      isQuery
    });
    
    // Extract client IP for logging
    const clientIp = extractClientIp(
      event.headers || {},
      event.requestContext?.identity?.sourceIp || '0.0.0.0'
    );
    
    logger.info('Client IP extracted', { clientIp });
    
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    
    // Process based on endpoint
    if (isQuery) {
      // Extract query parameters
      const startDate = queryParams.start_date;
      const endDate = queryParams.end_date;
      const sourceAttribution = queryParams.source_attribution;
      const destinationUrl = queryParams.destination_url;
      const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 100;
      const sortOrder = queryParams.sort_order || 'desc';
      const offset = queryParams.offset ? parseInt(queryParams.offset, 10) : 0;
      
      logger.info('Processing query request', {
        startDate,
        endDate,
        sourceAttribution,
        destinationUrl,
        limit,
        sortOrder,
        offset
      });
      
      // For now, return mock data
      const response = {
        data: {
          events: [
            {
              tracking_id: '550e8400-e29b-41d4-a716-446655440000',
              timestamp: new Date().toISOString(),
              formatted_timestamp: new Date().toLocaleString(),
              source_attribution: 'EdgeUp001',
              client_ip: clientIp,
              destination_url: 'https://aws.amazon.com/cn/blogs/china/new-aws-waf-antiddos-managed-rules/'
            },
            {
              tracking_id: '550e8400-e29b-41d4-a716-446655440001',
              timestamp: new Date().toISOString(),
              formatted_timestamp: new Date().toLocaleString(),
              source_attribution: 'EdgeUp002',
              client_ip: clientIp,
              destination_url: 'https://aws.amazon.com/cn/blogs/china/aws-lambda-function-urls/'
            }
          ],
          total_count: 150,
          has_more: true
        },
        timestamp: new Date().toISOString()
      };
      
      // Calculate response time
      const duration = Date.now() - startTime;
      logger.logRequestEnd(200, duration);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Response-Time': `${duration}ms`
        },
        body: JSON.stringify(response)
      };
    } else if (isAggregate) {
      // Extract query parameters
      const startDate = queryParams.start_date;
      const endDate = queryParams.end_date;
      const sourceAttribution = queryParams.source_attribution;
      const destinationUrl = queryParams.destination_url;
      
      logger.info('Processing aggregate request', {
        startDate,
        endDate,
        sourceAttribution,
        destinationUrl
      });
      
      // For now, return mock data
      const response = {
        data: [
          {
            source_attribution: 'EdgeUp001',
            count: 120,
            unique_ips: 45,
            destinations: [
              'https://aws.amazon.com/cn/blogs/china/new-aws-waf-antiddos-managed-rules/',
              'https://aws.amazon.com/cn/blogs/china/aws-lambda-function-urls/'
            ]
          },
          {
            source_attribution: 'EdgeUp002',
            count: 85,
            unique_ips: 32,
            destinations: [
              'https://aws.amazon.com/cn/blogs/china/aws-lambda-function-urls/',
              'https://aws.amazon.com/cn/blogs/china/serverless-applications/'
            ]
          }
        ],
        timestamp: new Date().toISOString()
      };
      
      // Calculate response time
      const duration = Date.now() - startTime;
      logger.logRequestEnd(200, duration);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Response-Time': `${duration}ms`
        },
        body: JSON.stringify(response)
      };
    } else {
      // Invalid endpoint
      logger.warn('Invalid analytics endpoint', { path });
      
      const response = {
        error: 'Invalid analytics endpoint',
        valid_endpoints: ['/analytics/query', '/analytics/aggregate'],
        timestamp: new Date().toISOString()
      };
      
      // Calculate response time
      const duration = Date.now() - startTime;
      logger.logRequestEnd(400, duration);
      
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Response-Time': `${duration}ms`
        },
        body: JSON.stringify(response)
      };
    }
  } catch (error) {
    return handleError(error, logger, 'analytics');
  }
};