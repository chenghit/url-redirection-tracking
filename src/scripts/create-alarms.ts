#!/usr/bin/env node
// Script to create CloudWatch alarms programmatically
import { createLambdaAlarms, createApiGatewayAlarms, createDynamoDBAlarms, createSQSAlarms } from '../shared/monitoring';
import { createLogger } from '../shared/logger';

async function main() {
  const logger = createLogger();
  logger.info('Starting alarm creation script');

  try {
    // Create Lambda alarms
    await createLambdaAlarms('url-redirection-RedirectionFunction', logger);
    await createLambdaAlarms('url-redirection-AnalyticsFunction', logger);
    await createLambdaAlarms('url-redirection-DLQProcessorFunction', logger);
    
    // Create API Gateway alarms
    await createApiGatewayAlarms('URL Redirection and Tracking API', 'prod', logger);
    
    // Create DynamoDB alarms
    await createDynamoDBAlarms('url-redirection-tracking', logger);
    
    // Create SQS alarms
    await createSQSAlarms('url-redirection-tracking-dlq', logger);
    
    logger.info('Successfully created all CloudWatch alarms');
  } catch (error) {
    logger.error('Failed to create CloudWatch alarms', error as Error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});