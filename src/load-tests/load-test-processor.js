/**
 * Artillery.js processor functions for URL redirection load testing
 * 
 * This module provides custom functions for Artillery.js load testing scenarios:
 * - Generating valid URLs for testing
 * - Validating response times against performance requirements
 * - Collecting and reporting performance metrics
 * 
 * The load tests are designed to validate that the system meets the performance
 * requirements specified in the requirements document:
 * - Handle up to 10 requests per second
 * - Maintain response times under 300ms for redirections
 * - Scale automatically to handle traffic spikes
 * 
 * @module load-test-processor
 */

// Valid domains for URL redirection
const ALLOWED_DOMAINS = [
  'amazonaws.cn',
  'amazonaws.com',
  'amazon.com'
];

// Valid paths for testing
const VALID_PATHS = [
  '/blogs/china/new-aws-waf-antiddos-managed-rules/',
  '/blogs/aws/announcing-aws-lambda-function-urls-built-in-https-endpoints-for-single-function-microservices/',
  '/blogs/aws/amazon-dynamodb-on-demand-no-capacity-planning-and-pay-per-request-pricing/',
  '/blogs/aws/amazon-cloudwatch-logs-insights-is-now-generally-available/',
  '/blogs/aws/new-amazon-cloudwatch-container-insights/',
  '/blogs/aws/aws-lambda-adds-amazon-mq-as-an-event-source/',
  '/blogs/aws/new-for-aws-lambda-container-image-support/',
  '/blogs/aws/aws-lambda-power-tuning/',
  '/blogs/aws/new-provisioned-concurrency-for-lambda-functions/',
  '/blogs/aws/new-for-aws-lambda-1ms-billing-granularity-adds-cost-savings/'
];

// Valid source attributions
const SOURCE_ATTRIBUTIONS = [
  'EdgeUp001',
  'EdgeUp002',
  'EdgeUp003',
  'EdgeUp004',
  'EdgeUp005',
  'EdgeUp010',
  'EdgeUp020',
  'EdgeUp050',
  'EdgeUp100',
  'EdgeUp999'
];

// Performance thresholds
const PERFORMANCE = {
  TARGET_RESPONSE_TIME_MS: 300,  // Maximum acceptable response time in ms
  TARGET_RPS: 10,                // Target requests per second
  P95_TARGET_MS: 250,            // 95th percentile target in ms
  P99_TARGET_MS: 280,            // 99th percentile target in ms
  MAX_ERROR_RATE: 5              // Maximum acceptable error rate in percentage
};

// Metrics collection
const metrics = {
  responseTimes: [],
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  requestsWithinThreshold: 0,
  requestsExceedingThreshold: 0,
  startTime: Date.now(),
  scenarioCounts: {},
  // Track response times by scenario for more detailed analysis
  scenarioResponseTimes: {},
  // Track errors by type
  errorTypes: {},
  // Track response time distribution
  responseTimeDistribution: {
    '0-50ms': 0,
    '51-100ms': 0,
    '101-200ms': 0,
    '201-300ms': 0,
    '301-500ms': 0,
    '501ms+': 0
  }
};

/**
 * Generates a valid URL for testing
 * 
 * @param {Object} userContext - The user context object
 * @param {Object} events - The events object for emitting events
 * @param {Function} done - Callback to signal completion
 */
function generateValidUrl(userContext, events, done) {
  // Select a random domain from allowed domains
  const domain = ALLOWED_DOMAINS[Math.floor(Math.random() * ALLOWED_DOMAINS.length)];
  
  // Select a random path from valid paths
  const path = VALID_PATHS[Math.floor(Math.random() * VALID_PATHS.length)];
  
  // Generate the full URL
  const url = `https://aws.${domain}${path}`;
  
  // Select a random source attribution
  const sourceAttribution = SOURCE_ATTRIBUTIONS[Math.floor(Math.random() * SOURCE_ATTRIBUTIONS.length)];
  
  // Set the values in the user context for use in the scenario
  userContext.vars.url = encodeURIComponent(url);
  userContext.vars.sourceAttribution = sourceAttribution;
  userContext.vars.requestStartTime = Date.now();
  
  // Track request for metrics
  metrics.totalRequests++;
  
  // Track scenario counts
  const scenarioName = userContext._scenario ? userContext._scenario.name : 'Unknown';
  if (!metrics.scenarioCounts[scenarioName]) {
    metrics.scenarioCounts[scenarioName] = 0;
  }
  metrics.scenarioCounts[scenarioName]++;
  
  return done();
}

