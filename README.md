# URL Redirection Tracking System

A serverless URL redirection and tracking application built on AWS using CDK, designed to handle URL redirections while capturing detailed analytics data for business intelligence purposes.

## Overview

This system provides secure URL redirection services with comprehensive tracking capabilities. It's built using AWS serverless technologies and follows best practices for scalability, security, and observability.

### Key Features

- **Secure URL Redirection**: Only allows redirections to authorized domains (amazonaws.cn, amazonaws.com, amazon.com)
- **Real-time Tracking**: Captures detailed analytics data including IP addresses, timestamps, and source attribution
- **Scalable Architecture**: Serverless design that automatically scales based on demand
- **Comprehensive Monitoring**: Built-in CloudWatch alarms and health checks
- **Security**: WAF protection with rate limiting and common attack prevention
- **Analytics API**: RESTful API for querying and aggregating tracking data

## Architecture

The system consists of three main Lambda functions:

1. **Redirection Lambda**: Handles incoming URL redirection requests
2. **Tracking Lambda**: Processes tracking data asynchronously via SQS
3. **Analytics Lambda**: Provides API endpoints for querying tracking data

### Infrastructure Components

- **API Gateway**: Regional endpoint for handling HTTP requests
- **AWS Lambda**: Serverless compute for business logic
- **DynamoDB**: NoSQL database for storing tracking events
- **SQS**: Message queue for asynchronous tracking processing
- **CloudWatch**: Monitoring, logging, and alerting
- **AWS WAF**: Web application firewall for security

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk@latest`) - **Note**: Ensure you have CDK CLI version 2.1020.2 or later for compatibility
- TypeScript (`npm install -g typescript`)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd url-redirection-tracking
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Run tests:
```bash
npm test
```

### Deployment

#### Quick Deployment

Deploy to development environment:
```bash
./scripts/deploy.sh
```

#### Custom Deployment

Deploy with specific options:
```bash
# Deploy to production environment
./scripts/deploy.sh -e prod -p production

# Deploy with custom region
./scripts/deploy.sh -r us-west-2

# Dry run (synthesize only)
./scripts/deploy.sh --dry-run

# Skip tests during deployment
./scripts/deploy.sh --skip-tests
```

#### Manual CDK Deployment

```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy the stack
cdk deploy
```

## API Reference

### Redirection Endpoint

**GET** `/{proxy+}`

Redirects users to the specified destination URL while capturing tracking data.

**Query Parameters:**
- `url` (required): Destination URL (must be from allowed domains)
- `sa` (optional): Source attribution in format `EdgeUp###` (e.g., `EdgeUp001`)

**Example:**
```bash
curl "https://api-gateway-url.amazonaws.com/prod/redirect?url=https://aws.amazon.com&sa=EdgeUp001"
```

**Response:**
- `302 Found` with `Location` header pointing to destination URL
- `400 Bad Request` for invalid parameters
- `500 Internal Server Error` for system errors

### Analytics Endpoints

All analytics endpoints require authentication via `X-API-Key` header. The API key is automatically generated during deployment and can be retrieved using the provided script.

#### Query Tracking Events

**GET** `/analytics/query`

Retrieve tracking events with filtering and pagination.

**Query Parameters:**
- `start_date` (optional): Filter start date (ISO 8601 format)
- `end_date` (optional): Filter end date (ISO 8601 format)
- `source_attribution` (optional): Filter by source attribution
- `destination_url` (optional): Filter by destination URL
- `limit` (optional): Number of results (default: 100, max: 1000)
- `sort_order` (optional): Sort order `asc` or `desc` (default: `desc`)
- `offset` (optional): Pagination offset (default: 0)

**Example:**
```bash
curl -H "X-API-Key: your-api-key" \
  "https://api-gateway-url.amazonaws.com/prod/analytics/query?start_date=2024-01-01T00:00:00Z&limit=50"
```

#### Aggregate Statistics

**GET** `/analytics/aggregate`

Get aggregated statistics grouped by source attribution.

**Query Parameters:**
- `start_date` (optional): Filter start date (ISO 8601 format)
- `end_date` (optional): Filter end date (ISO 8601 format)
- `source_attribution` (optional): Filter by specific source attribution

**Example:**
```bash
curl -H "X-API-Key: your-api-key" \
  "https://api-gateway-url.amazonaws.com/prod/analytics/aggregate"
```

#### Health Checks

**GET** `/health`
Basic health check endpoint (API key required).

**GET** `/health/deep`
Comprehensive health check including database connectivity (API key required).

### API Key Management

After deployment, retrieve your API key using:

```bash
# Get API key value
./scripts/get-api-key.sh

# Get API key for specific stack
./scripts/get-api-key.sh MyCustomStackName
```

The API key is required for all `/analytics/*` and `/health*` endpoints but not for redirection endpoints.

## Configuration

### Environment-Specific Configuration

Configuration files are located in the `config/` directory:

- `config/common/common.json`: Shared configuration
- `config/dev/config.json`: Development environment
- `config/prod/config.json`: Production environment
- `config/staging/config.json`: Staging environment

### Key Configuration Options

```json
{
  "region": "ap-northeast-1",
  "allowedDomains": ["amazonaws.cn", "amazonaws.com", "amazon.com"],
  "lambda": {
    "redirectionMemory": 128,
    "trackingMemory": 256,
    "analyticsMemory": 256,
    "timeout": 30
  },
  "waf": {
    "rateLimit": 100,
    "rateLimitWindow": 300
  }
}
```

## Monitoring and Operations

### CloudWatch Alarms

The system includes comprehensive monitoring with the following alarms:

