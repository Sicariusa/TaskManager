const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const authService = require('../services/authService');

// Test Cognito configuration
router.get('/test-cognito', async (req, res) => {
  try {
    const poolData = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      ClientId: process.env.COGNITO_APP_CLIENT_ID,
    };
    
    res.json({
      message: 'Cognito configuration check',
      config: {
        userPoolId: process.env.COGNITO_USER_POOL_ID ? 'Configured' : 'Missing',
        clientId: process.env.COGNITO_APP_CLIENT_ID ? 'Configured' : 'Missing',
        region: process.env.AWS_REGION ? 'Configured' : 'Missing'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, authController.updateProfile);

module.exports = router;