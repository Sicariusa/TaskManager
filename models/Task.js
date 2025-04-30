const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const TaskUser = require('./TaskUser');

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
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'pending'
  },
  priority: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'medium',
    validate: {
      isIn: [['low', 'medium', 'high']]
    }
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true
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

// Define associations
Task.hasMany(TaskUser, { foreignKey: 'taskId', onDelete: 'CASCADE' });

// Instance method to sync with DynamoDB
Task.prototype.syncWithDynamo = async function() {
  const DynamoTask = require('./DynamoTask');
  await DynamoTask.update(this.dynamoTaskId, {
    title: this.title,
    description: this.description,
    status: this.status,
    priority: this.priority,
    dueDate: this.dueDate
  });
};

module.exports = Task; 