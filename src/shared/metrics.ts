// CloudWatch metrics utility for custom metrics and monitoring
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { Logger } from './logger';
import { AWS_REGION } from './constants';

export interface MetricDimension {
  Name: string;
  Value: string;
}

export interface MetricData {
  MetricName: string;
  Value: number;
  Unit: StandardUnit | string;
  Dimensions?: MetricDimension[];
  Timestamp?: Date;
}

/**
 * Publishes custom metrics to CloudWatch
 */
export async function publishMetrics(
  namespace: string,
  metrics: MetricData[],
  logger: Logger
): Promise<void> {
  try {
    const client = new CloudWatchClient({ 
      region: process.env.AWS_REGION || AWS_REGION 
    });

    const command = new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: metrics.map(metric => ({
        MetricName: metric.MetricName,
        Value: metric.Value,
        Unit: metric.Unit as StandardUnit,
        Dimensions: metric.Dimensions,
        Timestamp: metric.Timestamp || new Date()
      }))
    });

    await client.send(command);
    
    logger.debug('Published custom metrics to CloudWatch', {
      namespace,
      metric_count: metrics.length,
      metric_names: metrics.map(m => m.MetricName).join(', ')
    });
  } catch (error) {
    logger.error('Failed to publish metrics to CloudWatch', error as Error, {
      namespace,
      metric_count: metrics.length
    });
  }
}

/**
 * Creates a metric data object
 */
export function createMetric(
  name: string,
  value: number,
  unit: StandardUnit | string,
  dimensions?: Record<string, string>
): MetricData {
  return {
    MetricName: name,
    Value: value,
    Unit: unit as StandardUnit,
    Dimensions: dimensions ? 
      Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })) : 
      undefined
  };
}

/**
 * Batches metrics for efficient publishing
 * CloudWatch allows up to 20 metrics per request
 */
export function batchMetrics(metrics: MetricData[]): MetricData[][] {
  const batchSize = 20;
  const batches: MetricData[][] = [];
  
  for (let i = 0; i < metrics.length; i += batchSize) {
    batches.push(metrics.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Common metric units
 */
export const MetricUnits = {
  COUNT: 'Count',
  MILLISECONDS: 'Milliseconds',
  SECONDS: 'Seconds',
  MICROSECONDS: 'Microseconds',
  BYTES: 'Bytes',
  KILOBYTES: 'Kilobytes',
  MEGABYTES: 'Megabytes',
  GIGABYTES: 'Gigabytes',
  TERABYTES: 'Terabytes',
  BITS: 'Bits',
  KILOBITS: 'Kilobits',
  MEGABITS: 'Megabits',
  GIGABITS: 'Gigabits',
  TERABITS: 'Terabits',
  PERCENT: 'Percent',
  BYTES_PER_SECOND: 'Bytes/Second',
  KILOBYTES_PER_SECOND: 'Kilobytes/Second',
  MEGABYTES_PER_SECOND: 'Megabytes/Second',
  GIGABYTES_PER_SECOND: 'Gigabytes/Second',
  TERABYTES_PER_SECOND: 'Terabytes/Second',
  BITS_PER_SECOND: 'Bits/Second',
  KILOBITS_PER_SECOND: 'Kilobits/Second',
  MEGABITS_PER_SECOND: 'Megabits/Second',
  GIGABITS_PER_SECOND: 'Gigabits/Second',
  TERABITS_PER_SECOND: 'Terabits/Second',
  COUNT_PER_SECOND: 'Count/Second'
};

/**
 * Common metric namespaces
 */
export const MetricNamespaces = {
  URL_REDIRECTION: 'URLRedirection',
  URL_REDIRECTION_API: 'URLRedirection/API',
  URL_REDIRECTION_LAMBDA: 'URLRedirection/Lambda',
  URL_REDIRECTION_DYNAMODB: 'URLRedirection/DynamoDB',
  URL_REDIRECTION_SQS: 'URLRedirection/SQS'
} as const;

/**
 * Utility class for batching and publishing metrics
 */
export class MetricBatcher {
  private metrics: MetricData[] = [];
  private namespace: string;
  private logger: Logger;
  private flushInterval: NodeJS.Timeout | null = null;
  private flushIntervalMs: number;

  constructor(namespace: string, logger: Logger, flushIntervalMs: number = 60000) {
    this.namespace = namespace;
    this.logger = logger;
    this.flushIntervalMs = flushIntervalMs;
    
    // Start automatic flushing if in Lambda environment
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      this.startAutoFlush();
    }
  }

  /**
   * Adds a metric to the batch
   */
  addMetric(name: string, value: number, unit: StandardUnit | string, dimensions?: Record<string, string>): void {
    this.metrics.push(createMetric(name, value, unit, dimensions));
  }

  /**
   * Publishes all batched metrics and clears the batch
   */
  async flush(): Promise<void> {
    if (this.metrics.length === 0) {
      return;
    }

    const metricBatches = batchMetrics([...this.metrics]);
    this.metrics = [];
    
    try {
      await Promise.all(
        metricBatches.map(batch => publishMetrics(this.namespace, batch, this.logger))
      );
      
      this.logger.debug('Flushed metric batches', {
        namespace: this.namespace,
        batch_count: metricBatches.length,
        total_metrics: metricBatches.reduce((sum, batch) => sum + batch.length, 0)
      });
    } catch (error) {
      this.logger.error('Failed to flush metric batches', error as Error, {
        namespace: this.namespace,
        batch_count: metricBatches.length
      });
    }
  }

  /**
   * Starts automatic flushing at regular intervals
   */
  startAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    this.flushInterval = setInterval(() => {
      this.flush().catch(error => {
        this.logger.error('Auto-flush failed', error as Error);
      });
    }, this.flushIntervalMs);
    
    // Ensure metrics are flushed before Lambda terminates
    process.on('beforeExit', async () => {
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
        this.flushInterval = null;
      }
      
      await this.flush();
    });
  }

  /**
   * Stops automatic flushing
   */
  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}