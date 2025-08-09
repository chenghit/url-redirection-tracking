#!/bin/bash

# Frontend Rollback Script
# This script helps rollback frontend deployments to a previous version

set -e  # Exit on any error

# Configuration
REGION="ap-northeast-1"
PROFILE="${AWS_PROFILE:-primary}"
ENVIRONMENT="${ENVIRONMENT:-production}"
FRONTEND_STACK_NAME="FrontendStack"

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
    
    success "Prerequisites checked"
}

# Function to validate AWS credentials
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
    
    if [ "$ENVIRONMENT" != "production" ]; then
        FRONTEND_STACK_NAME="FrontendStack-${ENVIRONMENT^}"
    fi
    
    # Check if frontend stack exists
    if ! aws cloudformation describe-stacks --stack-name "$FRONTEND_STACK_NAME" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        error "Frontend stack '$FRONTEND_STACK_NAME' does not exist."
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
    
    log "S3 Bucket: $S3_BUCKET"
    log "CloudFront Distribution ID: $CLOUDFRONT_DISTRIBUTION_ID"
    
    success "Frontend infrastructure details retrieved"
}

# Function to list available backups
list_backups() {
    log "Listing available backups..."
    
    local backup_dir="deployments/backups"
    
    if [ -d "$backup_dir" ]; then
        log "Local backup directories:"
        ls -la "$backup_dir" | grep "frontend-" | head -10
    else
        log "No local backup directory found"
    fi
    
    # List S3 bucket versions if versioning is enabled
    log "Checking S3 bucket versioning..."
    
    local versioning_status=$(aws s3api get-bucket-versioning \
        --bucket "$S3_BUCKET" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Status' \
        --output text 2>/dev/null || echo "None")
    
    if [ "$versioning_status" = "Enabled" ]; then
        log "S3 bucket versioning is enabled. Recent object versions:"
        aws s3api list-object-versions \
            --bucket "$S3_BUCKET" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --max-items 10 \
            --query 'Versions[?Key==`index.html`].[Key,VersionId,LastModified,IsLatest]' \
            --output table
    else
        warning "S3 bucket versioning is not enabled. Cannot rollback to previous versions."
    fi
}

# Function to create current backup before rollback
create_current_backup() {
    log "Creating backup of current deployment..."
    
    # Create backup directory
    BACKUP_DIR="deployments/backups/pre-rollback-$(date +'%Y%m%d-%H%M%S')"
    mkdir -p "$BACKUP_DIR"
    
    # Download current files from S3
    if aws s3 sync "s3://$S3_BUCKET/" "$BACKUP_DIR/" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --quiet; then
        success "Current deployment backed up to $BACKUP_DIR"
    else
        error "Failed to backup current deployment"
        exit 1
    fi
}

# Function to rollback to a specific backup
rollback_to_backup() {
    local backup_path="$1"
    
    if [ -z "$backup_path" ]; then
        error "No backup path specified"
        exit 1
    fi
    
    if [ ! -d "$backup_path" ]; then
        error "Backup directory not found: $backup_path"
        exit 1
    fi
    
    log "Rolling back to backup: $backup_path"
    
    # Upload backup files to S3
    if aws s3 sync "$backup_path/" "s3://$S3_BUCKET/" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --delete \
        --exact-timestamps; then
        success "Files uploaded from backup"
    else
        error "Failed to upload backup files"
        exit 1
    fi
    
    # Invalidate CloudFront cache
    log "Invalidating CloudFront cache..."
    
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
        --paths "/*" \
        --profile "$PROFILE" \
        --query 'Invalidation.Id' \
        --output text)
    
    log "CloudFront invalidation created: $INVALIDATION_ID"
    
    success "Rollback completed successfully"
}

