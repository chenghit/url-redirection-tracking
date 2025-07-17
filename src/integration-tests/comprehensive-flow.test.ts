// Comprehensive integration tests for URL redirection tracking system
// This file covers additional test scenarios to ensure complete coverage

import { 
  makeRedirectionRequest, 
  makeAnalyticsQueryRequest,
  makeAnalyticsAggregateRequest,
  generateUniqueSourceAttribution,
  queryTrackingEventsBySource,
  wait,
  retry,
  TEST_CONFIG
} from './setup';
import axios from 'axios';

describe('Comprehensive Integration Tests', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(60000);
  
  describe('Complete Redirection Flow with Verification', () => {
    // Generate unique source attribution for this test suite
    const uniqueSA = generateUniqueSourceAttribution();
    const destination = 'https://aws.amazon.com/ec2/';
    
    test('should complete full redirection flow with data verification', async () => {
      // Step 1: Make redirection request
      const response = await makeRedirectionRequest(destination, uniqueSA);
      
      // Verify redirection response
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(destination);
      expect(response.headers['x-correlation-id']).toBeDefined();
      
      // Extract correlation ID for tracking
      const correlationId = response.headers['x-correlation-id'];
      
      // Step 2: Wait for asynchronous tracking to complete
      await wait(3000);
      
      // Step 3: Verify tracking data was stored in DynamoDB
      const events = await retry(async () => {
        const result = await queryTrackingEventsBySource(uniqueSA);
        if (result.length === 0) {
          throw new Error('Tracking event not found');
        }
        return result;
      });
      
      // Verify tracking data contains all required fields
      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.tracking_id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.formatted_timestamp).toBeDefined();
      expect(event.source_attribution).toBe(uniqueSA);
      expect(event.destination_url).toBe(destination);
      expect(event.client_ip).toBeDefined();
      
      // Step 4: Verify data can be retrieved via analytics query API
      const queryResponse = await retry(async () => {
        const result = await makeAnalyticsQueryRequest({
          source_attribution: uniqueSA
        });
        
        if (result.data.data.events.length === 0) {
          throw new Error('No events found in analytics query');
        }
        
        return result;
      });
      
      expect(queryResponse.status).toBe(200);
      expect(queryResponse.data.data.events.length).toBeGreaterThan(0);
      
      // Find our event in the query results
      const queriedEvent = queryResponse.data.data.events.find(
        (e: any) => e.source_attribution === uniqueSA && e.destination_url === destination
      );
      expect(queriedEvent).toBeDefined();
      
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
      expect(aggregateResponse.data.data.length).toBeGreaterThan(0);
      
      // Find our source attribution in the aggregation results
      const aggregation = aggregateResponse.data.data.find(
        (agg: any) => agg.source_attribution === uniqueSA
      );
      expect(aggregation).toBeDefined();
      expect(aggregation.destinations).toContain(destination);
    });
  });
  
  describe('API Gateway Integration Tests', () => {
    test('should handle API Gateway proxy integration correctly', async () => {
      // Test with additional path parameters
      const response = await axios.get(
        `${TEST_CONFIG.apiEndpoint}/url/additional/path?url=https://aws.amazon.com/ec2/`,
        { validateStatus: () => true }
      );
      
      // Should either handle it or return a structured error
      if (response.status === 302) {
        expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
      } else {
        expect([400, 404]).toContain(response.status);
        expect(response.data.error).toBeDefined();
      }
    });
    
    test('should handle binary responses correctly', async () => {
      // Test with Accept header requesting binary response
      const response = await axios.get(
        `${TEST_CONFIG.apiEndpoint}/url?url=https://aws.amazon.com/ec2/`,
        {
          headers: {
            'Accept': 'application/octet-stream'
          },
          validateStatus: () => true
        }
      );
      
      // Should still redirect properly regardless of Accept header
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
    });
    
    test('should handle API Gateway stage variables if configured', async () => {
      // Make a request that might use stage variables in the backend
      const response = await makeRedirectionRequest('https://aws.amazon.com/ec2/');
      
      // Basic verification that the API works
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
    });
  });
  
  describe('DynamoDB Data Persistence and Retrieval', () => {
    // Generate unique source attribution for this test suite
    const uniqueSA = generateUniqueSourceAttribution();
    
    test('should persist and retrieve data with all required fields', async () => {
      // Step 1: Make redirection request
      const destination = 'https://aws.amazon.com/dynamodb/';
      const response = await makeRedirectionRequest(destination, uniqueSA);
      
      expect(response.status).toBe(302);
      
      // Step 2: Wait for asynchronous tracking to complete
      await wait(3000);
      
      // Step 3: Verify tracking data was stored with all required fields
      const events = await retry(async () => {
        const result = await queryTrackingEventsBySource(uniqueSA);
        if (result.length === 0) {
          throw new Error('Tracking event not found');
        }
        return result;
      });
      
      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      
      // Verify all required fields are present
      expect(event.tracking_id).toBeDefined();
      expect(typeof event.tracking_id).toBe('string');
      expect(event.tracking_id.length).toBeGreaterThan(0);
      
      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe('string');
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      
      expect(event.formatted_timestamp).toBeDefined();
      expect(typeof event.formatted_timestamp).toBe('string');
      expect(event.formatted_timestamp.length).toBeGreaterThan(0);
      
      expect(event.source_attribution).toBe(uniqueSA);
      expect(event.destination_url).toBe(destination);
      
      expect(event.client_ip).toBeDefined();
      expect(typeof event.client_ip).toBe('string');
      expect(event.client_ip.length).toBeGreaterThan(0);
    });
    
    test('should handle high volume of concurrent requests correctly', async () => {
      // Generate multiple unique source attributions
      const uniqueSAs = Array.from({ length: 5 }, () => generateUniqueSourceAttribution());
      const destinations = [
        'https://aws.amazon.com/ec2/',
        'https://aws.amazon.com/s3/',
        'https://aws.amazon.com/lambda/',
        'https://aws.amazon.com/dynamodb/',
        'https://aws.amazon.com/cloudformation/'
      ];
      
      // Make multiple concurrent requests
      const promises = uniqueSAs.map((sa, index) => 
        makeRedirectionRequest(destinations[index], sa)
      );
      
      const responses = await Promise.all(promises);
      
      // Verify all responses are successful
      responses.forEach((response, index) => {
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(destinations[index]);
      });
      
      // Wait for asynchronous tracking to complete
      await wait(5000);
      
      // Verify all tracking events were stored
      for (let i = 0; i < uniqueSAs.length; i++) {
        const events = await retry(async () => {
          const result = await queryTrackingEventsBySource(uniqueSAs[i]);
          if (result.length === 0) {
            throw new Error(`Tracking event not found for ${uniqueSAs[i]}`);
          }
          return result;
        });
        
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].source_attribution).toBe(uniqueSAs[i]);
        expect(events[0].destination_url).toBe(destinations[i]);
      }
    });
  });
  
  describe('Analytics API with Sample Data', () => {
    // Generate unique source attribution for this test suite
    const uniqueSA = generateUniqueSourceAttribution();
    const destinations = [
      'https://aws.amazon.com/ec2/',
      'https://aws.amazon.com/s3/',
      'https://aws.amazon.com/lambda/'
    ];
    
    beforeAll(async () => {
      // Create test data by making redirection requests
      for (const destination of destinations) {
        await makeRedirectionRequest(destination, uniqueSA);
      }
      
      // Wait for asynchronous tracking to complete
      await wait(3000);
    });
    
    test('should query analytics data with complex filters', async () => {
      // Wait to ensure data is available
      await wait(2000);
      
      // Query with multiple filters
      const response = await retry(async () => {
        const result = await makeAnalyticsQueryRequest({
          source_attribution: uniqueSA,
          destination_url: 'aws.amazon.com',
          limit: 10,
          sort_order: 'desc'
        });
        
        if (result.data.data.events.length === 0) {
          throw new Error('No events found for query');
        }
        
        return result;
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data.events.length).toBeGreaterThan(0);
      
      // All events should match the filters
      response.data.data.events.forEach((event: any) => {
        expect(event.source_attribution).toBe(uniqueSA);
        expect(event.destination_url).toContain('aws.amazon.com');
      });
    });
    
    test('should aggregate analytics data with time-based filters', async () => {
      // Get current time
      const now = new Date();
      
      // Set start time to 1 hour ago
      const startDate = new Date(now);
      startDate.setHours(startDate.getHours() - 1);
      
      // Set end time to current time
      const endDate = now;
      
      const response = await retry(async () => {
        const result = await makeAnalyticsAggregateRequest({
          source_attribution: uniqueSA,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString()
        });
        
        if (result.data.data.length === 0) {
          throw new Error('No aggregation data found');
        }
        
        return result;
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data.length).toBeGreaterThan(0);
      
      // Find our source attribution in the results
      const aggregation = response.data.data.find(
        (agg: any) => agg.source_attribution === uniqueSA
      );
      
      expect(aggregation).toBeDefined();
      expect(aggregation.count).toBe(destinations.length);
      expect(aggregation.destinations.length).toBe(destinations.length);
      
      // All destinations should be in the aggregation
      for (const destination of destinations) {
        expect(aggregation.destinations).toContain(destination);
      }
    });
  });
  
  describe('Error Handling Edge Cases', () => {
    test('should handle requests with missing headers gracefully', async () => {
      // Make request without standard headers
      const response = await axios.get(
        `${TEST_CONFIG.apiEndpoint}/url?url=https://aws.amazon.com/ec2/`,
        {
          headers: {
            // Omit standard headers like User-Agent
          },
          validateStatus: () => true
        }
      );
      
      // Should still work correctly
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
    });
    
    test('should handle requests with unusual HTTP methods gracefully', async () => {
      // Test with OPTIONS method (CORS preflight)
      const response = await axios.options(
        `${TEST_CONFIG.apiEndpoint}/url`,
        { validateStatus: () => true }
      );
      
      // Should return a valid response, not crash
      expect([200, 204, 400, 403, 404, 405]).toContain(response.status);
    });
    
    test('should handle requests with unusual query parameter encoding', async () => {
      // Test with URL that has unusual encoding
      const encodedUrl = encodeURIComponent('https://aws.amazon.com/ec2/?param=value with spaces&special=!@#$%^&*()');
      
      const response = await axios.get(
        `${TEST_CONFIG.apiEndpoint}/url?url=${encodedUrl}`,
        { validateStatus: () => true }
      );
      
      // Should handle it correctly
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(decodeURIComponent(encodedUrl));
    });
  });
});
</content>