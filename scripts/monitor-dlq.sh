#!/bin/bash

# URL Redirection Tracking - DLQ Monitoring Script
# This script monitors Dead Letter Queue messages and provides operational procedures

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

# Function to get DLQ URL from stack outputs
get_dlq_url() {
    log "Getting DLQ URL from stack outputs..."
    
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
    
    if [ -z "$DLQ_URL" ] || [ "$DLQ_URL" = "None" ]; then
        error "Could not find DLQ URL in stack outputs"
        exit 1
    fi
    
    # Extract queue name from URL
    DLQ_NAME=$(echo "$DLQ_URL" | sed 's/.*\///')
    
    log "DLQ URL: $DLQ_URL"
    log "DLQ Name: $DLQ_NAME"
    
    success "DLQ URL retrieved successfully"
}

# Function to get main queue URL from stack outputs
get_main_queue_url() {
    log "Getting main queue URL from stack outputs..."
    
    # Get main queue URL from stack outputs
    MAIN_QUEUE_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`TrackingQueueUrl`].OutputValue' \
        --output text)
    
    if [ -z "$MAIN_QUEUE_URL" ] || [ "$MAIN_QUEUE_URL" = "None" ]; then
        error "Could not find main queue URL in stack outputs"
        exit 1
    fi
    
    # Extract queue name from URL
    MAIN_QUEUE_NAME=$(echo "$MAIN_QUEUE_URL" | sed 's/.*\///')
    
    log "Main Queue URL: $MAIN_QUEUE_URL"
    log "Main Queue Name: $MAIN_QUEUE_NAME"
    
    success "Main queue URL retrieved successfully"
}

