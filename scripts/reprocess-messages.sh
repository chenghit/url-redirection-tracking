#!/bin/bash

# URL Redirection Tracking - Message Reprocessing Script
# This script handles manual reprocessing of failed messages from DLQ

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
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        error "jq is not installed. Please install it first."
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
    
    success "AWS configuration is valid"
}

# Function to get queue URLs from stack outputs
get_queue_urls() {
    log "Getting queue URLs from stack outputs..."
    
    # Check if stack exists
    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        error "Stack '$STACK_NAME' does not exist in region '$REGION'"
        exit 1
    fi
    
    # Get DLQ URL from stack outputs
    DLQ_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`TrackingDLQUrl`].OutputValue' \
        --output text)
    
    # Get main queue URL from stack outputs
    MAIN_QUEUE_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`TrackingQueueUrl`].OutputValue' \
        --output text)
    
    if [ -z "$DLQ_URL" ] || [ "$DLQ_URL" = "None" ]; then
        error "Could not find DLQ URL in stack outputs"
        exit 1
    fi
    
    if [ -z "$MAIN_QUEUE_URL" ] || [ "$MAIN_QUEUE_URL" = "None" ]; then
        error "Could not find main queue URL in stack outputs"
        exit 1
    fi
    
    # Extract queue names from URLs
    DLQ_NAME=$(echo "$DLQ_URL" | sed 's/.*\///')
    MAIN_QUEUE_NAME=$(echo "$MAIN_QUEUE_URL" | sed 's/.*\///')
    
    log "DLQ URL: $DLQ_URL"
    log "Main Queue URL: $MAIN_QUEUE_URL"
    
    success "Queue URLs retrieved successfully"
}

