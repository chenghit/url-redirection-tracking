#!/bin/bash

# URL Redirection Tracking - System Monitoring Script
# This script provides comprehensive system monitoring and health checks

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
    
    # Check if curl is installed
    if ! command -v curl &> /dev/null; then
        error "curl is not installed. Please install it first."
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

# Function to get stack outputs
get_stack_outputs() {
    log "Getting stack outputs..."
    
    # Check if stack exists
    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        error "Stack '$STACK_NAME' does not exist in region '$REGION'"
        exit 1
    fi
    
    # Get API Gateway URL
    API_GATEWAY_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
        --output text)
    
    # Get DLQ URL
    DLQ_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`TrackingDLQUrl`].OutputValue' \
        --output text)
    
    # Get main queue URL
    MAIN_QUEUE_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`TrackingQueueUrl`].OutputValue' \
        --output text)
    
    # Get DynamoDB table name
    DYNAMODB_TABLE_NAME=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`TrackingTableName`].OutputValue' \
        --output text)
    
    if [ -z "$API_GATEWAY_URL" ] || [ "$API_GATEWAY_URL" = "None" ]; then
        error "Could not find API Gateway URL in stack outputs"
        exit 1
    fi
    
    log "API Gateway URL: $API_GATEWAY_URL"
    log "DLQ URL: $DLQ_URL"
    log "Main Queue URL: $MAIN_QUEUE_URL"
    log "DynamoDB Table: $DYNAMODB_TABLE_NAME"
    
    success "Stack outputs retrieved successfully"
}

# Function to check API Gateway health
check_api_gateway_health() {
    log "Checking API Gateway health..."
    
    # Test basic health endpoint
    local health_url="${API_GATEWAY_URL}health"
    log "Testing health endpoint: $health_url"
    
    local response
    local status_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$health_url" 2>/dev/null || echo "HTTPSTATUS:000")
    status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$status_code" = "200" ]; then
        success "Health endpoint is responding"
        log "Response: $body"
        
        # Parse health status
        local health_status
        health_status=$(echo "$body" | jq -r '.status' 2>/dev/null || echo "unknown")
        
        if [ "$health_status" = "healthy" ]; then
            success "System reports healthy status"
        else
            warning "System reports status: $health_status"
        fi
    else
        error "Health endpoint failed with status code: $status_code"
        if [ -n "$body" ]; then
            error "Response body: $body"
        fi
        return 1
    fi
}

# Function to check deep health
check_deep_health() {
    log "Checking deep health..."
    
    # Test deep health endpoint
    local deep_health_url="${API_GATEWAY_URL}health/deep"
    log "Testing deep health endpoint: $deep_health_url"
    
    local response
    local status_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$deep_health_url" 2>/dev/null || echo "HTTPSTATUS:000")
    status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$status_code" = "200" ]; then
        success "Deep health endpoint is responding"
        
        # Parse and display detailed health information
        if echo "$body" | jq empty 2>/dev/null; then
            echo "Deep Health Check Results:"
            echo "========================="
            
            local overall_status
            overall_status=$(echo "$body" | jq -r '.status')
            echo "Overall Status: $overall_status"
            
            local response_time
            response_time=$(echo "$body" | jq -r '.responseTime')
            echo "Response Time: ${response_time}ms"
            
            # DynamoDB check
            local dynamo_status
            dynamo_status=$(echo "$body" | jq -r '.checks.dynamodb.status')
            local dynamo_response_time
            dynamo_response_time=$(echo "$body" | jq -r '.checks.dynamodb.responseTime')
            echo "DynamoDB: $dynamo_status (${dynamo_response_time}ms)"
            
            # Memory check
            local memory_status
            memory_status=$(echo "$body" | jq -r '.checks.memory.status')
            local heap_usage
            heap_usage=$(echo "$body" | jq -r '.checks.memory.heapUsagePercent')
            echo "Memory: $memory_status (${heap_usage}% heap usage)"
            
            # Environment check
            local env_status
            env_status=$(echo "$body" | jq -r '.checks.environment.status')
            echo "Environment: $env_status"
            
            # Runtime check
            local runtime_status
            runtime_status=$(echo "$body" | jq -r '.checks.runtime.status')
            local node_version
            node_version=$(echo "$body" | jq -r '.checks.runtime.nodeVersion')
            echo "Runtime: $runtime_status (Node.js $node_version)"
            
            if [ "$overall_status" = "healthy" ]; then
                success "All deep health checks passed"
            else
                warning "Some deep health checks failed"
                return 1
            fi
        else
            log "Response: $body"
        fi
    else
        error "Deep health endpoint failed with status code: $status_code"
        if [ -n "$body" ]; then
            error "Response body: $body"
        fi
        return 1
    fi
}

