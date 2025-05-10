const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { auth } = require('../middleware/auth');

// Task CRUD operations
router.get('/', auth, taskController.getAllTasks);
router.get('/user/:userId', auth, taskController.getTasksByUserId);
router.get('/:id', auth, taskController.getTaskById);
router.post('/', auth, taskController.createTask);
router.put('/:id', auth, taskController.updateTask);
router.delete('/:id', auth, taskController.deleteTask);

// Attachment operations
router.post('/:id/upload', auth, taskController.uploadAttachment);
router.get('/:id/attachments', auth, taskController.getAttachments);

// Notification operation
router.post('/:id/notify', auth, taskController.sendNotification);

module.exports = router;