/**
 * Validates that the response time is under the target threshold
 * 
 * @param {Object} userContext - The user context object
 * @param {Object} events - The events object for emitting events
 * @param {Function} done - Callback to signal completion
 */
function validateResponseTime(userContext, events, done) {
  const responseTime = userContext.vars.responseTime;
  
  // Handle missing response time header
  if (!responseTime) {
    console.warn('[WARNING] Response time header missing, using calculated time');
    // Calculate response time from request start time if available
    if (userContext.vars.requestStartTime) {
      const calculatedTime = Date.now() - userContext.vars.requestStartTime;
      userContext.vars.responseTime = `${calculatedTime}`;
    } else {
      // Default to a high value to indicate a problem
      userContext.vars.responseTime = '999';
      console.warn('[WARNING] Request start time not available, using default high value');
    }
  }
  
  // Extract the numeric value from the response time header (e.g., "150ms" -> 150)
  const responseTimeMs = parseInt(userContext.vars.responseTime, 10);
  
  // Target threshold from requirements
  const targetThresholdMs = PERFORMANCE.TARGET_RESPONSE_TIME_MS;
  
  // Store the response time for metrics calculation
  metrics.responseTimes.push(responseTimeMs);
  
  // Track response time distribution
  if (responseTimeMs <= 50) {
    metrics.responseTimeDistribution['0-50ms']++;
  } else if (responseTimeMs <= 100) {
    metrics.responseTimeDistribution['51-100ms']++;
  } else if (responseTimeMs <= 200) {
    metrics.responseTimeDistribution['101-200ms']++;
  } else if (responseTimeMs <= 300) {
    metrics.responseTimeDistribution['201-300ms']++;
  } else if (responseTimeMs <= 500) {
    metrics.responseTimeDistribution['301-500ms']++;
  } else {
    metrics.responseTimeDistribution['501ms+']++;
  }
  
  // Track response times by scenario
  const scenarioName = userContext._scenario ? userContext._scenario.name : 'Unknown';
  if (!metrics.scenarioResponseTimes[scenarioName]) {
    metrics.scenarioResponseTimes[scenarioName] = [];
  }
  metrics.scenarioResponseTimes[scenarioName].push(responseTimeMs);
  
  // Track if the response was within threshold
  const withinThreshold = responseTimeMs <= targetThresholdMs;
  if (withinThreshold) {
    metrics.requestsWithinThreshold++;
  } else {
    metrics.requestsExceedingThreshold++;
    console.warn(`[WARNING] Response time ${responseTimeMs}ms exceeds target threshold of ${targetThresholdMs}ms`);
  }
  
  // Add the response time to custom metrics
  events.emit('customStat', 'response_time', responseTimeMs);
  
  // Track if the response was within threshold
  events.emit('counter', 'responses_within_threshold', withinThreshold ? 1 : 0);
  events.emit('counter', 'responses_exceeding_threshold', withinThreshold ? 0 : 1);
  
  // Track success/failure
  metrics.successfulRequests++;
  
  // Log detailed information for slow responses
  if (responseTimeMs > targetThresholdMs) {
    const redirectUrl = userContext.vars.redirectUrl || 'N/A';
    const correlationId = userContext.vars.correlationId || 'N/A';
    console.warn(`[SLOW RESPONSE] URL: ${decodeURIComponent(userContext.vars.url || '')}, ` +
                 `Time: ${responseTimeMs}ms, CorrelationID: ${correlationId}`);
  }
  
  return done();
}

/**
 * Records a failed request
 * 
 * @param {Object} userContext - The user context object
 * @param {Object} events - The events object for emitting events
 * @param {Function} done - Callback to signal completion
 */
function recordFailure(userContext, events, done) {
  metrics.failedRequests++;
  events.emit('counter', 'failed_requests', 1);
  return done();
}

/**
 * Calculates and reports performance metrics at the end of the test
 * 
 * @param {Object} userContext - The user context object
 * @param {Object} events - The events object for emitting events
 * @param {Function} done - Callback to signal completion
 */
