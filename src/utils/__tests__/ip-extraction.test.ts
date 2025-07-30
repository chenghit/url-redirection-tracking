import { extractClientIP, isValidIPAddress } from '../ip-extraction';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Helper function to create a mock API Gateway event
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    resource: '/{proxy+}',
    path: '/test',
    httpMethod: 'GET',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: 'test-account-id',
      resourceId: 'test',
      resourcePath: '/{proxy+}',
      httpMethod: 'GET',
      requestId: 'test-request-id',
      protocol: 'HTTP/1.1',
      path: '/test',
      stage: 'test',
      requestTimeEpoch: Date.now(),
      requestTime: new Date().toISOString(),
      identity: {
        cognitoIdentityPoolId: null,
        accountId: null,
        cognitoIdentityId: null,
        caller: null,
        sourceIp: '192.168.1.1',
        principalOrgId: null,
        accessKey: null,
        cognitoAuthenticationType: null,
        cognitoAuthenticationProvider: null,
        userArn: null,
        userAgent: 'test-agent',
        user: null,
        apiKey: null,
        apiKeyId: null,
        clientCert: null
      },
      domainName: 'test.execute-api.region.amazonaws.com',
      apiId: 'test-api-id',
      domainPrefix: 'test',
      extendedRequestId: 'test-extended-id',
      authorizer: {}
    },
    body: null,
    isBase64Encoded: false,
    ...overrides
  };
}

describe('IP Extraction Utilities', () => {
  describe('extractClientIP', () => {
    it('should extract IP from X-Forwarded-For header (case sensitive)', () => {
      const event = createMockEvent({
        headers: {
          'X-Forwarded-For': '203.0.113.1, 198.51.100.1, 192.168.1.1'
        }
      });
      
      expect(extractClientIP(event)).toBe('203.0.113.1');
    });

    it('should extract IP from x-forwarded-for header (case insensitive)', () => {
      const event = createMockEvent({
        headers: {
          'x-forwarded-for': '203.0.113.2, 198.51.100.2'
        }
      });
      
      expect(extractClientIP(event)).toBe('203.0.113.2');
    });

    it('should handle single IP in X-Forwarded-For header', () => {
      const event = createMockEvent({
        headers: {
          'X-Forwarded-For': '203.0.113.3'
        }
      });
      
      expect(extractClientIP(event)).toBe('203.0.113.3');
    });

    it('should trim whitespace from X-Forwarded-For IPs', () => {
      const event = createMockEvent({
        headers: {
          'X-Forwarded-For': ' 203.0.113.4 , 198.51.100.4 '
        }
      });
      
      expect(extractClientIP(event)).toBe('203.0.113.4');
    });

    it('should fallback to requestContext.identity.sourceIp when X-Forwarded-For is not present', () => {
      const event = createMockEvent({
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.100'
          }
        }
      });
      
      expect(extractClientIP(event)).toBe('192.168.1.100');
    });

    it('should fallback to requestContext.identity.sourceIp when X-Forwarded-For contains invalid IP', () => {
      const event = createMockEvent({
        headers: {
          'X-Forwarded-For': 'invalid-ip, another-invalid'
        },
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.101'
          }
        }
      });
      
      expect(extractClientIP(event)).toBe('192.168.1.101');
    });

    it('should return "unknown" when no valid IP is found', () => {
      const event = createMockEvent({
        headers: {
          'X-Forwarded-For': 'invalid-ip'
        },
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: 'also-invalid'
          }
        }
      });
      
      expect(extractClientIP(event)).toBe('unknown');
    });

    it('should handle missing headers object', () => {
      const event = createMockEvent({
        headers: null as any,
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.102'
          }
        }
      });
      
      expect(extractClientIP(event)).toBe('192.168.1.102');
    });

    it('should handle IPv6 addresses in X-Forwarded-For', () => {
      const event = createMockEvent({
        headers: {
          'X-Forwarded-For': '2001:db8::1, 192.168.1.1'
        }
      });
      
      expect(extractClientIP(event)).toBe('2001:db8::1');
    });
  });

  describe('isValidIPAddress', () => {
    describe('IPv4 validation', () => {
      it('should return true for valid IPv4 addresses', () => {
        expect(isValidIPAddress('192.168.1.1')).toBe(true);
        expect(isValidIPAddress('10.0.0.1')).toBe(true);
        expect(isValidIPAddress('203.0.113.1')).toBe(true);
        expect(isValidIPAddress('0.0.0.0')).toBe(true);
        expect(isValidIPAddress('255.255.255.255')).toBe(true);
      });

      it('should return false for invalid IPv4 addresses', () => {
        expect(isValidIPAddress('256.1.1.1')).toBe(false); // Octet > 255
        expect(isValidIPAddress('192.168.1')).toBe(false); // Missing octet
        expect(isValidIPAddress('192.168.1.1.1')).toBe(false); // Too many octets
        expect(isValidIPAddress('192.168.-1.1')).toBe(false); // Negative octet
        expect(isValidIPAddress('192.168.abc.1')).toBe(false); // Non-numeric octet
      });
    });

    describe('IPv6 validation', () => {
      it('should return true for valid IPv6 addresses', () => {
        expect(isValidIPAddress('2001:db8::1')).toBe(true);
        expect(isValidIPAddress('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true);
        expect(isValidIPAddress('::1')).toBe(true); // Loopback
        expect(isValidIPAddress('::')).toBe(true); // All zeros
        expect(isValidIPAddress('fe80::1')).toBe(true);
      });

      it('should return false for invalid IPv6 addresses', () => {
        expect(isValidIPAddress('2001:db8::1::2')).toBe(false); // Multiple ::
        expect(isValidIPAddress('2001:db8:gggg::1')).toBe(false); // Invalid hex
        expect(isValidIPAddress('2001:db8:1:2:3:4:5:6:7:8')).toBe(false); // Too many groups
      });
    });

    describe('Edge cases', () => {
      it('should return false for null, undefined, or non-string inputs', () => {
        expect(isValidIPAddress(null as any)).toBe(false);
        expect(isValidIPAddress(undefined as any)).toBe(false);
        expect(isValidIPAddress(123 as any)).toBe(false);
        expect(isValidIPAddress({} as any)).toBe(false);
        expect(isValidIPAddress('')).toBe(false);
      });

      it('should handle whitespace correctly', () => {
        expect(isValidIPAddress(' 192.168.1.1 ')).toBe(true);
        expect(isValidIPAddress('\t192.168.1.1\n')).toBe(true);
      });

      it('should return false for completely invalid formats', () => {
        expect(isValidIPAddress('not-an-ip')).toBe(false);
        expect(isValidIPAddress('192.168.1')).toBe(false);
        expect(isValidIPAddress('192.168.1.1.1')).toBe(false);
        expect(isValidIPAddress('just-text')).toBe(false);
      });
    });
  });
});