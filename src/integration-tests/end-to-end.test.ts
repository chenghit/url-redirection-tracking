// End-to-end integration tests for the complete URL redirection tracking flow

import { 
  makeRedirectionRequest, 
  makeAnalyticsQueryRequest,
  makeAnalyticsAggregateRequest,
  generateUniqueSourceAttribution,
  queryTrackingEventsBySource,
  wait,
  retry
} from './setup';

describe('End-to-End Integration Tests', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(30000);
  
  describe('Complete Redirection to Analytics Flow', () => {
    // Generate unique source attributions for this test suite
    const uniqueSA = generateUniqueSourceAttribution();
    const destinations = [
      'https://aws.amazon.com/ec2/',
      'https://aws.amazon.com/s3/',
      'https://aws.amazon.com/lambda/'
    ];
    
    test('should track redirections and verify data in analytics', async () => {
      // Step 1: Make multiple redirection requests with the same source attribution
      for (const destination of destinations) {
        const response = await makeRedirectionRequest(destination, uniqueSA);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(destination);
        expect(response.headers['x-correlation-id']).toBeDefined();
      }
      
      // Step 2: Wait for asynchronous tracking to complete
      await wait(3000);
      
      // Step 3: Verify tracking data was stored in DynamoDB
      const events = await retry(async () => {
        const result = await queryTrackingEventsBySource(uniqueSA);
        if (result.length < destinations.length) {
          throw new Error(`Expected ${destinations.length} tracking events, found ${result.length}`);
        }
        return result;
      });
      
      expect(events.length).toBe(destinations.length);
      
      // Step 4: Verify data can be retrieved via analytics query API
      const queryResponse = await retry(async () => {
        const result = await makeAnalyticsQueryRequest({
          source_attribution: uniqueSA
        });
        
        if (result.data.data.events.length < destinations.length) {
          throw new Error('Not all events found in analytics query');
        }
        
        return result;
      });
      
      expect(queryResponse.status).toBe(200);
      expect(queryResponse.data.data.events.length).toBe(destinations.length);
      
      // Verify all destinations are present in the query results
      const queriedDestinations = queryResponse.data.data.events.map((event: any) => event.destination_url);
      for (const destination of destinations) {
        expect(queriedDestinations).toContain(destination);
      }
      
      // Step 5: Verify data can be retrieved via analytics aggregate API
      const aggregateResponse = await retry(async () => {
        const result = await makeAnalyticsAggregateRequest({
          source_attribution: uniqueSA
        });
        
        if (result.data.data.length === 0) {
          throw new Error('No aggregation data found');
        }
        
        return result;
      });
      
      expect(aggregateResponse.status).toBe(200);
      expect(aggregateResponse.data.data.length).toBe(1);
      expect(aggregateResponse.data.data[0].source_attribution).toBe(uniqueSA);
      expect(aggregateResponse.data.data[0].count).toBe(destinations.length);
      expect(aggregateResponse.data.data[0].destinations.length).toBe(destinations.length);
      
      // Verify all destinations are present in the aggregation results
      for (const destination of destinations) {
        expect(aggregateResponse.data.data[0].destinations).toContain(destination);
      }
    });
  });
  
  describe('Error Propagation Through System', () => {
    test('should handle and propagate validation errors correctly', async () => {
      // Test with invalid URL
      const invalidUrlResponse = await makeRedirectionRequest('invalid-url');
      expect(invalidUrlResponse.status).toBe(400);
      expect(invalidUrlResponse.data.error).toBe('Bad request');
      expect(invalidUrlResponse.data.timestamp).toBeDefined();
      expect(invalidUrlResponse.data.correlation_id).toBeDefined();
      
      // Test with disallowed domain
      const disallowedDomainResponse = await makeRedirectionRequest('https://google.com');
      expect(disallowedDomainResponse.status).toBe(400);
      expect(disallowedDomainResponse.data.error).toBe('Bad request');
      expect(disallowedDomainResponse.data.timestamp).toBeDefined();
      expect(disallowedDomainResponse.data.correlation_id).toBeDefined();
      
      // Test with invalid source attribution
      const invalidSAResponse = await makeRedirectionRequest(
        'https://aws.amazon.com/ec2/',
        'Invalid'
      );
      expect(invalidSAResponse.status).toBe(400);
      expect(invalidSAResponse.data.error).toBe('Bad request');
      expect(invalidSAResponse.data.timestamp).toBeDefined();
      expect(invalidSAResponse.data.correlation_id).toBeDefined();
    });
    
    test('should handle analytics API errors correctly', async () => {
      // Test with invalid query parameters
      const invalidQueryResponse = await makeAnalyticsQueryRequest({
        limit: -1
      });
      expect(invalidQueryResponse.status).toBe(400);
      expect(invalidQueryResponse.data.error).toBeDefined();
      expect(invalidQueryResponse.data.timestamp).toBeDefined();
      expect(invalidQueryResponse.data.correlation_id).toBeDefined();
      
      // Test with invalid date format
      const invalidDateResponse = await makeAnalyticsQueryRequest({
        start_date: 'not-a-date'
      });
      expect(invalidDateResponse.status).toBe(400);
      expect(invalidDateResponse.data.error).toBeDefined();
      expect(invalidDateResponse.data.timestamp).toBeDefined();
      expect(invalidDateResponse.data.correlation_id).toBeDefined();
    });
  });
});