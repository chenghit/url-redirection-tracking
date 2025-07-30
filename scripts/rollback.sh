#!/bin/bash

# URL Redirection Tracking - Rollback Script
# This script handles rollback procedures for failed deployments

set -e  # Exit on any error

# Configuration
REGION="ap-northeast-1"
PROFILE="${AWS_PROFILE:-primary}"
STACK_NAME="UrlRedirectionTrackingStack"

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
    
    # Check if CDK is installed
    if ! command -v cdk &> /dev/null; then
        error "AWS CDK is not installed. Please install it first: npm install -g aws-cdk"
        exit 1
    fi
    
    success "All prerequisites are installed"
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

# Function to check stack status
check_stack_status() {
    log "Checking stack status..."
    
    # Check if stack exists
    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        error "Stack '$STACK_NAME' does not exist in region '$REGION'"
        exit 1
    fi
    
    # Get stack status
    STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text)
    
    log "Current stack status: $STACK_STATUS"
    
    case $STACK_STATUS in
        "CREATE_FAILED"|"ROLLBACK_COMPLETE"|"ROLLBACK_FAILED"|"UPDATE_ROLLBACK_COMPLETE"|"UPDATE_ROLLBACK_FAILED")
            warning "Stack is in a failed state: $STACK_STATUS"
            ;;
        "CREATE_IN_PROGRESS"|"UPDATE_IN_PROGRESS"|"DELETE_IN_PROGRESS")
            error "Stack is currently being modified: $STACK_STATUS. Please wait for the operation to complete."
            exit 1
            ;;
        "CREATE_COMPLETE"|"UPDATE_COMPLETE")
            log "Stack is in a stable state: $STACK_STATUS"
            ;;
        *)
            warning "Unknown stack status: $STACK_STATUS"
            ;;
    esac
}

