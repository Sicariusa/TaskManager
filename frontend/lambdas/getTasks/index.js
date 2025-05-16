const AWS = require("aws-sdk");
const { verifyToken } = require("./verifyToken");
require("dotenv").config();

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log("📥 Received event in getTasks handler:", JSON.stringify(event, null, 2));

  if (event.Records && Array.isArray(event.Records)) {
    return await handleSQSEvent(event);
  }

  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      console.warn("⚠️ No authorization token provided");
      return formatError("Unauthorized: No token", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = await verifyToken(token);
    const userId = decoded.sub;
    console.log("🔐 Authenticated user:", userId);

    const taskId = event.pathParameters?.taskId || event.queryStringParameters?.taskId;

    if (taskId) {
      // 🔍 Fetch a single task
      const params = {
        TableName: process.env.DYNAMO_TASK_TABLE,
        Key: { taskId: taskId.toString() }
      };

      const result = await dynamodb.get(params).promise();
      if (!result.Item) {
        console.warn(`⚠️ Task ${taskId} not found`);
        return formatError("Task not found", 404);
      }

      console.log("✅ Task retrieved:", result.Item);
      return formatSuccess({ task: result.Item });

    } else {
      // 📦 Fetch all tasks for this user
      const filters = ["userId = :userId"];
      const filterValues = { ":userId": userId };

      if (event.queryStringParameters) {
        if (event.queryStringParameters.status) {
          filters.push("status = :status");
          filterValues[":status"] = event.queryStringParameters.status;
        }
        if (event.queryStringParameters.title) {
          filters.push("contains(title, :title)");
          filterValues[":title"] = event.queryStringParameters.title;
        }
      }

      const scanParams = {
        TableName: process.env.DYNAMO_TASK_TABLE,
        FilterExpression: filters.join(" AND "),
        ExpressionAttributeValues: filterValues
      };

      const result = await dynamodb.scan(scanParams).promise();
      console.log(`✅ Retrieved ${result.Count} tasks for user ${userId}`);
      return formatSuccess({ tasks: result.Items, count: result.Count });
    }

  } catch (err) {
    console.error("❌ Error retrieving tasks:", err);
    return formatError(err.message || "Failed to get tasks", 500);
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
        taskData = body.Type === "Notification" ? JSON.parse(body.Message) : body;
      }

      console.log("📦 Processing task data:", taskData);

      if (taskData.operation !== 'get') {
        throw new Error(`Invalid operation type: ${taskData.operation || 'undefined'}`);
      }

      if (!taskData.userId) {
        throw new Error("Missing userId for get operation");
      }

      const scanParams = {
        TableName: process.env.DYNAMO_TASK_TABLE,
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": taskData.userId }
      };

      const dynamoResult = await dynamodb.scan(scanParams).promise();
      console.log(`📈 Found ${dynamoResult.Items.length} tasks for user ${taskData.userId}`);

      if (taskData.callbackUrl) {
        try {
          const sns = new AWS.SNS();
          await sns.publish({
            TopicArn: taskData.callbackUrl.startsWith('arn:') ? taskData.callbackUrl : process.env.TASK_NOTIFICATION_TOPIC,
            Message: JSON.stringify({
              operation: 'getTasksResult',
              userId: taskData.userId,
              tasks: dynamoResult.Items,
              timestamp: new Date().toISOString()
            })
          }).promise();
          console.log(`📤 Results sent to callback: ${taskData.callbackUrl}`);
        } catch (err) {
          console.error("❌ Error sending results to callback:", err);
        }
      }

      results.successful.push({
        messageId: record.messageId,
        operation: 'get',
        userId: taskData.userId,
        taskCount: dynamoResult.Items.length,
        tasks: dynamoResult.Items
      });

      console.log(`✅ Get operation complete for userId=${taskData.userId}`);

    } catch (err) {
      console.error("❌ Failed to process SQS/SNS message:", err);
      results.failed.push({
        messageId: record.messageId,
        error: err.message
      });
    }
  }

  console.log("📊 Batch processing results:", results);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Get tasks operation completed",
      results
    })
  };
}

function formatSuccess(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true
    },
    body: JSON.stringify({ success: true, data })
  };
}

function formatError(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true
    },
    body: JSON.stringify({ success: false, error: message })
  };
}
