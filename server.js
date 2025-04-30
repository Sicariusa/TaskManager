require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/tasks', taskRoutes);
app.use('/api/auth', authRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Task Manager API' });
});

// Database connection
db.authenticate()
  .then(() => {
    console.log('Database connection established successfully.');
    return db.sync();
  })
  .then(() => {
    console.log('Database synchronized.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});