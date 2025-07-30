#!/bin/bash

# URL Redirection Tracking - Configuration Management Script
# This script handles environment-specific configuration management

set -e  # Exit on any error

# Configuration
REGION="ap-northeast-1"
PROFILE="${AWS_PROFILE:-primary}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
CONFIG_DIR="config"

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

# Function to create configuration directory structure
create_config_structure() {
    log "Creating configuration directory structure..."
    
    mkdir -p "$CONFIG_DIR"/{dev,staging,prod}
    mkdir -p "$CONFIG_DIR"/common
    
    success "Configuration directory structure created"
}

# Function to create default configuration files
create_default_configs() {
    log "Creating default configuration files..."
    
    # Common configuration
    cat > "$CONFIG_DIR/common/common.json" << 'EOF'
{
  "region": "ap-northeast-1",
  "stackName": "UrlRedirectionTrackingStack",
  "lambdaRuntime": "nodejs22.x",
  "allowedDomains": [
    "amazonaws.cn",
    "amazonaws.com", 
    "amazon.com"
  ],
  "sourceAttributionPattern": "^EdgeUp\\d{3}$",
  "monitoring": {
    "enableDetailedMetrics": true,
    "logRetentionDays": 30,
    "alarmNotificationEnabled": true
  },
  "waf": {
    "enableSqlInjectionProtection": true,
    "enableXssProtection": true,
    "enableKnownBadInputsProtection": true
  }
}
EOF

    # Development environment configuration
    cat > "$CONFIG_DIR/dev/config.json" << 'EOF'
{
  "environment": "dev",
  "profile": "primary",
  "lambda": {
    "redirectionMemory": 128,
    "trackingMemory": 256,
    "analyticsMemory": 256,
    "timeout": 30,
    "reservedConcurrency": 5
  },
  "dynamodb": {
    "billingMode": "PAY_PER_REQUEST",
    "pointInTimeRecovery": false,
    "removalPolicy": "DESTROY"
  },
  "sqs": {
    "visibilityTimeout": 30,
    "messageRetentionPeriod": 1209600,
    "maxReceiveCount": 3,
    "batchSize": 10
  },
  "waf": {
    "rateLimit": 100,
    "rateLimitWindow": 300
  },
  "apiGateway": {
    "throttlingRateLimit": 100,
    "throttlingBurstLimit": 200,
    "endpointType": "REGIONAL"
  },
  "monitoring": {
    "errorThreshold": 10,
    "latencyThreshold": 2000,
    "dlqAlarmThreshold": 1
  }
}
EOF

    # Staging environment configuration
    cat > "$CONFIG_DIR/staging/config.json" << 'EOF'
{
  "environment": "staging",
  "profile": "primary",
  "lambda": {
    "redirectionMemory": 256,
    "trackingMemory": 512,
    "analyticsMemory": 512,
    "timeout": 30,
    "reservedConcurrency": 10
  },
  "dynamodb": {
    "billingMode": "PAY_PER_REQUEST",
    "pointInTimeRecovery": true,
    "removalPolicy": "RETAIN"
  },
  "sqs": {
    "visibilityTimeout": 30,
    "messageRetentionPeriod": 1209600,
    "maxReceiveCount": 3,
    "batchSize": 10
  },
  "waf": {
    "rateLimit": 200,
    "rateLimitWindow": 300
  },
  "apiGateway": {
    "throttlingRateLimit": 200,
    "throttlingBurstLimit": 400,
    "endpointType": "REGIONAL"
  },
  "monitoring": {
    "errorThreshold": 5,
    "latencyThreshold": 1500,
    "dlqAlarmThreshold": 1
  }
}
EOF

    # Production environment configuration
    cat > "$CONFIG_DIR/prod/config.json" << 'EOF'
{
  "environment": "prod",
  "profile": "production",
  "lambda": {
    "redirectionMemory": 512,
    "trackingMemory": 1024,
    "analyticsMemory": 1024,
    "timeout": 30,
    "reservedConcurrency": 20
  },
  "dynamodb": {
    "billingMode": "PAY_PER_REQUEST",
    "pointInTimeRecovery": true,
    "removalPolicy": "RETAIN",
    "backupEnabled": true
  },
  "sqs": {
    "visibilityTimeout": 30,
    "messageRetentionPeriod": 1209600,
    "maxReceiveCount": 3,
    "batchSize": 10
  },
  "waf": {
    "rateLimit": 10,
    "rateLimitWindow": 300
  },
  "apiGateway": {
    "throttlingRateLimit": 1000,
    "throttlingBurstLimit": 2000,
    "endpointType": "REGIONAL"
  },
  "monitoring": {
    "errorThreshold": 3,
    "latencyThreshold": 1000,
    "dlqAlarmThreshold": 1,
    "enableDetailedMonitoring": true
  }
}
EOF

    success "Default configuration files created"
}

