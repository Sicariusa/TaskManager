const authService = require('../services/authService');

// Register a new user
exports.register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const user = await authService.registerUser(username, email, password);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const token = await authService.loginUser(username, password);
    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(401).json({ message: 'Login failed', error: error.message });
  }
};

// Get User Profile
exports.getProfile = async (req, res) => {
  const { user } = req;

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.status(200).json({ user });
};

// Update User Profile
exports.updateProfile = async (req, res) => {
  const { user } = req;
  const { email, name } = req.body;

  try {
    // Update user attributes in Cognito
    const updatedUser = await authService.updateUser(user.username, { email, name });
    
    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ message: 'Profile update failed', error: error.message });
  }
};