const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const { verifyToken } = require("../verifyToken");
require("dotenv").config();

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler for creating tasks from API Gateway or SNS/SQS messages
 */
exports.handler = async (event) => {
    console.log("Received event in createTask handler:", JSON.stringify(event, null, 2));
    
    // Check if this is an SQS/SNS event by looking for Records array
    if (event.Records && Array.isArray(event.Records)) {
        return await handleSQSEvent(event);
    }
    
    // If not an SQS/SNS event, handle as API Gateway request
    try {
        // Extract and verify token
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader) return formatError("Unauthorized: No token", 401);

        const token = authHeader.replace("Bearer ", "");
        const decoded = await verifyToken(token);
        const userId = decoded.sub;
        
        console.log("Authenticated user:", userId);
        
        // Parse task from body
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return formatError("Invalid request body", 400);
        }
        
        const { title, description, status } = body;
        if (!title || !description) {
            return formatError("Missing required fields: title and description", 400);
        }

        // Generate IDs and timestamp
        const uniqueId = uuidv4();
        const taskId = Math.floor(Math.random() * 1000000) + 1;
        const timestamp = new Date().toISOString();
        
        console.log(`Creating task: ID=${taskId}, Title=${title}`);
        
        // Connect to MySQL RDS
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        
        // Insert into TaskUser table
        const [result] = await conn.execute(
            "INSERT INTO TaskUser (taskId, userId, role, status, createdAt) VALUES (?, ?, ?, ?, ?)",
            [taskId, userId, "admin", status || "active", timestamp]
        );
        
        console.log("MySQL insert result:", result);
        await conn.end();
        
        // Insert into DynamoDB
        const params = {
            TableName: process.env.DYNAMO_TASK_TABLE,
            Item: {
                taskId: taskId.toString(),
                uniqueId: uniqueId,
                userId: userId,
                title: title,
                description: description,
                status: status || 'pending',
                createdAt: timestamp,
                updatedAt: timestamp
            }
        };
        
        await dynamodb.put(params).promise();
        
        return formatSuccess({
            message: "Task created successfully",
            taskId: taskId,
            uniqueId: uniqueId
        });
    } catch (err) {
        console.error("Error creating task:", err);
        return formatError(err.message || "Failed to create task", 500);
    }
};

/**
 * Handle SQS/SNS events
 */
async function handleSQSEvent(event) {
    const results = {
        successful: [],
        failed: []
    };
    
    for (const record of event.Records) {
        try {
            // Parse the message - handle both direct SQS and SNS via SQS
            let taskData;
            
            if (record.eventSource === 'aws:sns') {
                // Direct SNS message
                taskData = JSON.parse(record.Sns.Message);
            } else {
                // SQS message (might be from SNS)
                const body = JSON.parse(record.body);
                
                // Check if this is an SNS message delivered via SQS
                if (body.Type === 'Notification') {
                    taskData = JSON.parse(body.Message);
                } else {
                    // Direct SQS message
                    taskData = body;
                }
            }
            
            console.log("Processed task data:", taskData);
            
            // Validate that this is a create operation
            if (taskData.operation !== 'create') {
                throw new Error(`Invalid operation type: ${taskData.operation || 'undefined'}. Expected 'create'`);
            }
            
            // Validate required fields
            if (!taskData.userId || !taskData.title || !taskData.description) {
                throw new Error("Missing required task data for creation");
            }
            
            // Generate IDs and timestamp
            const uniqueId = uuidv4();
            const taskId = Math.floor(Math.random() * 1000000) + 1;
            const timestamp = new Date().toISOString();
            
            // Connect to MySQL RDS
            const conn = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
            });
            
            // Insert into TaskUser table
            const [result] = await conn.execute(
                "INSERT INTO TaskUser (taskId, userId, role, status, createdAt) VALUES (?, ?, ?, ?, ?)",
                [taskId, taskData.userId, "admin", taskData.status || "active", timestamp]
            );
            
            console.log("MySQL insert result:", result);
            await conn.end();
            
            // Insert into DynamoDB
            const params = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                Item: {
                    taskId: taskId.toString(),
                    uniqueId: uniqueId,
                    userId: taskData.userId,
                    title: taskData.title,
                    description: taskData.description,
                    status: taskData.status || 'pending',
                    createdAt: timestamp,
                    updatedAt: timestamp
                }
            };
            
            await dynamodb.put(params).promise();
            
            results.successful.push({
                messageId: record.messageId,
                operation: 'create',
                taskId: taskId,
                uniqueId: uniqueId
            });
            
            console.log(`Task created successfully: taskId=${taskId}, uniqueId=${uniqueId}`);
            
        } catch (err) {
            console.error("Failed to process message:", err);
            results.failed.push({
                messageId: record.messageId,
                error: err.message
            });
        }
    }
    
    console.log("Processing results:", results);
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "Task creation completed",
            results: results
        })
    };
}

/**
 * Helper functions for API responses
 */
function formatSuccess(data, statusCode = 200) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        },
        body: JSON.stringify({
            success: true,
            data
        })
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
        body: JSON.stringify({
            success: false,
            error: message
        })
    };
} 