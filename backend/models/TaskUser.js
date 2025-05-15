const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const TaskUser = sequelize.define('TaskUser', {
  taskId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    references: {
      model: User,
      key: 'userId'
    }
  },
  role: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false
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
TaskUser.belongsTo(User, { foreignKey: 'userId' });

module.exports = TaskUser;