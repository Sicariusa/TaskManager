const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMO_TASK_TABLE || 'Tasks';

class DynamoTask {
  static async create(taskData) {
    const taskId = uuidv4();
    const timestamp = new Date().toISOString();

    const params = {
      TableName: TABLE_NAME,
      Item: {
        taskId,
        title: taskData.title,
        description: taskData.description || null,
        status: taskData.status || 'pending',
        createdAt: timestamp,
        updatedAt: timestamp
      }
    };

    await dynamoDB.put(params).promise();
    return params.Item;
  }

  static async get(taskId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { taskId }
    };

    const result = await dynamoDB.get(params).promise();
    return result.Item;
  }

  static async update(taskId, updates) {
    const timestamp = new Date().toISOString();
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'taskId' && value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = timestamp;

    const params = {
      TableName: TABLE_NAME,
      Key: { taskId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamoDB.update(params).promise();
    return result.Attributes;
  }

  static async delete(taskId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { taskId }
    };

    await dynamoDB.delete(params).promise();
  }
}

module.exports = DynamoTask;