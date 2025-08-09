import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class UrlRedirectionTrackingStack extends cdk.Stack {
  public readonly apiGatewayUrl: string;
  public readonly apiKeyId: string;
  public readonly apiKeyValue: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Generate a random ID for resource naming
    const randomId = Math.random().toString(36).substring(2, 8);

    // DynamoDB table for tracking data
    const trackingTable = new dynamodb.Table(this, 'TrackingTable', {
      tableName: `url-redirection-tracking-${randomId}`,
      partitionKey: {
        name: 'tracking_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Serverless scaling
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true, // Enable backup for data protection
      },
    });

    // GSI1: source_attribution (PK) + timestamp (SK) for source-based queries
    trackingTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-SourceAttribution',
      partitionKey: {
        name: 'source_attribution',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL, // Include all attributes
    });

    // GSI2: formatted_timestamp (PK) for time-based analytics
    trackingTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-FormattedTimestamp',
      partitionKey: {
        name: 'formatted_timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL, // Include all attributes
    });

    // Dead Letter Queue for failed tracking messages (FIFO)
    const trackingDlq = new sqs.Queue(this, 'TrackingDLQ', {
      queueName: `url-tracking-dlq-${randomId}.fifo`,
      fifo: true,
      retentionPeriod: cdk.Duration.days(14), // Maximum retention period
    });

    // Main tracking queue with DLQ configuration (FIFO)
    const trackingQueue = new sqs.Queue(this, 'TrackingQueue', {
      queueName: `url-tracking-queue-${randomId}.fifo`,
      fifo: true,
      contentBasedDeduplication: true, // Enable automatic deduplication based on message body
      visibilityTimeout: cdk.Duration.seconds(30), // Matches Tracking Lambda timeout
      retentionPeriod: cdk.Duration.days(14), // Maximum retention period
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling for cost efficiency
      deadLetterQueue: {
        queue: trackingDlq,
        maxReceiveCount: 3, // Retry up to 3 times before sending to DLQ
      },
    });

    // Output the table name for reference
    new cdk.CfnOutput(this, 'TrackingTableName', {
      value: trackingTable.tableName,
      description: 'DynamoDB table name for tracking data',
    });

    new cdk.CfnOutput(this, 'TrackingTableArn', {
      value: trackingTable.tableArn,
      description: 'DynamoDB table ARN for tracking data',
    });

    // Redirection Lambda Function
    const redirectionLambda = new lambda.Function(this, 'RedirectionLambda', {
      functionName: `url-redirection-${randomId}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'lambdas/redirection/index.handler',
      code: lambda.Code.fromAsset('dist'),
      memorySize: 128, // Sufficient for URL processing
      timeout: cdk.Duration.seconds(5),
      environment: {
        TRACKING_QUEUE_URL: trackingQueue.queueUrl,
      },
    });

    // Grant redirection Lambda permission to send messages to SQS
    trackingQueue.grantSendMessages(redirectionLambda);

    // Tracking Lambda Function
    const trackingLambda = new lambda.Function(this, 'TrackingLambda', {
      functionName: `url-tracking-${randomId}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'lambdas/tracking/index.handler',
      code: lambda.Code.fromAsset('dist'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      reservedConcurrentExecutions: 5, // Control DynamoDB write capacity usage
      environment: {
        DYNAMODB_TABLE_NAME: trackingTable.tableName,
      },
    });

    // Grant tracking Lambda permissions to read from SQS and write to DynamoDB
    trackingQueue.grantConsumeMessages(trackingLambda);
    trackingTable.grantWriteData(trackingLambda);

    // Set up SQS event source mapping for tracking Lambda (FIFO queue)
    trackingLambda.addEventSource(new lambdaEventSources.SqsEventSource(trackingQueue, {
      batchSize: 10, // Process up to 10 messages per invocation
      reportBatchItemFailures: true, // Enable partial batch failure handling
      // Note: maxBatchingWindow is not supported for FIFO queues
      // For FIFO queues, messages are processed in order within each message group
    }));

    // Create API Key for analytics endpoints (before creating analytics Lambda)
    const apiKey = new apigateway.ApiKey(this, 'AnalyticsApiKey', {
      apiKeyName: `url-redirection-analytics-key-${randomId}`,
      description: 'API Key for URL redirection analytics endpoints',
    });

    // Analytics Lambda Function
    const analyticsLambda = new lambda.Function(this, 'AnalyticsLambda', {
      functionName: `url-analytics-${randomId}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'lambdas/analytics/index.handler',
      code: lambda.Code.fromAsset('dist'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DYNAMODB_TABLE_NAME: trackingTable.tableName,
      },
    });

    // Grant analytics Lambda permission to read from DynamoDB
    trackingTable.grantReadData(analyticsLambda);

    // API Gateway REST API (Regional endpoint)
    const api = new apigateway.RestApi(this, 'UrlRedirectionApi', {
      restApiName: `url-redirection-api-${randomId}`,
      description: 'URL redirection and analytics API',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL], // Regional endpoint as specified
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100, // Requests per second
        throttlingBurstLimit: 200, // Burst capacity
      },
    });

    // Create a proxy resource to handle all paths
    const proxyResource = api.root.addProxy({
      defaultIntegration: new apigateway.LambdaIntegration(redirectionLambda, {
        proxy: true, // Lambda proxy integration
        allowTestInvoke: false,
      }),
      anyMethod: false, // We'll add specific methods
    });

    // Add GET method for redirection (handles /{proxy+})
    proxyResource.addMethod('GET', new apigateway.LambdaIntegration(redirectionLambda, {
      proxy: true,
    }));

    // Create Usage Plan for API key management
    const usagePlan = new apigateway.UsagePlan(this, 'AnalyticsUsagePlan', {
      name: `url-redirection-usage-plan-${randomId}`,
      description: 'Usage plan for URL redirection analytics API',
      throttle: {
        rateLimit: 100, // requests per second
        burstLimit: 200, // burst capacity
      },
      quota: {
        limit: 10000, // requests per month
        period: apigateway.Period.MONTH,
      },
    });

    // Associate API key with usage plan
    usagePlan.addApiKey(apiKey);

    // Associate usage plan with API stage
    usagePlan.addApiStage({
      api: api,
      stage: api.deploymentStage,
    });

    // Analytics endpoints with API key protection
    const analyticsResource = api.root.addResource('analytics');
    
    // /analytics/query endpoint with API key required
    const queryResource = analyticsResource.addResource('query');
    queryResource.addMethod('GET', new apigateway.LambdaIntegration(analyticsLambda, {
      proxy: true,
    }), {
      apiKeyRequired: true, // Require API key for this endpoint
    });

    // /analytics/aggregate endpoint with API key required
    const aggregateResource = analyticsResource.addResource('aggregate');
    aggregateResource.addMethod('GET', new apigateway.LambdaIntegration(analyticsLambda, {
      proxy: true,
    }), {
      apiKeyRequired: true, // Require API key for this endpoint
    });

    // Health check endpoints (API key required)
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.LambdaIntegration(analyticsLambda, {
      proxy: true,
    }), {
      apiKeyRequired: true, // Require API key for health endpoint
    });

    // Deep health check endpoint (API key required)
    const deepHealthResource = healthResource.addResource('deep');
    deepHealthResource.addMethod('GET', new apigateway.LambdaIntegration(analyticsLambda, {
      proxy: true,
    }), {
      apiKeyRequired: true, // Require API key for deep health endpoint
    });

    // Grant API Gateway permission to invoke Lambda functions
    redirectionLambda.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
    analyticsLambda.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // AWS WAF Web ACL for security and rate limiting
    const webAcl = new wafv2.CfnWebACL(this, 'UrlRedirectionWebACL', {
      name: `url-redirection-waf-${randomId}`,
      scope: 'REGIONAL', // For API Gateway regional endpoint
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 10, // 10 requests per 5-minute window as per requirements
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
          },
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric',
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsRuleSetMetric',
          },
        },
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSetMetric',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'UrlRedirectionWebACL',
      },
    });

    // Associate WAF with API Gateway
    new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    // CloudWatch Alarms for monitoring and observability
    
    // SNS Topic for alarm notifications (optional - can be used for notifications)
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `url-redirection-alarms-${randomId}`,
      displayName: 'URL Redirection System Alarms',
    });

    // Lambda Function Error Alarms
    const redirectionErrorAlarm = new cloudwatch.Alarm(this, 'RedirectionLambdaErrorAlarm', {
      alarmName: `${redirectionLambda.functionName}-errors`,
      alarmDescription: 'Alarm for redirection Lambda function errors',
      metric: redirectionLambda.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // Alert if more than 5 errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const trackingErrorAlarm = new cloudwatch.Alarm(this, 'TrackingLambdaErrorAlarm', {
      alarmName: `${trackingLambda.functionName}-errors`,
      alarmDescription: 'Alarm for tracking Lambda function errors',
      metric: trackingLambda.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // Alert if more than 5 errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const analyticsErrorAlarm = new cloudwatch.Alarm(this, 'AnalyticsLambdaErrorAlarm', {
      alarmName: `${analyticsLambda.functionName}-errors`,
      alarmDescription: 'Alarm for analytics Lambda function errors',
      metric: analyticsLambda.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // Alert if more than 5 errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Lambda Function High Latency Alarms
    const redirectionLatencyAlarm = new cloudwatch.Alarm(this, 'RedirectionLambdaLatencyAlarm', {
      alarmName: `${redirectionLambda.functionName}-high-latency`,
      alarmDescription: 'Alarm for redirection Lambda function high latency',
      metric: redirectionLambda.metricDuration({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 2000, // Alert if average duration > 2 seconds (should be < 200ms normally)
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const trackingLatencyAlarm = new cloudwatch.Alarm(this, 'TrackingLambdaLatencyAlarm', {
      alarmName: `${trackingLambda.functionName}-high-latency`,
      alarmDescription: 'Alarm for tracking Lambda function high latency',
      metric: trackingLambda.metricDuration({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 25000, // Alert if average duration > 25 seconds (timeout is 30s)
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const analyticsLatencyAlarm = new cloudwatch.Alarm(this, 'AnalyticsLambdaLatencyAlarm', {
      alarmName: `${analyticsLambda.functionName}-high-latency`,
      alarmDescription: 'Alarm for analytics Lambda function high latency',
      metric: analyticsLambda.metricDuration({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 25000, // Alert if average duration > 25 seconds (timeout is 30s)
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // DynamoDB Throttling Alarms
    const dynamoDbThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoDbThrottleAlarm', {
      alarmName: `${trackingTable.tableName}-throttling`,
      alarmDescription: 'Alarm for DynamoDB throttling events',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: {
          TableName: trackingTable.tableName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1, // Alert on any throttling
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // SQS Queue Depth Alarm
    const sqsQueueDepthAlarm = new cloudwatch.Alarm(this, 'SqsQueueDepthAlarm', {
      alarmName: `${trackingQueue.queueName}-high-depth`,
      alarmDescription: 'Alarm for high SQS queue depth',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfVisibleMessages',
        dimensionsMap: {
          QueueName: trackingQueue.queueName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 100, // Alert if queue depth > 100 messages
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Dead Letter Queue Messages Alarm
    const dlqMessagesAlarm = new cloudwatch.Alarm(this, 'DlqMessagesAlarm', {
      alarmName: `${trackingDlq.queueName}-messages`,
      alarmDescription: 'Alarm for messages in Dead Letter Queue',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfVisibleMessages',
        dimensionsMap: {
          QueueName: trackingDlq.queueName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 0, // Alert on any messages in DLQ
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // SQS Message Age Alarm
    const sqsMessageAgeAlarm = new cloudwatch.Alarm(this, 'SqsMessageAgeAlarm', {
      alarmName: `${trackingQueue.queueName}-old-messages`,
      alarmDescription: 'Alarm for old messages in SQS queue',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateAgeOfOldestMessage',
        dimensionsMap: {
          QueueName: trackingQueue.queueName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 300, // Alert if messages are older than 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // API Gateway Error Rate Alarm
    const apiGatewayErrorAlarm = new cloudwatch.Alarm(this, 'ApiGatewayErrorAlarm', {
      alarmName: `${api.restApiName}-error-rate`,
      alarmDescription: 'Alarm for API Gateway high error rate',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: 'prod',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 10, // Alert if more than 10 4XX errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const apiGateway5xxErrorAlarm = new cloudwatch.Alarm(this, 'ApiGateway5xxErrorAlarm', {
      alarmName: `${api.restApiName}-5xx-errors`,
      alarmDescription: 'Alarm for API Gateway 5XX errors',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: 'prod',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1, // Alert on any 5XX errors
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // API Gateway High Latency Alarm
    const apiGatewayLatencyAlarm = new cloudwatch.Alarm(this, 'ApiGatewayLatencyAlarm', {
      alarmName: `${api.restApiName}-high-latency`,
      alarmDescription: 'Alarm for API Gateway high latency',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: 'prod',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 2000, // Alert if average latency > 2 seconds
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Output queue URLs for Lambda environment variables
    new cdk.CfnOutput(this, 'TrackingQueueUrl', {
      value: trackingQueue.queueUrl,
      description: 'SQS queue URL for tracking messages',
    });

    new cdk.CfnOutput(this, 'TrackingDLQUrl', {
      value: trackingDlq.queueUrl,
      description: 'SQS dead letter queue URL for failed tracking messages',
    });

    // Output Lambda function ARNs
    new cdk.CfnOutput(this, 'RedirectionLambdaArn', {
      value: redirectionLambda.functionArn,
      description: 'ARN of the redirection Lambda function',
    });

    new cdk.CfnOutput(this, 'AnalyticsLambdaArn', {
      value: analyticsLambda.functionArn,
      description: 'ARN of the analytics Lambda function',
    });

    // Output API Gateway URL
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    // Output WAF Web ACL ARN
    new cdk.CfnOutput(this, 'WebACLArn', {
      value: webAcl.attrArn,
      description: 'AWS WAF Web ACL ARN',
    });

    // Output SNS Topic ARN for alarm notifications
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for alarm notifications',
    });

    // Output alarm names for reference
    new cdk.CfnOutput(this, 'CloudWatchAlarms', {
      value: [
        redirectionErrorAlarm.alarmName,
        trackingErrorAlarm.alarmName,
        analyticsErrorAlarm.alarmName,
        redirectionLatencyAlarm.alarmName,
        trackingLatencyAlarm.alarmName,
        analyticsLatencyAlarm.alarmName,
        dynamoDbThrottleAlarm.alarmName,
        sqsQueueDepthAlarm.alarmName,
        dlqMessagesAlarm.alarmName,
        sqsMessageAgeAlarm.alarmName,
        apiGatewayErrorAlarm.alarmName,
        apiGateway5xxErrorAlarm.alarmName,
        apiGatewayLatencyAlarm.alarmName,
      ].join(','),
      description: 'CloudWatch alarm names for monitoring',
    });

    // Output API Key information
    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID for analytics endpoints',
    });

    new cdk.CfnOutput(this, 'ApiKeyArn', {
      value: apiKey.keyArn,
      description: 'API Key ARN for analytics endpoints',
    });

    new cdk.CfnOutput(this, 'ApiKeyValue', {
      value: apiKey.keyId, // Note: This is the key ID, not the actual secret value
      description: 'API Key value for CloudFront custom headers',
    });

    new cdk.CfnOutput(this, 'UsagePlanId', {
      value: usagePlan.usagePlanId,
      description: 'Usage Plan ID for API key management',
    });

    // Assign values to public properties for cross-stack references
    this.apiGatewayUrl = api.url;
    this.apiKeyId = apiKey.keyId;
    this.apiKeyValue = apiKey.keyId; // Note: This is the key ID, not the actual secret value
  }
}