# Function to rollback to S3 object version
rollback_to_version() {
    local version_id="$1"
    
    if [ -z "$version_id" ]; then
        error "No version ID specified"
        exit 1
    fi
    
    log "Rolling back to S3 object version: $version_id"
    
    # This is a simplified example - in practice, you'd need to restore all objects
    warning "S3 version rollback is not fully implemented in this script"
    warning "Please use AWS Console or implement full version restoration logic"
    
    # Example for single file:
    # aws s3api copy-object \
    #     --copy-source "$S3_BUCKET/index.html?versionId=$version_id" \
    #     --bucket "$S3_BUCKET" \
    #     --key "index.html" \
    #     --profile "$PROFILE" \
    #     --region "$REGION"
}

# Function to run post-rollback health check
run_health_check() {
    log "Running post-rollback health check..."
    
    if [ -f "scripts/health-check.sh" ]; then
        chmod +x scripts/health-check.sh
        if ./scripts/health-check.sh -e "$ENVIRONMENT"; then
            success "Health check passed after rollback"
        else
            error "Health check failed after rollback"
            return 1
        fi
    else
        warning "Health check script not found, skipping health check"
    fi
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Rollback frontend deployment to a previous version"
    echo ""
    echo "Commands:"
    echo "  list                    List available backups"
    echo "  rollback BACKUP_PATH    Rollback to specific backup directory"
    echo "  version VERSION_ID      Rollback to specific S3 object version"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV   Environment to rollback (default: production)"
    echo "  -p, --profile PROFILE   AWS profile to use (default: primary)"
    echo "  -r, --region REGION     AWS region (default: ap-northeast-1)"
    echo "  --skip-backup          Skip creating backup of current deployment"
    echo "  --skip-health-check    Skip post-rollback health check"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE            AWS profile to use"
    echo "  ENVIRONMENT            Environment name"
    echo ""
    echo "Examples:"
    echo "  $0 list                                    # List available backups"
    echo "  $0 rollback deployments/backups/backup-1  # Rollback to specific backup"
    echo "  $0 version abc123def456                    # Rollback to S3 version"
    echo "  $0 -e staging rollback backup-dir         # Rollback staging environment"
}

# Parse command line arguments
COMMAND=""
BACKUP_PATH=""
VERSION_ID=""
SKIP_BACKUP=false
SKIP_HEALTH_CHECK=false

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
        --skip-health-check)
            SKIP_HEALTH_CHECK=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        list|rollback|version)
            COMMAND="$1"
            shift
            if [ "$COMMAND" = "rollback" ] && [ $# -gt 0 ]; then
                BACKUP_PATH="$1"
                shift
            elif [ "$COMMAND" = "version" ] && [ $# -gt 0 ]; then
                VERSION_ID="$1"
                shift
            fi
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Default command if none specified
if [ -z "$COMMAND" ]; then
    COMMAND="list"
fi

# Main rollback process
main() {
    log "Starting frontend rollback process..."
    log "Command: $COMMAND"
    log "Environment: $ENVIRONMENT"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate AWS configuration
    validate_aws_config
    
    # Get frontend infrastructure details
    get_frontend_infrastructure
    
    case $COMMAND in
        "list")
            list_backups
            ;;
        "rollback")
            if [ -z "$BACKUP_PATH" ]; then
                error "Backup path not specified for rollback command"
                show_help
                exit 1
            fi
            
            # Create backup of current deployment
            if [ "$SKIP_BACKUP" = false ]; then
                create_current_backup
            fi
            
            # Perform rollback
            rollback_to_backup "$BACKUP_PATH"
            
            # Run health check
            if [ "$SKIP_HEALTH_CHECK" = false ]; then
                run_health_check
            fi
            
            success "Rollback completed successfully!"
            ;;
        "version")
            if [ -z "$VERSION_ID" ]; then
                error "Version ID not specified for version command"
                show_help
                exit 1
            fi
            
            # Create backup of current deployment
            if [ "$SKIP_BACKUP" = false ]; then
                create_current_backup
            fi
            
            # Perform version rollback
            rollback_to_version "$VERSION_ID"
            
            # Run health check
            if [ "$SKIP_HEALTH_CHECK" = false ]; then
                run_health_check
            fi
            
            success "Version rollback completed!"
            ;;
        *)
            error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"