# Function to validate message format
validate_message() {
    local message_body="$1"
    
    # Check if it's valid JSON
    if ! echo "$message_body" | jq empty 2>/dev/null; then
        error "Message is not valid JSON"
        return 1
    fi
    
    # Check for required fields
    local required_fields=("tracking_id" "timestamp" "client_ip" "destination_url")
    
    for field in "${required_fields[@]}"; do
        if ! echo "$message_body" | jq -e ".$field" >/dev/null 2>&1; then
            error "Message is missing required field: $field"
            return 1
        fi
    done
    
    # Validate field formats
    local tracking_id
    tracking_id=$(echo "$message_body" | jq -r '.tracking_id')
    if [[ ! "$tracking_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
        error "Invalid tracking_id format: $tracking_id"
        return 1
    fi
    
    local timestamp
    timestamp=$(echo "$message_body" | jq -r '.timestamp')
    if ! date -d "$timestamp" >/dev/null 2>&1; then
        error "Invalid timestamp format: $timestamp"
        return 1
    fi
    
    local destination_url
    destination_url=$(echo "$message_body" | jq -r '.destination_url')
    if [[ ! "$destination_url" =~ ^https?:// ]]; then
        error "Invalid destination_url format: $destination_url"
        return 1
    fi
    
    # Validate source_attribution if present
    if echo "$message_body" | jq -e '.source_attribution' >/dev/null 2>&1; then
        local source_attribution
        source_attribution=$(echo "$message_body" | jq -r '.source_attribution')
        if [[ ! "$source_attribution" =~ ^EdgeUp[0-9]{3}$ ]]; then
            error "Invalid source_attribution format: $source_attribution"
            return 1
        fi
    fi
    
    success "Message validation passed"
    return 0
}

# Function to fix common message issues
fix_message() {
    local message_body="$1"
    local fixed_message="$message_body"
    
    log "Attempting to fix message issues..."
    
    # Fix missing formatted_timestamp
    if ! echo "$fixed_message" | jq -e '.formatted_timestamp' >/dev/null 2>&1; then
        log "Adding missing formatted_timestamp field"
        local timestamp
        timestamp=$(echo "$fixed_message" | jq -r '.timestamp')
        
        # Convert to UTC+8 formatted timestamp
        local formatted_timestamp
        formatted_timestamp=$(date -d "$timestamp + 8 hours" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "")
        
        if [ -n "$formatted_timestamp" ]; then
            fixed_message=$(echo "$fixed_message" | jq --arg ft "$formatted_timestamp" '. + {formatted_timestamp: $ft}')
            log "Added formatted_timestamp: $formatted_timestamp"
        fi
    fi
    
    # Add TTL if missing (optional field)
    if ! echo "$fixed_message" | jq -e '.ttl' >/dev/null 2>&1; then
        log "Adding TTL field for data retention"
        local ttl
        ttl=$(date -d "+1 year" +%s)
        fixed_message=$(echo "$fixed_message" | jq --arg ttl "$ttl" '. + {ttl: ($ttl | tonumber)}')
        log "Added TTL: $ttl"
    fi
    
    echo "$fixed_message"
}

# Function to move messages from DLQ to main queue
move_dlq_to_main() {
    local max_messages="${1:-10}"
    local fix_messages="${2:-false}"
    
    log "Moving up to $max_messages messages from DLQ to main queue..."
    log "Fix messages: $fix_messages"
    
    local moved_count=0
    local failed_count=0
    
    # Receive messages from DLQ
    local messages
    messages=$(aws sqs receive-message \
        --queue-url "$DLQ_URL" \
        --max-number-of-messages "$max_messages" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output json)
    
    if [ "$messages" = "null" ] || [ -z "$messages" ]; then
        log "No messages found in DLQ"
        return 0
    fi
    
    # Process each message
    echo "$messages" | jq -c '.Messages[]' | while read -r message; do
        local message_id
        message_id=$(echo "$message" | jq -r '.MessageId')
        local receipt_handle
        receipt_handle=$(echo "$message" | jq -r '.ReceiptHandle')
        local body
        body=$(echo "$message" | jq -r '.Body')
        
        log "Processing message: $message_id"
        
        # Validate message
        if validate_message "$body"; then
            local final_body="$body"
            
            # Fix message if requested
            if [ "$fix_messages" = "true" ]; then
                final_body=$(fix_message "$body")
            fi
            
            # Send message to main queue
            if aws sqs send-message \
                --queue-url "$MAIN_QUEUE_URL" \
                --message-body "$final_body" \
                --profile "$PROFILE" \
                --region "$REGION" >/dev/null 2>&1; then
                
                # Delete message from DLQ
                if aws sqs delete-message \
                    --queue-url "$DLQ_URL" \
                    --receipt-handle "$receipt_handle" \
                    --profile "$PROFILE" \
                    --region "$REGION" >/dev/null 2>&1; then
                    
                    success "Moved message $message_id to main queue"
                    ((moved_count++))
                else
                    error "Failed to delete message $message_id from DLQ"
                    ((failed_count++))
                fi
            else
                error "Failed to send message $message_id to main queue"
                ((failed_count++))
            fi
        else
            error "Message $message_id failed validation - skipping"
            ((failed_count++))
        fi
    done
    
    log "Reprocessing completed: $moved_count moved, $failed_count failed"
}

# Function to reprocess messages from backup file
reprocess_from_backup() {
    local backup_file="$1"
    local fix_messages="${2:-false}"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log "Reprocessing messages from backup file: $backup_file"
    log "Fix messages: $fix_messages"
    
    local moved_count=0
    local failed_count=0
    
    # Read messages from backup file
    if ! jq -e '.Messages' "$backup_file" >/dev/null 2>&1; then
        error "Invalid backup file format - missing Messages array"
        exit 1
    fi
    
    # Process each message
    jq -c '.Messages[]' "$backup_file" | while read -r message; do
        local message_id
        message_id=$(echo "$message" | jq -r '.MessageId')
        local body
        body=$(echo "$message" | jq -r '.Body')
        
        log "Processing message from backup: $message_id"
        
        # Validate message
        if validate_message "$body"; then
            local final_body="$body"
            
            # Fix message if requested
            if [ "$fix_messages" = "true" ]; then
                final_body=$(fix_message "$body")
            fi
            
            # Send message to main queue
            if aws sqs send-message \
                --queue-url "$MAIN_QUEUE_URL" \
                --message-body "$final_body" \
                --profile "$PROFILE" \
                --region "$REGION" >/dev/null 2>&1; then
                
                success "Sent message $message_id to main queue"
                ((moved_count++))
            else
                error "Failed to send message $message_id to main queue"
                ((failed_count++))
            fi
        else
            error "Message $message_id failed validation - skipping"
            ((failed_count++))
        fi
    done
    
    log "Backup reprocessing completed: $moved_count sent, $failed_count failed"
}

# Function to create test message
create_test_message() {
    local destination_url="${1:-https://aws.amazon.com/cn/}"
    local source_attribution="${2:-EdgeUp001}"
    
    log "Creating test message..."
    
    # Generate test message
    local test_message
    test_message=$(cat << EOF
{
  "tracking_id": "$(uuidgen | tr '[:upper:]' '[:lower:]')",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "formatted_timestamp": "$(date -d '+8 hours' '+%Y-%m-%d %H:%M:%S')",
  "source_attribution": "$source_attribution",
  "client_ip": "192.168.1.100",
  "destination_url": "$destination_url",
  "ttl": $(date -d "+1 year" +%s)
}
EOF
)
    
    # Send test message to main queue
    if aws sqs send-message \
        --queue-url "$MAIN_QUEUE_URL" \
        --message-body "$test_message" \
        --profile "$PROFILE" \
        --region "$REGION" >/dev/null 2>&1; then
        
        success "Test message sent to main queue"
        log "Message content: $test_message"
    else
        error "Failed to send test message"
        exit 1
    fi
}

# Function to purge DLQ (dangerous operation)
purge_dlq() {
    warning "This will permanently delete ALL messages in the DLQ!"
    read -p "Are you sure you want to purge the DLQ? Type 'PURGE' to confirm: " -r
    
    if [ "$REPLY" != "PURGE" ]; then
        log "DLQ purge cancelled"
        return 0
    fi
    
    log "Purging DLQ..."
    
    # Create backup before purging
    local backup_file="dlq-backup-before-purge-$(date +'%Y%m%d-%H%M%S').json"
    mkdir -p dlq-backups
    
    # Get all messages for backup
    local messages
    messages=$(aws sqs receive-message \
        --queue-url "$DLQ_URL" \
        --max-number-of-messages 10 \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output json)
    
    if [ "$messages" != "null" ] && [ -n "$messages" ]; then
        echo "$messages" > "dlq-backups/$backup_file"
        log "Created backup: dlq-backups/$backup_file"
    fi
    
    # Purge the queue
    if aws sqs purge-queue \
        --queue-url "$DLQ_URL" \
        --profile "$PROFILE" \
        --region "$REGION" >/dev/null 2>&1; then
        
        success "DLQ purged successfully"
    else
        error "Failed to purge DLQ"
        exit 1
    fi
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS] COMMAND [ARGS]"
    echo ""
    echo "Reprocess failed messages from Dead Letter Queue"
    echo ""
    echo "Commands:"
    echo "  move [MAX] [--fix]      Move messages from DLQ to main queue"
    echo "  backup FILE [--fix]     Reprocess messages from backup file"
    echo "  test [URL] [SA]         Send test message to main queue"
    echo "  validate FILE           Validate messages in backup file"
    echo "  purge                   Purge all messages from DLQ (dangerous!)"
    echo ""
    echo "Options:"
    echo "  -p, --profile PROFILE   AWS profile to use (default: primary)"
    echo "  -r, --region REGION     AWS region (default: ap-northeast-1)"
    echo "  -s, --stack STACK       Stack name (default: UrlRedirectionTrackingStack)"
    echo "  --fix                   Attempt to fix message issues"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE             AWS profile to use"
    echo ""
    echo "Examples:"
    echo "  $0 move 5               # Move up to 5 messages from DLQ"
    echo "  $0 move 10 --fix        # Move 10 messages and fix issues"
    echo "  $0 backup backup.json   # Reprocess from backup file"
    echo "  $0 test                 # Send test message"
    echo "  $0 validate backup.json # Validate backup file messages"
}

# Parse command line arguments
COMMAND=""
ARGS=()
FIX_MESSAGES=false

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
        -s|--stack)
            STACK_NAME="$2"
            shift 2
            ;;
        --fix)
            FIX_MESSAGES=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        move|backup|test|validate|purge)
            COMMAND="$1"
            shift
            # Collect remaining arguments
            while [[ $# -gt 0 ]]; do
                if [[ "$1" == "--fix" ]]; then
                    FIX_MESSAGES=true
                    shift
                else
                    ARGS+=("$1")
                    shift
                fi
            done
            break
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
    COMMAND="move"
    ARGS=("5")
fi

# Main reprocessing process
main() {
    log "Message Reprocessing"
    log "Command: $COMMAND"
    log "Arguments: ${ARGS[*]}"
    log "Fix messages: $FIX_MESSAGES"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    log "Stack: $STACK_NAME"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate AWS configuration
    validate_aws_config
    
    # Get queue URLs
    get_queue_urls
    
    case $COMMAND in
        "move")
            local max_messages="${ARGS[0]:-10}"
            move_dlq_to_main "$max_messages" "$FIX_MESSAGES"
            ;;
        "backup")
            if [ ${#ARGS[@]} -eq 0 ]; then
                error "Backup file argument required"
                exit 1
            fi
            reprocess_from_backup "${ARGS[0]}" "$FIX_MESSAGES"
            ;;
        "test")
            local url="${ARGS[0]:-https://aws.amazon.com/cn/}"
            local sa="${ARGS[1]:-EdgeUp001}"
            create_test_message "$url" "$sa"
            ;;
        "validate")
            if [ ${#ARGS[@]} -eq 0 ]; then
                error "Backup file argument required"
                exit 1
            fi
            local backup_file="${ARGS[0]}"
            if [ ! -f "$backup_file" ]; then
                error "Backup file not found: $backup_file"
                exit 1
            fi
            
            log "Validating messages in backup file: $backup_file"
            local valid_count=0
            local invalid_count=0
            
            jq -c '.Messages[]' "$backup_file" | while read -r message; do
                local message_id
                message_id=$(echo "$message" | jq -r '.MessageId')
                local body
                body=$(echo "$message" | jq -r '.Body')
                
                if validate_message "$body"; then
                    ((valid_count++))
                else
                    ((invalid_count++))
                fi
            done
            
            log "Validation completed: $valid_count valid, $invalid_count invalid"
            ;;
        "purge")
            purge_dlq
            ;;
        *)
            error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
    
    success "Message reprocessing completed"
}

# Run main function
main "$@"