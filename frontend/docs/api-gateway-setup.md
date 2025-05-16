# API Gateway Configuration for Signup Lambda (HTTP API)

This document provides instructions for configuring HTTP API Gateway to connect the signup HTML form to the Lambda function.

## Step 1: Create a new HTTP API

1. Go to the AWS Management Console and navigate to API Gateway
2. Click "Create API" and select "HTTP API" (not REST API)
3. Fill in the details in the "Build an HTTP API" page:
   - API name: `TaskManagerAPI`
   - Click "Next"

## Step 2: Configure routes

1. On the "Configure routes" page, click "Add route"
   - Method: `POST`
   - Resource path: `/register`
   - Integration target: Select "Lambda" and choose your Lambda function (`register-handler` or similar)
2. Click "Next"

## Step 3: Configure stages

1. On the "Configure stages" page:
   - Keep the default stage name `$default` (or customize if needed)
   - Auto-deploy: Leave checked
2. Click "Next"

## Step 4: Review and create

1. Review the settings on the summary page
2. Click "Create"
3. After the API is created, you'll see the API URL at the top of the page (it will look like `https://api-id.execute-api.region.amazonaws.com`)

## Step 5: Configure CORS (important for browser access)

1. Select your API from the API Gateway dashboard
2. From the left navigation, select "CORS"
3. Configure CORS for the HTTP API:
   - Access-Control-Allow-Origins: `*` (or your specific domain for production)
   - Access-Control-Allow-Methods: `POST`
   - Access-Control-Allow-Headers: `Content-Type,Authorization`
   - Access-Control-Allow-Credentials: Leave unchecked for simple use cases
4. Click "Save"

## Step 6: Update the HTML signup form

1. Open the `signup.html` file
2. Find the line with `const apiUrl = '...'`
3. Replace the placeholder URL with your actual API Gateway URL:
   ```javascript
   const apiUrl = 'https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/register';
   ```
   Note: HTTP APIs use the `$default` stage which typically doesn't appear in the URL path

## Step 7: Testing the Integration

1. Open the `test-api.html` file in your browser
2. Enter your complete API Gateway URL in the field (including the `/register` path)
3. Fill in the test user credentials (or use the defaults)
4. Click "Test API"
5. Check the response to confirm the Lambda function is working
6. You can also check CloudWatch Logs for your Lambda function to verify it's being invoked
7. Verify that a new user is created in Cognito and the database

## Troubleshooting

If you encounter issues:

1. **CORS errors**: Confirm your CORS configuration is set correctly in API Gateway
2. **403 Forbidden errors**: Check that the Lambda function has permission to be invoked by API Gateway
3. **500 Internal Server errors**: Check CloudWatch Logs for errors in your Lambda function
4. **API not found**: Verify the URL is correct and includes the `/register` path
5. **Lambda not executing**: Check the IAM roles and permissions for your Lambda 