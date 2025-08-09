#!/bin/bash

# Frontend Build Script
# This script runs tests, builds the application, and optimizes assets for deployment

set -e  # Exit on any error

# Configuration
FRONTEND_DIR="frontend"
BUILD_DIR="$FRONTEND_DIR/dist"
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
    log "Checking prerequisites..."
    
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
    
    # Check if frontend directory exists
    if [ ! -d "$FRONTEND_DIR" ]; then
        error "Frontend directory '$FRONTEND_DIR' does not exist."
        exit 1
    fi
    
    # Check if package.json exists
    if [ ! -f "$FRONTEND_DIR/package.json" ]; then
        error "package.json not found in '$FRONTEND_DIR' directory."
        exit 1
    fi
    
    success "All prerequisites are met"
}

# Function to validate environment configuration
validate_environment() {
    log "Validating environment configuration..."
    
    # Check if .env file exists
    if [ ! -f "$FRONTEND_DIR/.env" ]; then
        warning ".env file not found in frontend directory"
        log "Creating minimal .env file for production build..."
        
        cat > "$FRONTEND_DIR/.env" << EOF
# Production Environment Configuration
VITE_APP_NAME=URL Redirection Analytics Dashboard
VITE_APP_VERSION=1.0.0
VITE_NODE_ENV=production
EOF
    fi
    
    # Validate that no hardcoded URLs exist in source files
    log "Checking for hardcoded URLs in source files..."
    
    # Check for hardcoded API URLs (excluding test files and .env)
    if grep -r "https://.*\.amazonaws\.com" "$FRONTEND_DIR/src" --exclude-dir=__tests__ --exclude="*.test.*" --exclude="*.spec.*" 2>/dev/null; then
        error "Found hardcoded AWS URLs in source files. Please use relative paths or environment variables."
        exit 1
    fi
    
    # Check for hardcoded localhost URLs (excluding test files)
    if grep -r "http://localhost" "$FRONTEND_DIR/src" --exclude-dir=__tests__ --exclude="*.test.*" --exclude="*.spec.*" 2>/dev/null; then
        warning "Found hardcoded localhost URLs in source files. These should be environment-specific."
    fi
    
    success "Environment configuration validated"
}

# Function to install dependencies
install_dependencies() {
    log "Installing frontend dependencies..."
    
    cd "$FRONTEND_DIR"
    
    # Use npm ci for builds (we need dev dependencies for linting and building)
    npm ci
    
    cd ..
    
    success "Dependencies installed"
}

# Function to run linting
run_linting() {
    log "Running ESLint..."
    
    cd "$FRONTEND_DIR"
    
    # Run linting with error reporting
    if npm run lint; then
        success "Linting passed"
    else
        error "Linting failed. Please fix the issues before building."
        exit 1
    fi
    
    cd ..
}

# Function to run type checking
run_type_checking() {
    log "Running TypeScript type checking..."
    
    cd "$FRONTEND_DIR"
    
    # Run TypeScript compiler in check mode
    if npm run type-check; then
        success "Type checking passed"
    else
        error "Type checking failed. Please fix TypeScript errors before building."
        exit 1
    fi
    
    cd ..
}

# Function to run tests
run_tests() {
    log "Running unit tests..."
    
    cd "$FRONTEND_DIR"
    
    # Run tests with coverage
    if npm run test:run; then
        success "All tests passed"
    else
        error "Tests failed. Please fix failing tests before building."
        exit 1
    fi
    
    cd ..
}

# Function to run test coverage check
check_test_coverage() {
    log "Checking test coverage..."
    
    cd "$FRONTEND_DIR"
    
    # Run tests with coverage report
    npm run test:coverage
    
    # Check if coverage directory exists
    if [ -d "coverage" ]; then
        log "Test coverage report generated in frontend/coverage/"
        
        # Extract coverage percentage (if available)
        if [ -f "coverage/coverage-final.json" ]; then
            # This would require jq to parse JSON, but we'll just log the location
            log "Coverage report available at frontend/coverage/index.html"
        fi
    fi
    
    cd ..
    
    success "Test coverage check completed"
}

