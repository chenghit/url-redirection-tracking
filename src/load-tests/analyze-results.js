#!/usr/bin/env node

/**
 * Load Test Results Analyzer
 * 
 * This script analyzes Artillery.js load test results and provides a summary
 * of performance metrics against the target requirements. It validates that
 * the system meets the performance requirements specified in the requirements
 * document:
 * - Handle up to 10 requests per second
 * - Maintain response times under 300ms for redirections
 * 
 * Usage:
 *   node analyze-results.js <path-to-results-json>
 * 
 * Example:
 *   node analyze-results.js report.json
 * 
 * Exit codes:
 *   0 - All performance targets met
 *   1 - One or more performance targets not met
 *   2 - Error analyzing results (invalid file, etc.)
 */

const fs = require('fs');
const path = require('path');

// Performance thresholds
const PERFORMANCE = {
  TARGET_RESPONSE_TIME_MS: 300,
  TARGET_RPS: 10,
  P95_TARGET_MS: 250,
  P99_TARGET_MS: 280,
  MAX_ERROR_RATE: 5
};

// ANSI color codes for terminal output
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  BOLD: '\x1b[1m'
};

/**
 * Main function to analyze load test results
 */
function analyzeResults() {
  // Get the results file path from command line arguments
  const resultsFilePath = process.argv[2];
  
  if (!resultsFilePath) {
    console.error(`${COLORS.RED}${COLORS.BOLD}Error: No results file specified${COLORS.RESET}`);
    console.log('Usage: node analyze-results.js <path-to-results-json>');
    process.exit(2);
  }
  
  try {
    // Read and parse the results file
    const resultsData = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));
    
    // Extract key metrics
    const { aggregate, counters, customStats, phases, scenarios } = resultsData;
    
    if (!aggregate) {
      console.error(`${COLORS.RED}${COLORS.BOLD}Error: Invalid results file format${COLORS.RESET}`);
      process.exit(2);
    }
    
    // Calculate metrics
    const totalRequests = aggregate.requestsCompleted + aggregate.errors;
    const errorRate = (aggregate.errors / totalRequests * 100).toFixed(2);
    const rps = aggregate.rps.mean;
    const responseTimeP95 = aggregate.latency.p95;
    const responseTimeP99 = aggregate.latency.p99;
    const responseTimeMedian = aggregate.latency.median;
    const responseTimeMean = aggregate.latency.mean;
    
    // Calculate requests within threshold
    const requestsWithinThreshold = counters['responses_within_threshold'] || 0;
    const requestsExceedingThreshold = counters['responses_exceeding_threshold'] || 0;
    const percentWithinThreshold = (requestsWithinThreshold / (requestsWithinThreshold + requestsExceedingThreshold) * 100).toFixed(2);
    
    // Determine if performance targets were met
    const targetsStatus = {
      errorRate: errorRate <= PERFORMANCE.MAX_ERROR_RATE,
      rps: rps >= PERFORMANCE.TARGET_RPS,
      p95: responseTimeP95 <= PERFORMANCE.P95_TARGET_MS,
      p99: responseTimeP99 <= PERFORMANCE.P99_TARGET_MS,
      threshold: percentWithinThreshold >= 95 // At least 95% of requests should be within threshold
    };
    
    const allTargetsMet = Object.values(targetsStatus).every(status => status === true);
    
    // Print the analysis report
    console.log(`\n${COLORS.BOLD}${COLORS.CYAN}========== LOAD TEST RESULTS ANALYSIS ==========${COLORS.RESET}\n`);
    
    // Print test configuration summary
    console.log(`${COLORS.BOLD}Test Configuration:${COLORS.RESET}`);
    if (phases && phases.length > 0) {
      console.log(`- Test Duration: ${phases.reduce((sum, phase) => sum + phase.duration, 0)} seconds`);
      console.log(`- Phases: ${phases.length}`);
      phases.forEach((phase, index) => {
        console.log(`  ${index + 1}. ${phase.name || `Phase ${index + 1}`}: ${phase.duration}s at ${phase.arrivalRate || 'variable'} RPS${phase.rampTo ? ` ramping to ${phase.rampTo} RPS` : ''}`);
      });
    }
    
    console.log(`\n${COLORS.BOLD}Test Summary:${COLORS.RESET}`);
    console.log(`- Total Requests: ${totalRequests}`);
    console.log(`- Completed Requests: ${aggregate.requestsCompleted}`);
    console.log(`- Failed Requests: ${aggregate.errors}`);
    console.log(`- Error Rate: ${formatMetric(errorRate, '%', targetsStatus.errorRate)}`);
    console.log(`- Average RPS: ${formatMetric(rps.toFixed(2), 'req/sec', targetsStatus.rps)}`);
    
    // Print scenario breakdown if available
    if (scenarios && Object.keys(scenarios).length > 0) {
      console.log(`\n${COLORS.BOLD}Scenario Breakdown:${COLORS.RESET}`);
      Object.entries(scenarios).forEach(([name, data]) => {
        const scenarioCount = data.counts.completed + data.counts.failed;
        const scenarioPercentage = ((scenarioCount / totalRequests) * 100).toFixed(1);
        console.log(`- ${name}: ${scenarioCount} requests (${scenarioPercentage}%)`);
      });
    }
    
    console.log(`\n${COLORS.BOLD}Response Time Metrics:${COLORS.RESET}`);
    console.log(`- Median (P50): ${responseTimeMedian.toFixed(2)} ms`);
    console.log(`- Mean: ${responseTimeMean.toFixed(2)} ms`);
    console.log(`- 95th Percentile (P95): ${formatMetric(responseTimeP95.toFixed(2), 'ms', targetsStatus.p95)}`);
    console.log(`- 99th Percentile (P99): ${formatMetric(responseTimeP99.toFixed(2), 'ms', targetsStatus.p99)}`);
    console.log(`- Min: ${aggregate.latency.min.toFixed(2)} ms`);
    console.log(`- Max: ${aggregate.latency.max.toFixed(2)} ms`);
    
    // Create a simple ASCII histogram of response times
    const histogramBuckets = [
      { label: '0-50ms', max: 50 },
      { label: '51-100ms', max: 100 },
      { label: '101-200ms', max: 200 },
      { label: '201-300ms', max: 300 },
      { label: '301-500ms', max: 500 },
      { label: '501ms+', max: Infinity }
    ];
    
    // If we have custom response time data, create a histogram
    if (customStats && customStats.response_time && customStats.response_time.length > 0) {
      console.log(`\n${COLORS.BOLD}Response Time Distribution:${COLORS.RESET}`);
      
      // Count responses in each bucket
      const bucketCounts = histogramBuckets.map(bucket => ({
        ...bucket,
        count: customStats.response_time.filter(time => 
          time <= bucket.max && (bucket.max === 50 || time > histogramBuckets[histogramBuckets.findIndex(b => b.max === bucket.max) - 1].max)
        ).length
      }));
      
      // Find the maximum count for scaling
      const maxCount = Math.max(...bucketCounts.map(b => b.count));
      const scale = 40; // Maximum bar length
      
      // Draw the histogram
      bucketCounts.forEach(bucket => {
        const barLength = Math.round((bucket.count / maxCount) * scale) || 0;
        const bar = '█'.repeat(barLength);
        const percentage = ((bucket.count / customStats.response_time.length) * 100).toFixed(1);
        const color = bucket.max <= PERFORMANCE.TARGET_RESPONSE_TIME_MS ? COLORS.GREEN : COLORS.RED;
        console.log(`- ${bucket.label.padEnd(10)}: ${color}${bar}${COLORS.RESET} ${bucket.count} (${percentage}%)`);
      });
    }
    
    console.log(`\n${COLORS.BOLD}Performance Threshold Compliance:${COLORS.RESET}`);
    console.log(`- Requests Within ${PERFORMANCE.TARGET_RESPONSE_TIME_MS}ms: ${requestsWithinThreshold}`);
    console.log(`- Requests Exceeding ${PERFORMANCE.TARGET_RESPONSE_TIME_MS}ms: ${requestsExceedingThreshold}`);
    console.log(`- Percentage Within Threshold: ${formatMetric(percentWithinThreshold, '%', targetsStatus.threshold)}`);
    
    console.log(`\n${COLORS.BOLD}Performance Targets:${COLORS.RESET}`);
    console.log(`- Target RPS: ${PERFORMANCE.TARGET_RPS} req/sec`);
    console.log(`- Target P95: ${PERFORMANCE.P95_TARGET_MS} ms`);
    console.log(`- Target P99: ${PERFORMANCE.P99_TARGET_MS} ms`);
    console.log(`- Target Error Rate: <= ${PERFORMANCE.MAX_ERROR_RATE}%`);
    console.log(`- Target Response Time: <= ${PERFORMANCE.TARGET_RESPONSE_TIME_MS} ms`);
    
    console.log(`\n${COLORS.BOLD}Overall Result:${COLORS.RESET}`);
    if (allTargetsMet) {
      console.log(`${COLORS.GREEN}${COLORS.BOLD}✓ PASS: All performance targets met${COLORS.RESET}`);
    } else {
      console.log(`${COLORS.RED}${COLORS.BOLD}✗ FAIL: Some performance targets not met${COLORS.RESET}`);
      
      // List failed targets
      console.log(`\n${COLORS.BOLD}Failed Targets:${COLORS.RESET}`);
      if (!targetsStatus.errorRate) console.log(`- Error Rate: ${errorRate}% exceeds target of ${PERFORMANCE.MAX_ERROR_RATE}%`);
      if (!targetsStatus.rps) console.log(`- RPS: ${rps.toFixed(2)} req/sec below target of ${PERFORMANCE.TARGET_RPS} req/sec`);
      if (!targetsStatus.p95) console.log(`- P95: ${responseTimeP95.toFixed(2)} ms exceeds target of ${PERFORMANCE.P95_TARGET_MS} ms`);
      if (!targetsStatus.p99) console.log(`- P99: ${responseTimeP99.toFixed(2)} ms exceeds target of ${PERFORMANCE.P99_TARGET_MS} ms`);
      if (!targetsStatus.threshold) console.log(`- Threshold Compliance: ${percentWithinThreshold}% below target of 95%`);
    }
    
    // Add recommendations if targets not met
    if (!allTargetsMet) {
      console.log(`\n${COLORS.BOLD}${COLORS.YELLOW}Recommendations:${COLORS.RESET}`);
      if (!targetsStatus.p95 || !targetsStatus.p99) {
        console.log(`- Check Lambda function memory allocation and consider increasing it`);
        console.log(`- Review DynamoDB provisioned throughput and consider increasing it`);
        console.log(`- Analyze CloudWatch logs for any bottlenecks or errors`);
      }
      if (!targetsStatus.rps) {
        console.log(`- Check API Gateway throttling settings`);
        console.log(`- Verify Lambda concurrency limits`);
      }
      if (!targetsStatus.errorRate) {
        console.log(`- Review error logs to identify the most common error types`);
        console.log(`- Check for any API Gateway or Lambda configuration issues`);
      }
    }
    
    console.log(`\n${COLORS.CYAN}${COLORS.BOLD}=============================================${COLORS.RESET}\n`);
    
    // Exit with appropriate code
    process.exit(allTargetsMet ? 0 : 1);
    
  } catch (error) {
    console.error(`${COLORS.RED}${COLORS.BOLD}Error analyzing results: ${error.message}${COLORS.RESET}`);
    process.exit(2);
  }
}

/**
 * Format a metric with color based on whether it meets the target
 * 
 * @param {string} value - The metric value
 * @param {string} unit - The unit of measurement
 * @param {boolean} meetsTarget - Whether the metric meets the target
 * @returns {string} - Formatted metric string with color
 */
function formatMetric(value, unit, meetsTarget) {
  const color = meetsTarget ? COLORS.GREEN : COLORS.RED;
  const symbol = meetsTarget ? '✓' : '✗';
  return `${color}${value} ${unit} ${symbol}${COLORS.RESET}`;
}

// Run the analysis
analyzeResults();