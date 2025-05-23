# Task Manager

A full-stack task management application with a modern frontend and robust backend API, featuring AWS integration and MySQL database.

## Project Structure

```
TaskManager/
├── frontend/           # Frontend application
│   ├── public/        # Static files
│   ├── lambdas/       # AWS Lambda functions
│   └── docs/          # Frontend documentation
│
├── backend/           # Backend API server
│   ├── config/        # Configuration files
│   ├── controllers/   # Route controllers
│   ├── middleware/    # Custom middleware
│   ├── models/        # Database models
│   ├── routes/        # API routes
│   ├── services/      # Business logic
│   ├── utils/         # Utility functions
│   └── lambdas/       # AWS Lambda functions
```

## Technologies Used

### Backend
- Node.js & Express.js
- MySQL Database with Sequelize ORM
- AWS Services Integration
  - AWS Lambda
  - Amazon Cognito for Authentication
  - AWS SQS
- JWT Authentication
- RESTful API Architecture

### Frontend
- Modern Web Application
- AWS Lambda Integration
- Responsive Design

## Prerequisites

- Node.js (v14 or higher)
- MySQL Database
- AWS Account with appropriate permissions
- npm or yarn package manager

## Environment Setup

1. Clone the repository
```bash
git clone [repository-url]
cd TaskManager
```

2. Install backend dependencies
```bash
cd backend
npm install
```

3. Configure environment variables
- Create a `.env` file in the backend directory
- Create a `.env.lambda` file for AWS Lambda configuration
- Set up required environment variables (see `.env.example`)

4. Install frontend dependencies
```bash
cd ../frontend
npm install
```

## Running the Application

### Backend
```bash
cd backend
npm run dev     # Development mode with nodemon
npm start       # Production mode
```

### Frontend
```bash
cd frontend
npm start      # Start the frontend development server
```

## AWS Cloud Architecture

### Infrastructure Components

1. **AWS Lambda Functions**
   - Serverless compute service for running backend code
   - Located in both frontend and backend `lambdas/` directories
   - Handles specific tasks and API endpoints
   - Auto-scales based on demand

2. **Amazon Cognito**
   - User authentication and authorization
   - Manages user pools and identity pools
   - Handles user registration, login, and password recovery
   - Provides secure token-based authentication

3. **AWS SQS (Simple Queue Service)**
   - Message queuing for asynchronous processing
   - Handles background tasks and notifications
   - Ensures reliable message delivery
   - Decouples application components

4. **Amazon S3**
   - File storage for user uploads and static assets
   - Stores task attachments and user documents
   - Provides secure and scalable storage
   - CDN integration for faster content delivery

### Deployment Process

1. **Backend Deployment**
   ```bash
   cd backend
   npm run deploy    # Deploys Lambda functions and API Gateway
   ```
   - Uses AWS SAM or Serverless Framework
   - Deploys Lambda functions
   - Sets up API Gateway endpoints
   - Configures IAM roles and permissions

2. **Frontend Deployment**
   ```bash
   cd frontend
   npm run deploy    # Deploys to S3 and CloudFront
   ```
   - Builds and optimizes frontend assets
   - Deploys to S3 bucket
   - Configures CloudFront distribution
   - Sets up custom domain (if configured)

### AWS Services Integration

1. **Authentication Flow**
   - User registration/login through Cognito
   - JWT token generation and validation
   - Secure session management
   - Role-based access control

2. **File Processing**
   - File uploads to S3
   - Lambda triggers for file processing
   - SQS queues for background tasks
   - CloudFront for content delivery

3. **API Integration**
   - RESTful API endpoints through API Gateway
   - Lambda function integration
   - Request/response transformation
   - API key management

4. **Monitoring and Logging**
   - CloudWatch for monitoring
   - X-Ray for tracing
   - CloudTrail for audit logs
   - Custom metrics and alarms

### Security Considerations

1. **IAM Roles and Policies**
   - Least privilege principle
   - Role-based access control
   - Secure credential management
   - Regular security audits

2. **Network Security**
   - VPC configuration
   - Security groups
   - Network ACLs
   - SSL/TLS encryption

3. **Data Protection**
   - Encryption at rest
   - Encryption in transit
   - Secure key management
   - Regular backups



## API Documentation

The API documentation is available in the backend documentation. Key endpoints include:

- Authentication endpoints
- Task management endpoints
- User management endpoints
- File upload endpoints

