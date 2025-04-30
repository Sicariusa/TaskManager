const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const DynamoTask = require('./DynamoTask');

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  dynamoTaskId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'in-progress', 'completed'),
    defaultValue: 'pending'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    defaultValue: 'medium'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Instance methods for DynamoDB synchronization
Task.prototype.syncWithDynamo = async function() {
  const dynamoTask = await DynamoTask.get(this.dynamoTaskId);
  if (dynamoTask) {
    await DynamoTask.update(this.dynamoTaskId, {
      title: this.title,
      description: this.description,
      status: this.status
    });
  }
};

// Hooks for DynamoDB synchronization
Task.addHook('afterCreate', 'syncWithDynamo', async (task) => {
  const dynamoTask = await DynamoTask.create({
    title: task.title,
    description: task.description,
    status: task.status
  });
  await task.update({ dynamoTaskId: dynamoTask.taskId }, { hooks: false });
});

Task.addHook('afterDestroy', 'deleteFromDynamo', async (task) => {
  await DynamoTask.delete(task.dynamoTaskId);
});

module.exports = Task;