// Integration tests for URL redirection flow

import { 
  makeRedirectionRequest, 
  generateUniqueSourceAttribution,
  queryTrackingEventsBySource,
  wait,
  retry
} from './setup';

describe('URL Redirection Integration Tests', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(30000);

  describe('Successful Redirections', () => {
    test('should redirect to valid AWS domain with 302 status code', async () => {
      const response = await makeRedirectionRequest('https://aws.amazon.com/products');
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://aws.amazon.com/products');
      expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    test('should redirect and track with source attribution', async () => {
      // Generate unique source attribution for this test
      const uniqueSA = generateUniqueSourceAttribution();
      const destinationUrl = 'https://aws.amazon.com/ec2/';
      
      // Make redirection request
      const response = await makeRedirectionRequest(destinationUrl, uniqueSA);
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(destinationUrl);
      
      // Wait for asynchronous tracking to complete
      await wait(2000);
      
      // Verify tracking data was stored in DynamoDB
      const events = await retry(async () => {
        const result = await queryTrackingEventsBySource(uniqueSA);
        if (result.length === 0) {
          throw new Error('Tracking event not found');
        }
        return result;
      });
      
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].source_attribution).toBe(uniqueSA);
      expect(events[0].destination_url).toBe(destinationUrl);
      expect(events[0].tracking_id).toBeDefined();
      expect(events[0].timestamp).toBeDefined();
      expect(events[0].formatted_timestamp).toBeDefined();
      expect(events[0].client_ip).toBeDefined();
    });

    test('should handle URLs with query parameters correctly', async () => {
      const destinationUrl = 'https://aws.amazon.com/ec2/?param1=value1&param2=value2';
      
      const response = await makeRedirectionRequest(destinationUrl);
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(destinationUrl);
    });

    test('should handle URLs with fragments correctly', async () => {
      const destinationUrl = 'https://aws.amazon.com/ec2/#section1';
      
      const response = await makeRedirectionRequest(destinationUrl);
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(destinationUrl);
    });
  });

  describe('Validation Errors', () => {
    test('should return 400 for missing URL parameter', async () => {
      // @ts-ignore - Intentionally omitting URL parameter
      const response = await makeRedirectionRequest(undefined);
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Bad request');
      expect(response.data.timestamp).toBeDefined();
    });

    test('should return 400 for invalid URL format', async () => {
      const response = await makeRedirectionRequest('invalid-url');
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Bad request');
    });

    test('should return 400 for disallowed domains', async () => {
      const response = await makeRedirectionRequest('https://google.com');
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Bad request');
    });

    test('should return 400 for invalid source attribution format', async () => {
      const response = await makeRedirectionRequest(
        'https://aws.amazon.com/products',
        'InvalidSA'
      );
      
      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Bad request');
    });
  });

  describe('Edge Cases', () => {
    test('should handle URLs with special characters correctly', async () => {
      const destinationUrl = 'https://aws.amazon.com/ec2/?param=value%20with%20spaces';
      
      const response = await makeRedirectionRequest(destinationUrl);
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(destinationUrl);
    });

    test('should handle multiple redirections in sequence', async () => {
      const uniqueSA1 = generateUniqueSourceAttribution();
      const uniqueSA2 = generateUniqueSourceAttribution();
      
      const response1 = await makeRedirectionRequest(
        'https://aws.amazon.com/ec2/',
        uniqueSA1
      );
      
      const response2 = await makeRedirectionRequest(
        'https://aws.amazon.com/s3/',
        uniqueSA2
      );
      
      expect(response1.status).toBe(302);
      expect(response2.status).toBe(302);
      
      // Wait for asynchronous tracking to complete
      await wait(2000);
      
      // Verify both tracking events were stored
      const events1 = await retry(async () => {
        const result = await queryTrackingEventsBySource(uniqueSA1);
        if (result.length === 0) {
          throw new Error('First tracking event not found');
        }
        return result;
      });
      
      const events2 = await retry(async () => {
        const result = await queryTrackingEventsBySource(uniqueSA2);
        if (result.length === 0) {
          throw new Error('Second tracking event not found');
        }
        return result;
      });
      
      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);
      expect(events1[0].destination_url).toBe('https://aws.amazon.com/ec2/');
      expect(events2[0].destination_url).toBe('https://aws.amazon.com/s3/');
    });
    
    test('should handle URLs with unicode characters correctly', async () => {
      const destinationUrl = 'https://aws.amazon.com/ec2/?param=测试';
      
      const response = await makeRedirectionRequest(destinationUrl);
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(destinationUrl);
    });
    
    test('should handle very long URLs within allowed limits', async () => {
      // Create a long URL with many query parameters
      let longUrl = 'https://aws.amazon.com/ec2/?';
      for (let i = 0; i < 20; i++) {
        longUrl += `param${i}=value${i}&`;
      }
      longUrl = longUrl.slice(0, -1); // Remove trailing &
      
      const response = await makeRedirectionRequest(longUrl);
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(longUrl);
    });
    
    test('should handle URLs with all allowed domains', async () => {
      const domains = [
        'https://amazonaws.cn/service',
        'https://amazonaws.com/service',
        'https://amazon.com/service'
      ];
      
      for (const domain of domains) {
        const response = await makeRedirectionRequest(domain);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(domain);
      }
    });
    
    test('should follow redirects when configured to do so', async () => {
      const destinationUrl = 'https://aws.amazon.com/ec2/';
      
      // Set followRedirects to true
      const response = await makeRedirectionRequest(destinationUrl, undefined, true);
      
      // When following redirects, we should get a 200 OK from the final destination
      expect(response.status).toBe(200);
      // The response should contain HTML from the AWS EC2 page
      expect(response.data).toContain('Amazon EC2');
    });
  });
});