function reportPerformanceMetrics(userContext, events, done) {
  // Sort response times for percentile calculations
  const sortedResponseTimes = [...metrics.responseTimes].sort((a, b) => a - b);
  
  // Calculate percentiles
  const p50Index = Math.floor(sortedResponseTimes.length * 0.5);
  const p95Index = Math.floor(sortedResponseTimes.length * 0.95);
  const p99Index = Math.floor(sortedResponseTimes.length * 0.99);
  
  const p50 = sortedResponseTimes[p50Index] || 0;
  const p95 = sortedResponseTimes[p95Index] || 0;
  const p99 = sortedResponseTimes[p99Index] || 0;
  
  // Calculate average
  const average = sortedResponseTimes.length > 0 
    ? sortedResponseTimes.reduce((sum, time) => sum + time, 0) / sortedResponseTimes.length 
    : 0;
  
  // Calculate response time distribution
  const responseTimeDistribution = {
    '0-50ms': 0,
    '51-100ms': 0,
    '101-200ms': 0,
    '201-300ms': 0,
    '301-500ms': 0,
    '501ms+': 0
  };
  
  // Populate response time distribution
  sortedResponseTimes.forEach(time => {
    if (time <= 50) responseTimeDistribution['0-50ms']++;
    else if (time <= 100) responseTimeDistribution['51-100ms']++;
    else if (time <= 200) responseTimeDistribution['101-200ms']++;
    else if (time <= 300) responseTimeDistribution['201-300ms']++;
    else if (time <= 500) responseTimeDistribution['301-500ms']++;
    else responseTimeDistribution['501ms+']++;
  });
  
  // Calculate test duration
  const testDuration = (Date.now() - metrics.startTime) / 1000; // in seconds
  const actualRPS = metrics.totalRequests / testDuration;
  
  // Prepare performance report
  const performanceReport = {
    testDuration: `${testDuration.toFixed(2)} seconds`,
    totalRequests: metrics.totalRequests,
    successfulRequests: metrics.successfulRequests,
    failedRequests: metrics.failedRequests,
    requestsWithinThreshold: metrics.requestsWithinThreshold,
    requestsExceedingThreshold: metrics.requestsExceedingThreshold,
    percentWithinThreshold: (metrics.requestsWithinThreshold / metrics.totalRequests * 100).toFixed(2),
    actualRPS: actualRPS.toFixed(2),
    responseTimeMetrics: {
      min: sortedResponseTimes[0] || 0,
      max: sortedResponseTimes[sortedResponseTimes.length - 1] || 0,
      average: average.toFixed(2),
      p50,
      p95,
      p99
    },
    responseTimeDistribution,
    scenarioCounts: metrics.scenarioCounts,
    performanceTargets: {
      targetResponseTime: PERFORMANCE.TARGET_RESPONSE_TIME_MS,
      targetRPS: PERFORMANCE.TARGET_RPS,
      p95Target: PERFORMANCE.P95_TARGET_MS,
      p99Target: PERFORMANCE.P99_TARGET_MS
    },
    targetsMet: {
      responseTime: average <= PERFORMANCE.TARGET_RESPONSE_TIME_MS,
      rps: actualRPS >= PERFORMANCE.TARGET_RPS,
      p95: p95 <= PERFORMANCE.P95_TARGET_MS,
      p99: p99 <= PERFORMANCE.P99_TARGET_MS,
      threshold: (metrics.requestsWithinThreshold / metrics.totalRequests * 100) >= 95
    }
  };
  
  // Log performance report
  console.log('\n========== PERFORMANCE REPORT ==========');
  console.log(JSON.stringify(performanceReport, null, 2));
  console.log('=======================================\n');
  
  // Emit performance metrics for Artillery reporting
  events.emit('customStat', 'avg_response_time', average);
  events.emit('customStat', 'p95_response_time', p95);
  events.emit('customStat', 'p99_response_time', p99);
  
  // Emit response time distribution metrics
  Object.entries(responseTimeDistribution).forEach(([bucket, count]) => {
    events.emit('customStat', `response_time_${bucket}`, count);
  });
  
  // Emit target compliance metrics
  events.emit('customStat', 'percent_within_threshold', 
    (metrics.requestsWithinThreshold / metrics.totalRequests * 100));
  
  return done();
}

module.exports = {
  generateValidUrl,
  validateResponseTime,
  recordFailure,
  reportPerformanceMetrics
};