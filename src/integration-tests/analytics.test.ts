// Integration tests for analytics API

import axios from 'axios';
import { 
  makeRedirectionRequest, 
  makeAnalyticsQueryRequest,
  makeAnalyticsAggregateRequest,
  generateUniqueSourceAttribution,
  wait,
  retry,
  TEST_CONFIG
} from './setup';

describe('Analytics API Integration Tests', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(30000);
  
  // Generate unique source attributions for this test suite
  const uniqueSA1 = generateUniqueSourceAttribution();
  const uniqueSA2 = generateUniqueSourceAttribution();
  
  // Store tracking IDs for verification
  let trackingIds: string[] = [];

  // Setup test data before running tests
  beforeAll(async () => {
    // Create test data by making redirection requests
    const destinations = [
      'https://aws.amazon.com/ec2/',
      'https://aws.amazon.com/s3/',
      'https://aws.amazon.com/lambda/'
    ];
    
    // Make redirection requests with first source attribution
    for (const destination of destinations) {
      const response = await makeRedirectionRequest(destination, uniqueSA1);
      expect(response.status).toBe(302);
      
      // Extract tracking ID from correlation ID if available
      const correlationId = response.headers['x-correlation-id'];
      if (correlationId) {
        trackingIds.push(correlationId);
      }
    }
    
    // Make redirection request with second source attribution
    const response = await makeRedirectionRequest(
      'https://aws.amazon.com/dynamodb/',
      uniqueSA2
    );
    expect(response.status).toBe(302);
    
    // Wait for asynchronous tracking to complete
    await wait(3000);
  });

  describe('Query Endpoint', () => {
    test('should return tracking events with no filters', async () => {
      const response = await makeAnalyticsQueryRequest();
      
      expect(response.status).toBe(200);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.events).toBeInstanceOf(Array);
      expect(response.data.data.total_count).toBeGreaterThan(0);
      expect(response.data.timestamp).toBeDefined();
    });

    test('should filter events by source attribution', async () => {
      // Wait to ensure data is available
      await wait(1000);
      
      const response = await retry(async () => {
        const result = await makeAnalyticsQueryRequest({
          source_attribution: uniqueSA1
        });
        
        if (result.data.data.events.length === 0) {
          throw new Error('No events found for source attribution');
        }
        
        return result;
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data.events.length).toBeGreaterThan(0);
      
      // All events should have the specified source attribution
      response.data.data.events.forEach((event: any) => {
        expect(event.source_attribution).toBe(uniqueSA1);
      });
    });

    test('should apply pagination correctly', async () => {
      const limit = 2;
      
      const response = await makeAnalyticsQueryRequest({
        limit,
        offset: 0
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data.events.length).toBeLessThanOrEqual(limit);
      
      if (response.data.data.total_count > limit) {
        expect(response.data.data.has_more).toBe(true);
      }
    });

    test('should sort events by timestamp', async () => {
      const ascResponse = await makeAnalyticsQueryRequest({
        sort_order: 'asc'
      });
      
      expect(ascResponse.status).toBe(200);
      
      if (ascResponse.data.data.events.length >= 2) {
        const firstTimestamp = new Date(ascResponse.data.data.events[0].timestamp).getTime();
        const secondTimestamp = new Date(ascResponse.data.data.events[1].timestamp).getTime();
        
        expect(firstTimestamp).toBeLessThanOrEqual(secondTimestamp);
      }
      
      const descResponse = await makeAnalyticsQueryRequest({
        sort_order: 'desc'
      });
      
      expect(descResponse.status).toBe(200);
      
      if (descResponse.data.data.events.length >= 2) {
        const firstTimestamp = new Date(descResponse.data.data.events[0].timestamp).getTime();
        const secondTimestamp = new Date(descResponse.data.data.events[1].timestamp).getTime();
        
        expect(firstTimestamp).toBeGreaterThanOrEqual(secondTimestamp);
      }
    });

    test('should filter events by time range', async () => {
      // Use a time range that includes our test data
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - 1); // 1 hour ago
      
      const endDate = new Date();
      endDate.setHours(endDate.getHours() + 1); // 1 hour from now
      
      const response = await makeAnalyticsQueryRequest({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString()
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data.events.length).toBeGreaterThan(0);
      
      // All events should be within the time range
      response.data.data.events.forEach((event: any) => {
        const eventTime = new Date(event.timestamp).getTime();
        expect(eventTime).toBeGreaterThanOrEqual(startDate.getTime());
        expect(eventTime).toBeLessThanOrEqual(endDate.getTime());
      });
    });

    test('should filter events by destination URL', async () => {
      const response = await makeAnalyticsQueryRequest({
        destination_url: 'ec2'
      });
      
      expect(response.status).toBe(200);
      
      // All events should contain the destination URL substring
      response.data.data.events.forEach((event: any) => {
        expect(event.destination_url).toContain('ec2');
      });
    });

    test('should handle complex queries with multiple filters', async () => {
      const response = await makeAnalyticsQueryRequest({
        source_attribution: uniqueSA1,
        destination_url: 'aws.amazon.com',
        limit: 10,
        sort_order: 'desc'
      });
      
      expect(response.status).toBe(200);
      
      // All events should match the filters
      response.data.data.events.forEach((event: any) => {
        expect(event.source_attribution).toBe(uniqueSA1);
        expect(event.destination_url).toContain('aws.amazon.com');
      });
    });
  });

  describe('Aggregate Endpoint', () => {
    test('should return aggregated statistics', async () => {
      const response = await makeAnalyticsAggregateRequest();
      
      expect(response.status).toBe(200);
      expect(response.data.data).toBeInstanceOf(Array);
      expect(response.data.timestamp).toBeDefined();
    });

    test('should aggregate by source attribution', async () => {
      // Wait to ensure data is available
      await wait(1000);
      
      const response = await retry(async () => {
        const result = await makeAnalyticsAggregateRequest();
        
        // Find our test source attributions in the results
        const sa1Agg = result.data.data.find((agg: any) => agg.source_attribution === uniqueSA1);
        const sa2Agg = result.data.data.find((agg: any) => agg.source_attribution === uniqueSA2);
        
        if (!sa1Agg || !sa2Agg) {
          throw new Error('Test source attributions not found in aggregation results');
        }
        
        return result;
      });
      
      expect(response.status).toBe(200);
      
      // Find our test source attributions in the results
      const sa1Agg = response.data.data.find((agg: any) => agg.source_attribution === uniqueSA1);
      const sa2Agg = response.data.data.find((agg: any) => agg.source_attribution === uniqueSA2);
      
      // Verify aggregation for first source attribution
      expect(sa1Agg).toBeDefined();
      expect(sa1Agg.count).toBe(3); // We created 3 events with this SA
      expect(sa1Agg.destinations.length).toBe(3);
      expect(sa1Agg.unique_ips).toBeGreaterThanOrEqual(1);
      
      // Verify aggregation for second source attribution
      expect(sa2Agg).toBeDefined();
      expect(sa2Agg.count).toBe(1); // We created 1 event with this SA
      expect(sa2Agg.destinations.length).toBe(1);
      expect(sa2Agg.unique_ips).toBeGreaterThanOrEqual(1);
    });

    test('should filter aggregations by source attribution', async () => {
      const response = await makeAnalyticsAggregateRequest({
        source_attribution: uniqueSA1
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data.length).toBe(1);
      expect(response.data.data[0].source_attribution).toBe(uniqueSA1);
      expect(response.data.data[0].count).toBe(3);
    });

    test('should sort aggregations by count in descending order', async () => {
      const response = await makeAnalyticsAggregateRequest();
      
      expect(response.status).toBe(200);
      
      // Verify that aggregations are sorted by count in descending order
      const counts = response.data.data.map((agg: any) => agg.count);
      
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
      }
    });
  });

  describe('Error Handling', () => {
    test('should return 400 for invalid query parameters', async () => {
      const response = await makeAnalyticsQueryRequest({
        limit: -1 // Invalid limit
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });

    test('should return 400 for invalid date format', async () => {
      const response = await makeAnalyticsQueryRequest({
        start_date: 'invalid-date'
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });

    test('should return 400 for invalid sort order', async () => {
      const response = await makeAnalyticsQueryRequest({
        sort_order: 'invalid' as any
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });

    test('should return 400 for invalid source attribution format', async () => {
      const response = await makeAnalyticsQueryRequest({
        source_attribution: 'Invalid'
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });

    test('should return 400 for invalid endpoint', async () => {
      const response = await retry(async () => {
        return axios.get(`${TEST_CONFIG.apiEndpoint}/analytics/invalid`, {
          headers: {
            'x-api-key': TEST_CONFIG.apiKey
          },
          validateStatus: () => true
        });
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });
    
    test('should return 403 when API key is missing', async () => {
      const response = await retry(async () => {
        return axios.get(`${TEST_CONFIG.apiEndpoint}/analytics/query`, {
          validateStatus: () => true
        });
      });
      
      expect(response.status).toBe(403);
      expect(response.data.error).toBeDefined();
    });
    
    test('should return 403 when API key is invalid', async () => {
      const response = await retry(async () => {
        return axios.get(`${TEST_CONFIG.apiEndpoint}/analytics/query`, {
          headers: {
            'x-api-key': 'invalid-api-key'
          },
          validateStatus: () => true
        });
      });
      
      expect(response.status).toBe(403);
      expect(response.data.error).toBeDefined();
    });
    
    test('should handle and log unexpected errors gracefully', async () => {
      // Test with malformed parameters that might cause internal errors
      const response = await makeAnalyticsQueryRequest({
        // @ts-ignore - Intentionally using invalid type to test error handling
        limit: "not-a-number"
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });
  });
  
  describe('Advanced Analytics Features', () => {
    // Generate unique source attributions for this test suite
    const uniqueSA = generateUniqueSourceAttribution();
    const destinations = [
      'https://aws.amazon.com/ec2/',
      'https://aws.amazon.com/s3/',
      'https://aws.amazon.com/lambda/'
    ];
    
    beforeAll(async () => {
      // Create test data with the same IP but different destinations
      for (const destination of destinations) {
        await makeRedirectionRequest(destination, uniqueSA);
      }
      
      // Wait for asynchronous tracking to complete
      await wait(3000);
    });
    
    test('should correctly count unique IPs in aggregations', async () => {
      const response = await retry(async () => {
        const result = await makeAnalyticsAggregateRequest({
          source_attribution: uniqueSA
        });
        
        if (result.data.data.length === 0) {
          throw new Error('No aggregation data found');
        }
        
        return result;
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data[0].source_attribution).toBe(uniqueSA);
      expect(response.data.data[0].count).toBe(destinations.length);
      
      // Since all requests came from the same test client, unique_ips should be 1
      expect(response.data.data[0].unique_ips).toBe(1);
    });
    
    test('should correctly list all unique destinations in aggregations', async () => {
      const response = await retry(async () => {
        const result = await makeAnalyticsAggregateRequest({
          source_attribution: uniqueSA
        });
        
        if (result.data.data.length === 0) {
          throw new Error('No aggregation data found');
        }
        
        return result;
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data[0].destinations.length).toBe(destinations.length);
      
      // All destinations should be in the list
      for (const destination of destinations) {
        expect(response.data.data[0].destinations).toContain(destination);
      }
    });
    
    test('should handle time-based filtering correctly', async () => {
      // Get current time
      const now = new Date();
      
      // Set start time to 1 hour ago
      const startDate = new Date(now);
      startDate.setHours(startDate.getHours() - 1);
      
      // Set end time to current time
      const endDate = now;
      
      const response = await makeAnalyticsQueryRequest({
        source_attribution: uniqueSA,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString()
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data.events.length).toBeGreaterThan(0);
      
      // All events should be within the time range
      response.data.data.events.forEach((event: any) => {
        const eventTime = new Date(event.timestamp).getTime();
        expect(eventTime).toBeGreaterThanOrEqual(startDate.getTime());
        expect(eventTime).toBeLessThanOrEqual(endDate.getTime());
      });
    });
  });
});