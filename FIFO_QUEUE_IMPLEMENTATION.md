# FIFO Queue Implementation for URL Redirect Tracker

## Overview

This document describes the implementation of Amazon SQS FIFO (First-In-First-Out) queues to handle message deduplication and ordering in the URL redirect tracking system.

## Why FIFO Queues?

### Native Deduplication
- **MessageDeduplicationId**: Prevents duplicate messages within a 5-minute window
- **Content-based deduplication**: Automatic deduplication based on message body hash
- **No application-level logic needed**: SQS handles deduplication natively

### Ordered Processing
- **MessageGroupId**: Groups related messages for ordered processing
- **Per-group ordering**: Messages within the same group are processed in order
- **Parallel processing**: Different groups can be processed simultaneously

## Implementation Details

### 1. Queue Configuration

```typescript
// FIFO Queue with content-based deduplication
const trackingQueue = new sqs.Queue(this, 'TrackingQueue', {
  queueName: `url-tracking-queue-${randomId}.fifo`,
  fifo: true,
  contentBasedDeduplication: true,
  visibilityTimeout: cdk.Duration.seconds(30),
  retentionPeriod: cdk.Duration.days(14),
  receiveMessageWaitTime: cdk.Duration.seconds(20),
  deadLetterQueue: {
    queue: trackingDlq,
    maxReceiveCount: 3,
  },
});
```

### 2. Message Deduplication Strategy

#### MessageDeduplicationId Generation
```typescript
function generateMessageDeduplicationId(
  clientIP: string,
  destinationUrl: string,
  sourceAttribution?: string,
  timeWindowSeconds: number = 300 // 5 minutes
): string {
  const currentTime = Math.floor(Date.now() / 1000);
  const windowedTime = Math.floor(currentTime / timeWindowSeconds) * timeWindowSeconds;
  
  const keyData = `${clientIP}:${destinationUrl}:${sourceAttribution || 'none'}:${windowedTime}`;
  
  return createHash('sha256').update(keyData).digest('hex').substring(0, 32);
}
```

**Key Components:**
- **Client IP**: Ensures different users can access the same URL
- **Destination URL**: Prevents deduplication across different URLs
- **Source Attribution**: Distinguishes between different campaigns
- **Time Window**: Groups requests within 5-minute windows

### 3. Message Grouping Strategy

#### MessageGroupId Generation
```typescript
function generateMessageGroupId(clientIP: string): string {
  return createHash('sha256').update(clientIP).digest('hex').substring(0, 16);
}
```

**Benefits:**
- **Per-client ordering**: Each client's requests are processed in order
- **Parallel processing**: Different clients' requests can be processed simultaneously
- **Load distribution**: Hash-based grouping distributes load evenly

### 4. SQS Message Structure

```typescript
const command = new SendMessageCommand({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify(trackingData),
  MessageAttributes: {
    'tracking_id': { DataType: 'String', StringValue: trackingData.tracking_id },
    'source_attribution': { DataType: 'String', StringValue: trackingData.source_attribution || 'none' },
    'client_ip': { DataType: 'String', StringValue: trackingData.client_ip },
    'destination_url': { DataType: 'String', StringValue: trackingData.destination_url }
  },
  MessageGroupId: messageGroupId,
  MessageDeduplicationId: messageDeduplicationId
});
```

## Deduplication Behavior

### Scenario: Multiple Rapid Requests
Given your example request:
```
https://edgeup.chencch.people.aws.dev/redirect?url=https://test.amazonaws.cn&sa=EdgeUp777
```

**From IP: 113.84.137.92**

1. **First Request** (07:12:09):
   - MessageDeduplicationId: `abc123...` (based on IP + URL + SA + time window)
   - MessageGroupId: `def456...` (based on IP hash)
   - **Result**: Message accepted and processed

2. **Subsequent Requests** (07:12:14, 07:12:29, etc.):
   - Same MessageDeduplicationId: `abc123...`
   - Same MessageGroupId: `def456...`
   - **Result**: Messages acknowledged but not delivered (deduplicated by SQS)

### Expected DynamoDB Result
Instead of 6 entries, you should see **only 1 entry** per 5-minute window:

```
a1745fff-470d-4397-9cbe-b5381646e1d2
2025-07-30T07:12:29.874Z
113.84.137.92
https://test.amazonaws.cn
2025-07-30 15:12:29
EdgeUp777
1785395556
```

## Performance Characteristics

### FIFO Queue Limitations
- **Throughput**: 300 TPS (vs 3000+ for standard queues)
- **Batching**: Up to 10 messages per batch
- **Regional**: Single region processing

### Mitigation Strategies
1. **Message Grouping**: Distribute load across multiple groups
2. **Batch Processing**: Process up to 10 messages per Lambda invocation
3. **Reserved Concurrency**: Control Lambda concurrency to match queue throughput

## Monitoring and Observability

### Key Metrics to Monitor
1. **Queue Depth**: `ApproximateNumberOfVisibleMessages`
2. **Message Age**: `ApproximateAgeOfOldestMessage`
3. **DLQ Messages**: Messages that failed processing
4. **Deduplication Rate**: Ratio of accepted vs deduplicated messages

### CloudWatch Alarms
- Queue depth > 100 messages
- Message age > 5 minutes
- Any messages in DLQ
- Lambda function errors

## Deployment Considerations

### Infrastructure Changes
1. **Queue Names**: Must end with `.fifo`
2. **DLQ**: Also needs to be FIFO
3. **Lambda Event Source**: No changes needed
4. **IAM Permissions**: Same as standard queues

### Migration Strategy
1. Deploy new FIFO queues alongside existing standard queues
2. Update Lambda functions to use FIFO queue URLs
3. Monitor for successful deduplication
4. Remove old standard queues after validation

## Testing Strategy

### Unit Tests
- Message deduplication ID generation
- Message group ID generation
- Time window behavior

### Integration Tests
- End-to-end deduplication verification
- Multiple client scenarios
- Error handling and DLQ behavior

### Load Testing
- Verify 300 TPS throughput limit
- Test deduplication under load
- Monitor Lambda concurrency and queue depth

## Benefits of This Implementation

1. **Native Deduplication**: No custom application logic needed
2. **Exactly-Once Processing**: Guaranteed by SQS FIFO
3. **Ordered Processing**: Per-client request ordering
4. **Automatic Cleanup**: SQS handles message lifecycle
5. **Built-in Monitoring**: CloudWatch metrics and alarms
6. **Fault Tolerance**: Dead letter queue for failed messages

## Conclusion

The FIFO queue implementation provides a robust, AWS-native solution for handling duplicate requests in the URL redirect tracking system. By leveraging SQS's built-in deduplication and ordering capabilities, we eliminate the need for custom application-level logic while ensuring exactly-once processing of tracking events.
