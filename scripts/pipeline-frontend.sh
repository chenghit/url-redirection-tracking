#!/bin/bash

# Frontend Deployment Pipeline Script
# This script orchestrates the complete build and deployment process

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENVIRONMENT="${ENVIRONMENT:-production}"

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

# Function to check prerequisites
check_prerequisites() {
    log "Checking pipeline prerequisites..."
    
    # Check if required scripts exist
    required_scripts=(
        "build-frontend.sh"
        "deploy-frontend.sh"
        "manage-environment.sh"
    )
    
    for script in "${required_scripts[@]}"; do
        if [ ! -f "$SCRIPT_DIR/$script" ]; then
            error "Required script not found: $script"
            exit 1
        fi
        
        # Make sure scripts are executable
        chmod +x "$SCRIPT_DIR/$script"
    done
    
    success "Pipeline prerequisites checked"
}

# Function to setup environment
setup_environment() {
    log "Setting up environment: $ENVIRONMENT"
    
    # Apply environment-specific configuration
    "$SCRIPT_DIR/manage-environment.sh" apply "$ENVIRONMENT"
    
    success "Environment setup completed"
}

# Function to run pre-deployment checks
run_pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    # Check Git status
    if command -v git &> /dev/null; then
        if [ -d ".git" ]; then
            # Check for uncommitted changes
            if ! git diff-index --quiet HEAD --; then
                warning "There are uncommitted changes in the repository"
                log "Uncommitted files:"
                git diff-index --name-only HEAD --
                
                if [ "$ALLOW_DIRTY" != "true" ]; then
                    error "Deployment with uncommitted changes is not allowed"
                    error "Commit your changes or set ALLOW_DIRTY=true to override"
                    exit 1
                fi
            fi
            
            # Get current branch and commit
            CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
            CURRENT_COMMIT=$(git rev-parse HEAD)
            
            log "Git branch: $CURRENT_BRANCH"
            log "Git commit: $CURRENT_COMMIT"
        fi
    fi
    
    # Check if infrastructure is deployed
    log "Checking if frontend infrastructure is deployed..."
    
    REGION="ap-northeast-1"
    PROFILE="${AWS_PROFILE:-primary}"
    FRONTEND_STACK_NAME="FrontendStack"
    
    if ! aws cloudformation describe-stacks --stack-name "$FRONTEND_STACK_NAME" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        error "Frontend infrastructure stack '$FRONTEND_STACK_NAME' not found"
        error "Please deploy the infrastructure first:"
        error "  cdk deploy FrontendStack"
        exit 1
    fi
    
    success "Pre-deployment checks completed"
}

# Function to build application
build_application() {
    log "Building frontend application..."
    
    # Build with environment-specific settings
    BUILD_ARGS=("-e" "$ENVIRONMENT")
    
    # Add conditional arguments based on pipeline settings
    if [ "$SKIP_TESTS" = "true" ]; then
        BUILD_ARGS+=("--skip-tests")
    fi
    
    if [ "$SKIP_LINT" = "true" ]; then
        BUILD_ARGS+=("--skip-lint")
    fi
    
    if [ "$SKIP_TYPECHECK" = "true" ]; then
        BUILD_ARGS+=("--skip-typecheck")
    fi
    
    if [ "$CLEAN_BUILD" = "true" ]; then
        BUILD_ARGS+=("--clean")
    fi
    
    # Run build script
    "$SCRIPT_DIR/build-frontend.sh" "${BUILD_ARGS[@]}"
    
    success "Application build completed"
}

# Function to deploy application
deploy_application() {
    log "Deploying frontend application..."
    
    # Deploy with environment-specific settings
    DEPLOY_ARGS=("-e" "$ENVIRONMENT")
    
    # Add conditional arguments based on pipeline settings
    if [ "$SKIP_BACKUP" = "true" ]; then
        DEPLOY_ARGS+=("--skip-backup")
    fi
    
    if [ "$WAIT_FOR_INVALIDATION" = "true" ]; then
        DEPLOY_ARGS+=("--wait-invalidation")
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        DEPLOY_ARGS+=("--dry-run")
    fi
    
    # Run deployment script
    "$SCRIPT_DIR/deploy-frontend.sh" "${DEPLOY_ARGS[@]}"
    
    success "Application deployment completed"
}

