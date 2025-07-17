# URL Redirection and Tracking Service

A serverless application for URL redirection with tracking capabilities, built on AWS Lambda, API Gateway, and DynamoDB.

## Overview

This service provides a simple yet powerful URL redirection mechanism with asynchronous tracking capabilities. It allows redirecting users to specified URLs while collecting tracking data for analytics purposes. The system is designed to be highly scalable, secure, and low-latency.

## Features

- **Fast URL Redirection**: Redirects users to specified URLs with minimal latency
- **Asynchronous Tracking**: Records tracking data without impacting redirection performance
- **Domain Validation**: Ensures redirects only go to allowed domains (amazonaws.cn, amazonaws.com, amazon.com)
- **Analytics API**: Query and aggregate tracking data with flexible filtering options
- **Security**: Implements AWS WAF for rate limiting and protection against common attacks
- **Monitoring**: Comprehensive CloudWatch metrics, logs, and alarms
- **Serverless Architecture**: Built entirely on AWS serverless services for minimal operational overhead

## Architecture

The application follows a serverless microservices architecture with the following key components:

- **API Gateway**: Entry point for all redirection and analytics requests
- **Lambda Functions**: Core business logic for URL validation, redirection, and analytics
- **DynamoDB**: Persistent storage for tracking data
- **AWS WAF**: Security and rate limiting
- **CloudWatch**: Monitoring, logging, and alerting

## Deployment

The application is deployed using AWS CDK to the Tokyo (ap-northeast-1) region.

### Prerequisites

- Node.js 18.x or higher
- AWS CLI configured with appropriate credentials
- AWS CDK installed globally

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Bootstrap CDK (if not already done):

```bash
npm run cdk:bootstrap
```

4. Deploy the application:

```bash
npm run deploy
```

## Usage

### URL Redirection

To redirect a user, make a GET request to the service endpoint with the following query parameters:

- `url` (required): The destination URL to redirect to (must be on allowed domains)
- `sa` (optional): Source attribution parameter (must follow EdgeUp + 3 digits format)

#### Example Redirection Request

```
GET https://www.example.com/url?sa=EdgeUp001&url=https://aws.amazon.com/cn/blogs/china/new-aws-waf-antiddos-managed-rules/
```

This will redirect the user to the specified URL and asynchronously record tracking data.

## Analytics API

The Analytics API allows querying and aggregating tracking data. All analytics endpoints require an API key for authentication.

### Getting an API Key

API keys are managed through the AWS Management Console:

1. Navigate to API Gateway in the AWS Console
2. Select the URL Redirection and Tracking API
3. Go to "API Keys" in the left navigation
4. Find the "analytics-api-key" and note its value

### API Endpoints

The Analytics API provides two main endpoints:

1. **Query Endpoint**: Retrieve tracking events with filtering and pagination
2. **Aggregate Endpoint**: Get aggregated statistics on tracking data

### Query Endpoint

The query endpoint allows retrieving tracking events with various filtering options.

#### Endpoint

```
GET https://www.example.com/analytics/query
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| start_date | ISO 8601 date string | No | Filter events after this date |
| end_date | ISO 8601 date string | No | Filter events before this date |
| source_attribution | String | No | Filter by source attribution (must follow EdgeUp + 3 digits format) |
| destination_url | String | No | Filter by destination URL (partial match) |
| limit | Number | No | Maximum number of results to return (default: 100, max: 1000) |
| sort_order | String | No | Sort order by timestamp ('asc' or 'desc', default: 'desc') |
| offset | Number | No | Pagination offset (default: 0) |

#### Example Query Requests

**1. Basic Query (Most Recent Events)**

```bash
curl -X GET "https://www.example.com/analytics/query" \
  -H "x-api-key: YOUR_API_KEY"
```

**2. Query by Date Range**

```bash
curl -X GET "https://www.example.com/analytics/query?start_date=2024-01-01T00:00:00.000Z&end_date=2024-01-31T23:59:59.999Z" \
  -H "x-api-key: YOUR_API_KEY"
```

**3. Query by Source Attribution**

```bash
curl -X GET "https://www.example.com/analytics/query?source_attribution=EdgeUp001" \
  -H "x-api-key: YOUR_API_KEY"
```

**4. Complex Query with Multiple Filters**

```bash
curl -X GET "https://www.example.com/analytics/query?source_attribution=EdgeUp001&start_date=2024-01-01T00:00:00.000Z&end_date=2024-01-31T23:59:59.999Z&limit=50&sort_order=asc" \
  -H "x-api-key: YOUR_API_KEY"
```

**5. Pagination Example**

```bash
# First page (first 100 results)
curl -X GET "https://www.example.com/analytics/query?limit=100&offset=0" \
  -H "x-api-key: YOUR_API_KEY"

# Second page (next 100 results)
curl -X GET "https://www.example.com/analytics/query?limit=100&offset=100" \
  -H "x-api-key: YOUR_API_KEY"