# Function to clean previous build
clean_build() {
    log "Cleaning previous build..."
    
    if [ -d "$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"
        log "Removed previous build directory"
    fi
    
    success "Build directory cleaned"
}

# Function to build the application
build_application() {
    log "Building frontend application..."
    
    cd "$FRONTEND_DIR"
    
    # Set NODE_ENV for production build
    export NODE_ENV=production
    
    # Build the application - use different command based on type checking
    if [ "$SKIP_TYPECHECK" = true ]; then
        # Skip TypeScript compilation and use Vite directly
        if npx vite build; then
            success "Application built successfully (without TypeScript compilation)"
        else
            error "Build failed. Please check the build output for errors."
            exit 1
        fi
    else
        # Use full build with TypeScript compilation
        if npm run build; then
            success "Application built successfully"
        else
            error "Build failed. Please check the build output for errors."
            exit 1
        fi
    fi
    
    cd ..
}

# Function to optimize build assets
optimize_assets() {
    log "Optimizing build assets..."
    
    if [ ! -d "$BUILD_DIR" ]; then
        error "Build directory not found. Please run build first."
        exit 1
    fi
    
    # Get build size information
    log "Build size analysis:"
    du -sh "$BUILD_DIR"
    
    # List largest files in build
    log "Largest files in build:"
    find "$BUILD_DIR" -type f -exec du -h {} + | sort -rh | head -10
    
    # Check for source maps in production
    if find "$BUILD_DIR" -name "*.map" | grep -q .; then
        warning "Source maps found in production build. Consider removing them for security."
        log "Source map files:"
        find "$BUILD_DIR" -name "*.map"
    fi
    
    success "Asset optimization completed"
}

# Function to validate build output
validate_build() {
    log "Validating build output..."
    
    if [ ! -d "$BUILD_DIR" ]; then
        error "Build directory not found."
        exit 1
    fi
    
    # Check for required files
    required_files=("index.html")
    for file in "${required_files[@]}"; do
        if [ ! -f "$BUILD_DIR/$file" ]; then
            error "Required file '$file' not found in build output."
            exit 1
        fi
    done
    
    # Check that no environment secrets are in build files
    log "Checking for sensitive information in build files..."
    
    # Check for API keys or secrets (excluding source maps and common false positives)
    if grep -r "API_KEY_VALUE\|aws_secret_access_key\|AKIA[0-9A-Z]{16}" "$BUILD_DIR" --exclude="*.map" 2>/dev/null; then
        error "Found potential secrets in build files. Please review and remove them."
        exit 1
    fi
    
    # Verify that API client uses relative paths
    if grep -r "https://.*\.amazonaws\.com" "$BUILD_DIR" --exclude="*.map" 2>/dev/null; then
        error "Found hardcoded AWS URLs in build files. API client should use relative paths."
        exit 1
    fi
    
    success "Build validation passed"
}

# Function to generate build manifest
generate_build_manifest() {
    log "Generating build manifest..."
    
    # Create build info file
    BUILD_MANIFEST="$BUILD_DIR/build-manifest.json"
    
    cat > "$BUILD_MANIFEST" << EOF
{
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "environment": "$ENVIRONMENT",
  "nodeVersion": "$(node --version)",
  "npmVersion": "$(npm --version)",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "buildSize": "$(du -sh "$BUILD_DIR" | cut -f1)",
  "files": $(find "$BUILD_DIR" -type f -name "*.js" -o -name "*.css" -o -name "*.html" | wc -l)
}
EOF
    
    success "Build manifest generated: $BUILD_MANIFEST"
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Build frontend application for deployment"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV   Set environment (default: production)"
    echo "  --skip-tests           Skip running tests"
    echo "  --skip-lint            Skip linting"
    echo "  --skip-typecheck       Skip TypeScript type checking"
    echo "  --skip-coverage        Skip test coverage check"
    echo "  --clean                Clean build directory before building"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  ENVIRONMENT            Environment name (development, staging, production)"
    echo ""
    echo "Examples:"
    echo "  $0                     # Build with default settings"
    echo "  $0 -e staging          # Build for staging environment"
    echo "  $0 --skip-tests        # Build without running tests"
    echo "  $0 --clean             # Clean and build"
}

# Parse command line arguments
SKIP_TESTS=false
SKIP_LINT=false
SKIP_TYPECHECK=false
SKIP_COVERAGE=false
CLEAN_BUILD=false

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
        --skip-coverage)
            SKIP_COVERAGE=true
            shift
            ;;
        --clean)
            CLEAN_BUILD=true
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

# Main build process
main() {
    log "Starting frontend build process..."
    log "Environment: $ENVIRONMENT"
    log "Frontend directory: $FRONTEND_DIR"
    log "Build directory: $BUILD_DIR"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate environment
    validate_environment
    
    # Install dependencies
    install_dependencies
    
    # Clean build directory if requested
    if [ "$CLEAN_BUILD" = true ]; then
        clean_build
    fi
    
    # Run linting (unless skipped)
    if [ "$SKIP_LINT" = false ]; then
        run_linting
    else
        warning "Skipping linting"
    fi
    
    # Run type checking (unless skipped)
    if [ "$SKIP_TYPECHECK" = false ]; then
        run_type_checking
    else
        warning "Skipping type checking"
    fi
    
    # Run tests (unless skipped)
    if [ "$SKIP_TESTS" = false ]; then
        run_tests
        
        # Run coverage check (unless skipped)
        if [ "$SKIP_COVERAGE" = false ]; then
            check_test_coverage
        fi
    else
        warning "Skipping tests"
    fi
    
    # Build application
    build_application
    
    # Optimize assets
    optimize_assets
    
    # Validate build
    validate_build
    
    # Generate build manifest
    generate_build_manifest
    
    success "Frontend build completed successfully!"
    log "Build output: $BUILD_DIR"
    log "Build size: $(du -sh "$BUILD_DIR" | cut -f1)"
    log "Build manifest: $BUILD_DIR/build-manifest.json"
}

# Run main function
main "$@"