const AWS = require("aws-sdk");
const { verifyToken } = require("../verifyToken");
const { success, error } = require("../response");
require("dotenv").config();

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();
// Initialize SQS client
const sqs = new AWS.SQS();

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
        if (!authHeader) return error("Unauthorized: No token", 401);

        const token = authHeader.replace("Bearer ", "");
        const decoded = await verifyToken(token);
        const userId = decoded.sub;
        
        console.log("Authenticated user:", userId);

        // Parse task from body
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return error("Invalid request body", 400);
        }
        
        // Extract taskId from path parameters or body
        const taskId = event.pathParameters?.taskId || body.taskId;
        if (!taskId) {
            return error("Missing taskId", 400);
        }

        const updateFields = {};
        
        // Check which fields to update
        if (body.title !== undefined) updateFields.title = body.title;
        if (body.description !== undefined) updateFields.description = body.description;
        if (body.status !== undefined) updateFields.status = body.status;
        
        if (Object.keys(updateFields).length === 0) {
            return error("No fields to update", 400);
        }
        
        // Update the task in DynamoDB
        const result = await updateTaskInDynamoDB(taskId.toString(), updateFields);
        
        // Send notification to SQS
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
            taskId: taskId,
            updatedFields: Object.keys(updateFields)
        });
    } catch (err) {
        console.error("Error updating task:", err);
        return error(err.message || "Failed to update task", 500);
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
            
            const updateFields = {};
            
            // Build update fields
            if (taskData.title !== undefined) updateFields.title = taskData.title;
            if (taskData.description !== undefined) updateFields.description = taskData.description;
            if (taskData.status !== undefined) updateFields.status = taskData.status;
            
            if (Object.keys(updateFields).length === 0) {
                throw new Error("No fields to update");
            }
            
            // Update the task in DynamoDB
            const updatedTask = await updateTaskInDynamoDB(taskData.taskId.toString(), updateFields);
            
            // Send notification to SQS if userId is provided
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
 * Updates a task in DynamoDB
 * @param {string} taskId - The ID of the task to update
 * @param {object} updateFields - The fields to update
 * @returns {Promise<object>} - The updated task
 */
async function updateTaskInDynamoDB(taskId, updateFields) {
    const timestamp = new Date().toISOString();
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
    
    // First, get the task to check its existence
    const getParams = {
        TableName: process.env.DYNAMO_TASK_TABLE,
        Key: {
            taskId: taskId
        }
    };
    
    const existingItem = await dynamodb.get(getParams).promise();
    console.log("Existing item:", existingItem);
    
    if (!existingItem.Item) {
        throw new Error(`Task with ID ${taskId} not found`);
    }
    
    // Update DynamoDB
    const params = {
        TableName: process.env.DYNAMO_TASK_TABLE,
        Key: {
            taskId: taskId
        },
        UpdateExpression: 'SET ' + updateExpressions.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    };
    
    const dynamoResult = await dynamodb.update(params).promise();
    console.log("DynamoDB update result:", dynamoResult);
    
    return dynamoResult.Attributes;
}

/**
 * Sends a notification to the SQS queue
 * @param {object} notificationData - The notification data to send
 * @returns {Promise<object>} - The SQS response
 */
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
        console.log("Message sent to notification queue:", result);
        return result;
    } catch (err) {
        console.error("Failed to send notification:", err);
        // Don't throw the error as this is a non-critical operation
        return null;
    }
} 