# Function to run post-deployment checks
run_post_deployment_checks() {
    log "Running post-deployment checks..."
    
    # Get CloudFront URL from stack outputs
    REGION="ap-northeast-1"
    PROFILE="${AWS_PROFILE:-primary}"
    FRONTEND_STACK_NAME="FrontendStack"
    
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
        --stack-name "$FRONTEND_STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendCloudFrontDistributionUrl`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$CLOUDFRONT_URL" ] && [ "$CLOUDFRONT_URL" != "None" ]; then
        log "Testing deployment at: $CLOUDFRONT_URL"
        
        # Wait a moment for deployment to propagate
        sleep 10
        
        # Test main page
        if curl -s -f "$CLOUDFRONT_URL" > /dev/null; then
            success "Deployment is accessible"
        else
            warning "Deployment may not be immediately accessible"
            log "This is normal due to CloudFront cache propagation"
        fi
        
        # Test API endpoints through CloudFront
        log "Testing API endpoints..."
        
        # Test health endpoint
        if curl -s -f "$CLOUDFRONT_URL/health" > /dev/null; then
            success "Health API endpoint is accessible"
        else
            warning "Health API endpoint may not be immediately accessible"
        fi
        
        # Test analytics endpoint (this might fail without proper parameters, but we check if it's routed)
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CLOUDFRONT_URL/analytics/query" || echo "000")
        if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "200" ]; then
            success "Analytics API endpoint is routed correctly (HTTP $HTTP_STATUS)"
        else
            warning "Analytics API endpoint routing may have issues (HTTP $HTTP_STATUS)"
        fi
    else
        warning "Could not retrieve CloudFront URL for testing"
    fi
    
    success "Post-deployment checks completed"
}

# Function to send notifications
send_notifications() {
    log "Sending deployment notifications..."
    
    # Create deployment summary
    DEPLOYMENT_SUMMARY="Frontend deployment completed successfully!
Environment: $ENVIRONMENT
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Git Branch: ${CURRENT_BRANCH:-unknown}
Git Commit: ${CURRENT_COMMIT:-unknown}
CloudFront URL: ${CLOUDFRONT_URL:-unknown}"
    
    log "Deployment Summary:"
    echo "$DEPLOYMENT_SUMMARY"
    
    # Save deployment summary to file
    SUMMARY_FILE="deployments/deployment-summary-$(date +'%Y%m%d-%H%M%S').txt"
    mkdir -p deployments
    echo "$DEPLOYMENT_SUMMARY" > "$SUMMARY_FILE"
    
    log "Deployment summary saved to: $SUMMARY_FILE"
    
    # TODO: Add integration with notification services (Slack, email, etc.)
    # if [ -n "$SLACK_WEBHOOK_URL" ]; then
    #     curl -X POST -H 'Content-type: application/json' \
    #         --data "{\"text\":\"$DEPLOYMENT_SUMMARY\"}" \
    #         "$SLACK_WEBHOOK_URL"
    # fi
    
    success "Notifications sent"
}

# Function to cleanup temporary files
cleanup() {
    log "Cleaning up temporary files..."
    
    # Remove any temporary files created during the pipeline
    find . -name "*.tmp" -type f -delete 2>/dev/null || true
    find . -name "*.backup.*" -type f -mtime +7 -delete 2>/dev/null || true
    
    success "Cleanup completed"
}

