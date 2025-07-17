# Implementation Plan

- [x] 1. Set up project structure and core interfaces
  - Create directory structure for Lambda functions, shared utilities, and infrastructure code
  - Define TypeScript interfaces for data models and API contracts
  - Set up package.json with required dependencies for Node.js Lambda functions
  - _Requirements: 5.1, 5.2_

- [x] 2. Implement URL validation utilities
  - Create URL validation function that checks for valid format and allowed domains (amazonaws.cn, amazonaws.com, amazon.com)
  - Implement source attribution validation for EdgeUp prefix pattern
  - Write unit tests for URL validation edge cases and domain restrictions
  - _Requirements: 1.3, 1.4, 4.3_

- [x] 3. Create DynamoDB data access layer
  - Implement DynamoDB client configuration for AWS Tokyo (ap-northeast-1) region
  - Create functions for writing tracking events to DynamoDB table
  - Implement error handling and retry logic for DynamoDB operations
  - Write unit tests for DynamoDB operations and error scenarios
  - _Requirements: 2.2, 2.3_

- [x] 4. Implement core redirection Lambda function
  - Create main Lambda handler that processes API Gateway events
  - Implement synchronous URL redirection with proper HTTP status codes
  - Add request parsing for query parameters (url, sa) and client IP extraction
  - Integrate URL validation and return appropriate error responses
  - Write unit tests for Lambda handler with various input scenarios
  - _Requirements: 1.1, 1.2, 1.5, 4.4_

- [x] 5. Add asynchronous tracking functionality
  - Implement tracking event creation with timestamp formatting
  - Add asynchronous DynamoDB write operations to avoid blocking redirects
  - Create tracking data structure with all required fields (tracking_id, timestamps, IP, etc.)
  - Write unit tests for tracking event generation and async processing
  - _Requirements: 2.1, 2.4_

- [x] 6. Create analytics Lambda function
  - Implement Lambda function for querying and aggregating tracking data
  - Add DynamoDB query operations using GSI indexes for efficient data retrieval
  - Create filtering and sorting functionality for analytics queries
  - Implement aggregation logic for statistics by source, time period, and destination
  - Write unit tests for analytics queries and aggregation functions
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 7. Set up infrastructure as code
  - Create AWS CDK stack for deploying all resources to AWS Tokyo (ap-northeast-1) region with the local profile `primary`
  - Configure API Gateway REST API with proper integration settings
  - The redirection API is public without authentication, while the analytics API is public with an API key needed.
  - Set a custom domain `www.example.com` for API, using the existing wildcard certificate in the ap-northeast-1 region or issue a new one.
  - Set up DynamoDB table with partition key, sort key, and GSI indexes
  - Configure Lambda functions with appropriate runtime, memory, and timeout settings
  - Add IAM roles and policies for Lambda functions to access DynamoDB
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 8. Implement AWS WAF security rules
  - Create WAF Web ACL with rate limiting rules (10 requests per 5-minute window)
  - Add SQL injection, known bad inputs, and XSS protection rules
  - Associate WAF with API Gateway
  - _Requirements: 4.1, 4.2_

- [x] 9. Add comprehensive error handling
  - Implement structured error responses for all validation failures
  - Add CloudWatch logging with correlation IDs for request tracing
  - Create dead letter queue for failed tracking events
  - Add retry logic with exponential backoff for DynamoDB operations
  - Write tests for error scenarios and logging functionality
  - _Requirements: 1.4, 4.3_

- [x] 10. Create integration tests
  - Write end-to-end tests for complete redirection flow
  - Test API Gateway integration with Lambda functions
  - Verify DynamoDB data persistence and retrieval
  - Test analytics API functionality with sample data
  - Create tests for error handling and edge cases
  - _Requirements: 1.1, 1.2, 2.1, 3.1_

- [x] 11. Implement monitoring and observability
  - Set up CloudWatch metrics for Lambda invocations and API Gateway requests
  - Create CloudWatch alarms for error rates and performance thresholds
  - Implement structured logging in JSON format with performance metrics
  - Add correlation IDs for request tracing across services
  - Write tests to verify logging and metrics collection
  - _Requirements: 5.4_

- [x] 12. Add load testing and performance validation
  - Create load testing scripts using Artillery.js or similar tool
  - Test system performance at 10 requests per second target
  - Verify response times stay under 300ms for redirections
  - _Requirements: 5.4_

- [x] 13. Write a comprehensive README.md
  - Introduce how to use the analytics API with detailed request examples.