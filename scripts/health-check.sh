#!/bin/bash

# Deployment Health Check Script
# This script performs health checks on deployed frontend applications

set -e  # Exit on any error

# Configuration
REGION="ap-northeast-1"
PROFILE="${AWS_PROFILE:-primary}"
ENVIRONMENT="${ENVIRONMENT:-production}"
TIMEOUT="${TIMEOUT:-60}"
RETRY_COUNT="${RETRY_COUNT:-3}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to get CloudFront URL
get_cloudfront_url() {
    local stack_name="FrontendStack"
    if [ "$ENVIRONMENT" != "production" ]; then
        stack_name="FrontendStack-${ENVIRONMENT^}"
    fi
    
    log "Getting CloudFront URL from stack: $stack_name"
    
    local url=$(aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendCloudFrontDistributionUrl`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$url" ] || [ "$url" = "None" ]; then
        error "Could not retrieve CloudFront URL from stack outputs"
        return 1
    fi
    
    echo "$url"
}

# Function to test URL with retries
test_url() {
    local url="$1"
    local description="$2"
    local expected_status="${3:-200}"
    local retry_count="$RETRY_COUNT"
    
    log "Testing $description: $url"
    
    for i in $(seq 1 $retry_count); do
        local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        
        if [ "$status" = "$expected_status" ]; then
            success "$description is accessible (HTTP $status)"
            return 0
        elif [ "$status" = "400" ] || [ "$status" = "401" ]; then
            # These are acceptable for API endpoints (means routing works)
            success "$description is routed correctly (HTTP $status)"
            return 0
        else
            if [ $i -lt $retry_count ]; then
                warning "$description returned HTTP $status, retrying in 10 seconds... (attempt $i/$retry_count)"
                sleep 10
            else
                error "$description failed with HTTP $status after $retry_count attempts"
                return 1
            fi
        fi
    done
}

# Function to test page content
test_page_content() {
    local url="$1"
    local description="$2"
    
    log "Testing $description content"
    
    local content=$(curl -s "$url" 2>/dev/null || echo "")
    
    if echo "$content" | grep -q "<title>"; then
        success "$description contains valid HTML content"
        return 0
    else
        error "$description does not contain valid HTML content"
        return 1
    fi
}

# Function to run comprehensive health checks
run_health_checks() {
    local cloudfront_url="$1"
    local failed_checks=0
    
    log "Starting comprehensive health checks for $ENVIRONMENT environment"
    log "CloudFront URL: $cloudfront_url"
    
    # Test main page
    if test_url "$cloudfront_url" "Main page"; then
        test_page_content "$cloudfront_url" "Main page"
    else
        ((failed_checks++))
    fi
    
    # Test health endpoint
    if ! test_url "$cloudfront_url/health" "Health API endpoint"; then
        ((failed_checks++))
    fi
    
    # Test analytics endpoint routing
    if ! test_url "$cloudfront_url/analytics/query" "Analytics API endpoint" "400"; then
        ((failed_checks++))
    fi
    
    # Test static assets
    if ! test_url "$cloudfront_url/vite.svg" "Static assets"; then
        ((failed_checks++))
    fi
    
    # Test 404 handling
    if ! test_url "$cloudfront_url/non-existent-page" "404 handling" "200"; then
        warning "404 handling may not be configured (SPA routing)"
    fi
    
    return $failed_checks
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Perform health checks on deployed frontend application"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV   Environment to check (default: production)"
    echo "  -p, --profile PROFILE   AWS profile to use (default: primary)"
    echo "  -r, --region REGION     AWS region (default: ap-northeast-1)"
    echo "  -t, --timeout TIMEOUT   Timeout in seconds (default: 60)"
    echo "  --retry-count COUNT     Number of retries (default: 3)"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE             AWS profile to use"
    echo "  ENVIRONMENT             Environment name"
    echo "  TIMEOUT                 Timeout in seconds"
    echo "  RETRY_COUNT             Number of retries"
    echo ""
    echo "Examples:"
    echo "  $0                      # Check production environment"
    echo "  $0 -e staging           # Check staging environment"
    echo "  $0 --retry-count 5      # Use 5 retries"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --retry-count)
            RETRY_COUNT="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main health check process
main() {
    log "Starting health check for $ENVIRONMENT environment"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    log "Timeout: ${TIMEOUT}s"
    log "Retry count: $RETRY_COUNT"
    
    # Get CloudFront URL
    local cloudfront_url
    if ! cloudfront_url=$(get_cloudfront_url); then
        error "Failed to get CloudFront URL"
        exit 1
    fi
    
    # Wait for deployment to propagate
    log "Waiting 30 seconds for deployment to propagate..."
    sleep 30
    
    # Run health checks
    local failed_checks=0
    if ! run_health_checks "$cloudfront_url"; then
        failed_checks=$?
    fi
    
    # Summary
    if [ $failed_checks -eq 0 ]; then
        success "All health checks passed for $ENVIRONMENT environment"
        log "Application URL: $cloudfront_url"
        exit 0
    else
        error "$failed_checks health check(s) failed for $ENVIRONMENT environment"
        log "Application URL: $cloudfront_url"
        exit 1
    fi
}

# Run main function
main "$@"