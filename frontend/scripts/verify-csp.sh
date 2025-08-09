#!/bin/bash

# CSP Verification Script
# Checks for Content Security Policy implementation

CLOUDFRONT_URL="https://dy2prvpgmxnws.cloudfront.net"

echo "🔍 Checking Content Security Policy implementation..."
echo "Target URL: $CLOUDFRONT_URL"
echo ""

# Check for CSP in HTTP headers
echo "1. Checking HTTP headers for CSP..."
CSP_HEADER=$(curl -I -s "$CLOUDFRONT_URL" | grep -i "content-security-policy" || echo "Not found in headers")
echo "CSP Header: $CSP_HEADER"
echo ""

# Check for CSP in HTML meta tags
echo "2. Checking HTML meta tags for CSP..."
CSP_META=$(curl -s "$CLOUDFRONT_URL" | grep -i "content-security-policy" || echo "Not found in meta tags")
echo "CSP Meta: $CSP_META"
echo ""

# Check for other security-related meta tags
echo "3. Checking for other security meta tags..."
curl -s "$CLOUDFRONT_URL" | grep -i "meta.*security\|meta.*policy\|meta.*frame" || echo "No additional security meta tags found"
echo ""

echo "✅ CSP verification complete"