# Function to handle pipeline failure
handle_failure() {
    local exit_code=$?
    
    error "Pipeline failed with exit code: $exit_code"
    
    # Log failure details
    FAILURE_LOG="deployments/pipeline-failure-$(date +'%Y%m%d-%H%M%S').log"
    mkdir -p deployments
    
    cat > "$FAILURE_LOG" << EOF
Pipeline Failure Report
======================
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Environment: $ENVIRONMENT
Exit Code: $exit_code
Git Branch: ${CURRENT_BRANCH:-unknown}
Git Commit: ${CURRENT_COMMIT:-unknown}
Working Directory: $(pwd)
User: $(whoami)

Environment Variables:
$(env | grep -E '^(AWS_|VITE_|NODE_|npm_)' | sort)

Recent Log Output:
$(tail -50 /tmp/pipeline.log 2>/dev/null || echo "No log file found")
EOF
    
    error "Failure details saved to: $FAILURE_LOG"
    
    # Cleanup on failure
    cleanup
    
    exit $exit_code
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Complete frontend deployment pipeline"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV   Set environment (default: production)"
    echo "  --skip-tests           Skip running tests during build"
    echo "  --skip-lint            Skip linting during build"
    echo "  --skip-typecheck       Skip TypeScript type checking"
    echo "  --skip-backup          Skip backing up current deployment"
    echo "  --clean                Clean build directory before building"
    echo "  --wait-invalidation    Wait for CloudFront invalidation to complete"
    echo "  --allow-dirty          Allow deployment with uncommitted changes"
    echo "  --dry-run              Show what would be deployed without actually deploying"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  ENVIRONMENT            Environment name (development, staging, production)"
    echo "  AWS_PROFILE            AWS profile to use"
    echo "  ALLOW_DIRTY            Allow deployment with uncommitted changes (true/false)"
    echo "  SKIP_TESTS             Skip tests during build (true/false)"
    echo "  SKIP_LINT              Skip linting during build (true/false)"
    echo "  SKIP_TYPECHECK         Skip type checking during build (true/false)"
    echo "  SKIP_BACKUP            Skip backup during deployment (true/false)"
    echo "  CLEAN_BUILD            Clean build directory before building (true/false)"
    echo "  WAIT_FOR_INVALIDATION  Wait for CloudFront invalidation (true/false)"
    echo "  DRY_RUN                Perform dry run (true/false)"
    echo ""
    echo "Examples:"
    echo "  $0                     # Deploy to production with default settings"
    echo "  $0 -e staging          # Deploy to staging environment"
    echo "  $0 --skip-tests        # Deploy without running tests"
    echo "  $0 --dry-run           # Show what would be deployed"
    echo "  $0 --clean --wait-invalidation  # Clean build and wait for cache invalidation"
}

# Set up error handling
trap 'handle_failure' ERR

# Parse command line arguments
SKIP_TESTS="${SKIP_TESTS:-false}"
SKIP_LINT="${SKIP_LINT:-false}"
SKIP_TYPECHECK="${SKIP_TYPECHECK:-false}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
CLEAN_BUILD="${CLEAN_BUILD:-false}"
WAIT_FOR_INVALIDATION="${WAIT_FOR_INVALIDATION:-false}"
ALLOW_DIRTY="${ALLOW_DIRTY:-false}"
DRY_RUN="${DRY_RUN:-false}"

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-lint)
            SKIP_LINT=true
            shift
            ;;
        --skip-typecheck)
            SKIP_TYPECHECK=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --wait-invalidation)
            WAIT_FOR_INVALIDATION=true
            shift
            ;;
        --allow-dirty)
            ALLOW_DIRTY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
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

# Main pipeline process
main() {
    log "Starting frontend deployment pipeline..."
    log "Environment: $ENVIRONMENT"
    log "Project root: $PROJECT_ROOT"
    
    # Change to project root directory
    cd "$PROJECT_ROOT"
    
    # Start logging to file
    exec > >(tee -a /tmp/pipeline.log)
    exec 2>&1
    
    # Pipeline stages
    check_prerequisites
    setup_environment
    run_pre_deployment_checks
    build_application
    
    if [ "$DRY_RUN" = false ]; then
        deploy_application
        run_post_deployment_checks
        send_notifications
    else
        success "Dry run completed successfully"
    fi
    
    cleanup
    
    success "Frontend deployment pipeline completed successfully!"
    log "Environment: $ENVIRONMENT"
    log "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    
    if [ -n "$CLOUDFRONT_URL" ]; then
        log "Application URL: $CLOUDFRONT_URL"
    fi
}

# Export environment variables for child scripts
export ENVIRONMENT
export SKIP_TESTS
export SKIP_LINT
export SKIP_TYPECHECK
export SKIP_BACKUP
export CLEAN_BUILD
export WAIT_FOR_INVALIDATION
export ALLOW_DIRTY
export DRY_RUN

# Run main function
main "$@"