// Monitoring and observability utilities for CloudWatch alarms and dashboards
import { 
  CloudWatchClient, 
  PutMetricAlarmCommand,
  ComparisonOperator,
  Statistic
} from '@aws-sdk/client-cloudwatch';
import { Logger } from './logger';
import { AWS_REGION, MONITORING } from './constants';

/**
 * Creates a CloudWatch alarm programmatically
 * @param alarmName Alarm name
 * @param metricName Metric name
 * @param namespace Metric namespace
 * @param threshold Alarm threshold
 * @param comparisonOperator Comparison operator
 * @param evaluationPeriods Number of evaluation periods
 * @param period Period in seconds
 * @param statistic Statistic to use
 * @param dimensions Metric dimensions
 * @param logger Logger instance
 */
export async function createCloudWatchAlarm(
  alarmName: string,
  metricName: string,
  namespace: string,
  threshold: number,
  comparisonOperator: ComparisonOperator | string,
  evaluationPeriods: number,
  period: number,
  statistic: Statistic | string,
  dimensions: { Name: string; Value: string }[],
  logger: Logger
): Promise<void> {
  try {
    const client = new CloudWatchClient({ 
      region: process.env.AWS_REGION || AWS_REGION 
    });

    // Convert string values to enum values if needed
    const comparisonOp = comparisonOperator as ComparisonOperator;
    const statisticValue = statistic as Statistic;

    const command = new PutMetricAlarmCommand({
      AlarmName: alarmName,
      MetricName: metricName,
      Namespace: namespace,
      Threshold: threshold,
      ComparisonOperator: comparisonOp,
      EvaluationPeriods: evaluationPeriods,
      Period: period,
      Statistic: statisticValue,
      Dimensions: dimensions,
      AlarmDescription: `Alarm for ${metricName} in ${namespace}`,
      TreatMissingData: 'notBreaching',
      ActionsEnabled: true
    });

    await client.send(command);
    
    logger.info('Created CloudWatch alarm', {
      alarm_name: alarmName,
      metric_name: metricName,
      namespace,
      threshold,
      comparison_operator: comparisonOperator
    });
  } catch (error) {
    logger.error('Failed to create CloudWatch alarm', error as Error, {
      alarm_name: alarmName,
      metric_name: metricName,
      namespace
    });
    throw error;
  }
}

/**
 * Creates standard CloudWatch alarms for Lambda functions
 * @param functionName Lambda function name
 * @param logger Logger instance
 */
export async function createLambdaAlarms(
  functionName: string,
  logger: Logger
): Promise<void> {
  try {
    // Error count alarm
    await createCloudWatchAlarm(
      `${functionName}-ErrorCount`,
      'Errors',
      'AWS/Lambda',
      MONITORING.ALARM_THRESHOLDS.LAMBDA_ERROR_COUNT,
      'GreaterThanThreshold',
      1,
      60,
      'Sum',
      [{ Name: 'FunctionName', Value: functionName }],
      logger
    );

    // Duration alarm
    await createCloudWatchAlarm(
      `${functionName}-Duration`,
      'Duration',
      'AWS/Lambda',
      MONITORING.ALARM_THRESHOLDS.LAMBDA_DURATION_MS,
      'GreaterThanThreshold',
      3,
      60,
      'p95',
      [{ Name: 'FunctionName', Value: functionName }],
      logger
    );

    // Throttles alarm
    await createCloudWatchAlarm(
      `${functionName}-Throttles`,
      'Throttles',
      'AWS/Lambda',
      0,
      'GreaterThanThreshold',
      1,
      60,
      'Sum',
      [{ Name: 'FunctionName', Value: functionName }],
      logger
    );

    logger.info('Created standard Lambda alarms', {
      function_name: functionName
    });
  } catch (error) {
    logger.error('Failed to create Lambda alarms', error as Error, {
      function_name: functionName
    });
    throw error;
  }
}

/**
 * Creates standard CloudWatch alarms for API Gateway
 * @param apiName API Gateway name
 * @param stage API Gateway stage
 * @param logger Logger instance
 */
