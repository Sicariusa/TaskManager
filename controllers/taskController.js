const TaskUser = require('../models/TaskUser');
const Attachment = require('../models/Attachment');
const DynamoTask = require('../models/DynamoTask');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const Task = require('../models/Task');
const sequelize = require('../config/database');

const fs = require('fs');




// Get all tasks for a user
exports.getAllTasks = async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const taskUsers = await TaskUser.findAll({
      where: { userId },
      include: [
        { model: Task }
      ],
      order: [[Task, 'createdAt', 'DESC']]
    });

    const tasks = taskUsers.map(tu => ({
      ...tu.Task.toJSON(),
      userRole: tu.role,
      userStatus: tu.status
    }));

    res.status(200).json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks', error: error.message });
  }
};

// Get a single task by ID
exports.getTaskById = async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findByPk(taskId, {
      include: [
        { model: Attachment },
        { 
          model: TaskUser,
          include: [{
            model: User,
            attributes: ['userId', 'username', 'name', 'email']
          }]
        }
      ]
    });
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Get DynamoDB task details
    const dynamoTask = await DynamoTask.get(task.dynamoTaskId);
    const taskData = {
      ...task.toJSON(),
      dynamoDetails: dynamoTask
    };
    
    res.status(200).json(taskData);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ message: 'Failed to fetch task', error: error.message });
  }
};

// Create a new task
exports.createTask = async (req, res) => {
  const t = await sequelize.transaction();
  let dynamoTask = null;

  try {
    const { title, description, status, dueDate, priority, userId, assignees } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // First, create the task in DynamoDB
    dynamoTask = await DynamoTask.create({
      title,
      description,
      status: status || 'pending',
      priority: priority || 'medium',
      dueDate: dueDate || null,
      userId
    });
    
    // Then create the task in SQL database with the DynamoDB taskId
    const task = await Task.create({
      dynamoTaskId: dynamoTask.taskId,
      title,
      description,
      status: status || 'pending',
      priority: priority || 'medium',
      dueDate: dueDate || null
    }, { transaction: t });

    // Create creator relationship
    await TaskUser.create({
      taskId: task.id,
      userId,
      role: 'creator',
      status: 'active'
    }, { transaction: t });

    // Create assignee relationships
    if (assignees && Array.isArray(assignees)) {
      await Promise.all(assignees.map(assigneeId =>
        TaskUser.create({
          taskId: task.id,
          userId: assigneeId,
          role: 'assignee',
          status: 'pending'
        }, { transaction: t })
      ));
    }

    // Commit transaction
    await t.commit();

    // Fetch the complete task with relationships
    const createdTask = await Task.findByPk(task.id, {
      include: [
        { 
          model: TaskUser,
          include: [{
            model: User,
            attributes: ['userId', 'username', 'name', 'email']
          }]
        }
      ]
    });
    
    // Include DynamoDB data in response
    const taskResponse = {
      ...createdTask.toJSON(),
      dynamoDetails: dynamoTask
    };
    
    res.status(201).json(taskResponse);
  } catch (error) {
    // Only rollback if the transaction hasn't been committed
    if (!t.finished) {
      await t.rollback();
    }
    
    // Delete DynamoDB record if it was created
    if (dynamoTask && dynamoTask.taskId) {
      try {
        await DynamoTask.delete(dynamoTask.taskId);
      } catch (deleteError) {
        console.error('Error deleting DynamoDB record:', deleteError);
      }
    }
    
    console.error('Error creating task:', error);
    res.status(500).json({ 
      message: 'Failed to create task', 
      error: error.message 
    });
  }
};

// Update a task
exports.updateTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const { title, description, status, dueDate, priority, assignees } = req.body;
    
    const task = await Task.findByPk(taskId);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    await task.update({
      title: title || task.title,
      description: description !== undefined ? description : task.description,
      status: status || task.status,
      dueDate: dueDate !== undefined ? dueDate : task.dueDate,
      priority: priority || task.priority
    });

    // Update assignees if provided
    if (assignees && Array.isArray(assignees)) {
      // Remove existing assignees
      await TaskUser.destroy({
        where: {
          taskId: task.id,
          role: 'assignee'
        }
      });

      // Add new assignees
      await Promise.all(assignees.map(assigneeId =>
        TaskUser.create({
          taskId: task.id,
          userId: assigneeId,
          role: 'assignee',
          status: 'pending'
        })
      ));
    }

    // Sync with DynamoDB
    await task.syncWithDynamo();

    // Fetch updated task with relationships
    const updatedTask = await Task.findByPk(taskId, {
      include: [
        { 
          model: TaskUser,
          include: [{
            model: User,
            attributes: ['userId', 'username', 'name', 'email']
          }]
        }
      ]
    });
    
    res.status(200).json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Failed to update task', error: error.message });
  }
};

// Delete a task
exports.deleteTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findByPk(taskId);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Delete associated attachments from storage
    const attachments = await Attachment.findAll({ where: { taskId } });
    for (const attachment of attachments) {
      const filePath = attachment.path;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await task.destroy();
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Failed to delete task', error: error.message });
  }
};

// Upload attachment
exports.uploadAttachment = async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findByPk(taskId);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Multer middleware for file upload
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: 'File upload failed', error: err.message });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const { filename, originalname, mimetype, size, path: filePath } = req.file;
      
      const attachment = await Attachment.create({
        filename,
        originalName: originalname,
        mimeType: mimetype,
        size,
        path: filePath,
        taskId
      });
      
      res.status(201).json(attachment);
    });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ message: 'Failed to upload attachment', error: error.message });
  }
};

// Get all attachments for a task
exports.getAttachments = async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findByPk(taskId);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    const attachments = await Attachment.findAll({ where: { taskId } });
    res.status(200).json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ message: 'Failed to fetch attachments', error: error.message });
  }
};

// Send notification
exports.sendNotification = async (req, res) => {
  try {
    const taskId = req.params.id;
    const { message, recipient } = req.body;
    
    if (!message || !recipient) {
      return res.status(400).json({ message: 'Message and recipient are required' });
    }
    
    const task = await Task.findByPk(taskId);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Send notification via SQS
    await notificationService.sendNotification({
      taskId,
      taskTitle: task.title,
      message,
      recipient,
      timestamp: new Date().toISOString()
    });
    
    res.status(200).json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ message: 'Failed to send notification', error: error.message });
  }
};