# Function to check DLQ message count
check_dlq_message_count() {
    log "Checking DLQ message count..."
    
    # Get approximate number of visible messages
    MESSAGE_COUNT=$(aws sqs get-queue-attributes \
        --queue-url "$DLQ_URL" \
        --attribute-names ApproximateNumberOfMessages \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Attributes.ApproximateNumberOfMessages' \
        --output text)
    
    # Get approximate number of not visible messages (in flight)
    IN_FLIGHT_COUNT=$(aws sqs get-queue-attributes \
        --queue-url "$DLQ_URL" \
        --attribute-names ApproximateNumberOfMessagesNotVisible \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Attributes.ApproximateNumberOfMessagesNotVisible' \
        --output text)
    
    log "Messages in DLQ: $MESSAGE_COUNT"
    log "Messages in flight: $IN_FLIGHT_COUNT"
    
    if [ "$MESSAGE_COUNT" -gt 0 ]; then
        warning "Found $MESSAGE_COUNT messages in DLQ - investigation required!"
        return 1
    else
        success "No messages in DLQ"
        return 0
    fi
}

# Function to list DLQ messages
list_dlq_messages() {
    local max_messages="${1:-10}"
    
    log "Listing up to $max_messages DLQ messages..."
    
    # Receive messages from DLQ without deleting them
    MESSAGES=$(aws sqs receive-message \
        --queue-url "$DLQ_URL" \
        --max-number-of-messages "$max_messages" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output json)
    
    if [ "$MESSAGES" = "null" ] || [ -z "$MESSAGES" ]; then
        log "No messages found in DLQ"
        return 0
    fi
    
    echo "DLQ Messages:"
    echo "============="
    
    # Parse and display messages
    echo "$MESSAGES" | jq -r '.Messages[] | "Message ID: " + .MessageId + "\nBody: " + .Body + "\nAttributes: " + (.Attributes | tostring) + "\n---"'
    
    # Count messages
    MESSAGE_COUNT=$(echo "$MESSAGES" | jq '.Messages | length')
    log "Displayed $MESSAGE_COUNT messages"
}

# Function to analyze DLQ message patterns
analyze_dlq_messages() {
    log "Analyzing DLQ message patterns..."
    
    # Get all messages for analysis
    MESSAGES=$(aws sqs receive-message \
        --queue-url "$DLQ_URL" \
        --max-number-of-messages 10 \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output json)
    
    if [ "$MESSAGES" = "null" ] || [ -z "$MESSAGES" ]; then
        log "No messages to analyze"
        return 0
    fi
    
    echo "Message Analysis:"
    echo "================="
    
    # Analyze message bodies for common patterns
    echo "$MESSAGES" | jq -r '.Messages[].Body' | while read -r body; do
        echo "Analyzing message: $body"
        
        # Check if it's valid JSON
        if echo "$body" | jq empty 2>/dev/null; then
            echo "  - Valid JSON format"
            
            # Check for required fields
            if echo "$body" | jq -e '.tracking_id' >/dev/null 2>&1; then
                echo "  - Has tracking_id"
            else
                echo "  - Missing tracking_id"
            fi
            
            if echo "$body" | jq -e '.timestamp' >/dev/null 2>&1; then
                echo "  - Has timestamp"
            else
                echo "  - Missing timestamp"
            fi
            
            if echo "$body" | jq -e '.source_attribution' >/dev/null 2>&1; then
                echo "  - Has source_attribution"
            else
                echo "  - Missing source_attribution"
            fi
            
            if echo "$body" | jq -e '.client_ip' >/dev/null 2>&1; then
                echo "  - Has client_ip"
            else
                echo "  - Missing client_ip"
            fi
            
            if echo "$body" | jq -e '.destination_url' >/dev/null 2>&1; then
                echo "  - Has destination_url"
            else
                echo "  - Missing destination_url"
            fi
        else
            echo "  - Invalid JSON format"
        fi
        
        echo "---"
    done
}

# Function to save DLQ messages to file
save_dlq_messages() {
    local output_file="${1:-dlq-messages-$(date +'%Y%m%d-%H%M%S').json}"
    
    log "Saving DLQ messages to file: $output_file"
    
    # Create directory for DLQ backups
    mkdir -p dlq-backups
    
    # Get all messages
    MESSAGES=$(aws sqs receive-message \
        --queue-url "$DLQ_URL" \
        --max-number-of-messages 10 \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output json)
    
    if [ "$MESSAGES" = "null" ] || [ -z "$MESSAGES" ]; then
        log "No messages to save"
        return 0
    fi
    
    # Save messages to file
    echo "$MESSAGES" > "dlq-backups/$output_file"
    
    # Create metadata file
    cat > "dlq-backups/metadata-$(date +'%Y%m%d-%H%M%S').json" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "dlq_url": "$DLQ_URL",
  "dlq_name": "$DLQ_NAME",
  "region": "$REGION",
  "profile": "$PROFILE",
  "message_count": $(echo "$MESSAGES" | jq '.Messages | length'),
  "backup_file": "$output_file"
}
EOF
    
    success "DLQ messages saved to dlq-backups/$output_file"
}

# Function to monitor DLQ continuously
monitor_dlq_continuous() {
    local interval="${1:-60}"
    
    log "Starting continuous DLQ monitoring (interval: ${interval}s)"
    log "Press Ctrl+C to stop monitoring"
    
    while true; do
        echo ""
        log "Checking DLQ status..."
        
        if check_dlq_message_count; then
            success "DLQ is clean"
        else
            warning "Messages found in DLQ!"
            
            # Get basic stats
            MESSAGE_COUNT=$(aws sqs get-queue-attributes \
                --queue-url "$DLQ_URL" \
                --attribute-names ApproximateNumberOfMessages \
                --profile "$PROFILE" \
                --region "$REGION" \
                --query 'Attributes.ApproximateNumberOfMessages' \
                --output text)
            
            warning "Current message count: $MESSAGE_COUNT"
            
            # Optionally save messages if count is high
            if [ "$MESSAGE_COUNT" -gt 5 ]; then
                warning "High message count detected, saving messages to backup"
                save_dlq_messages
            fi
        fi
        
        log "Waiting ${interval} seconds before next check..."
        sleep "$interval"
    done
}

# Function to get DLQ metrics from CloudWatch
get_dlq_metrics() {
    local hours="${1:-24}"
    
    log "Getting DLQ CloudWatch metrics for the last $hours hours..."
    
    # Calculate start time
    START_TIME=$(date -u -d "$hours hours ago" +"%Y-%m-%dT%H:%M:%SZ")
    END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    log "Time range: $START_TIME to $END_TIME"
    
    # Get ApproximateNumberOfVisibleMessages metric
    aws cloudwatch get-metric-statistics \
        --namespace AWS/SQS \
        --metric-name ApproximateNumberOfVisibleMessages \
        --dimensions Name=QueueName,Value="$DLQ_NAME" \
        --start-time "$START_TIME" \
        --end-time "$END_TIME" \
        --period 3600 \
        --statistics Maximum,Average \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output table
    
    # Get NumberOfMessagesSent metric
    log "Messages sent to DLQ:"
    aws cloudwatch get-metric-statistics \
        --namespace AWS/SQS \
        --metric-name NumberOfMessagesSent \
        --dimensions Name=QueueName,Value="$DLQ_NAME" \
        --start-time "$START_TIME" \
        --end-time "$END_TIME" \
        --period 3600 \
        --statistics Sum \
        --profile "$PROFILE" \
        --region "$REGION" \
        --output table
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS] COMMAND [ARGS]"
    echo ""
    echo "Monitor and manage Dead Letter Queue messages"
    echo ""
    echo "Commands:"
    echo "  check                   Check DLQ message count"
    echo "  list [MAX_MESSAGES]     List DLQ messages (default: 10)"
    echo "  analyze                 Analyze DLQ message patterns"
    echo "  save [OUTPUT_FILE]      Save DLQ messages to file"
    echo "  monitor [INTERVAL]      Monitor DLQ continuously (default: 60s)"
    echo "  metrics [HOURS]         Get CloudWatch metrics (default: 24h)"
    echo "  status                  Show overall DLQ status"
    echo ""
    echo "Options:"
    echo "  -p, --profile PROFILE   AWS profile to use (default: primary)"
    echo "  -r, --region REGION     AWS region (default: ap-northeast-1)"
    echo "  -s, --stack STACK       Stack name (default: UrlRedirectionTrackingStack)"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE             AWS profile to use"
    echo ""
    echo "Examples:"
    echo "  $0 check                # Check DLQ message count"
    echo "  $0 list 5               # List up to 5 DLQ messages"
    echo "  $0 monitor 30           # Monitor DLQ every 30 seconds"
    echo "  $0 save backup.json     # Save DLQ messages to backup.json"
    echo "  $0 metrics 12           # Get metrics for last 12 hours"
}

