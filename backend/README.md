# Task Manager API

A Node.js REST API for task management with MySQL database integration on AWS.

## Features

- CRUD operations for tasks
- File attachment uploads
- Notification system (simulated email via AWS SQS)
- MySQL database integration on AWS RDS

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /tasks | GET | Fetch all tasks for user |
| /tasks/{id} | GET | Fetch single task |
| /tasks | POST | Create a new task |
| /tasks/{id} | PUT | Update task info/status |
| /tasks/{id} | DELETE | Delete a task |
| /tasks/{id}/upload | POST | Upload attachment |
| /tasks/{id}/attachments | GET | Get all attachments |
| /tasks/{id}/notify | POST | Send notification (simulated email via SQS) |

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables in `.env` file
4. Run the server: `npm start` or `npm run dev` for development

## Database Configuration

The application uses MySQL on AWS RDS. Update the `.env` file with your database credentials.

## Project Structure

```
├── config/
│   └── database.js
├── controllers/
│   └── taskController.js
├── models/
│   ├── Task.js
│   └── Attachment.js
├── routes/
│   └── taskRoutes.js
├── services/
│   └── notificationService.js
├── uploads/
├── .env
├── package.json
├── README.md
└── server.js
```

## AWS Integration

The application uses AWS SQS for simulating email notifications. Configure your AWS credentials in the `.env` file.