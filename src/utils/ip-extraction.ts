/**
 * IP address extraction utilities for the redirection service
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Extracts client IP address from API Gateway event
 * Handles CloudFront, load balancers, and proxy scenarios
 * @param event - API Gateway proxy event
 * @returns Client IP address string
 */
export function extractClientIP(event: APIGatewayProxyEvent): string {
  // Priority order for IP extraction:
  // 1. CloudFront-Viewer-Address (most reliable for CloudFront)
  // 2. X-Forwarded-For (first IP in chain)
  // 3. X-Real-IP
  // 4. requestContext.identity.sourceIp (fallback)
  
  // CloudFront-Viewer-Address header (most reliable for CloudFront distributions)
  const cloudFrontViewerAddress = event.headers?.['CloudFront-Viewer-Address'] || 
                                  event.headers?.['cloudfront-viewer-address'];
  if (cloudFrontViewerAddress && isValidIPAddress(cloudFrontViewerAddress)) {
    return cloudFrontViewerAddress;
  }
  
  // X-Forwarded-For header (standard for proxies and load balancers)
  const xForwardedFor = event.headers?.['X-Forwarded-For'] || 
                        event.headers?.['x-forwarded-for'];
  if (xForwardedFor) {
    // X-Forwarded-For format: client, proxy1, proxy2, ...
    // The first IP is the original client IP
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    
    // Find the first valid public IP address
    for (const ip of ips) {
      if (isValidIPAddress(ip) && !isPrivateIP(ip)) {
        return ip;
      }
    }
    
    // If no public IP found, use the first valid IP
    const firstValidIP = ips.find(ip => isValidIPAddress(ip));
    if (firstValidIP) {
      return firstValidIP;
    }
  }
  
  // X-Real-IP header (used by some proxies)
  const xRealIP = event.headers?.['X-Real-IP'] || event.headers?.['x-real-ip'];
  if (xRealIP && isValidIPAddress(xRealIP)) {
    return xRealIP;
  }
  
  // Fallback to requestContext.identity.sourceIp
  const sourceIP = event.requestContext?.identity?.sourceIp;
  if (sourceIP && isValidIPAddress(sourceIP)) {
    return sourceIP;
  }
  
  // If no valid IP found, return a default value
  return 'unknown';
}

/**
 * Validates if a string is a valid IP address (IPv4 or IPv6)
 * @param ip - IP address string to validate
 * @returns true if the IP address is valid
 */
export function isValidIPAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  
  // Remove any whitespace
  ip = ip.trim();
  
  // Check for IPv4 format
  if (isValidIPv4(ip)) {
    return true;
  }
  
  // Check for IPv6 format
  if (isValidIPv6(ip)) {
    return true;
  }
  
  return false;
}

/**
 * Validates IPv4 address format
 * @param ip - IP address string to validate
 * @returns true if valid IPv4 address
 */
function isValidIPv4(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);
  
  if (!match) {
    return false;
  }
  
  // Check that each octet is between 0 and 255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validates IPv6 address format (basic validation)
 * @param ip - IP address string to validate
 * @returns true if valid IPv6 address
 */
function isValidIPv6(ip: string): boolean {
  // Basic IPv6 validation - checks for valid characters and structure
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
  
  // Handle compressed notation (::)
  if (ip.includes('::')) {
    const parts = ip.split('::');
    if (parts.length > 2) {
      return false; // More than one :: is invalid
    }
    
    // Reconstruct the full address for validation
    const leftParts = parts[0] ? parts[0].split(':') : [];
    const rightParts = parts[1] ? parts[1].split(':') : [];
    const totalParts = leftParts.length + rightParts.length;
    
    if (totalParts > 8) {
      return false;
    }
    
    // Check each part
    const allParts = [...leftParts, ...rightParts];
    return allParts.every(part => /^[0-9a-fA-F]{0,4}$/.test(part));
  }
  
  return ipv6Regex.test(ip);
}

/**
 * Checks if an IP address is a private/internal IP
 * @param ip - IP address to check
 * @returns true if the IP is private
 */
function isPrivateIP(ip: string): boolean {
  if (!isValidIPv4(ip)) {
    return false; // For simplicity, only check IPv4 private ranges
  }
  
  const parts = ip.split('.').map(part => parseInt(part, 10));
  
  // Private IPv4 ranges:
  // 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  // 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
  // 127.0.0.0/8 (loopback)
  // 169.254.0.0/16 (link-local)
  
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  return false;
}