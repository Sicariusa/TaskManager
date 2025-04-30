const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Task = require('./Task');

const TaskUser = sequelize.define('TaskUser', {
  taskId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Task,
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'assignee'
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'pending'
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
TaskUser.belongsTo(Task, { foreignKey: 'taskId' });

module.exports = TaskUser;