const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const { verifyToken } = require("./verifyToken");
//const { success, error } = require("../common/response");
require("dotenv").config();

// Configure AWS SDK
// AWS.config.update({
//     region: process.env.AWS_REGION || "us-east-1"
// });

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler for processing tasks from SNS/SQS messages
 */
exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    // Check if this is an SQS/SNS event by looking for Records array
    if (event.Records && Array.isArray(event.Records)) {
        return await processSQSMessages(event);
    }
    
    // If not an SQS/SNS event, handle as regular API request
    try {
        // Extract and verify token
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader) return formatError("Unauthorized: No token", 401);

        const token = authHeader.replace("Bearer ", "");
        const decoded = await verifyToken(token);
        const userId = decoded.sub;

        // Parse task from body
        const { title, description } = JSON.parse(event.body || "{}");
        if (!title || !description) return formatError("Missing task data", 400);

        // Generate a unique ID for the task
        const uniqueId = uuidv4();
        const taskId = Math.floor(Math.random() * 1000000) + 1; // Generate a random number between 1 and 1000000
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
            [taskId, userId, "admin", "active", timestamp]
        );

        console.log("MySQL insert result:", result);
        await conn.end();

        // Insert into DynamoDB using the same taskId
        const params = {
            TableName: process.env.DYNAMO_TASK_TABLE,
            Item: {
                taskId: taskId.toString(), // Use the same taskId
                uniqueId: uniqueId,        // Store the UUID as a separate attribute
                userId: userId,
                title: title,
                description: description,
                status: 'pending',
                createdAt: timestamp,
                updatedAt: timestamp
            }
        };

        await dynamodb.put(params).promise();

        return formatSuccess({ 
            message: "Task created in both RDS and DynamoDB", 
            taskId: taskId,
            uniqueId: uniqueId
        });
    } catch (err) {
        console.error("Error:", err);
        return formatError(err.message || "Task creation failed", 500);
    }
};

/**
 * Process SQS messages (which may contain SNS notifications)
 */
async function processSQSMessages(event) {
    console.log("Processing SQS/SNS messages");
    
    const results = {
        successful: [],
        failed: []
    };
    
    for (const record of event.Records) {
        try {
            // Parse the message - handle both direct SQS and SNS via SQS
            let messageData;
            
            if (record.eventSource === 'aws:sns') {
                // Direct SNS message
                messageData = JSON.parse(record.Sns.Message);
            } else {
                // SQS message (might be from SNS)
                const body = JSON.parse(record.body);
                
                // Check if this is an SNS message delivered via SQS
                if (body.Type === 'Notification') {
                    messageData = JSON.parse(body.Message);
                } else {
                    // Direct SQS message
                    messageData = body;
                }
            }
            
            console.log("Processed message data:", messageData);
            
            // Validate the operation type
            if (!messageData.operation) {
                throw new Error("Missing operation type in message");
            }
            
            // Handle different operation types
            switch (messageData.operation.toLowerCase()) {
                case 'create':
                    await handleCreateTask(messageData, record.messageId, results);
                    break;
                    
                case 'update':
                    await handleUpdateTask(messageData, record.messageId, results);
                    break;
                    
                case 'delete':
                    await handleDeleteTask(messageData, record.messageId, results);
                    break;
                    
                case 'get':
                    await handleGetTasks(messageData, record.messageId, results);
                    break;
                    
                default:
                    throw new Error(`Unsupported operation type: ${messageData.operation}`);
            }
            
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
            message: "SQS/SNS processing completed",
            results: results
        })
    };
}

/**
 * Handle task creation
 */
async function handleCreateTask(taskData, messageId, results) {
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
        messageId: messageId,
        operation: 'create',
        taskId: taskId,
        uniqueId: uniqueId
    });
    
    console.log(`Task created successfully: taskId=${taskId}, uniqueId=${uniqueId}`);
}

/**
 * Handle task update
 */