```

#### Example Query Response

```json
{
  "data": {
    "events": [
      {
        "tracking_id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2024-01-15T10:30:45.123Z",
        "formatted_timestamp": "2024-01-15 10:30:45",
        "source_attribution": "EdgeUp001",
        "client_ip": "192.168.1.1",
        "destination_url": "https://aws.amazon.com/cn/blogs/china/new-aws-waf-antiddos-managed-rules/"
      },
      {
        "tracking_id": "550e8400-e29b-41d4-a716-446655440001",
        "timestamp": "2024-01-15T10:28:30.456Z",
        "formatted_timestamp": "2024-01-15 10:28:30",
        "source_attribution": "EdgeUp002",
        "client_ip": "192.168.1.2",
        "destination_url": "https://aws.amazon.com/cn/blogs/china/aws-lambda-function-urls/"
      }
      // Additional events...
    ],
    "total_count": 150,
    "has_more": true
  },
  "timestamp": "2024-01-16T08:45:30.123Z"
}
```

### Aggregate Endpoint

The aggregate endpoint provides aggregated statistics on tracking data.

#### Endpoint

```
GET https://www.example.com/analytics/aggregate
```

#### Query Parameters

The aggregate endpoint accepts the same filtering parameters as the query endpoint:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| start_date | ISO 8601 date string | No | Filter events after this date |
| end_date | ISO 8601 date string | No | Filter events before this date |
| source_attribution | String | No | Filter by source attribution |
| destination_url | String | No | Filter by destination URL (partial match) |

#### Example Aggregate Requests

**1. Basic Aggregation (All Data)**

```bash
curl -X GET "https://www.example.com/analytics/aggregate" \
  -H "x-api-key: YOUR_API_KEY"
```

**2. Aggregation by Date Range**

```bash
curl -X GET "https://www.example.com/analytics/aggregate?start_date=2024-01-01T00:00:00.000Z&end_date=2024-01-31T23:59:59.999Z" \
  -H "x-api-key: YOUR_API_KEY"
```

**3. Aggregation for Specific Source**

```bash
curl -X GET "https://www.example.com/analytics/aggregate?source_attribution=EdgeUp001" \
  -H "x-api-key: YOUR_API_KEY"
```

#### Example Aggregate Response

```json
{
  "data": [
    {
      "source_attribution": "EdgeUp001",
      "count": 120,
      "unique_ips": 45,
      "destinations": [
        "https://aws.amazon.com/cn/blogs/china/new-aws-waf-antiddos-managed-rules/",
        "https://aws.amazon.com/cn/blogs/china/aws-lambda-function-urls/"
      ]
    },
    {
      "source_attribution": "EdgeUp002",
      "count": 85,
      "unique_ips": 32,
      "destinations": [
        "https://aws.amazon.com/cn/blogs/china/aws-lambda-function-urls/",
        "https://aws.amazon.com/cn/blogs/china/serverless-applications/"
      ]
    },
    {
      "source_attribution": "EdgeUp003",
      "count": 65,
      "unique_ips": 28,
      "destinations": [
        "https://aws.amazon.com/cn/blogs/china/dynamodb-best-practices/"
      ]
    }
  ],
  "timestamp": "2024-01-16T08:45:30.123Z"
}
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

### Common Error Codes

| Status Code | Description | Possible Causes |
|-------------|-------------|----------------|
| 400 | Bad Request | Invalid URL format, invalid domain, missing required parameters |
| 401 | Unauthorized | Missing or invalid API key for analytics endpoints |
| 403 | Forbidden | Rate limit exceeded |
| 404 | Not Found | Endpoint not found |
| 500 | Internal Server Error | Server-side error |

### Example Error Response

```json
{
  "error": "Invalid endpoint",
  "timestamp": "2024-01-16T08:45:30.123Z",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "error_code": "INVALID_ENDPOINT"
}
```

## Best Practices

### Querying Analytics Data

1. **Use Specific Filters**: Narrow down your queries with specific date ranges or source attributions for better performance
2. **Pagination**: Use the `limit` and `offset` parameters for large result sets
3. **Date Ranges**: Always provide both `start_date` and `end_date` for time-based queries
4. **Sorting**: Use `sort_order=asc` for chronological order or `sort_order=desc` (default) for most recent first

### Performance Considerations

1. **Query Optimization**: Queries with source attribution are more efficient than date range queries
2. **Result Limits**: Keep result limits reasonable (under 500) for better performance
3. **Aggregation**: Use the aggregate endpoint for summary statistics instead of fetching all events
4. **Rate Limiting**: The API is rate-limited to 10 requests per 5-minute window per IP address

## Monitoring and Troubleshooting

The service includes comprehensive monitoring through CloudWatch:

- **CloudWatch Dashboard**: A dedicated dashboard for monitoring service metrics
- **CloudWatch Logs**: Structured logs with correlation IDs for request tracing
- **CloudWatch Alarms**: Configured alarms for error rates and performance thresholds

### Key Metrics

- **Lambda Invocations**: Number of function invocations
- **Lambda Errors**: Error count for Lambda functions
- **Lambda Duration**: Execution time for Lambda functions
- **API Gateway Requests**: Number of API requests
- **API Gateway Latency**: Response time for API requests
- **DynamoDB Read/Write Capacity**: Consumed capacity units
- **WAF Blocked Requests**: Number of requests blocked by WAF

## Load Testing

The service includes load testing scripts to validate performance requirements. See the [load testing documentation](src/load-tests/README.md) for details.

## Security

The service implements several security measures:

- **AWS WAF**: Protection against common web exploits and rate limiting
- **Input Validation**: Strict validation of all input parameters
- **API Key Authentication**: Required for analytics endpoints
- **Domain Restrictions**: Redirects only allowed to specific domains

## License

MIT