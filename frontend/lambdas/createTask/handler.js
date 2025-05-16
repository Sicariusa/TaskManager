const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const { verifyToken } = require("./verifyToken");
require("dotenv").config();

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log("📥 Received event in createTask handler:", JSON.stringify(event, null, 2));

  if (event.Records && Array.isArray(event.Records)) {
    return await handleSQSEvent(event);
  }

  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      console.warn("⚠️ Missing Authorization header");
      return formatError("Unauthorized: No token", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = await verifyToken(token);
    const userId = decoded.sub;
    console.log("🔐 Authenticated user:", userId);

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      console.warn("⚠️ Invalid JSON in request body");
      return formatError("Invalid request body", 400);
    }

    const { title, description, status } = body;
    if (!title || !description) {
      console.warn("⚠️ Missing title or description in request body");
      return formatError("Missing required fields: title and description", 400);
    }

    const taskId = Math.floor(Math.random() * 1000000) + 1;
    const uniqueId = uuidv4();
    const timestamp = new Date().toISOString();

    console.log(`📝 Creating task: ID=${taskId}, Title=${title}`);

    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const [result] = await conn.execute(
      "INSERT INTO TaskUser (taskId, userId, role, status, createdAt) VALUES (?, ?, ?, ?, ?)",
      [taskId, userId, "admin", status || "active", timestamp]
    );
    console.log("✅ MySQL insert result:", result);
    await conn.end();

    const params = {
      TableName: process.env.DYNAMO_TASK_TABLE,
      Item: {
        taskId: taskId.toString(),
        uniqueId,
        userId,
        title,
        description,
        status: status || "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    };
    await dynamodb.put(params).promise();

    console.log("✅ Task saved to DynamoDB");

    return formatSuccess({
      message: "Task created successfully",
      taskId,
      uniqueId
    });

  } catch (err) {
    console.error("❌ Error creating task:", err);
    return formatError(err.message || "Failed to create task", 500);
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

      console.log("📦 Processing task data from SQS/SNS:", taskData);

      if (taskData.operation !== "create") {
        throw new Error(`Invalid operation type: ${taskData.operation || "undefined"}. Expected 'create'`);
      }

      if (!taskData.userId || !taskData.title || !taskData.description) {
        throw new Error("Missing required task data for creation");
      }

      const taskId = Math.floor(Math.random() * 1000000) + 1;
      const uniqueId = uuidv4();
      const timestamp = new Date().toISOString();

      const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });

      const [result] = await conn.execute(
        "INSERT INTO TaskUser (taskId, userId, role, status, createdAt) VALUES (?, ?, ?, ?, ?)",
        [taskId, taskData.userId, "admin", taskData.status || "active", timestamp]
      );
      console.log("✅ MySQL insert result:", result);
      await conn.end();

      await dynamodb.put({
        TableName: process.env.DYNAMO_TASK_TABLE,
        Item: {
          taskId: taskId.toString(),
          uniqueId,
          userId: taskData.userId,
          title: taskData.title,
          description: taskData.description,
          status: taskData.status || "pending",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      }).promise();

      results.successful.push({
        messageId: record.messageId,
        operation: 'create',
        taskId,
        uniqueId
      });

      console.log(`✅ Task created from queue: taskId=${taskId}, uniqueId=${uniqueId}`);

    } catch (err) {
      console.error("❌ Failed to process message:", err);
      results.failed.push({
        messageId: record.messageId,
        error: err.message
      });
    }
  }

  console.log("📊 SQS Processing results:", results);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Task creation completed",
      results
    })
  };
}

function formatSuccess(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify({ success: true, data })
  };
}

function formatError(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify({ success: false, error: message })
  };
}
