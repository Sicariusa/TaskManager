const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Task CRUD operations
router.get('/', authenticateToken, taskController.getAllTasks);
router.get('/:id', authenticateToken,taskController.getTaskById);
router.post('/', authenticateToken,taskController.createTask);
router.put('/:id', authenticateToken, taskController.updateTask);
router.delete('/:id', authenticateToken, taskController.deleteTask);

// Attachment operations
router.post('/:id/upload', authenticateToken,taskController.uploadAttachment);
router.get('/:id/attachments', authenticateToken,taskController.getAttachments);

// Notification operation
router.post('/:id/notify', authenticateToken,taskController.sendNotification);

module.exports = router;