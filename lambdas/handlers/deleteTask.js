const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { verifyToken } = require("../verifyToken");
require("dotenv").config();

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler for deleting tasks from API Gateway or SNS/SQS messages
 */
exports.handler = async (event) => {
    console.log("Received event in deleteTask handler:", JSON.stringify(event, null, 2));
    
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

        // Extract taskId from path parameters or query string
        const taskId = event.pathParameters?.taskId || 
                       event.queryStringParameters?.taskId || 
                       JSON.parse(event.body || "{}")?.taskId;
                       
        if (!taskId) {
            return formatError("Missing taskId", 400);
        }
        
        try {
            // First, get the task to check its structure
            const getParams = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                Key: {
                    taskId: taskId.toString()
                }
            };
            
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
            
            // Delete from DynamoDB
            const dynamoParams = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                Key: keyStructure
            };
            
            await dynamodb.delete(dynamoParams).promise();
            console.log(`Task deleted from DynamoDB: taskId=${taskId}`);
        } catch (err) {
            console.error("Error getting or deleting item:", err);
            return formatError(`Failed to delete task: ${err.message}`, 500);
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
            [taskId, userId]
        );
        
        console.log("MySQL delete result:", result);
        await conn.end();
        
        return formatSuccess({
            message: "Task deleted successfully",
            taskId: taskId
        });
    } catch (err) {
        console.error("Error deleting task:", err);
        return formatError(err.message || "Failed to delete task", 500);
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
            
            // Validate that this is a delete operation
            if (taskData.operation !== 'delete') {
                throw new Error(`Invalid operation type: ${taskData.operation || 'undefined'}. Expected 'delete'`);
            }
            
            // Validate required fields
            if (!taskData.taskId || !taskData.userId) {
                throw new Error("Missing taskId or userId for delete operation");
            }
            
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
                messageId: record.messageId,
                operation: 'delete',
                taskId: taskData.taskId
            });
            
            console.log(`Task deleted successfully: taskId=${taskData.taskId}`);
            
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
            message: "Task deletion completed",
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