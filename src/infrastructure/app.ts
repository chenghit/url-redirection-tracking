#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UrlRedirectionTrackingStack } from './stack';
import { FrontendStack } from './frontend-stack';

const app = new cdk.App();

// Deploy backend stack first
const backendStack = new UrlRedirectionTrackingStack(app, 'UrlRedirectionTrackingStack', {
  env: {
    region: 'ap-northeast-1', // Tokyo region as specified in requirements
  },
});

// Deploy frontend stack independently - reads configuration from .env file
const frontendStack = new FrontendStack(app, 'FrontendStack', {
  env: {
    region: 'ap-northeast-1', // Tokyo region as specified in requirements
  },
});

// Configure stack dependencies - temporarily disabled for deployment
// frontendStack.addDependency(backendStack);