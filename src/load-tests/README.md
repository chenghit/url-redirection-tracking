# URL Redirection Load Testing

This directory contains load testing scripts and configuration for the URL Redirection and Tracking service. The load tests are designed to validate that the system meets the performance requirements specified in the requirements document.

## Performance Requirements

- Handle up to 10 requests per second
- Maintain response times under 300ms for redirections
- Scale automatically to handle traffic spikes

## Load Testing Tools

We use [Artillery.js](https://artillery.io/) for load testing, which is a modern, powerful, and easy-to-use load testing toolkit.

## Test Scenarios

The load tests include the following scenarios:

1. **URL Redirection Flow** (80% of traffic)
   - Tests the main redirection functionality with valid URLs and source attribution
   - Verifies response times are under the 300ms threshold

2. **Error Handling Scenarios** (20% of traffic)
   - Invalid URL format (7%)
   - Invalid domain (non-allowed domains) (7%)
   - Invalid source attribution (6%)

## Running Load Tests

Several npm scripts are available to run load tests:

```bash
# Run load test with default configuration
npm run load-test

# Run load test against production environment
npm run load-test:prod

# Run load test against development environment
npm run load-test:dev

# Run load test and generate HTML report
npm run load-test:report

# Run a quick load test with fewer virtual users
npm run load-test:quick

# Run load test and analyze results against performance requirements
npm run load-test:analyze

# Run load test validation for CI/CD pipelines
npm run load-test:ci
```

## Test Configuration

The load test configuration is defined in `load-test-config.yml` and includes:

- **Warm-up phase**: Gradually increases from 1 to 10 requests per second over 60 seconds
- **Sustained load phase**: Maintains 10 requests per second for 180 seconds
- **Cool-down phase**: Gradually decreases from 10 to 1 requests per second over 30 seconds

### Configuration Files

- **load-test-config.yml**: Main Artillery configuration file defining test phases, scenarios, and performance requirements
- **load-test-processor.js**: JavaScript module with custom functions for Artillery to generate test data and validate responses
- **analyze-results.js**: Script to analyze test results and validate against performance requirements
- **ci-performance-validation.sh**: Shell script for running load tests in CI/CD pipelines

## Performance Metrics

The load tests collect and report the following metrics:

- **Response times**: min, max, average, median (p50), 95th percentile (p95), 99th percentile (p99)
- **Request counts**: total, successful, failed
- **Threshold compliance**: percentage of requests within the 300ms threshold
- **Error rates**: percentage of requests that resulted in errors
- **Response time distribution**: breakdown of response times in buckets (0-50ms, 51-100ms, etc.)
- **Scenario breakdown**: distribution of requests across different test scenarios

## Interpreting Results

After running a load test, a performance report will be displayed in the console. For more detailed analysis, use the HTML report generated with the `load-test:report` command.

A successful load test should show:

- Response times consistently under 300ms
- 95th percentile (p95) under 250ms
- 99th percentile (p99) under 280ms
- Error rate below 5%
- At least 95% of requests within the 300ms threshold

### Sample Output

The analysis script provides a detailed breakdown of test results:

```
========== LOAD TEST RESULTS ANALYSIS ==========

Test Configuration:
- Test Duration: 270 seconds
- Phases: 3
  1. Warm up phase - gradually increase to 10 RPS: 60s at 1 RPS ramping to 10 RPS
  2. Sustained load - maintain 10 RPS for 3 minutes: 180s at 10 RPS
  3. Cool down phase - gradually decrease from 10 RPS: 30s at 10 RPS ramping to 1 RPS

Test Summary:
- Total Requests: 2000
- Completed Requests: 1998
- Failed Requests: 2
- Error Rate: 0.10% ✓
- Average RPS: 10.05 req/sec ✓

Scenario Breakdown:
- URL Redirection Flow: 1600 requests (80.0%)
- Error Handling - Invalid URL: 140 requests (7.0%)
- Error Handling - Invalid Domain: 140 requests (7.0%)
- Error Handling - Invalid Source Attribution: 120 requests (6.0%)

Response Time Metrics:
- Median (P50): 45.20 ms
- Mean: 52.35 ms
- 95th Percentile (P95): 125.40 ms ✓
- 99th Percentile (P99): 185.60 ms ✓
- Min: 22.10 ms
- Max: 278.50 ms

Response Time Distribution:
- 0-50ms:     ████████████████████████████████████ 1250 (62.5%)
- 51-100ms:   ██████████████ 550 (27.5%)
- 101-200ms:  ████ 160 (8.0%)
- 201-300ms:  █ 40 (2.0%)
- 301-500ms:   0 (0.0%)
- 501ms+:      0 (0.0%)

Performance Threshold Compliance:
- Requests Within 300ms: 2000
- Requests Exceeding 300ms: 0
- Percentage Within Threshold: 100.00% ✓

Performance Targets:
- Target RPS: 10 req/sec
- Target P95: 250 ms
- Target P99: 280 ms
- Target Error Rate: <= 5%
- Target Response Time: <= 300 ms

Overall Result:
✓ PASS: All performance targets met
```

## Troubleshooting

If the load tests fail to meet performance requirements, consider:

1. Checking CloudWatch logs for errors or bottlenecks
2. Reviewing Lambda function configurations (memory, timeout)
3. Analyzing DynamoDB throughput and throttling
4. Inspecting API Gateway settings and limits
5. Looking for slow database queries or inefficient code paths
6. Checking for network latency issues between components

The analysis script will provide specific recommendations based on which performance targets were not met.

## Continuous Integration

These load tests can be integrated into CI/CD pipelines to ensure performance requirements are consistently met. The tests will fail if the performance thresholds are not met.

### CI/CD Integration

The `ci-performance-validation.sh` script is designed to be used in CI/CD pipelines. It:

1. Runs the load tests against the specified environment
2. Generates a JSON report with detailed metrics
3. Creates an HTML report for visual analysis
4. Analyzes the results against performance requirements
5. Exits with a non-zero code if any performance targets are not met

To integrate with your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow step
- name: Run performance validation
  run: npm run load-test:ci
  env:
    NODE_ENV: production
    API_URL: ${{ secrets.API_URL }}
```

### Performance Validation Reports

Performance validation reports are stored in the `./load-test-results` directory with timestamps to prevent overwriting. These reports include:

- JSON results file with raw metrics
- HTML report with visualizations and charts
- Console output with pass/fail status for each performance target
- Summary file with key information about the test run

The validation script checks the following performance targets:

- Response time: < 300ms
- 95th percentile (p95): < 250ms
- 99th percentile (p99): < 280ms
- Error rate: < 5%
- RPS: >= 10 requests per second

### Exit Codes

The CI script uses the following exit codes:

- **0**: All performance targets met
- **1**: One or more performance targets not met
- **Non-zero**: Error running the load test (configuration issue, etc.)

## Customizing Tests

To customize the load tests for different environments or requirements:

1. Modify `load-test-config.yml` to adjust test phases, scenarios, or performance targets
2. Update `load-test-processor.js` to change URL generation, validation logic, or metrics collection
3. Edit `analyze-results.js` to adjust performance thresholds or add additional metrics

## Dependencies

- Node.js 18.x or higher
- Artillery.js 2.0 or higher
- AWS SDK for JavaScript v3