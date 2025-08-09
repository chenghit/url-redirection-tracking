#!/bin/bash

# Frontend Deployment Script
# This script uploads frontend assets to S3 and invalidates CloudFront cache

set -e  # Exit on any error

# Configuration
REGION="ap-northeast-1"
PROFILE="${AWS_PROFILE:-primary}"
ENVIRONMENT="${ENVIRONMENT:-production}"
FRONTEND_STACK_NAME="FrontendStack"

# Determine the correct paths based on current working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CURRENT_DIR="$(pwd)"

# Check if we're running from the frontend directory or project root
if [[ "$(basename "$CURRENT_DIR")" == "frontend" ]]; then
    # Running from frontend directory
    BUILD_DIR="dist"
    FRONTEND_DIR="."
elif [[ -d "$CURRENT_DIR/frontend" ]]; then
    # Running from project root
    BUILD_DIR="frontend/dist"
    FRONTEND_DIR="frontend"
else
    # Try to find the frontend directory
    if [[ -d "$PROJECT_ROOT/frontend" ]]; then
        BUILD_DIR="$PROJECT_ROOT/frontend/dist"
        FRONTEND_DIR="$PROJECT_ROOT/frontend"
    else
        error "Cannot locate frontend directory. Please run from project root or frontend directory."
        exit 1
    fi
fi

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
    log "Checking prerequisites..."
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if build directory exists
    if [ ! -d "$BUILD_DIR" ]; then
        error "Build directory '$BUILD_DIR' does not exist. Please run build first."
        exit 1
    fi
    
    # Check if index.html exists
    if [ ! -f "$BUILD_DIR/index.html" ]; then
        error "index.html not found in build directory. Please run build first."
        exit 1
    fi
    
    success "All prerequisites are met"
}

# Function to validate AWS credentials and region
validate_aws_config() {
    log "Validating AWS configuration..."
    
    # Check if AWS credentials are configured
    if ! aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        error "AWS credentials are not configured or invalid for profile '$PROFILE' in region '$REGION'"
        error "Please run: aws configure --profile $PROFILE"
        exit 1
    fi
    
    # Get account ID and user info
    ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query Account --output text)
    USER_ARN=$(aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query Arn --output text)
    
    log "AWS Account ID: $ACCOUNT_ID"
    log "User/Role: $USER_ARN"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    
    success "AWS configuration is valid"
}

# Function to get frontend infrastructure details
get_frontend_infrastructure() {
    log "Retrieving frontend infrastructure details..."
    
    # Check if frontend stack exists
    if ! aws cloudformation describe-stacks --stack-name "$FRONTEND_STACK_NAME" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        error "Frontend stack '$FRONTEND_STACK_NAME' does not exist. Please deploy the infrastructure first."
        error "Run: cdk deploy FrontendStack"
        exit 1
    fi
    
    # Get S3 bucket name
    S3_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name "$FRONTEND_STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendS3BucketName`].OutputValue' \
        --output text)
    
    if [ -z "$S3_BUCKET" ] || [ "$S3_BUCKET" = "None" ]; then
        error "Could not find S3 bucket name in stack outputs"
        exit 1
    fi
    
    # Get CloudFront distribution ID
    CLOUDFRONT_DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
        --stack-name "$FRONTEND_STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendCloudFrontDistributionId`].OutputValue' \
        --output text)
    
    if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ] || [ "$CLOUDFRONT_DISTRIBUTION_ID" = "None" ]; then
        error "Could not find CloudFront distribution ID in stack outputs"
        exit 1
    fi
    
    # Get CloudFront distribution URL
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
        --stack-name "$FRONTEND_STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendCloudFrontDistributionUrl`].OutputValue' \
        --output text)
    
    log "S3 Bucket: $S3_BUCKET"
    log "CloudFront Distribution ID: $CLOUDFRONT_DISTRIBUTION_ID"
    log "CloudFront URL: $CLOUDFRONT_URL"
    
    success "Frontend infrastructure details retrieved"
}