- **Lambda Function Errors**: Alerts on function errors (>5 errors in 5 minutes)
- **High Latency**: Alerts on slow response times
- **DynamoDB Throttling**: Alerts on database throttling events
- **SQS Queue Depth**: Alerts on high message queue depth
- **Dead Letter Queue**: Alerts on any messages in DLQ
- **API Gateway Errors**: Alerts on 4XX/5XX error rates

### Operational Scripts

#### Monitor Dead Letter Queue

```bash
# Check DLQ status
./scripts/monitor-dlq.sh check

# List messages in DLQ
./scripts/monitor-dlq.sh list 10

# Continuous monitoring
./scripts/monitor-dlq.sh monitor 60

# Get CloudWatch metrics
./scripts/monitor-dlq.sh metrics 24
```

#### System Monitoring

```bash
# Monitor system health
./scripts/system-monitor.sh

# Check Lambda function metrics
./scripts/system-monitor.sh lambda-metrics

# Check DynamoDB metrics
./scripts/system-monitor.sh dynamodb-metrics
```

#### Reprocess Failed Messages

```bash
# Reprocess messages from DLQ
./scripts/reprocess-messages.sh

# Reprocess specific message
./scripts/reprocess-messages.sh --message-id <message-id>
```

### Log Analysis

Logs are structured in JSON format and sent to CloudWatch Logs. Each log entry includes:

- Timestamp
- Log level (DEBUG, INFO, WARN, ERROR)
- Correlation ID for request tracing
- Performance metrics
- Contextual data

Example log query in CloudWatch Insights:
```sql
fields @timestamp, level, message, context.correlationId, data
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

## Development

### Project Structure

```
src/
├── infrastructure/          # CDK infrastructure code
│   ├── app.ts              # CDK app entry point
│   └── stack.ts            # Main stack definition
├── lambdas/                # Lambda function code
│   ├── redirection/        # URL redirection handler
│   ├── tracking/           # Tracking data processor
│   └── analytics/          # Analytics API handler
├── types/                  # TypeScript type definitions
├── utils/                  # Shared utility functions
│   ├── validation.ts       # URL and parameter validation
│   ├── ip-extraction.ts    # IP address extraction
│   ├── timestamp.ts        # Timestamp formatting
│   └── logger.ts           # Structured logging
└── __tests__/              # Integration tests
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test -- --coverage

# Run specific test file
npm test -- src/lambdas/redirection/__tests__/index.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with verbose output for debugging
npm test -- --verbose
```

**Note**: If you encounter test failures related to AWS SDK mocks, ensure that handler imports are placed after mock configurations in test files.

### Local Development

```bash
# Build TypeScript
npm run build

# Synthesize CDK template
npm run synth

# Run linting
npm run lint

# Format code
npm run format
```

## Security

### Access Control

- API Gateway endpoints are protected by AWS WAF
- Analytics endpoints (`/analytics/*`) and health endpoints (`/health*`) require API key authentication via `X-API-Key` header
- Redirection endpoints (`/{proxy+}`) are publicly accessible
- Rate limiting prevents abuse (10 requests per 5-minute window per IP)

### Data Protection

- All data is encrypted at rest in DynamoDB
- Data in transit is encrypted using TLS
- IP addresses are collected for analytics but can be anonymized if required

### Allowed Domains

The system only allows redirections to these domains:
- `amazonaws.cn`
- `amazonaws.com`
- `amazon.com`

### WAF Protection

- SQL injection protection
- XSS protection
- Known bad inputs protection
- Rate limiting by IP address

## Troubleshooting

### Common Issues

#### CDK Version Compatibility

If you encounter CDK schema version mismatch errors during deployment:

1. Update CDK CLI to the latest version: `npm install -g aws-cdk@latest`
2. Verify version compatibility: `cdk --version` (should be 2.1020.2 or later)
3. Clear CDK cache if needed: `cdk context --clear`

#### Test Failures During Deployment

If tests fail during deployment:

1. Run tests individually to identify issues: `npm test -- --verbose`
2. Use `--skip-tests` flag for deployment if tests are not critical: `./scripts/deploy.sh --skip-tests`
3. Check mock configurations in test files, especially import order for AWS SDK mocks

#### High DLQ Message Count

1. Check DLQ messages: `./scripts/monitor-dlq.sh list`
2. Analyze message patterns: `./scripts/monitor-dlq.sh analyze`
3. Reprocess valid messages: `./scripts/reprocess-messages.sh`

#### Lambda Function Errors

1. Check CloudWatch logs for error details
2. Verify environment variables are set correctly
3. Check DynamoDB table permissions
4. Verify SQS queue permissions

#### High Latency

1. Check DynamoDB performance metrics
2. Review Lambda function memory allocation
3. Analyze query patterns for optimization opportunities

### Performance Optimization

- Use DynamoDB Global Secondary Indexes for efficient queries
- Implement connection pooling for database connections
- Optimize Lambda memory allocation based on usage patterns
- Use SQS batching for improved throughput

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and add tests
4. Run tests: `npm test`
5. Commit changes: `git commit -am 'Add feature'`
6. Push to branch: `git push origin feature-name`
7. Submit a pull request

### Code Standards

- Use TypeScript for all code
- Follow ESLint configuration
- Write unit tests for all functions
- Use structured logging
- Document all public APIs

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:

1. Check the troubleshooting section above
2. Review CloudWatch logs and metrics
3. Use the monitoring scripts for diagnostics
4. Create an issue in the repository

## Changelog

### Version 1.0.1
- Fixed CDK version compatibility issues
- Resolved test mock configuration problems
- Updated deployment script to handle test failures gracefully
- Improved error handling and debugging information

### Version 1.0.0
- Initial release with URL redirection and tracking
- Analytics API with query and aggregation endpoints
- Comprehensive monitoring and alerting
- Security features with WAF protection
- Operational scripts for monitoring and maintenance