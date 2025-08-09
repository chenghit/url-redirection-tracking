#!/bin/bash

# Environment Configuration Management Script
# This script manages environment-specific configurations for different deployment stages

set -e  # Exit on any error

# Configuration
FRONTEND_DIR="frontend"
CONFIG_DIR="config"
ENVIRONMENTS=("development" "staging" "production")

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
    
    # Check if frontend directory exists
    if [ ! -d "$FRONTEND_DIR" ]; then
        error "Frontend directory '$FRONTEND_DIR' does not exist."
        exit 1
    fi
    
    # Check if config directory exists
    if [ ! -d "$CONFIG_DIR" ]; then
        log "Config directory '$CONFIG_DIR' does not exist. Creating it..."
        mkdir -p "$CONFIG_DIR"
    fi
    
    success "Prerequisites checked"
}

# Function to validate environment name
validate_environment() {
    local env="$1"
    
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${env} " ]]; then
        error "Invalid environment: $env"
        error "Valid environments: ${ENVIRONMENTS[*]}"
        exit 1
    fi
}

# Function to create environment-specific configuration
create_environment_config() {
    local environment="$1"
    
    log "Creating configuration for environment: $environment"
    
    # Create environment-specific config directory
    ENV_CONFIG_DIR="$CONFIG_DIR/$environment"
    mkdir -p "$ENV_CONFIG_DIR"
    
    # Create environment-specific .env file
    ENV_FILE="$ENV_CONFIG_DIR/.env"
    
    case $environment in
        "development")
            cat > "$ENV_FILE" << EOF
# Development Environment Configuration
VITE_APP_NAME=URL Redirection Analytics Dashboard (Dev)
VITE_APP_VERSION=1.0.0-dev
VITE_NODE_ENV=development

# API Configuration
# For development, we use the CloudFront URL if available, otherwise relative paths
VITE_CLOUDFRONT_URL=

# Development-specific settings
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=debug
VITE_ENABLE_MOCK_DATA=false

# Build settings
VITE_GENERATE_SOURCEMAP=true
VITE_MINIFY=false
EOF
            ;;
        "staging")
            cat > "$ENV_FILE" << EOF
# Staging Environment Configuration
VITE_APP_NAME=URL Redirection Analytics Dashboard (Staging)
VITE_APP_VERSION=1.0.0-staging
VITE_NODE_ENV=staging

# API Configuration
# Staging uses relative paths through CloudFront distribution
VITE_CLOUDFRONT_URL=

# Staging-specific settings
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=info
VITE_ENABLE_MOCK_DATA=false

# Build settings
VITE_GENERATE_SOURCEMAP=true
VITE_MINIFY=true
EOF
            ;;
        "production")
            cat > "$ENV_FILE" << EOF
# Production Environment Configuration
VITE_APP_NAME=URL Redirection Analytics Dashboard
VITE_APP_VERSION=1.0.0
VITE_NODE_ENV=production

# API Configuration
# Production uses relative paths through CloudFront distribution
# No hardcoded URLs - all API calls use relative paths

# Production-specific settings
VITE_DEBUG_MODE=false
VITE_LOG_LEVEL=error
VITE_ENABLE_MOCK_DATA=false

# Build settings
VITE_GENERATE_SOURCEMAP=false
VITE_MINIFY=true
EOF
            ;;
    esac
    
    success "Environment configuration created: $ENV_FILE"
}