export async function createApiGatewayAlarms(
  apiName: string,
  stage: string,
  logger: Logger
): Promise<void> {
  try {
    // 4XX error alarm
    await createCloudWatchAlarm(
      `${apiName}-${stage}-4XXError`,
      '4XXError',
      'AWS/ApiGateway',
      MONITORING.ALARM_THRESHOLDS.API_4XX_ERROR_COUNT,
      'GreaterThanThreshold',
      1,
      300,
      'Sum',
      [
        { Name: 'ApiName', Value: apiName },
        { Name: 'Stage', Value: stage }
      ],
      logger
    );

    // 5XX error alarm
    await createCloudWatchAlarm(
      `${apiName}-${stage}-5XXError`,
      '5XXError',
      'AWS/ApiGateway',
      MONITORING.ALARM_THRESHOLDS.API_5XX_ERROR_COUNT,
      'GreaterThanThreshold',
      1,
      60,
      'Sum',
      [
        { Name: 'ApiName', Value: apiName },
        { Name: 'Stage', Value: stage }
      ],
      logger
    );

    // Latency alarm
    await createCloudWatchAlarm(
      `${apiName}-${stage}-Latency`,
      'Latency',
      'AWS/ApiGateway',
      MONITORING.PERFORMANCE.REDIRECTION_TARGET_MS,
      'GreaterThanThreshold',
      3,
      60,
      'p95',
      [
        { Name: 'ApiName', Value: apiName },
        { Name: 'Stage', Value: stage }
      ],
      logger
    );

    logger.info('Created standard API Gateway alarms', {
      api_name: apiName,
      stage
    });
  } catch (error) {
    logger.error('Failed to create API Gateway alarms', error as Error, {
      api_name: apiName,
      stage
    });
    throw error;
  }
}

/**
 * Creates standard CloudWatch alarms for DynamoDB
 * @param tableName DynamoDB table name
 * @param logger Logger instance
 */
export async function createDynamoDBAlarms(
  tableName: string,
  logger: Logger
): Promise<void> {
  try {
    // Throttled requests alarm
    await createCloudWatchAlarm(
      `${tableName}-ThrottledRequests`,
      'ThrottledRequests',
      'AWS/DynamoDB',
      MONITORING.ALARM_THRESHOLDS.DYNAMODB_THROTTLED_COUNT,
      'GreaterThanThreshold',
      1,
      60,
      'Sum',
      [{ Name: 'TableName', Value: tableName }],
      logger
    );

    // System errors alarm
    await createCloudWatchAlarm(
      `${tableName}-SystemErrors`,
      'SystemErrors',
      'AWS/DynamoDB',
      0,
      'GreaterThanThreshold',
      1,
      60,
      'Sum',
      [{ Name: 'TableName', Value: tableName }],
      logger
    );

    logger.info('Created standard DynamoDB alarms', {
      table_name: tableName
    });
  } catch (error) {
    logger.error('Failed to create DynamoDB alarms', error as Error, {
      table_name: tableName
    });
    throw error;
  }
}

/**
 * Creates standard CloudWatch alarms for SQS
 * @param queueName SQS queue name
 * @param logger Logger instance
 */
export async function createSQSAlarms(
  queueName: string,
  logger: Logger
): Promise<void> {
  try {
    // DLQ message count alarm
    await createCloudWatchAlarm(
      `${queueName}-ApproximateNumberOfMessagesVisible`,
      'ApproximateNumberOfMessagesVisible',
      'AWS/SQS',
      MONITORING.ALARM_THRESHOLDS.DLQ_MESSAGE_COUNT,
      'GreaterThanThreshold',
      1,
      300,
      'Maximum',
      [{ Name: 'QueueName', Value: queueName }],
      logger
    );

    // Age of oldest message alarm
    await createCloudWatchAlarm(
      `${queueName}-ApproximateAgeOfOldestMessage`,
      'ApproximateAgeOfOldestMessage',
      'AWS/SQS',
      300, // 5 minutes
      'GreaterThanThreshold',
      1,
      300,
      'Maximum',
      [{ Name: 'QueueName', Value: queueName }],
      logger
    );

    logger.info('Created standard SQS alarms', {
      queue_name: queueName
    });
  } catch (error) {
    logger.error('Failed to create SQS alarms', error as Error, {
      queue_name: queueName
    });
    throw error;
  }
}

/**
 * Creates a correlation ID header for distributed tracing
 * @param correlationId Correlation ID
 * @returns Headers object with correlation ID
 */
export function createCorrelationHeaders(correlationId: string): Record<string, string> {
  return {
    'X-Correlation-ID': correlationId
  };
}

/**
 * Extracts correlation ID from headers or generates a new one
 * @param headers HTTP headers
 * @param defaultId Default correlation ID if not found in headers
 * @returns Correlation ID
 */
export function extractCorrelationId(headers: Record<string, string | undefined>, defaultId: string): string {
  return headers['X-Correlation-ID'] || 
         headers['x-correlation-id'] || 
         defaultId;
}