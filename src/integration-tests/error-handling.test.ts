// Integration tests for error handling and recovery mechanisms

import { 
  makeRedirectionRequest, 
  makeAnalyticsQueryRequest,
  generateUniqueSourceAttribution,
  wait,
  retry,
  TEST_CONFIG
} from './setup';
import axios from 'axios';
import { ERROR_CODES } from '../shared/constants';

describe('Error Handling Integration Tests', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(30000);
  
  describe('Redirection Error Handling', () => {
    test('should return structured error responses with correlation IDs', async () => {
      // Test with invalid URL
      const response = await makeRedirectionRequest('invalid-url');
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Bad request');
      expect(response.data.timestamp).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
      
      // Verify error structure
      expect(typeof response.data.error).toBe('string');
      expect(typeof response.data.timestamp).toBe('string');
      expect(typeof response.data.correlation_id).toBe('string');
    });
    
    test('should include error codes in error responses', async () => {
      // Test with invalid URL
      const response = await makeRedirectionRequest('invalid-url');
      
      expect(response.status).toBe(400);
      expect(response.data.error_code).toBeDefined();
      expect(Object.values(ERROR_CODES)).toContain(response.data.error_code);
    });
    
    test('should handle concurrent error scenarios correctly', async () => {
      // Make multiple invalid requests concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(makeRedirectionRequest(`invalid-url-${i}`));
      }
      
      const responses = await Promise.all(promises);
      
      // All responses should be error responses
      responses.forEach(response => {
        expect(response.status).toBe(400);
        expect(response.data.error).toBe('Bad request');
        expect(response.data.correlation_id).toBeDefined();
      });
      
      // Each response should have a unique correlation ID
      const correlationIds = responses.map(r => r.data.correlation_id);
      const uniqueCorrelationIds = new Set(correlationIds);
      expect(uniqueCorrelationIds.size).toBe(responses.length);
    });
    
    test('should handle malformed requests gracefully', async () => {
      // Test with completely invalid query parameters
      const response = await axios.get(`${TEST_CONFIG.apiEndpoint}/url?invalid=true&another=invalid`, {
        validateStatus: () => true
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });
  });
  
  describe('Analytics Error Handling', () => {
    test('should handle invalid date ranges gracefully', async () => {
      // Test with end date before start date
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() - 7); // End date 7 days before start date
      
      const response = await makeAnalyticsQueryRequest({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString()
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });
    
    test('should handle extremely large limit values gracefully', async () => {
      // Test with extremely large limit
      const response = await makeAnalyticsQueryRequest({
        limit: 1000000
      });
      
      // Should either cap the limit or return an error, but not crash
      expect([200, 400]).toContain(response.status);
      
      if (response.status === 200) {
        // If it caps the limit, the response should be valid
        expect(response.data.data).toBeDefined();
        expect(response.data.data.events).toBeInstanceOf(Array);
      } else {
        // If it returns an error, it should be structured
        expect(response.data.error).toBeDefined();
        expect(response.data.correlation_id).toBeDefined();
      }
    });
    
    test('should handle malformed JSON in request body gracefully', async () => {
      // Test with malformed JSON in request body
      const response = await axios.post(
        `${TEST_CONFIG.apiEndpoint}/analytics/query`,
        'this is not valid JSON',
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': TEST_CONFIG.apiKey
          },
          validateStatus: () => true
        }
      );
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
      expect(response.data.correlation_id).toBeDefined();
    });
  });
  
  describe('Cross-Cutting Error Handling', () => {
    test('should handle unsupported HTTP methods gracefully', async () => {
      // Test with unsupported HTTP method
      const response = await axios.put(
        `${TEST_CONFIG.apiEndpoint}/url?url=https://aws.amazon.com`,
        {},
        { validateStatus: () => true }
      );
      
      // Should return 405 Method Not Allowed or similar error
      expect([400, 403, 404, 405, 415]).toContain(response.status);
      expect(response.data.error).toBeDefined();
    });
    
    test('should handle unsupported paths gracefully', async () => {
      // Test with non-existent path
      const response = await axios.get(
        `${TEST_CONFIG.apiEndpoint}/non-existent-path`,
        { validateStatus: () => true }
      );
      
      // Should return 404 Not Found or similar error
      expect([400, 403, 404]).toContain(response.status);
      expect(response.data.error).toBeDefined();
    });
    
    test('should handle very long URLs gracefully', async () => {
      // Create an extremely long URL
      let longUrl = 'https://aws.amazon.com/ec2/?';
      for (let i = 0; i < 100; i++) {
        longUrl += `param${i}=value${i}&`;
      }
      
      const response = await makeRedirectionRequest(longUrl);
      
      // Should either handle it or return a structured error
      if (response.status === 302) {
        expect(response.headers.location).toBe(longUrl);
      } else {
        expect(response.status).toBe(400);
        expect(response.data.error).toBeDefined();
        expect(response.data.correlation_id).toBeDefined();
      }
    });
  });
});