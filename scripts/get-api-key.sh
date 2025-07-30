#!/bin/bash

# Script to retrieve the API key value for analytics endpoints
# Usage: ./scripts/get-api-key.sh [stack-name]

set -e

# Configuration
REGION="ap-northeast-1"
PROFILE="${AWS_PROFILE:-primary}"
STACK_NAME="UrlRedirectionTrackingStack"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "Retrieving API key information for stack: $STACK_NAME"

# Get the API Key ID from CloudFormation outputs
API_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiKeyId`].OutputValue' \
  --output text \
  --profile $PROFILE \
  --region ap-northeast-1)

if [ -z "$API_KEY_ID" ] || [ "$API_KEY_ID" = "None" ]; then
  echo "Error: Could not find API Key ID in stack outputs"
  echo "Make sure the stack is deployed and contains the ApiKeyId output"
  exit 1
fi

echo "API Key ID: $API_KEY_ID"

# Get the actual API key value
echo "Retrieving API key value..."
API_KEY_VALUE=$(aws apigateway get-api-key \
  --api-key "$API_KEY_ID" \
  --include-value \
  --query 'value' \
  --output text \
  --profile $PROFILE \
  --region ap-northeast-1)

if [ -z "$API_KEY_VALUE" ] || [ "$API_KEY_VALUE" = "None" ]; then
  echo "Error: Could not retrieve API key value"
  exit 1
fi

echo ""
echo "=== API Key Information ==="
echo "API Key ID: $API_KEY_ID"
echo "API Key Value: $API_KEY_VALUE"
echo ""
echo "Usage examples:"
echo "curl -H \"x-api-key: $API_KEY_VALUE\" \"https://your-api-gateway-url/analytics/query\""
echo "curl -H \"x-api-key: $API_KEY_VALUE\" \"https://your-api-gateway-url/analytics/aggregate\""
echo "curl -H \"x-api-key: $API_KEY_VALUE\" \"https://your-api-gateway-url/health\""
echo "curl -H \"x-api-key: $API_KEY_VALUE\" \"https://your-api-gateway-url/health/deep\""
echo ""
echo "Note: Replace 'your-api-gateway-url' with the actual API Gateway URL from stack outputs"