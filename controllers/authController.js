const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

// JWT secret key - should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register new user
exports.register = async (req, res) => {
  try {
    const { username, email, password, name } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    // Create new user
    const user = await User.create({
      username,
      email,
      password,
      name
    });

    // // Generate JWT token
    // const token = jwt.sign({ userId: user.userId }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'User registered successfully',
      // token,
      user: {
        id: user.userId,
        username: user.username,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Failed to register user', error: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.userId }, JWT_SECRET, { expiresIn: '24h' });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.userId,
        username: user.username,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Failed to login', error: error.message });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Set by auth middleware
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Set by auth middleware
    const { name, email, password } = req.body;

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user fields
    await user.update({
      name: name || user.name,
      email: email || user.email,
      password: password || user.password
    });

    // Exclude password from response
    const updatedUser = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
};