# Function to check SQS queue health
check_sqs_health() {
    log "Checking SQS queue health..."
    
    # Check main queue
    if [ -n "$MAIN_QUEUE_URL" ]; then
        local main_queue_name
        main_queue_name=$(echo "$MAIN_QUEUE_URL" | sed 's/.*\///')
        
        local main_message_count
        main_message_count=$(aws sqs get-queue-attributes \
            --queue-url "$MAIN_QUEUE_URL" \
            --attribute-names ApproximateNumberOfMessages \
            --profile "$PROFILE" \
            --region "$REGION" \
            --query 'Attributes.ApproximateNumberOfMessages' \
            --output text)
        
        log "Main queue ($main_queue_name): $main_message_count messages"
        
        if [ "$main_message_count" -gt 100 ]; then
            warning "High message count in main queue: $main_message_count"
        else
            success "Main queue message count is normal"
        fi
    fi
    
    # Check DLQ
    if [ -n "$DLQ_URL" ]; then
        local dlq_name
        dlq_name=$(echo "$DLQ_URL" | sed 's/.*\///')
        
        local dlq_message_count
        dlq_message_count=$(aws sqs get-queue-attributes \
            --queue-url "$DLQ_URL" \
            --attribute-names ApproximateNumberOfMessages \
            --profile "$PROFILE" \
            --region "$REGION" \
            --query 'Attributes.ApproximateNumberOfMessages' \
            --output text)
        
        log "DLQ ($dlq_name): $dlq_message_count messages"
        
        if [ "$dlq_message_count" -gt 0 ]; then
            warning "Messages found in DLQ: $dlq_message_count"
            return 1
        else
            success "DLQ is clean"
        fi
    fi
}

# Function to check DynamoDB health
check_dynamodb_health() {
    log "Checking DynamoDB health..."
    
    if [ -n "$DYNAMODB_TABLE_NAME" ]; then
        # Get table status
        local table_status
        table_status=$(aws dynamodb describe-table \
            --table-name "$DYNAMODB_TABLE_NAME" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --query 'Table.TableStatus' \
            --output text)
        
        log "Table status: $table_status"
        
        if [ "$table_status" = "ACTIVE" ]; then
            success "DynamoDB table is active"
            
            # Get item count (approximate)
            local item_count
            item_count=$(aws dynamodb describe-table \
                --table-name "$DYNAMODB_TABLE_NAME" \
                --profile "$PROFILE" \
                --region "$REGION" \
                --query 'Table.ItemCount' \
                --output text)
            
            log "Approximate item count: $item_count"
            
            # Get table size
            local table_size
            table_size=$(aws dynamodb describe-table \
                --table-name "$DYNAMODB_TABLE_NAME" \
                --profile "$PROFILE" \
                --region "$REGION" \
                --query 'Table.TableSizeBytes' \
                --output text)
            
            local table_size_mb=$((table_size / 1024 / 1024))
            log "Table size: ${table_size_mb}MB"
            
        else
            error "DynamoDB table is not active: $table_status"
            return 1
        fi
    fi
}

