// AWS CDK Stack for URL Redirection and Tracking
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import * as path from 'path';

export class UrlRedirectionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table for tracking events
    const trackingTable = new dynamodb.Table(this, 'TrackingTable', {
      tableName: 'url-redirection-tracking',
      partitionKey: {
        name: 'tracking_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain data for permanent storage
      timeToLiveAttribute: 'ttl' // Optional TTL for data retention
    });

    // GSI1: source_attribution (PK) + timestamp (SK) for source-based queries
    trackingTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'source_attribution',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // GSI2: formatted_timestamp (PK) for time-based analytics
    trackingTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'formatted_timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Dead Letter Queue for failed tracking events
    const trackingDLQ = new sqs.Queue(this, 'TrackingDeadLetterQueue', {
      queueName: 'url-redirection-tracking-dlq',
      retentionPeriod: cdk.Duration.days(14), // Retain failed messages for 14 days
      visibilityTimeout: cdk.Duration.minutes(5),
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'TrackingDLQDeadLetter', {
          queueName: 'url-redirection-tracking-dlq-dlq',
          retentionPeriod: cdk.Duration.days(14)
        }),
        maxReceiveCount: 3
      }
    });

    // IAM Role for Lambda functions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });
    
    // Add CloudWatch metrics permissions to Lambda role
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:PutMetricData'
      ],
      resources: ['*'],
      effect: iam.Effect.ALLOW
    }));

    // Grant DynamoDB permissions to Lambda role
    trackingTable.grantReadWriteData(lambdaRole);
    
    // Grant SQS permissions to Lambda role for DLQ operations
    trackingDLQ.grantSendMessages(lambdaRole);

    // Redirection Lambda Function
    const redirectionFunction = new lambda.Function(this, 'RedirectionFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambdas/redirection')),
      role: lambdaRole,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        DYNAMODB_TABLE_NAME: trackingTable.tableName,
        TRACKING_DLQ_URL: trackingDLQ.queueUrl,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        METRICS_REGION: this.region
      },
      description: 'Handles URL redirection and tracking'
    });

    // Analytics Lambda Function
    const analyticsFunction = new lambda.Function(this, 'AnalyticsFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambdas/analytics')),
      role: lambdaRole,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DYNAMODB_TABLE_NAME: trackingTable.tableName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        METRICS_REGION: this.region
      },
      description: 'Handles analytics queries and aggregations'
    });

    // DLQ Processor Lambda Function
    const dlqProcessorFunction = new lambda.Function(this, 'DLQProcessorFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambdas/dlq-processor')),
      role: lambdaRole,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5), // Longer timeout for batch processing
      environment: {
        DYNAMODB_TABLE_NAME: trackingTable.tableName,
        TRACKING_DLQ_URL: trackingDLQ.queueUrl,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        METRICS_REGION: this.region
      },
      description: 'Processes failed tracking events from dead letter queue'
    });

    // Configure DLQ to trigger the processor function
    dlqProcessorFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(trackingDLQ, {
        batchSize: 10, // Process up to 10 messages at once
        maxBatchingWindow: cdk.Duration.seconds(5), // Wait up to 5 seconds to batch messages
        reportBatchItemFailures: true // Enable partial batch failure reporting
      })
    );

    // API Gateway REST API
    const api = new apigateway.RestApi(this, 'UrlRedirectionApi', {
      restApiName: 'URL Redirection and Tracking API',
      description: 'Serverless URL redirection with tracking capabilities',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20
      }
    });

    // API Key for analytics endpoint
    const apiKey = new apigateway.ApiKey(this, 'AnalyticsApiKey', {
      apiKeyName: 'analytics-api-key',
      description: 'API Key for accessing analytics endpoints'
    });

    // Usage Plan for API Key
    const usagePlan = new apigateway.UsagePlan(this, 'AnalyticsUsagePlan', {
      name: 'analytics-usage-plan',
      description: 'Usage plan for analytics API',
      throttle: {
        rateLimit: 10,
        burstLimit: 20
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.MONTH
      }
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      api: api,
      stage: api.deploymentStage
    });

    // Redirection endpoint (public, no authentication)
    const redirectionIntegration = new apigateway.LambdaIntegration(redirectionFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });

    // Add redirection resource - captures all paths for redirection
    const redirectionResource = api.root.addResource('{proxy+}');
    redirectionResource.addMethod('GET', redirectionIntegration, {
      requestParameters: {
        'method.request.querystring.url': true,
        'method.request.querystring.sa': false
      }
    });

    // Analytics endpoints (public with API key required)
    const analyticsIntegration = new apigateway.LambdaIntegration(analyticsFunction);
    
    const analyticsResource = api.root.addResource('analytics');
    
    // Query endpoint
    const queryResource = analyticsResource.addResource('query');
    queryResource.addMethod('GET', analyticsIntegration, {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.querystring.start_date': false,
        'method.request.querystring.end_date': false,
        'method.request.querystring.source_attribution': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.sort_order': false
      }
    });

    // Aggregate endpoint
    const aggregateResource = analyticsResource.addResource('aggregate');
    aggregateResource.addMethod('GET', analyticsIntegration, {
      apiKeyRequired: true
    });

    // Custom domain setup
    // Try to use existing wildcard certificate or create a new one
    let certificate: certificatemanager.ICertificate;
    
    // Check if certificate ARN is provided via context or environment
    const existingCertArn = this.node.tryGetContext('certificateArn');
    
    if (existingCertArn) {
      // Use existing certificate
      certificate = certificatemanager.Certificate.fromCertificateArn(
        this,
        'ExistingCertificate',
        existingCertArn
      );
    } else {
      // Create new certificate for the domain
      certificate = new certificatemanager.Certificate(this, 'ApiCertificate', {
        domainName: 'www.example.com',
        validation: certificatemanager.CertificateValidation.fromDns(),
        subjectAlternativeNames: ['*.chencch.people.aws.dev'] // Support wildcard
      });
    }

    // Custom domain for API Gateway
    const domainName = new apigateway.DomainName(this, 'ApiDomainName', {
      domainName: 'www.example.com',
      certificate: certificate,
      endpointType: apigateway.EndpointType.REGIONAL,
      securityPolicy: apigateway.SecurityPolicy.TLS_1_2
    });

    // Base path mapping
    new apigateway.BasePathMapping(this, 'ApiBasePathMapping', {
      domainName: domainName,
      restApi: api,
      stage: api.deploymentStage
    });

    // Route53 record for custom domain (optional - only if setupRoute53 context is true)
    const setupRoute53 = this.node.tryGetContext('setupRoute53');
    
    if (setupRoute53 === 'true' && this.account && this.region) {
      try {
        const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
          domainName: 'chencch.people.aws.dev'
        });

        new route53.ARecord(this, 'ApiAliasRecord', {
          zone: hostedZone,
          recordName: 'edgeup',
          target: route53.RecordTarget.fromAlias(
            new route53targets.ApiGatewayDomain(domainName)
          )
        });
      } catch (error) {
        console.warn('Route53 setup failed:', error);
      }
    }

    // Output the domain alias target for manual DNS setup
    new cdk.CfnOutput(this, 'DomainTarget', {
      value: domainName.domainNameAliasDomainName,
      description: 'API Gateway domain name for DNS CNAME/A record setup'
    });

    new cdk.CfnOutput(this, 'DnsSetupInstructions', {
      value: `Create a CNAME record: www.example.com -> ${domainName.domainNameAliasDomainName}`,
      description: 'Manual DNS setup instructions'
    });

    // AWS WAF Web ACL for security and rate limiting
    const webAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
      name: 'UrlRedirectionWebAcl', // Explicit name to avoid conflicts
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 100, // 100 requests per 5-minute window
              aggregateKeyType: 'IP'
            }
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule'
          }
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              excludedRules: [
                { name: 'SizeRestrictions_BODY' },
                { name: 'NoUserAgent_HEADER' }
              ]
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric'
          }
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsRuleSetMetric'
          }
        }
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'UrlRedirectionWebAcl'
      }
    });

    // Associate WAF with API Gateway
    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: api.arnForExecuteApi(),
      webAclArn: webAcl.attrArn
    });

    // CloudWatch Logs for Lambda Functions with log retention
    const redirectionLogGroup = new logs.LogGroup(this, 'RedirectionLogGroup', {
      logGroupName: `/aws/lambda/${redirectionFunction.functionName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const analyticsLogGroup = new logs.LogGroup(this, 'AnalyticsLogGroup', {
      logGroupName: `/aws/lambda/${analyticsFunction.functionName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const dlqProcessorLogGroup = new logs.LogGroup(this, 'DLQProcessorLogGroup', {
      logGroupName: `/aws/lambda/${dlqProcessorFunction.functionName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create SNS Topic for alarm notifications
    const alarmTopic = new sns.Topic(this, 'AlarmNotificationTopic', {
      displayName: 'URL Redirection Alarms',
      topicName: 'url-redirection-alarms'
    });

    // Optional: Add email subscription to the SNS topic (uncomment and replace with actual email)
    // alarmTopic.addSubscription(new subscriptions.EmailSubscription('your-email@example.com'));

    // CloudWatch Dashboard for monitoring
    const dashboard = new cloudwatch.Dashboard(this, 'UrlRedirectionDashboard', {
      dashboardName: 'UrlRedirectionMonitoring',
      start: '-P1D' // Start from 1 day ago
    });

    // Add Lambda metrics to dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [
          redirectionFunction.metricInvocations({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          analyticsFunction.metricInvocations({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          dlqProcessorFunction.metricInvocations({ statistic: 'Sum', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [
          redirectionFunction.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          analyticsFunction.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          dlqProcessorFunction.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      })
    );

    // Add Lambda duration metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [
          redirectionFunction.metricDuration({ statistic: 'Average', period: cdk.Duration.minutes(1) }),
          analyticsFunction.metricDuration({ statistic: 'Average', period: cdk.Duration.minutes(1) }),
          dlqProcessorFunction.metricDuration({ statistic: 'Average', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (p95)',
        left: [
          redirectionFunction.metricDuration({ statistic: 'p95', period: cdk.Duration.minutes(1) }),
          analyticsFunction.metricDuration({ statistic: 'p95', period: cdk.Duration.minutes(1) }),
          dlqProcessorFunction.metricDuration({ statistic: 'p95', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      })
    );

    // Add API Gateway metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [
          api.metricCount({ statistic: 'Sum', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Latency',
        left: [
          api.metricLatency({ statistic: 'Average', period: cdk.Duration.minutes(1) }),
          api.metricLatency({ statistic: 'p95', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      })
    );

    // Add DynamoDB metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Capacity',
        left: [
          trackingTable.metricConsumedReadCapacityUnits({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          trackingTable.metricConsumedWriteCapacityUnits({ statistic: 'Sum', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Throttled Requests',
        left: [
          trackingTable.metricThrottledRequests({ statistic: 'Sum', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      })
    );

    // Add SQS metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DLQ Messages',
        left: [
          trackingDLQ.metricNumberOfMessagesReceived({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          trackingDLQ.metricNumberOfMessagesDeleted({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          trackingDLQ.metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period: cdk.Duration.minutes(1) })
        ],
        width: 12
      })
    );

    // Add WAF metrics
    const wafMetricAllowedRequests = new cloudwatch.Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'AllowedRequests',
      dimensionsMap: {
        WebACL: 'UrlRedirectionWebAcl',
        Region: this.region
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1)
    });

    const wafMetricBlockedRequests = new cloudwatch.Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'BlockedRequests',
      dimensionsMap: {
        WebACL: 'UrlRedirectionWebAcl',
        Region: this.region
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1)
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'WAF Requests',
        left: [
          wafMetricAllowedRequests,
          wafMetricBlockedRequests
        ],
        width: 12
      })
    );

    // Create CloudWatch Alarms

    // 1. Lambda Error Rate Alarm for Redirection Function
    const redirectionErrorAlarm = new cloudwatch.Alarm(this, 'RedirectionErrorAlarm', {
      metric: redirectionFunction.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when redirection function has more than 5 errors in 1 minute',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    redirectionErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 2. Lambda Duration Alarm for Redirection Function (p95 > 300ms)
    const redirectionDurationAlarm = new cloudwatch.Alarm(this, 'RedirectionDurationAlarm', {
      metric: redirectionFunction.metricDuration({ statistic: 'p95', period: cdk.Duration.minutes(1) }),
      threshold: 300,
      evaluationPeriods: 3,
      alarmDescription: 'Alarm when redirection function p95 duration exceeds 300ms for 3 consecutive minutes',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    redirectionDurationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 3. API Gateway 4xx Error Rate Alarm
    const api4xxErrorMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '4XXError',
      dimensionsMap: {
        ApiName: api.restApiName,
        Stage: api.deploymentStage.stageName
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5)
    });
    
    const api4xxErrorAlarm = new cloudwatch.Alarm(this, 'Api4xxErrorAlarm', {
      metric: api4xxErrorMetric,
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when API Gateway has more than 10 4xx errors in 5 minutes',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    api4xxErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 4. API Gateway 5xx Error Rate Alarm
    const api5xxErrorMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: {
        ApiName: api.restApiName,
        Stage: api.deploymentStage.stageName
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1)
    });
    
    const api5xxErrorAlarm = new cloudwatch.Alarm(this, 'Api5xxErrorAlarm', {
      metric: api5xxErrorMetric,
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when API Gateway has any 5xx errors in 1 minute',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    api5xxErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 5. DynamoDB Throttled Requests Alarm
    const dynamoThrottledAlarm = new cloudwatch.Alarm(this, 'DynamoThrottledAlarm', {
      metric: trackingTable.metricThrottledRequests({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when DynamoDB has any throttled requests in 1 minute',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    dynamoThrottledAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 6. DLQ Messages Visible Alarm
    const dlqMessagesAlarm = new cloudwatch.Alarm(this, 'DlqMessagesAlarm', {
      metric: trackingDLQ.metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period: cdk.Duration.minutes(5) }),
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when DLQ has more than 10 messages visible for 5 minutes',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    dlqMessagesAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // 7. WAF Blocked Requests Alarm
    const wafBlockedRequestsAlarm = new cloudwatch.Alarm(this, 'WafBlockedRequestsAlarm', {
      metric: wafMetricBlockedRequests,
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when WAF blocks more than 10 requests in 1 minute',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    wafBlockedRequestsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'API Gateway URL'
    });

    new cdk.CfnOutput(this, 'CustomDomainUrl', {
      value: `https://www.example.com`,
      description: 'Custom domain URL'
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID for analytics endpoints'
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: trackingTable.tableName,
      description: 'DynamoDB table name for tracking events'
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: webAcl.attrArn,
      description: 'WAF Web ACL ARN'
    });

    new cdk.CfnOutput(this, 'TrackingDLQUrl', {
      value: trackingDLQ.queueUrl,
      description: 'Dead Letter Queue URL for failed tracking events'
    });
    
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=UrlRedirectionMonitoring`,
      description: 'URL Redirection Monitoring Dashboard URL'
    });
    
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch Alarms'
    });
  }
}