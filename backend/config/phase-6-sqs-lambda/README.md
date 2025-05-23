# Phase 6 – Asynchronous Processing (SQS + Lambda)

This Lambda function listens to the `TaskNotificationsQueue` SQS queue and logs simulated notifications.

## Example message:
```json
{
  "taskId": "T123",
  "userEmail": "user@example.com",
  "action": "updated"
}
