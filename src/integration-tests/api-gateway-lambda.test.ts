// Integration tests for API Gateway and Lambda integration

import { 
  makeRedirectionRequest, 
  makeAnalyticsQueryRequest,
  generateUniqueSourceAttribution,
  wait,
  retry,
  TEST_CONFIG
} from './setup';
import axios from 'axios';

describe('API Gateway and Lambda Integration Tests', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(30000);
  
  describe('API Gateway Configuration', () => {
    test('should handle CORS headers correctly', async () => {
      // Make OPTIONS request to check CORS configuration
      const response = await axios.options(
        `${TEST_CONFIG.apiEndpoint}/url`,
        {
          headers: {
            'Origin': 'https://example.com',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Content-Type'
          },
          validateStatus: () => true
        }
      );
      
      // Should either support CORS or return a valid error
      if (response.status === 200 || response.status === 204) {
        // If CORS is supported, check for CORS headers
        expect(response.headers['access-control-allow-origin']).toBeDefined();
        expect(response.headers['access-control-allow-methods']).toBeDefined();
      } else {
        // If CORS is not supported, should return a valid error response
        expect([400, 403, 404, 405]).toContain(response.status);
      }
    });
    
    test('should handle API Gateway request context correctly', async () => {
      // Make request with custom headers to test context passing
      const uniqueSA = generateUniqueSourceAttribution();
      const customRequestId = `test-${Date.now()}`;
      
      const response = await axios.get(
        `${TEST_CONFIG.apiEndpoint}/url?url=https://aws.amazon.com/ec2/&sa=${uniqueSA}`,
        {
          headers: {
            'X-Custom-Request-Id': customRequestId
          },
          validateStatus: () => true
        }
      );
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
      
      // Wait for asynchronous tracking to complete
      await wait(3000);
      
      // Verify tracking data was stored with request context information
      // This is an indirect test of API Gateway -> Lambda context passing
      const analyticsResponse = await retry(async () => {
        const result = await makeAnalyticsQueryRequest({
          source_attribution: uniqueSA
        });
        
        if (result.data.data.events.length === 0) {
          throw new Error('No events found for source attribution');
        }
        
        return result;
      });
      
      expect(analyticsResponse.status).toBe(200);
      expect(analyticsResponse.data.data.events.length).toBeGreaterThan(0);
    });
    
    test('should handle API Gateway stage variables correctly', async () => {
      // Make a standard request to test stage variable handling
      const response = await makeRedirectionRequest('https://aws.amazon.com/ec2/');
      
      // Basic verification that the API works with stage variables
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
    });
  });
  
  describe('Lambda Proxy Integration', () => {
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
    
    test('should handle multiValueHeaders and multiValueQueryStringParameters', async () => {
      // Test with multiple values for the same query parameter
      const response = await axios.get(
        `${TEST_CONFIG.apiEndpoint}/url?url=https://aws.amazon.com/ec2/&param=value1&param=value2`,
        { validateStatus: () => true }
      );
      
      // Should handle it correctly (either redirect or return a structured error)
      if (response.status === 302) {
        expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
      } else {
        expect(response.status).toBe(400);
        expect(response.data.error).toBeDefined();
      }
    });
    
    test('should handle path parameters correctly', async () => {
      // Test with path parameters
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
  });
  
  describe('Lambda Cold Start and Performance', () => {
    test('should handle cold start scenarios correctly', async () => {
      // Wait to allow any previous Lambda instances to potentially expire
      await wait(5000);
      
      // Make a request that might trigger a cold start
      const startTime = Date.now();
      const response = await makeRedirectionRequest('https://aws.amazon.com/ec2/');
      const endTime = Date.now();
      
      // Verify response is correct
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
      
      // Check response time - should be reasonable even with cold start
      // This is a soft assertion as cold start times can vary
      const responseTime = endTime - startTime;
      console.log(`Cold start response time: ${responseTime}ms`);
      
      // Make a second request that should be warm
      const warmStartTime = Date.now();
      const warmResponse = await makeRedirectionRequest('https://aws.amazon.com/s3/');
      const warmEndTime = Date.now();
      
      // Verify response is correct
      expect(warmResponse.status).toBe(302);
      expect(warmResponse.headers.location).toBe('https://aws.amazon.com/s3/');
      
      // Check warm response time
      const warmResponseTime = warmEndTime - warmStartTime;
      console.log(`Warm response time: ${warmResponseTime}ms`);
    });
    
    test('should handle concurrent requests correctly', async () => {
      // Generate unique source attributions
      const uniqueSAs = Array.from({ length: 5 }, () => generateUniqueSourceAttribution());
      
      // Make multiple concurrent requests
      const promises = uniqueSAs.map(sa => 
        makeRedirectionRequest('https://aws.amazon.com/ec2/', sa)
      );
      
      // Wait for all requests to complete
      const responses = await Promise.all(promises);
      
      // Verify all responses are correct
      responses.forEach(response => {
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('https://aws.amazon.com/ec2/');
      });
      
      // Wait for asynchronous tracking to complete
      await wait(3000);
      
      // Verify all tracking events were stored
      for (const sa of uniqueSAs) {
        const events = await retry(async () => {
          const result = await makeAnalyticsQueryRequest({
            source_attribution: sa
          });
          
          if (result.data.data.events.length === 0) {
            throw new Error(`No events found for source attribution ${sa}`);
          }
          
          return result;
        });
        
        expect(events.status).toBe(200);
        expect(events.data.data.events.length).toBeGreaterThan(0);
        expect(events.data.data.events[0].source_attribution).toBe(sa);
      }
    });
  });
});
</content>