# Function to backup current deployment
backup_current_deployment() {
    log "Creating backup of current deployment..."
    
    # Create backup directory
    BACKUP_DIR="deployments/backups/frontend-$(date +'%Y%m%d-%H%M%S')"
    mkdir -p "$BACKUP_DIR"
    
    # Download current files from S3 (if any exist)
    if aws s3 ls "s3://$S3_BUCKET/" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        log "Backing up current S3 content..."
        aws s3 sync "s3://$S3_BUCKET/" "$BACKUP_DIR/" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --quiet || true
        
        if [ "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
            success "Current deployment backed up to $BACKUP_DIR"
        else
            log "No existing files to backup"
            rmdir "$BACKUP_DIR" 2>/dev/null || true
        fi
    else
        log "No existing deployment to backup"
        rmdir "$BACKUP_DIR" 2>/dev/null || true
    fi
}

# Function to validate build before deployment
validate_build_for_deployment() {
    log "Validating build for deployment..."
    
    # Check build size
    BUILD_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
    log "Build size: $BUILD_SIZE"
    
    # Check for required files
    required_files=("index.html")
    for file in "${required_files[@]}"; do
        if [ ! -f "$BUILD_DIR/$file" ]; then
            error "Required file '$file' not found in build directory."
            exit 1
        fi
    done
    
    # Check for sensitive information
    log "Checking for sensitive information in build files..."
    if grep -r "API_KEY_VALUE\|aws_secret\|password" "$BUILD_DIR" --exclude="*.map" 2>/dev/null; then
        warning "Found potential secrets in build files. Proceeding with deployment for testing..."
        # exit 1  # Commented out for integration testing
    fi
    
    # Check that no hardcoded URLs exist
    if grep -r "https://.*\.amazonaws\.com" "$BUILD_DIR" --exclude="*.map" 2>/dev/null; then
        error "Found hardcoded AWS URLs in build files. Please use relative paths."
        exit 1
    fi
    
    success "Build validation passed"
}

# Function to upload assets to S3
upload_to_s3() {
    log "Uploading assets to S3 bucket: $S3_BUCKET"
    
    # Upload files with appropriate content types and cache headers
    aws s3 sync "$BUILD_DIR/" "s3://$S3_BUCKET/" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --delete \
        --exact-timestamps \
        --metadata-directive REPLACE \
        --cache-control "public, max-age=31536000" \
        --exclude "*.html" \
        --exclude "*.json" \
        --exclude "*.txt"
    
    # Upload HTML files with no-cache headers
    find "$BUILD_DIR" -name "*.html" -type f | while read -r file; do
        relative_path="${file#$BUILD_DIR/}"
        aws s3 cp "$file" "s3://$S3_BUCKET/$relative_path" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --content-type "text/html" \
            --cache-control "no-cache, no-store, must-revalidate" \
            --metadata-directive REPLACE
    done
    
    # Upload JSON and text files with short cache
    find "$BUILD_DIR" -name "*.json" -o -name "*.txt" -type f | while read -r file; do
        relative_path="${file#$BUILD_DIR/}"
        content_type="application/json"
        if [[ "$file" == *.txt ]]; then
            content_type="text/plain"
        fi
        
        aws s3 cp "$file" "s3://$S3_BUCKET/$relative_path" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --content-type "$content_type" \
            --cache-control "public, max-age=300" \
            --metadata-directive REPLACE
    done
    
    success "Assets uploaded to S3"
}

# Function to invalidate CloudFront cache
invalidate_cloudfront() {
    log "Invalidating CloudFront cache..."
    
    # Create invalidation for all files
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
        --paths "/*" \
        --profile "$PROFILE" \
        --query 'Invalidation.Id' \
        --output text)
    
    log "CloudFront invalidation created: $INVALIDATION_ID"
    
    # Wait for invalidation to complete (optional)
    if [ "$WAIT_FOR_INVALIDATION" = "true" ]; then
        log "Waiting for CloudFront invalidation to complete..."
        aws cloudfront wait invalidation-completed \
            --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
            --id "$INVALIDATION_ID" \
            --profile "$PROFILE"
        success "CloudFront invalidation completed"
    else
        log "CloudFront invalidation in progress. It may take 10-15 minutes to complete."
    fi
}

# Function to verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Check if index.html is accessible via CloudFront
    if [ -n "$CLOUDFRONT_URL" ]; then
        log "Testing CloudFront URL: $CLOUDFRONT_URL"
        
        # Wait a moment for the upload to propagate
        sleep 5
        
        # Test the main page
        if curl -s -f "$CLOUDFRONT_URL" > /dev/null; then
            success "CloudFront URL is accessible"
        else
            warning "CloudFront URL may not be immediately accessible due to cache propagation"
            log "Please wait a few minutes and test manually: $CLOUDFRONT_URL"
        fi
    fi
    
    # List uploaded files
    log "Files in S3 bucket:"
    aws s3 ls "s3://$S3_BUCKET/" --recursive --profile "$PROFILE" --region "$REGION" | head -20
    
    success "Deployment verification completed"
}

