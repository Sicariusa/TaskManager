const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// AWS Configuration
AWS.config.update({
  region: process.env.AWS_REGION || 'eu-north-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
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
        priority: taskData.priority || 'medium',
        dueDate: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : null,
        userId: taskData.userId,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    };

    try {
      await dynamoDB.put(params).promise();
      return params.Item;
    } catch (error) {
      console.error('DynamoDB put error:', error);
      throw new Error('Failed to create task in DynamoDB');
    }
  }

  static async get(taskId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { taskId }
    };

    try {
      const result = await dynamoDB.get(params).promise();
      return result.Item;
    } catch (error) {
      console.error('DynamoDB get error:', error);
      throw new Error('Failed to fetch task from DynamoDB');
    }
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
        expressionAttributeValues[`:${key}`] = key === 'dueDate' && value ? 
          new Date(value).toISOString() : value;
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

    try {
      const result = await dynamoDB.update(params).promise();
      return result.Attributes;
    } catch (error) {
      console.error('DynamoDB update error:', error);
      throw new Error('Failed to update task in DynamoDB');
    }
  }

  static async delete(taskId) {
    const params = {
      TableName: TABLE_NAME,
      Key: { taskId }
    };

    try {
      await dynamoDB.delete(params).promise();
    } catch (error) {
      console.error('DynamoDB delete error:', error);
      throw new Error('Failed to delete task from DynamoDB');
    }
  }

  // Helper method to create DynamoDB table (for setup)
  static async createTable() {
    const dynamoDBRaw = new AWS.DynamoDB();
    const params = {
      TableName: TABLE_NAME,
      KeySchema: [
        { AttributeName: 'taskId', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'taskId', AttributeType: 'S' }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    };

    try {
      await dynamoDBRaw.createTable(params).promise();
      console.log(`Created table ${TABLE_NAME}`);
    } catch (error) {
      if (error.code === 'ResourceInUseException') {
        console.log(`Table ${TABLE_NAME} already exists`);
      } else {
        console.error('Error creating DynamoDB table:', error);
        throw error;
      }
    }
  }
}

module.exports = DynamoTask;