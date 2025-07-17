// Integration test setup and utilities

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { TrackingEvent } from '../shared/types';
import { AWS_REGION, DYNAMODB_TABLE_NAME } from '../shared/constants';

// Test configuration
export const TEST_CONFIG = {
  // Use local API Gateway endpoint for testing
  apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3000',
  // Use API key for analytics endpoints
  apiKey: process.env.API_KEY || 'test-api-key',
  // Test timeout in milliseconds
  timeout: 30000,
  // DynamoDB table name
  tableName: process.env.DYNAMODB_TABLE_NAME || 'url-redirection-tracking',
  // AWS region
  region: process.env.AWS_REGION || 'ap-northeast-1'
};

// DynamoDB client for verification
const client = new DynamoDBClient({ region: TEST_CONFIG.region });
export const dynamoDbClient = DynamoDBDocumentClient.from(client);

/**
 * Makes a request to the redirection endpoint
 * @param url - Destination URL to redirect to
 * @param sa - Optional source attribution
 * @returns Promise with axios response
 */
export async function makeRedirectionRequest(
  url: string,
  sa?: string,
  followRedirects: boolean = false
): Promise<AxiosResponse> {
  const config: AxiosRequestConfig = {
    validateStatus: () => true, // Don't throw on error status codes
    maxRedirects: followRedirects ? 5 : 0, // Don't follow redirects by default
    timeout: TEST_CONFIG.timeout
  };

  let endpoint = `${TEST_CONFIG.apiEndpoint}/url?url=${encodeURIComponent(url)}`;
  if (sa) {
    endpoint += `&sa=${encodeURIComponent(sa)}`;
  }

  return axios.get(endpoint, config);
}

/**
 * Makes a request to the analytics query endpoint
 * @param params - Query parameters
 * @returns Promise with axios response
 */
export async function makeAnalyticsQueryRequest(
  params: Record<string, string | number | undefined> = {}
): Promise<AxiosResponse> {
  const config: AxiosRequestConfig = {
    headers: {
      'x-api-key': TEST_CONFIG.apiKey
    },
    validateStatus: () => true,
    timeout: TEST_CONFIG.timeout,
    params
  };

  return axios.get(`${TEST_CONFIG.apiEndpoint}/analytics/query`, config);
}

/**
 * Makes a request to the analytics aggregation endpoint
 * @param params - Query parameters
 * @returns Promise with axios response
 */
export async function makeAnalyticsAggregateRequest(
  params: Record<string, string | number | undefined> = {}
): Promise<AxiosResponse> {
  const config: AxiosRequestConfig = {
    headers: {
      'x-api-key': TEST_CONFIG.apiKey
    },
    validateStatus: () => true,
    timeout: TEST_CONFIG.timeout,
    params
  };

  return axios.get(`${TEST_CONFIG.apiEndpoint}/analytics/aggregate`, config);
}

/**
 * Queries DynamoDB for tracking events by source attribution
 * @param sourceAttribution - Source attribution to filter by
 * @returns Promise with tracking events
 */
export async function queryTrackingEventsBySource(
  sourceAttribution: string
): Promise<TrackingEvent[]> {
  const command = new ScanCommand({
    TableName: TEST_CONFIG.tableName,
    FilterExpression: 'source_attribution = :sa',
    ExpressionAttributeValues: {
      ':sa': sourceAttribution
    }
  });

  const result = await dynamoDbClient.send(command);
  return (result.Items || []) as TrackingEvent[];
}

/**
 * Generates a unique source attribution for testing
 * @returns Unique source attribution string
 */
export function generateUniqueSourceAttribution(): string {
  // Generate a random 3-digit number
  const randomDigits = Math.floor(Math.random() * 900 + 100).toString();
  return `EdgeUp${randomDigits}`;
}

/**
 * Waits for a specified amount of time
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a function until it succeeds or reaches max attempts
 * @param fn - Function to retry
 * @param maxAttempts - Maximum number of attempts
 * @param delayMs - Delay between attempts in milliseconds
 * @returns Promise with the function result
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 5,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${attempt} failed: ${lastError.message}`);
      
      if (attempt < maxAttempts) {
        await wait(delayMs);
      }
    }
  }
  
  throw lastError || new Error(`Failed after ${maxAttempts} attempts`);
}