# Function to get stack events
get_stack_events() {
    log "Retrieving recent stack events..."
    
    aws cloudformation describe-stack-events \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --max-items 20 \
        --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED` || ResourceStatus==`DELETE_FAILED`].[Timestamp,LogicalResourceId,ResourceStatus,ResourceStatusReason]' \
        --output table
}

# Function to list available deployment backups
list_deployment_backups() {
    log "Listing available deployment backups..."
    
    if [ -d "deployments" ]; then
        echo "Available deployment backups:"
        ls -la deployments/deployment-*.json | head -10
    else
        warning "No deployment backups found"
    fi
}

# Function to create stack backup before rollback
create_stack_backup() {
    log "Creating stack backup before rollback..."
    
    # Create deployments directory if it doesn't exist
    mkdir -p deployments/backups
    
    # Create backup file
    BACKUP_FILE="deployments/backups/pre-rollback-$(date +'%Y%m%d-%H%M%S').json"
    
    # Get current stack template
    aws cloudformation get-template \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output json > "$BACKUP_FILE"
    
    # Get current stack parameters and outputs
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output json >> "$BACKUP_FILE"
    
    success "Stack backup created: $BACKUP_FILE"
}

# Function to perform CDK rollback
perform_cdk_rollback() {
    log "Performing CDK rollback..."
    
    # Set environment variables for CDK
    export AWS_PROFILE="$PROFILE"
    export AWS_REGION="$REGION"
    export CDK_DEFAULT_REGION="$REGION"
    export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
    
    # Check if there's a previous version to rollback to
    log "Checking CloudFormation stack history..."
    
    # Try to cancel any in-progress update
    if aws cloudformation cancel-update-stack --stack-name "$STACK_NAME" --profile "$PROFILE" --region "$REGION" 2>/dev/null; then
        log "Cancelled in-progress stack update"
        
        # Wait for cancellation to complete
        log "Waiting for stack update cancellation to complete..."
        aws cloudformation wait stack-update-complete \
            --stack-name "$STACK_NAME" \
            --profile "$PROFILE" \
            --region "$REGION" || true
    fi
    
    # Check if we can continue with rollback
    STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text)
    
    case $STACK_STATUS in
        "UPDATE_ROLLBACK_COMPLETE"|"ROLLBACK_COMPLETE")
            success "Stack has already been rolled back: $STACK_STATUS"
            ;;
        "UPDATE_ROLLBACK_FAILED"|"ROLLBACK_FAILED")
            error "Stack rollback failed: $STACK_STATUS"
            log "You may need to manually fix the stack or delete and recreate it"
            exit 1
            ;;
        "CREATE_FAILED")
            log "Stack creation failed. Deleting the stack..."
            delete_failed_stack
            ;;
        *)
            log "Current stack status: $STACK_STATUS"
            log "Attempting to continue with rollback using CloudFormation..."
            
            # Try to continue rollback if it's stuck
            if aws cloudformation continue-update-rollback \
                --stack-name "$STACK_NAME" \
                --profile "$PROFILE" \
                --region "$REGION" 2>/dev/null; then
                
                log "Continuing stack rollback..."
                aws cloudformation wait stack-update-complete \
                    --stack-name "$STACK_NAME" \
                    --profile "$PROFILE" \
                    --region "$REGION"
                
                success "Stack rollback completed"
            else
                warning "Could not continue rollback automatically"
                log "You may need to manually resolve the stack state"
            fi
            ;;
    esac
}

# Function to delete a failed stack
delete_failed_stack() {
    log "Deleting failed stack..."
    
    # Confirm deletion
    read -p "Are you sure you want to delete the stack '$STACK_NAME'? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Stack deletion cancelled"
        return
    fi
    
    # Delete the stack
    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION"
    
    log "Waiting for stack deletion to complete..."
    aws cloudformation wait stack-delete-complete \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION"
    
    success "Stack deleted successfully"
}

# Function to restore from backup
restore_from_backup() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        error "No backup file specified"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log "Restoring from backup: $backup_file"
    
    # This would require implementing a restore mechanism
    # For now, we'll just show the backup content
    warning "Backup restore functionality is not yet implemented"
    log "Backup file contents:"
    cat "$backup_file" | jq '.' 2>/dev/null || cat "$backup_file"
}

# Function to check resource health after rollback
check_resource_health() {
    log "Checking resource health after rollback..."
    
    # Check if stack exists and is in good state
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        STACK_STATUS=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --query 'Stacks[0].StackStatus' \
            --output text)
        
        log "Stack status after rollback: $STACK_STATUS"
        
        if [[ "$STACK_STATUS" == *"COMPLETE" ]]; then
            success "Stack is in a stable state"
            
            # Get stack outputs
            log "Current stack outputs:"
            aws cloudformation describe-stacks \
                --stack-name "$STACK_NAME" \
                --profile "$PROFILE" \
                --region "$REGION" \
                --query 'Stacks[0].Outputs' \
                --output table
        else
            warning "Stack may still be in an unstable state: $STACK_STATUS"
        fi
    else
        log "Stack no longer exists (may have been deleted)"
    fi
}

# Function to save rollback info
save_rollback_info() {
    log "Saving rollback information..."
    
    # Create rollback info directory
    mkdir -p deployments/rollbacks
    
    # Create rollback info file
    ROLLBACK_FILE="deployments/rollbacks/rollback-$(date +'%Y%m%d-%H%M%S').json"
    
    cat > "$ROLLBACK_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "region": "$REGION",
  "profile": "$PROFILE",
  "account_id": "$ACCOUNT_ID",
  "stack_name": "$STACK_NAME",
  "user_arn": "$USER_ARN",
  "rollback_reason": "Manual rollback initiated",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF
    
    success "Rollback information saved to $ROLLBACK_FILE"
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Rollback URL Redirection Tracking application deployment"
    echo ""
    echo "Commands:"
    echo "  rollback                Perform automatic rollback"
    echo "  delete                  Delete the failed stack"
    echo "  status                  Check current stack status"
    echo "  events                  Show recent stack events"
    echo "  backups                 List available backups"
    echo "  restore BACKUP_FILE     Restore from backup file"
    echo ""
    echo "Options:"
    echo "  -p, --profile PROFILE   AWS profile to use (default: primary)"
    echo "  -r, --region REGION     AWS region (default: ap-northeast-1)"
    echo "  --force                 Force rollback without confirmation"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE             AWS profile to use"
    echo ""
    echo "Examples:"
    echo "  $0 status               # Check stack status"
    echo "  $0 rollback             # Perform rollback"
    echo "  $0 delete               # Delete failed stack"
    echo "  $0 events               # Show recent events"
}

# Parse command line arguments
FORCE=false
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        rollback|delete|status|events|backups|restore)
            COMMAND="$1"
            shift
            if [ "$COMMAND" = "restore" ] && [ $# -gt 0 ]; then
                BACKUP_FILE="$1"
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
    COMMAND="status"
fi

# Main rollback process
main() {
    log "Starting rollback process..."
    log "Command: $COMMAND"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate AWS configuration
    validate_aws_config
    
    case $COMMAND in
        "status")
            check_stack_status
            ;;
        "events")
            check_stack_status
            get_stack_events
            ;;
        "backups")
            list_deployment_backups
            ;;
        "restore")
            restore_from_backup "$BACKUP_FILE"
            ;;
        "delete")
            check_stack_status
            create_stack_backup
            delete_failed_stack
            save_rollback_info
            ;;
        "rollback")
            check_stack_status
            create_stack_backup
            perform_cdk_rollback
            check_resource_health
            save_rollback_info
            success "Rollback process completed!"
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