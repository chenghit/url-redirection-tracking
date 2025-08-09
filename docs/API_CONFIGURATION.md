# API Configuration Setup

This document describes the automated process for retrieving API configuration from the deployed AWS infrastructure.

## Overview

The frontend dashboard requires API configuration to connect to the backend services. This includes:
- API Gateway endpoint URL
- API key for authentication

## Automated Setup

### Script: `scripts/setup-frontend-config.sh`

This script automatically:
1. Retrieves the API Gateway URL from CloudFormation stack outputs
2. Retrieves the API key ID from CloudFormation stack outputs  
3. Fetches the actual API key value using AWS API Gateway API
4. Creates/updates the `frontend/.env` file with all configuration

### Usage

```bash
# Run from project root
./scripts/setup-frontend-config.sh
```

### Prerequisites

- AWS CLI configured with appropriate credentials
- Access to the deployed CloudFormation stack
- Permissions to read CloudFormation outputs and API Gateway resources

### Generated Configuration

The script creates `frontend/.env` with:

```env
# API Configuration
VITE_API_BASE_URL=https://your-api-gateway-url.amazonaws.com/prod

# API Key (for deployment pipeline reference only)
API_KEY_VALUE=your-api-key-value
API_KEY_ID=your-api-key-id

# Development Configuration
VITE_APP_NAME=URL Redirection Analytics Dashboard
VITE_APP_VERSION=1.0.0
VITE_NODE_ENV=development
```

## Security Notes

- The API key is stored in `.env` for deployment pipeline reference only
- The API key will be injected via CloudFront custom headers during deployment
- The frontend JavaScript code never directly handles the API key
- The `.env` file should be included in `.gitignore` for production deployments

## Integration with Deployment Pipeline

The generated configuration is used by:
1. **Frontend Development**: `VITE_API_BASE_URL` for API calls
2. **CloudFront Setup**: `API_KEY_VALUE` for custom header injection
3. **Build Process**: Environment variables for application metadata

## Troubleshooting

### Common Issues

1. **AWS CLI not configured**
   ```bash
   aws configure --profile primary
   ```

2. **Stack not found**
   - Verify the stack name in the script matches your deployment
   - Ensure the CloudFormation stack is deployed successfully

3. **Permission denied**
   - Ensure AWS credentials have CloudFormation read permissions
   - Ensure access to API Gateway resources

### Manual Verification

You can verify the configuration manually:

```bash
# Check CloudFormation outputs
aws cloudformation describe-stacks --stack-name UrlRedirectionTrackingStack --query 'Stacks[0].Outputs'

# Test API endpoint
curl -H "x-api-key: YOUR_API_KEY" "https://your-api-gateway-url/health"
```

## Development Workflow

1. Deploy backend infrastructure with CDK
2. Run `./scripts/setup-frontend-config.sh` to generate configuration
3. Start frontend development with proper API configuration
4. Configuration is automatically available to the build process