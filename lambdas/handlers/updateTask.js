const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { verifyToken } = require("../verifyToken");
require("dotenv").config();

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler for updating tasks from API Gateway or SNS/SQS messages
 */
exports.handler = async (event) => {
    console.log("Received event in updateTask handler:", JSON.stringify(event, null, 2));
    
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
        
        // Extract taskId from path parameters or body
        const taskId = event.pathParameters?.taskId || body.taskId;
        if (!taskId) {
            return formatError("Missing taskId", 400);
        }

        const timestamp = new Date().toISOString();
        const updateFields = {};
        
        // Check which fields to update
        if (body.title !== undefined) updateFields.title = body.title;
        if (body.description !== undefined) updateFields.description = body.description;
        if (body.status !== undefined) updateFields.status = body.status;
        
        if (Object.keys(updateFields).length === 0) {
            return formatError("No fields to update", 400);
        }
        
        // Update DynamoDB
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        // Build update expression for DynamoDB
        Object.entries(updateFields).forEach(([key, value]) => {
            updateExpressions.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        });
        
        // Add updatedAt timestamp
        updateExpressions.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = timestamp;
        
        // First, get the task to check its structure
        const getParams = {
            TableName: process.env.DYNAMO_TASK_TABLE,
            Key: {
                taskId: taskId.toString()
            }
        };
        
        try {
            // Try to get the item first to determine the correct key structure
            const existingItem = await dynamodb.get(getParams).promise();
            console.log("Existing item:", existingItem);
            
            if (!existingItem.Item) {
                return formatError(`Task with ID ${taskId} not found`, 404);
            }
            
            // Determine the correct key structure based on the existing item
            const keyStructure = {
                taskId: taskId.toString()
            };
            
            // Table only has taskId as the HASH key, so we don't need userId in the key
            console.log("Using key structure:", JSON.stringify(keyStructure));
            
            // Update DynamoDB
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
            return formatError(`Failed to update task: ${err.message}`, 500);
        }
        
        // Update MySQL if status needs to be updated
        if (updateFields.status) {
            const conn = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
            });
            
            const [result] = await conn.execute(
                "UPDATE TaskUser SET status = ?, updatedAt = ? WHERE taskId = ? AND userId = ?",
                [updateFields.status, timestamp, taskId, userId]
            );
            
            console.log("MySQL update result:", result);
            await conn.end();
        }
        
        return formatSuccess({
            message: "Task updated successfully",
            taskId: taskId,
            updatedFields: Object.keys(updateFields)
        });
    } catch (err) {
        console.error("Error updating task:", err);
        return formatError(err.message || "Failed to update task", 500);
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
            
            // Validate that this is an update operation
            if (taskData.operation !== 'update') {
                throw new Error(`Invalid operation type: ${taskData.operation || 'undefined'}. Expected 'update'`);
            }
            
            // Validate required fields
            if (!taskData.taskId) {
                throw new Error("Missing taskId for update operation");
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
                    const keyStructure = {
                        taskId: taskData.taskId.toString()
                    };
                    
                    // Table only has taskId as the HASH key, so we don't need userId in the key
                    console.log("Using key structure:", JSON.stringify(keyStructure));
                    
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
                messageId: record.messageId,
                operation: 'update',
                taskId: taskData.taskId,
                updatedFields: Object.keys(updateFields)
            });
            
            console.log(`Task updated successfully: taskId=${taskData.taskId}`);
            
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
            message: "Task update completed",
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