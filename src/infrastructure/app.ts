#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UrlRedirectionTrackingStack } from './stack';

const app = new cdk.App();
new UrlRedirectionTrackingStack(app, 'UrlRedirectionTrackingStack', {
  env: {
    region: 'ap-northeast-1', // Tokyo region as specified in requirements
  },
});