async function handleUpdateTask(taskData, messageId, results) {
    // Validate required fields
    if (!taskData.taskId) {
        throw new Error("Missing taskId for update operation");
    }
    
    // Check if userId is provided
    if (!taskData.userId) {
        throw new Error("Missing userId for update operation");
    }
    
    const timestamp = new Date().toISOString();
    const updateFields = {};
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Build update expression for DynamoDB
    if (taskData.title) {
        updateExpressions.push('#title = :title');
        expressionAttributeNames['#title'] = 'title';
        expressionAttributeValues[':title'] = taskData.title;
        updateFields.title = taskData.title;
    }
    
    if (taskData.description) {
        updateExpressions.push('#description = :description');
        expressionAttributeNames['#description'] = 'description';
        expressionAttributeValues[':description'] = taskData.description;
        updateFields.description = taskData.description;
    }
    
    if (taskData.status) {
        updateExpressions.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = taskData.status;
        updateFields.status = taskData.status;
    }
    
    // Add updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = timestamp;
    
    // Update DynamoDB if there are fields to update
    if (updateExpressions.length > 0) {
        // First, get the task to check its structure
        const getParams = {
            TableName: process.env.DYNAMO_TASK_TABLE,
            Key: {
                taskId: taskData.taskId.toString()
            }
        };
        
        try {
            // Try to get the item first to determine the correct key structure
            const existingItem = await dynamodb.get(getParams).promise();
            console.log("Existing item:", existingItem);
            
            if (!existingItem.Item) {
                throw new Error(`Task with ID ${taskData.taskId} not found`);
            }
            
            // Determine the correct key structure based on the existing item
            const keyStructure = {};
            keyStructure.taskId = taskData.taskId.toString();
            
            // If the item has a composite key with userId as sort key
            if (existingItem.Item.userId) {
                keyStructure.userId = taskData.userId;
            }
            
            const params = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                Key: keyStructure,
                UpdateExpression: 'SET ' + updateExpressions.join(', '),
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW'
            };
            
            const dynamoResult = await dynamodb.update(params).promise();
            console.log("DynamoDB update result:", dynamoResult);
        } catch (err) {
            console.error("Error getting or updating item:", err);
            throw err;
        }
    }
    
    // Update MySQL if status needs to be updated
    if (taskData.status) {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        
        const [result] = await conn.execute(
            "UPDATE TaskUser SET status = ?, updatedAt = ? WHERE taskId = ?",
            [taskData.status, timestamp, taskData.taskId]
        );
        
        console.log("MySQL update result:", result);
        await conn.end();
    }
    
    results.successful.push({
        messageId: messageId,
        operation: 'update',
        taskId: taskData.taskId,
        updatedFields: Object.keys(updateFields)
    });
    
    console.log(`Task updated successfully: taskId=${taskData.taskId}`);
}

/**
 * Handle task deletion
 */
async function handleDeleteTask(taskData, messageId, results) {
    // Validate required fields
    if (!taskData.taskId) {
        throw new Error("Missing taskId for delete operation");
    }
    
    // Check if userId is provided
    if (!taskData.userId) {
        throw new Error("Missing userId for delete operation");
    }
    
    try {
        // First, get the task to check its structure
        const getParams = {
            TableName: process.env.DYNAMO_TASK_TABLE,
            Key: {
                taskId: taskData.taskId.toString()
            }
        };
        
        try {
            // Try to get the item first to determine the correct key structure
            const existingItem = await dynamodb.get(getParams).promise();
            console.log("Existing item:", existingItem);
            
            if (!existingItem.Item) {
                throw new Error(`Task with ID ${taskData.taskId} not found`);
            }
            
            // Determine the correct key structure based on the existing item
            const keyStructure = {};
            keyStructure.taskId = taskData.taskId.toString();
            
            // If the item has a composite key with userId as sort key
            if (existingItem.Item.userId) {
                keyStructure.userId = taskData.userId;
            }
            
            // Delete from DynamoDB
            const dynamoParams = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                Key: keyStructure
            };
            
            await dynamodb.delete(dynamoParams).promise();
            console.log(`Task deleted from DynamoDB: taskId=${taskData.taskId}`);
        } catch (err) {
            console.error("Error getting or deleting item:", err);
            throw err;
        }
        
        // Delete from MySQL
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        
        const [result] = await conn.execute(
            "DELETE FROM TaskUser WHERE taskId = ? AND userId = ?",
            [taskData.taskId, taskData.userId]
        );
        
        console.log("MySQL delete result:", result);
        await conn.end();
        
        results.successful.push({
            messageId: messageId,
            operation: 'delete',
            taskId: taskData.taskId
        });
        
        console.log(`Task deleted successfully: taskId=${taskData.taskId}`);
    } catch (err) {
        console.error("Error during delete operation:", err);
        throw err;
    }
}

/**
 * Handle get tasks operation
 */
async function handleGetTasks(taskData, messageId, results) {
    // Validate required fields
    if (!taskData.userId) {
        throw new Error("Missing userId for get operation");
    }
    
    // Query DynamoDB for tasks
    const params = {
        TableName: process.env.DYNAMO_TASK_TABLE,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
            ":userId": taskData.userId
        }
    };
    
    const dynamoResult = await dynamodb.query(params).promise();
    console.log(`Found ${dynamoResult.Items.length} tasks for user ${taskData.userId}`);
    
    // If a callback URL is provided, send the results there
    if (taskData.callbackUrl) {
        try {
            // Use the AWS SDK to invoke another Lambda or send to SQS/SNS
            // This is just a placeholder - implement based on your needs
            console.log(`Would send results to callback URL: ${taskData.callbackUrl}`);
        } catch (err) {
            console.error("Error sending results to callback:", err);
        }
    }
    
    results.successful.push({
        messageId: messageId,
        operation: 'get',
        userId: taskData.userId,
        taskCount: dynamoResult.Items.length
    });
    
    console.log(`Get tasks operation completed for userId=${taskData.userId}`);
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

