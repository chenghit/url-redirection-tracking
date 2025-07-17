# Requirements Document

## Introduction

This document outlines the requirements for a serverless URL redirection and tracking application hosted on AWS. The application will receive requests with a destination URL as a query parameter, redirect users to that destination, and asynchronously record tracking data including source identifier, timestamp, and client IP. The system will be built using serverless AWS services to ensure scalability and minimal maintenance overhead.

## Requirements

### Requirement 1: URL Redirection

**User Story:** As a service provider, I want to redirect users to specified URLs while tracking their access, so that I can analyze traffic patterns without impacting user experience.

#### Acceptance Criteria

1. WHEN a user accesses the endpoint with a valid URL query parameter THEN the system SHALL redirect the user to the specified destination URL.
2. WHEN redirecting a user THEN the system SHALL ensure no additional latency is introduced by the tracking mechanism.
3. WHEN a URL is provided THEN the system SHALL validate that it points to `amazonaws.cn`, `amazonaws.com`, or `amazon.com` domains.
4. WHEN a URL is invalid or improperly formatted THEN the system SHALL return a 400 error response.
5. WHEN a user is redirected THEN the system SHALL use an appropriate HTTP redirect status code (e.g., 302).

### Requirement 2: Access Tracking

**User Story:** As a service provider, I want to track access to my redirection service, so that I can analyze usage patterns and source attribution.

#### Acceptance Criteria

1. WHEN a redirection occurs THEN the system SHALL asynchronously record the following data:
   - Source attribution parameter (`sa` query parameter)
   - Timestamp of the request in the format of "yyyy-MM-dd HH:mm:ss" in the UTC+8 timezone.
   - Client IP address (from X-Forwarded-For header when available)
2. WHEN tracking data is recorded THEN the system SHALL store it in a persistent database.
3. WHEN storing tracking data THEN the system SHALL ensure the storage solution can retain data permanently.
4. WHEN recording tracking data THEN the system SHALL handle the process asynchronously to avoid adding latency to the user experience.

### Requirement 3: Analytics and Reporting

**User Story:** As a service provider, I want to access analytics and reports on the redirection usage, so that I can understand traffic patterns and source effectiveness.

#### Acceptance Criteria

1. WHEN authorized users access the analytics feature THEN the system SHALL provide access to stored tracking data.
2. WHEN viewing analytics THEN the system SHALL allow filtering and sorting of tracking data.
3. WHEN generating reports THEN the system SHALL provide aggregated statistics on redirections by source, time period, and destination.

### Requirement 4: Security and Rate Limiting

**User Story:** As a service provider, I want to ensure the redirection service is secure and protected from abuse, so that it remains reliable and available for legitimate use.

#### Acceptance Criteria

1. WHEN the service is deployed THEN the system SHALL implement rate limiting using AWS WAF in the Tokyo (ap-northeast-1) region.
2. WHEN a request exceeds rate limits THEN the system SHALL return an appropriate error response.
3. WHEN processing URLs THEN the system SHALL validate and sanitize all input parameters to prevent injection attacks.
4. WHEN receiving a request THEN the system SHALL only accept and process the required query parameters.

### Requirement 5: Serverless Architecture

**User Story:** As a service provider, I want the application to use serverless AWS services, so that I can minimize operational overhead and ensure scalability.

#### Acceptance Criteria

1. WHEN the application is deployed THEN the system SHALL use AWS API Gateway REST API for request handling.
2. WHEN processing redirections THEN the system SHALL use AWS Lambda for business logic.
3. WHEN storing tracking data THEN the system SHALL use AWS DynamoDB or another appropriate serverless database.
4. WHEN the application experiences traffic spikes THEN the system SHALL scale automatically to handle up to 10 requests per second.
5. WHEN deploying the application THEN the system SHALL be configured for the AWS Tokyo (ap-northeast-1) region.
6. WHEN deploying the application THEN the system SHALL NOT use Amazon CloudFront or any other CDN service.