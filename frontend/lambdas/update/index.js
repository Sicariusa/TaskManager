const AWS = require("aws-sdk");
const { verifyToken } = require("./verifyToken");
const { success, error } = require("./response");
require("dotenv").config();

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

exports.handler = async (event) => {
  console.log("📥 Received event in updateTask handler:", JSON.stringify(event, null, 2));

  if (event.Records && Array.isArray(event.Records)) {
    return await handleSQSEvent(event);
  }

  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      console.warn("⚠️ No authorization token provided.");
      return error("Unauthorized: No token", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = await verifyToken(token);
    const userId = decoded.sub;
    console.log("🔐 Authenticated user:", userId);

    const body = JSON.parse(event.body || "{}");
    const taskId = event.pathParameters?.taskId || body.taskId;
    if (!taskId) return error("Missing taskId", 400);

    // Only accept the specific attributes
    const updateFields = {};
    // Required identifiers
    if (body.userId !== undefined) updateFields.userId = body.userId;
    // Task content fields
    if (body.title !== undefined) updateFields.title = body.title;
    if (body.description !== undefined) updateFields.description = body.description; 
    if (body.status !== undefined) updateFields.status = body.status;
    // File attachment fields
    if (body.file_key !== undefined) updateFields.file_key = body.file_key;
    if (body.uploaded_at !== undefined) updateFields.uploaded_at = body.uploaded_at;
    if (body.attachment_id !== undefined) updateFields.attachment_id = body.attachment_id;

    if (Object.keys(updateFields).length === 0) return error("No fields to update", 400);

    const result = await updateTaskInDynamoDB(taskId.toString(), updateFields);

    await sendNotification({
      taskId,
      userId,
      type: 'TASK_UPDATED',
      message: `Task ${taskId} has been updated`,
      updatedFields: Object.keys(updateFields),
      updatedTask: result
    });

    return success({
      message: "Task updated successfully",
      taskId,
      updatedFields: Object.keys(updateFields)
    });

  } catch (err) {
    console.error("❌ Error updating task:", err);
    return error(err.message || "Failed to update task", 500);
  }
};

async function handleSQSEvent(event) {
  const results = { successful: [], failed: [] };

  for (const record of event.Records) {
    try {
      let taskData;

      if (record.eventSource === 'aws:sns') {
        taskData = JSON.parse(record.Sns.Message);
      } else {
        const body = JSON.parse(record.body);
        taskData = body.Type === 'Notification' ? JSON.parse(body.Message) : body;
      }

      console.log("📦 Processed task data:", taskData);

      if (taskData.operation !== 'update') {
        throw new Error(`Invalid operation type: ${taskData.operation || 'undefined'}. Expected 'update'`);
      }

      if (!taskData.taskId) throw new Error("Missing taskId for update operation");

      // Only accept the specific attributes
      const updateFields = {};
      // Required identifiers
      if (taskData.userId !== undefined) updateFields.userId = taskData.userId;
      // Task content fields
      if (taskData.title !== undefined) updateFields.title = taskData.title;
      if (taskData.description !== undefined) updateFields.description = taskData.description;
      if (taskData.status !== undefined) updateFields.status = taskData.status;
      // File attachment fields
      if (taskData.file_key !== undefined) updateFields.file_key = taskData.file_key;
      if (taskData.uploaded_at !== undefined) updateFields.uploaded_at = taskData.uploaded_at;
      if (taskData.attachment_id !== undefined) updateFields.attachment_id = taskData.attachment_id;

      if (Object.keys(updateFields).length === 0) throw new Error("No fields to update");

      const updatedTask = await updateTaskInDynamoDB(taskData.taskId.toString(), updateFields);

      if (taskData.userId) {
        await sendNotification({
          taskId: taskData.taskId,
          userId: taskData.userId,
          type: 'TASK_UPDATED',
          message: `Task ${taskData.taskId} has been updated`,
          updatedFields: Object.keys(updateFields),
          updatedTask
        });
      }

      results.successful.push({
        messageId: record.messageId,
        operation: 'update',
        taskId: taskData.taskId,
        updatedFields: Object.keys(updateFields)
      });

      console.log(`✅ Task updated via queue: taskId=${taskData.taskId}`);

    } catch (err) {
      console.error("❌ Failed to process message:", err);
      results.failed.push({
        messageId: record.messageId,
        error: err.message
      });
    }
  }

  console.log("📊 SQS batch processing results:", results);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Task update completed",
      results
    })
  };
}

async function updateTaskInDynamoDB(taskId, updateFields) {
  const timestamp = new Date().toISOString();
  
  // Filter updateFields to only include the allowed attributes
  const validKeys = ['userId', 'title', 'description', 'status', 'file_key', 'uploaded_at', 'attachment_id'];
  const filteredUpdateFields = Object.fromEntries(
    Object.entries(updateFields).filter(([key]) => validKeys.includes(key))
  );
  
  const getParams = {
    TableName: process.env.DYNAMO_TASK_TABLE,
    Key: { taskId }
  };

  const existingItem = await dynamodb.get(getParams).promise();
  console.log("🔍 Existing item:", existingItem);

  if (!existingItem.Item) throw new Error(`Task with ID ${taskId} not found`);

  // Create new item by merging existing item with updates
  const updatedItem = {
    ...existingItem.Item,
    ...filteredUpdateFields,
    updatedAt: timestamp
  };

  const putParams = {
    TableName: process.env.DYNAMO_TASK_TABLE,
    Item: updatedItem
  };

  await dynamodb.put(putParams).promise();
  console.log("✅ DynamoDB put result:", updatedItem);
  return updatedItem;
}

async function sendNotification(notificationData) {
  try {
    const params = {
      QueueUrl: process.env.NOTIFICATION_QUEUE_URL,
      MessageBody: JSON.stringify(notificationData),
      MessageAttributes: {
        Type: {
          DataType: 'String',
          StringValue: notificationData.type || 'TASK_UPDATED'
        }
      }
    };

    const result = await sqs.sendMessage(params).promise();
    console.log("📤 Notification sent to SQS:", result);
    return result;

  } catch (err) {
    console.error("❌ Failed to send SQS notification:", err);
    return null; // Don't break the flow for SQS issues
  }
}
