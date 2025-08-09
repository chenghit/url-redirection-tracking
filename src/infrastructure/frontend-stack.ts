import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { readFrontendConfig } from './config-reader';

export interface FrontendStackProps extends cdk.StackProps {
  // No backend stack dependencies - all configuration read from .env file
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Read frontend configuration to get correct API key value
    const frontendConfig = readFrontendConfig();

    // Generate a random ID for resource naming
    const randomId = Math.random().toString(36).substring(2, 8);

    // S3 bucket for static website hosting
    const websiteBucket = new s3.Bucket(this, 'FrontendWebsiteBucket', {
      bucketName: `url-redirection-frontend-${randomId}`,
      publicReadAccess: false, // Disabled for security - only CloudFront can access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true, // Enable versioning for rollback capability
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
    });

    // Origin Access Control for CloudFront to access S3
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'FrontendOriginAccessControl', {
      description: 'Origin Access Control for Frontend S3 bucket',
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    // WAF Web ACL for CloudFront - temporarily disabled due to region constraint
    // CloudFront WAF must be created in us-east-1 region, but our stack is in ap-northeast-1
    // TODO: Create separate WAF stack in us-east-1 or use cross-region stack
    let frontendWebAcl: wafv2.CfnWebACL | undefined;

    // Extract API Gateway domain from URL for custom origin
    const apiGatewayDomain = frontendConfig.apiGatewayUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    // CloudFront distribution with S3 and API Gateway origins
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: `Frontend distribution for URL redirection analytics dashboard - ${randomId}`,
      // webAclId: frontendWebAcl?.attrArn, // Temporarily disabled
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
          originAccessControl: originAccessControl,
        }),
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      additionalBehaviors: {
        '/analytics/*': {
          origin: new origins.HttpOrigin(apiGatewayDomain, {
            customHeaders: {
              'X-API-Key': frontendConfig.apiKeyValue, // Inject API key via custom header from .env file
            },
            httpsPort: 443,
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originPath: '/prod', // Include the API Gateway stage path
          }),
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
        '/health*': {
          origin: new origins.HttpOrigin(apiGatewayDomain, {
            customHeaders: {
              'X-API-Key': frontendConfig.apiKeyValue, // Inject API key via custom header from .env file
            },
            httpsPort: 443,
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originPath: '/prod', // Include the API Gateway stage path
          }),
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing support
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing support
        },
      ],
    });

    // Grant CloudFront access to S3 bucket
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipal',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [websiteBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    // CDK Outputs with "Frontend" prefix to avoid conflicts
    new cdk.CfnOutput(this, 'FrontendS3BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 bucket name for frontend static assets',
    });

    new cdk.CfnOutput(this, 'FrontendS3BucketArn', {
      value: websiteBucket.bucketArn,
      description: 'S3 bucket ARN for frontend static assets',
    });

    new cdk.CfnOutput(this, 'FrontendCloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID for frontend',
    });

    new cdk.CfnOutput(this, 'FrontendCloudFrontDistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL for frontend access',
    });

    // WAF output temporarily disabled
    // new cdk.CfnOutput(this, 'FrontendWebACLArn', {
    //   value: frontendWebAcl?.attrArn || 'WAF temporarily disabled',
    //   description: 'AWS WAF Web ACL ARN for frontend CloudFront distribution',
    // });

    new cdk.CfnOutput(this, 'FrontendOriginAccessControlId', {
      value: originAccessControl.originAccessControlId,
      description: 'Origin Access Control ID for S3 bucket access',
    });

    // Output configuration information for reference
    new cdk.CfnOutput(this, 'FrontendApiGatewayOrigin', {
      value: apiGatewayDomain,
      description: 'API Gateway domain used as CloudFront custom origin',
    });

    new cdk.CfnOutput(this, 'FrontendApiKeyId', {
      value: frontendConfig.apiKeyId,
      description: 'API Key ID used for CloudFront custom headers',
    });
  }
}