# Parse command line arguments
COMMAND=""
ARGS=()

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
        -h|--help)
            show_help
            exit 0
            ;;
        check|list|analyze|save|monitor|metrics|status)
            COMMAND="$1"
            shift
            # Collect remaining arguments
            while [[ $# -gt 0 ]]; do
                ARGS+=("$1")
                shift
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
    COMMAND="status"
fi

# Main monitoring process
main() {
    log "DLQ Monitoring"
    log "Command: $COMMAND"
    log "Arguments: ${ARGS[*]}"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    log "Stack: $STACK_NAME"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate AWS configuration
    validate_aws_config
    
    # Get DLQ URL
    get_dlq_url
    
    case $COMMAND in
        "check")
            check_dlq_message_count
            ;;
        "list")
            local max_messages="${ARGS[0]:-10}"
            list_dlq_messages "$max_messages"
            ;;
        "analyze")
            analyze_dlq_messages
            ;;
        "save")
            local output_file="${ARGS[0]}"
            save_dlq_messages "$output_file"
            ;;
        "monitor")
            local interval="${ARGS[0]:-60}"
            monitor_dlq_continuous "$interval"
            ;;
        "metrics")
            local hours="${ARGS[0]:-24}"
            get_dlq_metrics "$hours"
            ;;
        "status")
            check_dlq_message_count
            get_main_queue_url
            
            # Get main queue stats too
            MAIN_MESSAGE_COUNT=$(aws sqs get-queue-attributes \
                --queue-url "$MAIN_QUEUE_URL" \
                --attribute-names ApproximateNumberOfMessages \
                --profile "$PROFILE" \
                --region "$REGION" \
                --query 'Attributes.ApproximateNumberOfMessages' \
                --output text)
            
            log "Main queue message count: $MAIN_MESSAGE_COUNT"
            
            echo ""
            echo "Queue Status Summary:"
            echo "===================="
            echo "Main Queue: $MAIN_MESSAGE_COUNT messages"
            echo "DLQ: $MESSAGE_COUNT messages"
            echo "DLQ In Flight: $IN_FLIGHT_COUNT messages"
            ;;
        *)
            error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
    
    success "DLQ monitoring completed"
}

# Run main function
main "$@"