# Function to validate configuration
validate_config() {
    local env="$1"
    local config_file="$CONFIG_DIR/$env/config.json"
    
    log "Validating configuration for environment: $env"
    
    if [ ! -f "$config_file" ]; then
        error "Configuration file not found: $config_file"
        return 1
    fi
    
    # Check if JSON is valid
    if ! jq empty "$config_file" 2>/dev/null; then
        error "Invalid JSON in configuration file: $config_file"
        return 1
    fi
    
    # Check required fields
    local required_fields=(
        ".environment"
        ".profile"
        ".lambda.redirectionMemory"
        ".lambda.trackingMemory"
        ".lambda.analyticsMemory"
        ".dynamodb.billingMode"
        ".sqs.visibilityTimeout"
        ".waf.rateLimit"
        ".apiGateway.throttlingRateLimit"
        ".monitoring.errorThreshold"
    )
    
    for field in "${required_fields[@]}"; do
        if ! jq -e "$field" "$config_file" >/dev/null 2>&1; then
            error "Missing required field: $field in $config_file"
            return 1
        fi
    done
    
    success "Configuration validation passed for environment: $env"
}

# Function to merge configurations
merge_configs() {
    local env="$1"
    local output_file="$2"
    
    log "Merging configurations for environment: $env"
    
    local common_config="$CONFIG_DIR/common/common.json"
    local env_config="$CONFIG_DIR/$env/config.json"
    
    if [ ! -f "$common_config" ]; then
        error "Common configuration file not found: $common_config"
        return 1
    fi
    
    if [ ! -f "$env_config" ]; then
        error "Environment configuration file not found: $env_config"
        return 1
    fi
    
    # Merge common and environment-specific configurations
    jq -s '.[0] * .[1]' "$common_config" "$env_config" > "$output_file"
    
    success "Configuration merged and saved to: $output_file"
}

# Function to export configuration as environment variables
export_config_vars() {
    local env="$1"
    local config_file="$CONFIG_DIR/$env/merged-config.json"
    
    log "Exporting configuration as environment variables for: $env"
    
    if [ ! -f "$config_file" ]; then
        merge_configs "$env" "$config_file"
    fi
    
    # Export key configuration values as environment variables
    export CDK_ENVIRONMENT="$env"
    export CDK_REGION=$(jq -r '.region' "$config_file")
    export CDK_PROFILE=$(jq -r '.profile' "$config_file")
    export CDK_STACK_NAME=$(jq -r '.stackName' "$config_file")
    
    # Lambda configuration
    export CDK_LAMBDA_REDIRECTION_MEMORY=$(jq -r '.lambda.redirectionMemory' "$config_file")
    export CDK_LAMBDA_TRACKING_MEMORY=$(jq -r '.lambda.trackingMemory' "$config_file")
    export CDK_LAMBDA_ANALYTICS_MEMORY=$(jq -r '.lambda.analyticsMemory' "$config_file")
    export CDK_LAMBDA_TIMEOUT=$(jq -r '.lambda.timeout' "$config_file")
    export CDK_LAMBDA_RESERVED_CONCURRENCY=$(jq -r '.lambda.reservedConcurrency' "$config_file")
    
    # DynamoDB configuration
    export CDK_DYNAMODB_BILLING_MODE=$(jq -r '.dynamodb.billingMode' "$config_file")
    export CDK_DYNAMODB_POINT_IN_TIME_RECOVERY=$(jq -r '.dynamodb.pointInTimeRecovery' "$config_file")
    export CDK_DYNAMODB_REMOVAL_POLICY=$(jq -r '.dynamodb.removalPolicy' "$config_file")
    
    # SQS configuration
    export CDK_SQS_VISIBILITY_TIMEOUT=$(jq -r '.sqs.visibilityTimeout' "$config_file")
    export CDK_SQS_MESSAGE_RETENTION_PERIOD=$(jq -r '.sqs.messageRetentionPeriod' "$config_file")
    export CDK_SQS_MAX_RECEIVE_COUNT=$(jq -r '.sqs.maxReceiveCount' "$config_file")
    export CDK_SQS_BATCH_SIZE=$(jq -r '.sqs.batchSize' "$config_file")
    
    # WAF configuration
    export CDK_WAF_RATE_LIMIT=$(jq -r '.waf.rateLimit' "$config_file")
    export CDK_WAF_RATE_LIMIT_WINDOW=$(jq -r '.waf.rateLimitWindow' "$config_file")
    
    # API Gateway configuration
    export CDK_API_THROTTLING_RATE_LIMIT=$(jq -r '.apiGateway.throttlingRateLimit' "$config_file")
    export CDK_API_THROTTLING_BURST_LIMIT=$(jq -r '.apiGateway.throttlingBurstLimit' "$config_file")
    export CDK_API_ENDPOINT_TYPE=$(jq -r '.apiGateway.endpointType' "$config_file")
    
    # Monitoring configuration
    export CDK_MONITORING_ERROR_THRESHOLD=$(jq -r '.monitoring.errorThreshold' "$config_file")
    export CDK_MONITORING_LATENCY_THRESHOLD=$(jq -r '.monitoring.latencyThreshold' "$config_file")
    export CDK_MONITORING_DLQ_ALARM_THRESHOLD=$(jq -r '.monitoring.dlqAlarmThreshold' "$config_file")
    
    success "Configuration variables exported for environment: $env"
}

