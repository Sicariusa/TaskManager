const AWS = require("aws-sdk");
const mysql = require("mysql2/promise");
require("dotenv").config();

// Initialize AWS clients
const ses = new AWS.SES();
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler for processing notification messages from SQS
 */
exports.handler = async (event) => {
    console.log("Received event in sendNotification handler:", JSON.stringify(event, null, 2));
    
    const results = {
        successful: [],
        failed: []
    };
    
    // Process each SQS message
    for (const record of event.Records) {
        try {
            // Parse the message body
            const messageBody = JSON.parse(record.body);
            console.log("Processing notification:", messageBody);
            
            if (!messageBody.userId) {
                throw new Error("Missing userId in notification data");
            }
            
            if (!messageBody.taskId) {
                throw new Error("Missing taskId in notification data");
            }
            
            // Fetch user email from database
            const userEmail = await getUserEmail(messageBody.userId);
            
            if (!userEmail) {
                throw new Error(`Could not find email for user ${messageBody.userId}`);
            }
            
            // Get task details if not included in message
            let taskDetails = messageBody.updatedTask;
            if (!taskDetails) {
                taskDetails = await getTaskDetails(messageBody.taskId);
            }
            
            // Send email notification
            await sendEmailNotification(userEmail, messageBody, taskDetails);
            
            results.successful.push({
                messageId: record.messageId,
                userId: messageBody.userId,
                taskId: messageBody.taskId,
                email: userEmail
            });
            
            console.log(`Successfully sent notification email to ${userEmail} for task ${messageBody.taskId}`);
            
        } catch (err) {
            console.error("Failed to process notification message:", err);
            results.failed.push({
                messageId: record.messageId,
                error: err.message
            });
        }
    }
    
    console.log("Notification processing results:", results);
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "Notification processing completed",
            results: results
        })
    };
};

/**
 * Fetches a user's email address from the database
 * @param {string} userId - The user ID
 * @returns {Promise<string|null>} - The user's email address
 */
async function getUserEmail(userId) {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    
    try {
        const [rows] = await conn.execute(
            "SELECT email FROM Users WHERE userId = ?",
            [userId]
        );
        
        await conn.end();
        
        if (rows.length === 0) {
            return null;
        }
        
        return rows[0].email;
    } catch (err) {
        console.error("Error fetching user email:", err);
        await conn.end();
        throw err;
    }
}

/**
 * Fetches task details from DynamoDB
 * @param {string} taskId - The task ID
 * @returns {Promise<object|null>} - The task details
 */
async function getTaskDetails(taskId) {
    const params = {
        TableName: process.env.DYNAMO_TASK_TABLE,
        Key: {
            taskId: taskId.toString()
        }
    };
    
    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
        throw new Error(`Task with ID ${taskId} not found`);
    }
    
    return result.Item;
}

/**
 * Sends an email notification to a user
 * @param {string} email - The recipient's email address
 * @param {object} notification - The notification data
 * @param {object} taskDetails - The task details
 * @returns {Promise<object>} - The SES response
 */
async function sendEmailNotification(email, notification, taskDetails) {
    // Format task details
    const updatedFieldsList = notification.updatedFields
        .map(field => {
            const value = taskDetails[field];
            return `- ${field}: ${value}`;
        })
        .join('\n');
    
    // Create email parameters
    const params = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Text: {
                    Data: `Hello,

One of your tasks has been updated:

Task ID: ${notification.taskId}
Task Title: ${taskDetails.title || 'N/A'}

Updated Fields:
${updatedFieldsList}

Current Status: ${taskDetails.status || 'N/A'}
Last Updated: ${taskDetails.updatedAt || 'N/A'}

Thank you for using our Task Manager!
`
                },
                Html: {
                    Data: `
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 10px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { text-align: center; font-size: 12px; color: #666; padding: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Task Update Notification</h2>
        </div>
        <div class="content">
            <p>Hello,</p>
            <p>One of your tasks has been updated:</p>
            
            <div style="margin: 15px 0; padding: 15px; border-left: 4px solid #4CAF50;">
                <p><strong>Task ID:</strong> ${notification.taskId}</p>
                <p><strong>Task Title:</strong> ${taskDetails.title || 'N/A'}</p>
                
                <p><strong>Updated Fields:</strong></p>
                <ul>
                    ${notification.updatedFields.map(field => `<li><strong>${field}:</strong> ${taskDetails[field]}</li>`).join('')}
                </ul>
                
                <p><strong>Current Status:</strong> ${taskDetails.status || 'N/A'}</p>
                <p><strong>Last Updated:</strong> ${taskDetails.updatedAt || 'N/A'}</p>
            </div>
            
            <p>Thank you for using our Task Manager!</p>
        </div>
        <div class="footer">
            <p>This is an automated message, please do not reply.</p>
        </div>
    </div>
</body>
</html>
`
                }
            },
            Subject: {
                Data: `Task Updated: ${taskDetails.title || 'Your task'}`
            }
        },
        Source: process.env.EMAIL_SENDER
    };
    
    // Send the email
    const result = await ses.sendEmail(params).promise();
    console.log("Email sent successfully:", result);
    return result;
} 