# Function to create build configuration
create_build_config() {
    local environment="$1"
    
    log "Creating build configuration for environment: $environment"
    
    ENV_CONFIG_DIR="$CONFIG_DIR/$environment"
    BUILD_CONFIG_FILE="$ENV_CONFIG_DIR/build.json"
    
    case $environment in
        "development")
            cat > "$BUILD_CONFIG_FILE" << EOF
{
  "environment": "development",
  "minify": false,
  "sourcemap": true,
  "target": "es2020",
  "outDir": "dist-dev",
  "assetsDir": "assets",
  "rollupOptions": {
    "output": {
      "manualChunks": {
        "vendor": ["react", "react-dom"],
        "charts": ["chart.js", "react-chartjs-2"],
        "router": ["react-router-dom"]
      }
    }
  },
  "define": {
    "__DEV__": true,
    "__STAGING__": false,
    "__PROD__": false
  }
}
EOF
            ;;
        "staging")
            cat > "$BUILD_CONFIG_FILE" << EOF
{
  "environment": "staging",
  "minify": true,
  "sourcemap": true,
  "target": "es2020",
  "outDir": "dist-staging",
  "assetsDir": "assets",
  "rollupOptions": {
    "output": {
      "manualChunks": {
        "vendor": ["react", "react-dom"],
        "charts": ["chart.js", "react-chartjs-2"],
        "router": ["react-router-dom"]
      }
    }
  },
  "define": {
    "__DEV__": false,
    "__STAGING__": true,
    "__PROD__": false
  }
}
EOF
            ;;
        "production")
            cat > "$BUILD_CONFIG_FILE" << EOF
{
  "environment": "production",
  "minify": true,
  "sourcemap": false,
  "target": "es2020",
  "outDir": "dist",
  "assetsDir": "assets",
  "rollupOptions": {
    "output": {
      "manualChunks": {
        "vendor": ["react", "react-dom"],
        "charts": ["chart.js", "react-chartjs-2"],
        "router": ["react-router-dom"]
      }
    }
  },
  "define": {
    "__DEV__": false,
    "__STAGING__": false,
    "__PROD__": true
  }
}
EOF
            ;;
    esac
    
    success "Build configuration created: $BUILD_CONFIG_FILE"
}

# Function to create deployment configuration
create_deployment_config() {
    local environment="$1"
    
    log "Creating deployment configuration for environment: $environment"
    
    ENV_CONFIG_DIR="$CONFIG_DIR/$environment"
    DEPLOY_CONFIG_FILE="$ENV_CONFIG_DIR/deploy.json"
    
    case $environment in
        "development")
            cat > "$DEPLOY_CONFIG_FILE" << EOF
{
  "environment": "development",
  "aws": {
    "region": "ap-northeast-1",
    "profile": "primary",
    "stackName": "FrontendStack-Dev"
  },
  "s3": {
    "cacheControl": {
      "html": "no-cache, no-store, must-revalidate",
      "assets": "public, max-age=86400",
      "static": "public, max-age=31536000"
    }
  },
  "cloudfront": {
    "invalidateOnDeploy": true,
    "waitForInvalidation": false
  },
  "backup": {
    "enabled": true,
    "retentionDays": 7
  }
}
EOF
            ;;
        "staging")
            cat > "$DEPLOY_CONFIG_FILE" << EOF
{
  "environment": "staging",
  "aws": {
    "region": "ap-northeast-1",
    "profile": "primary",
    "stackName": "FrontendStack-Staging"
  },
  "s3": {
    "cacheControl": {
      "html": "no-cache, no-store, must-revalidate",
      "assets": "public, max-age=86400",
      "static": "public, max-age=31536000"
    }
  },
  "cloudfront": {
    "invalidateOnDeploy": true,
    "waitForInvalidation": true
  },
  "backup": {
    "enabled": true,
    "retentionDays": 30
  }
}
EOF
            ;;
        "production")
            cat > "$DEPLOY_CONFIG_FILE" << EOF
{
  "environment": "production",
  "aws": {
    "region": "ap-northeast-1",
    "profile": "primary",
    "stackName": "FrontendStack"
  },
  "s3": {
    "cacheControl": {
      "html": "no-cache, no-store, must-revalidate",
      "assets": "public, max-age=86400",
      "static": "public, max-age=31536000"
    }
  },
  "cloudfront": {
    "invalidateOnDeploy": true,
    "waitForInvalidation": true
  },
  "backup": {
    "enabled": true,
    "retentionDays": 90
  }
}
EOF
            ;;
    esac
    
    success "Deployment configuration created: $DEPLOY_CONFIG_FILE"
}

