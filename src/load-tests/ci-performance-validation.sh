#!/bin/bash

# CI/CD Performance Validation Script
# This script runs load tests and validates that performance requirements are met
# It's designed to be used in CI/CD pipelines

# Set error handling
set -e

# Print header
echo "========================================"
echo "URL Redirection Performance Validation"
echo "========================================"
echo "Target: 10 RPS with response times < 300ms"
echo "Starting validation at $(date)"
echo ""

# Check if Artillery is installed
if ! command -v artillery &> /dev/null; then
    echo "Error: Artillery is not installed. Please run 'npm install -g artillery' first."
    exit 1
fi

# Set environment variables
export NODE_ENV=production

# Default to production environment if not specified
ENVIRONMENT=${1:-production}
echo "Using environment: $ENVIRONMENT"

# Check if API_URL is set
if [ -z "$API_URL" ]; then
    # Use the environment-specific URL from config if API_URL is not set
    if [ "$ENVIRONMENT" == "production" ]; then
        export API_URL="https://www.example.com"
        echo "Using production API URL: $API_URL"
    elif [ "$ENVIRONMENT" == "development" ]; then
        export API_URL="http://localhost:3000"
        echo "Using development API URL: $API_URL"
    else
        echo "Error: Unknown environment '$ENVIRONMENT' and no API_URL provided."
        exit 1
    fi
else
    echo "Using provided API URL: $API_URL"
fi

# Create output directory if it doesn't exist
mkdir -p ./load-test-results

# Generate timestamp for unique filenames
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RESULTS_FILE="./load-test-results/load-test-results-${TIMESTAMP}.json"
REPORT_FILE="./load-test-results/load-test-report-${TIMESTAMP}.html"
LOG_FILE="./load-test-results/load-test-log-${TIMESTAMP}.txt"

echo "Running load test..."
echo "This will take approximately 5 minutes to complete..."
echo "Results will be saved to: $RESULTS_FILE"
echo "Logs will be saved to: $LOG_FILE"

# Run load test with Artillery
artillery run \
    --output "$RESULTS_FILE" \
    --environment "$ENVIRONMENT" \
    src/load-tests/load-test-config.yml 2>&1 | tee "$LOG_FILE"

# Check if the test completed successfully
ARTILLERY_EXIT_CODE=${PIPESTATUS[0]}
if [ $ARTILLERY_EXIT_CODE -ne 0 ]; then
    echo "Error: Load test failed to complete with exit code $ARTILLERY_EXIT_CODE."
    echo "Check the log file for details: $LOG_FILE"
    exit 1
fi

echo "Load test completed. Generating report..."

# Generate HTML report
artillery report \
    --output "$REPORT_FILE" \
    "$RESULTS_FILE"

if [ $? -ne 0 ]; then
    echo "Warning: Failed to generate HTML report. Continuing with analysis..."
else
    echo "HTML report generated at $REPORT_FILE"
fi

echo ""

# Analyze results
echo "Analyzing performance results..."
node src/load-tests/analyze-results.js "$RESULTS_FILE"

# Store the exit code from the analysis
ANALYSIS_RESULT=$?

# Create a summary file with key information
SUMMARY_FILE="./load-test-results/load-test-summary-${TIMESTAMP}.txt"
{
    echo "URL Redirection Performance Test Summary"
    echo "========================================"
    echo "Date: $(date)"
    echo "Environment: $ENVIRONMENT"
    echo "API URL: $API_URL"
    echo "Results File: $RESULTS_FILE"
    echo "Report File: $REPORT_FILE"
    echo "Log File: $LOG_FILE"
    echo ""
    echo "Performance Requirements:"
    echo "- Target RPS: 10 requests per second"
    echo "- Response Time: < 300ms"
    echo "- P95: < 250ms"
    echo "- P99: < 280ms"
    echo "- Error Rate: < 5%"
    echo ""
    echo "Result: $([ $ANALYSIS_RESULT -eq 0 ] && echo "PASS" || echo "FAIL")"
    echo ""
    echo "For detailed analysis, see the HTML report and log files."
} > "$SUMMARY_FILE"

echo "Summary saved to: $SUMMARY_FILE"
echo ""
echo "Performance validation completed at $(date)"

if [ $ANALYSIS_RESULT -eq 0 ]; then
    echo "✅ Performance requirements met!"
    exit 0
else
    echo "❌ Performance requirements not met!"
    exit 1
fi