# Function to show current configuration
show_config() {
    local env="$1"
    local config_file="$CONFIG_DIR/$env/merged-config.json"
    
    log "Showing configuration for environment: $env"
    
    if [ ! -f "$config_file" ]; then
        merge_configs "$env" "$config_file"
    fi
    
    echo "Configuration for environment: $env"
    echo "=================================="
    jq '.' "$config_file"
}

# Function to compare configurations
compare_configs() {
    local env1="$1"
    local env2="$2"
    
    log "Comparing configurations: $env1 vs $env2"
    
    local config1="$CONFIG_DIR/$env1/merged-config.json"
    local config2="$CONFIG_DIR/$env2/merged-config.json"
    
    if [ ! -f "$config1" ]; then
        merge_configs "$env1" "$config1"
    fi
    
    if [ ! -f "$config2" ]; then
        merge_configs "$env2" "$config2"
    fi
    
    echo "Configuration differences between $env1 and $env2:"
    echo "=================================================="
    
    # Use diff to show differences
    if command -v colordiff &> /dev/null; then
        colordiff -u <(jq --sort-keys '.' "$config1") <(jq --sort-keys '.' "$config2") || true
    else
        diff -u <(jq --sort-keys '.' "$config1") <(jq --sort-keys '.' "$config2") || true
    fi
}

# Function to update configuration value
update_config() {
    local env="$1"
    local key="$2"
    local value="$3"
    
    log "Updating configuration for environment: $env"
    log "Key: $key, Value: $value"
    
    local config_file="$CONFIG_DIR/$env/config.json"
    
    if [ ! -f "$config_file" ]; then
        error "Configuration file not found: $config_file"
        return 1
    fi
    
    # Create backup
    cp "$config_file" "$config_file.backup.$(date +%Y%m%d-%H%M%S)"
    
    # Update the configuration
    jq --arg key "$key" --arg value "$value" 'setpath($key | split("."); $value)' "$config_file" > "$config_file.tmp"
    mv "$config_file.tmp" "$config_file"
    
    success "Configuration updated successfully"
    
    # Validate the updated configuration
    validate_config "$env"
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS] COMMAND [ARGS]"
    echo ""
    echo "Manage environment-specific configurations"
    echo ""
    echo "Commands:"
    echo "  init                    Initialize configuration structure and default files"
    echo "  validate ENV            Validate configuration for environment"
    echo "  merge ENV [OUTPUT]      Merge common and environment configs"
    echo "  export ENV              Export configuration as environment variables"
    echo "  show ENV                Show configuration for environment"
    echo "  compare ENV1 ENV2       Compare configurations between environments"
    echo "  update ENV KEY VALUE    Update configuration value"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV   Set environment (default: dev)"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environments:"
    echo "  dev                     Development environment"
    echo "  staging                 Staging environment"
    echo "  prod                    Production environment"
    echo ""
    echo "Examples:"
    echo "  $0 init                 # Initialize configuration structure"
    echo "  $0 validate dev         # Validate dev configuration"
    echo "  $0 show prod            # Show production configuration"
    echo "  $0 compare dev prod     # Compare dev and prod configs"
    echo "  $0 export staging       # Export staging config as env vars"
}

# Parse command line arguments
COMMAND=""
ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        init|validate|merge|export|show|compare|update)
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
    COMMAND="show"
    ARGS=("$ENVIRONMENT")
fi

# Main configuration management process
main() {
    log "Configuration management"
    log "Command: $COMMAND"
    log "Arguments: ${ARGS[*]}"
    
    case $COMMAND in
        "init")
            create_config_structure
            create_default_configs
            success "Configuration initialization completed!"
            ;;
        "validate")
            if [ ${#ARGS[@]} -eq 0 ]; then
                error "Environment argument required for validate command"
                exit 1
            fi
            validate_config "${ARGS[0]}"
            ;;
        "merge")
            if [ ${#ARGS[@]} -eq 0 ]; then
                error "Environment argument required for merge command"
                exit 1
            fi
            local output_file="${ARGS[1]:-$CONFIG_DIR/${ARGS[0]}/merged-config.json}"
            merge_configs "${ARGS[0]}" "$output_file"
            ;;
        "export")
            if [ ${#ARGS[@]} -eq 0 ]; then
                error "Environment argument required for export command"
                exit 1
            fi
            export_config_vars "${ARGS[0]}"
            ;;
        "show")
            if [ ${#ARGS[@]} -eq 0 ]; then
                error "Environment argument required for show command"
                exit 1
            fi
            show_config "${ARGS[0]}"
            ;;
        "compare")
            if [ ${#ARGS[@]} -lt 2 ]; then
                error "Two environment arguments required for compare command"
                exit 1
            fi
            compare_configs "${ARGS[0]}" "${ARGS[1]}"
            ;;
        "update")
            if [ ${#ARGS[@]} -lt 3 ]; then
                error "Environment, key, and value arguments required for update command"
                exit 1
            fi
            update_config "${ARGS[0]}" "${ARGS[1]}" "${ARGS[2]}"
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