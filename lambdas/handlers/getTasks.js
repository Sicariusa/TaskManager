const AWS = require("aws-sdk");
const { verifyToken } = require("../verifyToken");
require("dotenv").config();

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler for retrieving tasks from API Gateway or SNS/SQS messages
 */
exports.handler = async (event) => {
    console.log("Received event in getTasks handler:", JSON.stringify(event, null, 2));
    
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
        
        // Check if a specific taskId is requested
        const taskId = event.pathParameters?.taskId || event.queryStringParameters?.taskId;
        
        if (taskId) {
            // Get a specific task
            const params = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                Key: {
                    taskId: taskId.toString()
                }
            };
            
            const result = await dynamodb.get(params).promise();
            
            if (!result.Item) {
                return formatError("Task not found", 404);
            }
            
            return formatSuccess({
                task: result.Item
            });
        } else {
            // Get all tasks for the user
            const params = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                FilterExpression: "userId = :userId",
                ExpressionAttributeValues: {
                    ":userId": userId
                }
            };
            
            // Apply filters if provided
            const filters = ["userId = :userId"];
            const filterValues = {
                ":userId": userId
            };
            
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
            
            if (filters.length > 0) {
                params.FilterExpression = filters.join(" AND ");
                Object.assign(params.ExpressionAttributeValues, filterValues);
            }
            
            const result = await dynamodb.scan(params).promise();
            
            return formatSuccess({
                tasks: result.Items,
                count: result.Count
            });
        }
    } catch (err) {
        console.error("Error getting tasks:", err);
        return formatError(err.message || "Failed to get tasks", 500);
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
            
            // Validate that this is a get operation
            if (taskData.operation !== 'get') {
                throw new Error(`Invalid operation type: ${taskData.operation || 'undefined'}. Expected 'get'`);
            }
            
            // Validate required fields
            if (!taskData.userId) {
                throw new Error("Missing userId for get operation");
            }
            
            // Query DynamoDB for tasks
            const params = {
                TableName: process.env.DYNAMO_TASK_TABLE,
                FilterExpression: "userId = :userId",
                ExpressionAttributeValues: {
                    ":userId": taskData.userId
                }
            };
            
            const dynamoResult = await dynamodb.scan(params).promise();
            console.log(`Found ${dynamoResult.Items.length} tasks for user ${taskData.userId}`);
            
            // If a callback URL is provided, send the results there
            if (taskData.callbackUrl) {
                try {
                    // Use the AWS SDK to invoke another Lambda or send to SQS/SNS
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
                    
                    console.log(`Results sent to callback: ${taskData.callbackUrl}`);
                } catch (err) {
                    console.error("Error sending results to callback:", err);
                }
            }
            
            results.successful.push({
                messageId: record.messageId,
                operation: 'get',
                userId: taskData.userId,
                taskCount: dynamoResult.Items.length,
                tasks: dynamoResult.Items
            });
            
            console.log(`Get tasks operation completed for userId=${taskData.userId}`);
            
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
            message: "Get tasks operation completed",
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