# Function to apply environment configuration
apply_environment_config() {
    local environment="$1"
    
    log "Applying configuration for environment: $environment"
    
    ENV_CONFIG_DIR="$CONFIG_DIR/$environment"
    ENV_FILE="$ENV_CONFIG_DIR/.env"
    TARGET_ENV_FILE="$FRONTEND_DIR/.env"
    
    # Check if environment config exists
    if [ ! -f "$ENV_FILE" ]; then
        error "Environment configuration not found: $ENV_FILE"
        error "Please create it first using: $0 create $environment"
        exit 1
    fi
    
    # Backup current .env file if it exists
    if [ -f "$TARGET_ENV_FILE" ]; then
        BACKUP_FILE="$TARGET_ENV_FILE.backup.$(date +'%Y%m%d-%H%M%S')"
        cp "$TARGET_ENV_FILE" "$BACKUP_FILE"
        log "Current .env file backed up to: $BACKUP_FILE"
    fi
    
    # Copy environment-specific configuration
    cp "$ENV_FILE" "$TARGET_ENV_FILE"
    
    # Add environment-specific CloudFront URL if available
    if [ -f "$FRONTEND_DIR/.env.local" ]; then
        log "Found .env.local file, merging CloudFront URL..."
        
        # Extract CloudFront URL from .env.local if it exists
        if grep -q "VITE_CLOUDFRONT_URL=" "$FRONTEND_DIR/.env.local"; then
            CLOUDFRONT_URL=$(grep "VITE_CLOUDFRONT_URL=" "$FRONTEND_DIR/.env.local" | cut -d'=' -f2)
            if [ -n "$CLOUDFRONT_URL" ] && [ "$CLOUDFRONT_URL" != "" ]; then
                # Update the CloudFront URL in the target .env file
                sed -i.bak "s|VITE_CLOUDFRONT_URL=.*|VITE_CLOUDFRONT_URL=$CLOUDFRONT_URL|" "$TARGET_ENV_FILE"
                rm "$TARGET_ENV_FILE.bak"
                log "Updated CloudFront URL: $CLOUDFRONT_URL"
            fi
        fi
    fi
    
    success "Environment configuration applied: $environment"
    log "Active configuration: $TARGET_ENV_FILE"
}

# Function to list available environments
list_environments() {
    log "Available environments:"
    
    for env in "${ENVIRONMENTS[@]}"; do
        ENV_CONFIG_DIR="$CONFIG_DIR/$env"
        if [ -d "$ENV_CONFIG_DIR" ]; then
            echo -e "  ${GREEN}✓${NC} $env (configured)"
            
            # Show configuration files
            if [ -f "$ENV_CONFIG_DIR/.env" ]; then
                echo "    - Environment variables: $ENV_CONFIG_DIR/.env"
            fi
            if [ -f "$ENV_CONFIG_DIR/build.json" ]; then
                echo "    - Build config: $ENV_CONFIG_DIR/build.json"
            fi
            if [ -f "$ENV_CONFIG_DIR/deploy.json" ]; then
                echo "    - Deploy config: $ENV_CONFIG_DIR/deploy.json"
            fi
        else
            echo -e "  ${YELLOW}○${NC} $env (not configured)"
        fi
    done
    
    # Show current active environment
    if [ -f "$FRONTEND_DIR/.env" ]; then
        CURRENT_ENV=$(grep "VITE_NODE_ENV=" "$FRONTEND_DIR/.env" | cut -d'=' -f2 2>/dev/null || echo "unknown")
        log "Current active environment: $CURRENT_ENV"
    else
        log "No active environment configuration"
    fi
}

# Function to validate environment configuration
validate_config() {
    local environment="$1"
    
    log "Validating configuration for environment: $environment"
    
    ENV_CONFIG_DIR="$CONFIG_DIR/$environment"
    
    # Check if environment directory exists
    if [ ! -d "$ENV_CONFIG_DIR" ]; then
        error "Environment configuration directory not found: $ENV_CONFIG_DIR"
        exit 1
    fi
    
    # Validate .env file
    ENV_FILE="$ENV_CONFIG_DIR/.env"
    if [ -f "$ENV_FILE" ]; then
        log "Validating environment variables..."
        
        # Check for required variables
        required_vars=("VITE_APP_NAME" "VITE_APP_VERSION" "VITE_NODE_ENV")
        for var in "${required_vars[@]}"; do
            if ! grep -q "^$var=" "$ENV_FILE"; then
                error "Required environment variable '$var' not found in $ENV_FILE"
                exit 1
            fi
        done
        
        # Check for hardcoded URLs
        if grep -q "https://.*\.amazonaws\.com" "$ENV_FILE"; then
            warning "Found hardcoded AWS URLs in environment file. Consider using relative paths."
        fi
        
        success "Environment variables validated"
    else
        error "Environment file not found: $ENV_FILE"
        exit 1
    fi
    
    # Validate build configuration
    BUILD_CONFIG_FILE="$ENV_CONFIG_DIR/build.json"
    if [ -f "$BUILD_CONFIG_FILE" ]; then
        log "Validating build configuration..."
        
        # Check if it's valid JSON
        if ! python3 -m json.tool "$BUILD_CONFIG_FILE" > /dev/null 2>&1; then
            error "Invalid JSON in build configuration: $BUILD_CONFIG_FILE"
            exit 1
        fi
        
        success "Build configuration validated"
    else
        warning "Build configuration not found: $BUILD_CONFIG_FILE"
    fi
    
    # Validate deployment configuration
    DEPLOY_CONFIG_FILE="$ENV_CONFIG_DIR/deploy.json"
    if [ -f "$DEPLOY_CONFIG_FILE" ]; then
        log "Validating deployment configuration..."
        
        # Check if it's valid JSON
        if ! python3 -m json.tool "$DEPLOY_CONFIG_FILE" > /dev/null 2>&1; then
            error "Invalid JSON in deployment configuration: $DEPLOY_CONFIG_FILE"
            exit 1
        fi
        
        success "Deployment configuration validated"
    else
        warning "Deployment configuration not found: $DEPLOY_CONFIG_FILE"
    fi
    
    success "Configuration validation completed for environment: $environment"
}