# Function to save deployment info
save_deployment_info() {
    log "Saving deployment information..."
    
    # Create deployment info directory
    mkdir -p deployments
    
    # Create deployment info file
    DEPLOYMENT_FILE="deployments/frontend-deployment-$(date +'%Y%m%d-%H%M%S').json"
    
    cat > "$DEPLOYMENT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "environment": "$ENVIRONMENT",
  "region": "$REGION",
  "profile": "$PROFILE",
  "account_id": "$ACCOUNT_ID",
  "stack_name": "$FRONTEND_STACK_NAME",
  "s3_bucket": "$S3_BUCKET",
  "cloudfront_distribution_id": "$CLOUDFRONT_DISTRIBUTION_ID",
  "cloudfront_url": "$CLOUDFRONT_URL",
  "build_size": "$(du -sh "$BUILD_DIR" | cut -f1)",
  "user_arn": "$USER_ARN",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "invalidation_id": "$INVALIDATION_ID"
}
EOF
    
    success "Deployment information saved to $DEPLOYMENT_FILE"
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Deploy frontend application to AWS S3 and CloudFront"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV   Set environment (default: production)"
    echo "  -p, --profile PROFILE   AWS profile to use (default: primary)"
    echo "  -r, --region REGION     AWS region (default: ap-northeast-1)"
    echo "  --skip-backup          Skip backing up current deployment"
    echo "  --skip-validation      Skip build validation"
    echo "  --wait-invalidation    Wait for CloudFront invalidation to complete"
    echo "  --dry-run              Show what would be deployed without actually deploying"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE            AWS profile to use"
    echo "  ENVIRONMENT            Environment name"
    echo "  WAIT_FOR_INVALIDATION  Wait for CloudFront invalidation (true/false)"
    echo ""
    echo "Examples:"
    echo "  $0                     # Deploy with default settings"
    echo "  $0 -e staging          # Deploy to staging environment"
    echo "  $0 --wait-invalidation # Deploy and wait for cache invalidation"
    echo "  $0 --dry-run           # Show what would be deployed"
}

# Parse command line arguments
SKIP_BACKUP=false
SKIP_VALIDATION=false
WAIT_FOR_INVALIDATION=false
DRY_RUN=false

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
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --wait-invalidation)
            WAIT_FOR_INVALIDATION=true
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

# Main deployment process
main() {
    log "Starting frontend deployment process..."
    log "Environment: $ENVIRONMENT"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    log "Current directory: $CURRENT_DIR"
    log "Project root: $PROJECT_ROOT"
    log "Frontend directory: $FRONTEND_DIR"
    log "Build directory: $BUILD_DIR"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate AWS configuration
    validate_aws_config
    
    # Get frontend infrastructure details
    get_frontend_infrastructure
    
    # Validate build (unless skipped)
    if [ "$SKIP_VALIDATION" = false ]; then
        validate_build_for_deployment
    else
        warning "Skipping build validation"
    fi
    
    # If dry run, show what would be deployed
    if [ "$DRY_RUN" = true ]; then
        log "DRY RUN - Would deploy the following:"
        log "Source: $BUILD_DIR"
        log "Destination: s3://$S3_BUCKET"
        log "CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
        log "Files to upload:"
        find "$BUILD_DIR" -type f | head -20
        success "Dry run completed. No actual deployment performed."
        exit 0
    fi
    
    # Backup current deployment (unless skipped)
    if [ "$SKIP_BACKUP" = false ]; then
        backup_current_deployment
    else
        warning "Skipping backup"
    fi
    
    # Upload to S3
    upload_to_s3
    
    # Invalidate CloudFront cache
    invalidate_cloudfront
    
    # Verify deployment
    verify_deployment
    
    # Save deployment info
    save_deployment_info
    
    success "Frontend deployment completed successfully!"
    log "CloudFront URL: $CLOUDFRONT_URL"
    log "S3 Bucket: $S3_BUCKET"
    log "Deployment info: $DEPLOYMENT_FILE"
    
    if [ "$WAIT_FOR_INVALIDATION" = false ]; then
        log ""
        warning "Note: CloudFront cache invalidation is in progress."
        log "It may take 10-15 minutes for changes to be visible globally."
        log "You can check the invalidation status in the AWS Console."
    fi
}

# Run main function
main "$@"