# Function to check CloudWatch alarms
check_cloudwatch_alarms() {
    log "Checking CloudWatch alarms..."
    
    # Get alarm names from stack outputs
    local alarm_names
    alarm_names=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudWatchAlarms`].OutputValue' \
        --output text)
    
    if [ -n "$alarm_names" ] && [ "$alarm_names" != "None" ]; then
        # Convert comma-separated list to array
        IFS=',' read -ra ALARM_ARRAY <<< "$alarm_names"
        
        local alarm_count=0
        local alarm_states=""
        
        for alarm_name in "${ALARM_ARRAY[@]}"; do
            local alarm_state
            alarm_state=$(aws cloudwatch describe-alarms \
                --alarm-names "$alarm_name" \
                --profile "$PROFILE" \
                --region "$REGION" \
                --query 'MetricAlarms[0].StateValue' \
                --output text 2>/dev/null || echo "UNKNOWN")
            
            alarm_states="$alarm_states$alarm_name:$alarm_state "
            
            case $alarm_state in
                "OK")
                    ((alarm_count++))
                    ;;
                "ALARM")
                    warning "Alarm in ALARM state: $alarm_name"
                    ;;
                "INSUFFICIENT_DATA")
                    log "Alarm has insufficient data: $alarm_name"
                    ;;
                *)
                    warning "Unknown alarm state for $alarm_name: $alarm_state"
                    ;;
            esac
        done
        
        log "Checked ${#ALARM_ARRAY[@]} alarms, $alarm_count are OK"
        
        if [ $alarm_count -eq ${#ALARM_ARRAY[@]} ]; then
            success "All alarms are in OK state"
        else
            warning "Some alarms are not in OK state"
            return 1
        fi
    else
        log "No CloudWatch alarms found in stack outputs"
    fi
}

# Function to run comprehensive system check
run_comprehensive_check() {
    log "Running comprehensive system check..."
    
    local checks_passed=0
    local total_checks=6
    
    echo ""
    echo "System Health Check Report"
    echo "=========================="
    echo "Timestamp: $(date)"
    echo "Stack: $STACK_NAME"
    echo "Region: $REGION"
    echo ""
    
    # API Gateway Health Check
    echo "1. API Gateway Health Check"
    echo "----------------------------"
    if check_api_gateway_health; then
        ((checks_passed++))
    fi
    echo ""
    
    # Deep Health Check
    echo "2. Deep Health Check"
    echo "--------------------"
    if check_deep_health; then
        ((checks_passed++))
    fi
    echo ""
    
    # SQS Health Check
    echo "3. SQS Health Check"
    echo "-------------------"
    if check_sqs_health; then
        ((checks_passed++))
    fi
    echo ""
    
    # DynamoDB Health Check
    echo "4. DynamoDB Health Check"
    echo "------------------------"
    if check_dynamodb_health; then
        ((checks_passed++))
    fi
    echo ""
    
    # CloudWatch Alarms Check
    echo "5. CloudWatch Alarms Check"
    echo "--------------------------"
    if check_cloudwatch_alarms; then
        ((checks_passed++))
    fi
    echo ""
    
    # Overall System Status
    echo "6. Overall System Status"
    echo "------------------------"
    if [ $checks_passed -eq $total_checks ]; then
        success "All system checks passed ($checks_passed/$total_checks)"
        ((checks_passed++))
    else
        warning "Some system checks failed ($checks_passed/$total_checks)"
    fi
    echo ""
    
    # Summary
    echo "Summary"
    echo "======="
    echo "Checks passed: $checks_passed/$total_checks"
    
    if [ $checks_passed -eq $total_checks ]; then
        success "System is healthy"
        return 0
    else
        warning "System has issues that need attention"
        return 1
    fi
}

# Function to monitor system continuously
monitor_system_continuous() {
    local interval="${1:-300}"  # Default 5 minutes
    
    log "Starting continuous system monitoring (interval: ${interval}s)"
    log "Press Ctrl+C to stop monitoring"
    
    while true; do
        echo ""
        log "Running system health check..."
        
        if run_comprehensive_check; then
            success "System health check completed - all systems healthy"
        else
            warning "System health check completed - issues detected"
        fi
        
        log "Waiting ${interval} seconds before next check..."
        sleep "$interval"
    done
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS] COMMAND [ARGS]"
    echo ""
    echo "Monitor URL Redirection Tracking system health"
    echo ""
    echo "Commands:"
    echo "  check                   Run comprehensive system check"
    echo "  api                     Check API Gateway health only"
    echo "  deep                    Check deep health only"
    echo "  sqs                     Check SQS queues only"
    echo "  dynamodb                Check DynamoDB only"
    echo "  alarms                  Check CloudWatch alarms only"
    echo "  monitor [INTERVAL]      Monitor system continuously (default: 300s)"
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
    echo "  $0 check                # Run comprehensive system check"
    echo "  $0 api                  # Check API Gateway health only"
    echo "  $0 monitor 60           # Monitor system every 60 seconds"
    echo "  $0 sqs                  # Check SQS queues only"
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
        check|api|deep|sqs|dynamodb|alarms|monitor)
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
    COMMAND="check"
fi

# Main monitoring process
main() {
    log "System Monitoring"
    log "Command: $COMMAND"
    log "Arguments: ${ARGS[*]}"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    log "Stack: $STACK_NAME"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate AWS configuration
    validate_aws_config
    
    # Get stack outputs
    get_stack_outputs
    
    case $COMMAND in
        "check")
            run_comprehensive_check
            ;;
        "api")
            check_api_gateway_health
            ;;
        "deep")
            check_deep_health
            ;;
        "sqs")
            check_sqs_health
            ;;
        "dynamodb")
            check_dynamodb_health
            ;;
        "alarms")
            check_cloudwatch_alarms
            ;;
        "monitor")
            local interval="${ARGS[0]:-300}"
            monitor_system_continuous "$interval"
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