# Function to display help
show_help() {
    echo "Usage: $0 COMMAND [ENVIRONMENT] [OPTIONS]"
    echo ""
    echo "Manage environment-specific configurations for frontend deployment"
    echo ""
    echo "Commands:"
    echo "  create ENV              Create configuration for environment"
    echo "  apply ENV               Apply environment configuration"
    echo "  list                    List available environments"
    echo "  validate ENV            Validate environment configuration"
    echo "  clean ENV               Remove environment configuration"
    echo ""
    echo "Environments:"
    echo "  development             Development environment"
    echo "  staging                 Staging environment"
    echo "  production              Production environment"
    echo ""
    echo "Options:"
    echo "  --force                 Force overwrite existing configuration"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 create development   # Create development configuration"
    echo "  $0 apply production     # Apply production configuration"
    echo "  $0 list                 # List all environments"
    echo "  $0 validate staging     # Validate staging configuration"
}

# Parse command line arguments
COMMAND=""
ENVIRONMENT=""
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        create|apply|list|validate|clean)
            COMMAND="$1"
            shift
            if [[ $# -gt 0 && ! "$1" =~ ^-- ]]; then
                ENVIRONMENT="$1"
                shift
            fi
            ;;
        --force)
            FORCE=true
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

# Validate command
if [ -z "$COMMAND" ]; then
    error "No command specified"
    show_help
    exit 1
fi

# Main process
main() {
    log "Starting environment management..."
    log "Command: $COMMAND"
    
    # Check prerequisites
    check_prerequisites
    
    case $COMMAND in
        "create")
            if [ -z "$ENVIRONMENT" ]; then
                error "Environment not specified for create command"
                show_help
                exit 1
            fi
            
            validate_environment "$ENVIRONMENT"
            
            ENV_CONFIG_DIR="$CONFIG_DIR/$ENVIRONMENT"
            if [ -d "$ENV_CONFIG_DIR" ] && [ "$FORCE" = false ]; then
                error "Environment configuration already exists: $ENV_CONFIG_DIR"
                error "Use --force to overwrite"
                exit 1
            fi
            
            create_environment_config "$ENVIRONMENT"
            create_build_config "$ENVIRONMENT"
            create_deployment_config "$ENVIRONMENT"
            success "Environment configuration created: $ENVIRONMENT"
            ;;
        "apply")
            if [ -z "$ENVIRONMENT" ]; then
                error "Environment not specified for apply command"
                show_help
                exit 1
            fi
            
            validate_environment "$ENVIRONMENT"
            apply_environment_config "$ENVIRONMENT"
            ;;
        "list")
            list_environments
            ;;
        "validate")
            if [ -z "$ENVIRONMENT" ]; then
                error "Environment not specified for validate command"
                show_help
                exit 1
            fi
            
            validate_environment "$ENVIRONMENT"
            validate_config "$ENVIRONMENT"
            ;;
        "clean")
            if [ -z "$ENVIRONMENT" ]; then
                error "Environment not specified for clean command"
                show_help
                exit 1
            fi
            
            validate_environment "$ENVIRONMENT"
            
            ENV_CONFIG_DIR="$CONFIG_DIR/$ENVIRONMENT"
            if [ -d "$ENV_CONFIG_DIR" ]; then
                rm -rf "$ENV_CONFIG_DIR"
                success "Environment configuration removed: $ENVIRONMENT"
            else
                log "Environment configuration does not exist: $ENVIRONMENT"
            fi
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