#!/usr/bin/env node
// CDK App entry point

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UrlRedirectionStack } from './lib/url-redirection-stack';

const app = new cdk.App();

new UrlRedirectionStack(app, 'UrlRedirectionStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1', // Tokyo region as specified in requirements
  },
  description: 'Serverless URL redirection and tracking application',
});

app.synth();