#!/bin/bash

# Cross-Browser Testing Script
# Tests the Analytics Web Dashboard across multiple browsers and viewports

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_RESULTS_DIR="testing/results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$TEST_RESULTS_DIR/cross_browser_report_$TIMESTAMP.md"

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

echo -e "${BLUE}=== Analytics Dashboard Cross-Browser Testing ===${NC}"
echo "Starting comprehensive cross-browser and device testing..."
echo "Results will be saved to: $REPORT_FILE"
echo ""

# Initialize report
cat > "$REPORT_FILE" << EOF
# Cross-Browser Testing Report

**Generated:** $(date)
**Test Environment:** $(node --version), $(npm --version)

## Test Summary

EOF

# Function to run tests and capture results
run_test_suite() {
    local browser=$1
    local viewport=$2
    local test_name="$browser ($viewport)"
    
    echo -e "${YELLOW}Testing: $test_name${NC}"
    
    if [ "$viewport" != "default" ]; then
        local viewport_width=$(echo $viewport | cut -d'x' -f1)
        local viewport_height=$(echo $viewport | cut -d'x' -f2)
        viewport_config="--config viewportWidth=$viewport_width,viewportHeight=$viewport_height"
    else
        viewport_config=""
    fi
    
    # Run the test
    if npx cypress run --browser "$browser" $viewport_config --reporter json --reporter-options "output=$TEST_RESULTS_DIR/results_${browser}_${viewport//x/_}.json" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED: $test_name${NC}"
        echo "- [x] **$test_name**: PASSED" >> "$REPORT_FILE"
        return 0
    else
        echo -e "${RED}✗ FAILED: $test_name${NC}"
        echo "- [ ] **$test_name**: FAILED" >> "$REPORT_FILE"
        return 1
    fi
}

# Function to test accessibility
test_accessibility() {
    echo -e "${YELLOW}Running Accessibility Tests${NC}"
    
    if npm run cypress:run -- --spec "cypress/e2e/responsive-accessibility.cy.ts" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED: Accessibility Tests${NC}"
        echo "- [x] **Accessibility Tests**: PASSED" >> "$REPORT_FILE"
        return 0
    else
        echo -e "${RED}✗ FAILED: Accessibility Tests${NC}"
        echo "- [ ] **Accessibility Tests**: FAILED" >> "$REPORT_FILE"
        return 1
    fi
}

# Start testing
echo "## Browser Compatibility Tests" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Test counters
total_tests=0
passed_tests=0

# Desktop Browser Tests
browsers=("chrome" "firefox" "edge")
viewports=("1280x720" "1920x1080")

for browser in "${browsers[@]}"; do
    for viewport in "${viewports[@]}"; do
        total_tests=$((total_tests + 1))
        if run_test_suite "$browser" "$viewport"; then
            passed_tests=$((passed_tests + 1))
        fi
    done
done

echo "" >> "$REPORT_FILE"
echo "## Mobile Responsiveness Tests" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Mobile Viewport Tests (using Chrome for mobile simulation)
mobile_viewports=("375x667" "667x375" "768x1024" "1024x768")

for viewport in "${mobile_viewports[@]}"; do
    total_tests=$((total_tests + 1))
    if run_test_suite "chrome" "$viewport"; then
        passed_tests=$((passed_tests + 1))
    fi
done

echo "" >> "$REPORT_FILE"
echo "## Accessibility Tests" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Accessibility Tests
total_tests=$((total_tests + 1))
if test_accessibility; then
    passed_tests=$((passed_tests + 1))
fi

# Generate final report
echo "" >> "$REPORT_FILE"
echo "## Test Results Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- **Total Tests:** $total_tests" >> "$REPORT_FILE"
echo "- **Passed:** $passed_tests" >> "$REPORT_FILE"
echo "- **Failed:** $((total_tests - passed_tests))" >> "$REPORT_FILE"
echo "- **Success Rate:** $(( (passed_tests * 100) / total_tests ))%" >> "$REPORT_FILE"

# Performance Testing
echo "" >> "$REPORT_FILE"
echo "## Performance Testing" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo -e "${YELLOW}Running Performance Tests${NC}"
if command -v lighthouse &> /dev/null; then
    echo "Running Lighthouse audit..."
    lighthouse http://localhost:5173 --output html --output-path "$TEST_RESULTS_DIR/lighthouse_report_$TIMESTAMP.html" --quiet
    echo "- [x] **Lighthouse Audit**: Completed (see lighthouse_report_$TIMESTAMP.html)" >> "$REPORT_FILE"
else
    echo "- [ ] **Lighthouse Audit**: Skipped (lighthouse not installed)" >> "$REPORT_FILE"
fi

# Browser-specific notes
echo "" >> "$REPORT_FILE"
echo "## Browser-Specific Notes" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "### Chrome 90+" >> "$REPORT_FILE"
echo "- Primary target browser" >> "$REPORT_FILE"
echo "- Full feature support expected" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "### Firefox 88+" >> "$REPORT_FILE"
echo "- CSS Grid and Flexbox compatibility" >> "$REPORT_FILE"
echo "- JavaScript ES6+ feature support" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "### Edge 90+" >> "$REPORT_FILE"
echo "- Chromium-based Edge compatibility" >> "$REPORT_FILE"
echo "- Similar behavior to Chrome expected" >> "$REPORT_FILE"

# Final summary
echo ""
echo -e "${BLUE}=== Testing Complete ===${NC}"
echo "Total Tests: $total_tests"
echo "Passed: $passed_tests"
echo "Failed: $((total_tests - passed_tests))"

if [ $passed_tests -eq $total_tests ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Check the report for details.${NC}"
    exit 1
fi