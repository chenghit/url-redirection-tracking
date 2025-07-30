#!/bin/bash

# URL Redirection Tracking - Deployment Script
# This script handles CDK deployment to ap-northeast-1 region with environment-specific configuration

set -e  # Exit on any error

# Configuration
REGION="ap-northeast-1"
PROFILE="${AWS_PROFILE:-primary}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
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
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        error "npm is not installed. Please install it first."
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

# Function to install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    if [ ! -d "node_modules" ]; then
        log "Installing npm dependencies..."
        npm install
    else
        log "Dependencies already installed, checking for updates..."
        npm ci
    fi
    
    success "Dependencies installed"
}

# Function to build the project
build_project() {
    log "Building TypeScript project..."
    
    npm run build
    
    success "Project built successfully"
}

# Function to run tests
run_tests() {
    log "Running tests..."
    
    npm test
    
    success "All tests passed"
}

# Function to synthesize CDK stack
synthesize_stack() {
    log "Synthesizing CDK stack..."
    
    # Set environment variables for CDK
    export AWS_PROFILE="$PROFILE"
    export AWS_REGION="$REGION"
    export CDK_DEFAULT_REGION="$REGION"
    export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
    
    # Synthesize the stack
    cdk synth --profile "$PROFILE" --region "$REGION"
    
    success "CDK stack synthesized successfully"
}

# Function to bootstrap CDK (if needed)
bootstrap_cdk() {
    log "Checking if CDK bootstrap is needed..."
    
    # Check if CDK is already bootstrapped in this region
    if aws cloudformation describe-stacks --stack-name CDKToolkit --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        log "CDK is already bootstrapped in region $REGION"
    else
        log "Bootstrapping CDK in region $REGION..."
        cdk bootstrap aws://$ACCOUNT_ID/$REGION --profile "$PROFILE" --region "$REGION"
        success "CDK bootstrapped successfully"
    fi
}

# Function to deploy the stack
deploy_stack() {
    log "Deploying CDK stack to $REGION..."
    
    # Set environment variables for CDK
    export AWS_PROFILE="$PROFILE"
    export AWS_REGION="$REGION"
    export CDK_DEFAULT_REGION="$REGION"
    export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
    
    # Deploy with confirmation prompt disabled for automation
    cdk deploy --profile "$PROFILE" --region "$REGION" --require-approval never
    
    success "Stack deployed successfully"
}

# Function to get stack outputs
get_stack_outputs() {
    log "Retrieving stack outputs..."
    
    # Get stack outputs
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs' \
        --output table
    
    success "Stack outputs retrieved"
}

# Function to save deployment info
save_deployment_info() {
    log "Saving deployment information..."
    
    # Create deployment info directory
    mkdir -p deployments
    
    # Create deployment info file
    DEPLOYMENT_FILE="deployments/deployment-$(date +'%Y%m%d-%H%M%S').json"
    
    cat > "$DEPLOYMENT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "environment": "$ENVIRONMENT",
  "region": "$REGION",
  "profile": "$PROFILE",
  "account_id": "$ACCOUNT_ID",
  "stack_name": "$STACK_NAME",
  "user_arn": "$USER_ARN",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF
    
    # Get stack outputs and save them
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs' \
        --output json > "deployments/outputs-$(date +'%Y%m%d-%H%M%S').json"
    
    success "Deployment information saved to $DEPLOYMENT_FILE"
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Deploy URL Redirection Tracking application to AWS"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Set environment (default: dev)"
    echo "  -p, --profile PROFILE    AWS profile to use (default: primary)"
    echo "  -r, --region REGION      AWS region (default: ap-northeast-1)"
    echo "  --skip-tests            Skip running tests before deployment"
    echo "  --skip-build            Skip building the project"
    echo "  --dry-run               Only synthesize, don't deploy"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE             AWS profile to use"
    echo "  ENVIRONMENT             Environment name"
    echo ""
    echo "Examples:"
    echo "  $0                      # Deploy with default settings"
    echo "  $0 -e prod -p production # Deploy to production"
    echo "  $0 --dry-run            # Only synthesize the stack"
}

# Parse command line arguments
SKIP_TESTS=false
SKIP_BUILD=false
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
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
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
    log "Starting deployment process..."
    log "Environment: $ENVIRONMENT"
    log "Region: $REGION"
    log "Profile: $PROFILE"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate AWS configuration
    validate_aws_config
    
    # Install dependencies
    install_dependencies
    
    # Build project (unless skipped)
    if [ "$SKIP_BUILD" = false ]; then
        build_project
    else
        warning "Skipping build step"
    fi
    
    # Run tests (unless skipped)
    if [ "$SKIP_TESTS" = false ]; then
        run_tests
    else
        warning "Skipping tests"
    fi
    
    # Synthesize stack
    synthesize_stack
    
    # If dry run, stop here
    if [ "$DRY_RUN" = true ]; then
        success "Dry run completed. Stack synthesized but not deployed."
        exit 0
    fi
    
    # Bootstrap CDK if needed
    bootstrap_cdk
    
    # Deploy stack
    deploy_stack
    
    # Get stack outputs
    get_stack_outputs
    
    # Save deployment info
    save_deployment_info
    
    success "Deployment completed successfully!"
    log "Stack name: $STACK_NAME"
    log "Region: $REGION"
    log "Environment: $ENVIRONMENT"
}

# Run main function
main "$@"