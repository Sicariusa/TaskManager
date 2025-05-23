const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'eu-north-1'
});

const sqs = new AWS.SQS();

/**
 * Send a notification message to SQS queue
 * @param {Object} data - Notification data
 * @param {number} data.taskId - Task ID
 * @param {string} data.taskTitle - Task title
 * @param {string} data.message - Notification message
 * @param {string} data.recipient - Email recipient
 * @param {string} data.timestamp - ISO timestamp
 * @returns {Promise} - SQS send message result
 */
exports.sendNotification = async (data) => {
  try {
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(data),
      MessageAttributes: {
        'Type': {
          DataType: 'String',
          StringValue: 'TaskNotification'
        }
      }
    };

    // For development/testing without actual SQS
    if (!process.env.SQS_QUEUE_URL) {
      console.log('SQS notification would be sent (simulation):', data);
      return { MessageId: 'simulated-message-id' };
    }

    const result = await sqs.sendMessage(params).promise();
    console.log('Notification sent to SQS:', result.MessageId);
    return result;
  } catch (error) {
    console.error('Error sending notification to SQS:', error);
    throw error;
  }
};