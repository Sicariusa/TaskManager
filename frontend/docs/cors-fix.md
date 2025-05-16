# Fixing CORS Issues in API Gateway

Based on the error message you're seeing, your API Gateway needs proper CORS configuration. Here's how to fix it:

## Step 1: Configure CORS in HTTP API Gateway

1. Go to the AWS Management Console and navigate to API Gateway
2. Select your API (TaskManagerAPI)
3. In the left navigation menu, click on "CORS"
4. Configure the CORS settings with the following values:
   - Access-Control-Allow-Origin: `*` (or specifically `http://127.0.0.1:5500` if you're testing locally)
   - Access-Control-Allow-Headers: `Content-Type,Authorization`
   - Access-Control-Allow-Methods: Make sure `POST` is selected
   - Access-Control-Expose-Headers: Leave empty for now
   - Access-Control-Max-Age: Default (usually 300 seconds)
   - Access-Control-Allow-Credentials: Unchecked (unless you specifically need credentials)
5. Click "Save" to apply these changes

## Step 2: Verify Route Configuration

1. While in API Gateway, check your routes:
   - Click on "Routes" in the left navigation
   - Verify you have a `POST` method for `/signUp` (note the capitalization)
   - If the route doesn't exist exactly as `POST /signUp`, create it or modify the existing one

## Step 3: Check Lambda Integration

1. Click on the route and verify the Lambda integration
2. Make sure your Lambda function is correctly integrated
3. The Lambda function name should match the one you intended to use

## Step 4: Deploy the Changes

1. After making CORS changes, you may need to redeploy your API:
   - Click on "Deployments" in the left navigation
   - Click "Create"
   - Select the stage and deploy

## Step 5: Test Again

1. After applying these changes, try your test-api.html again
2. The CORS error should be resolved

## Still Having Issues?

If you're still having CORS issues:

1. **Check Case Sensitivity**: Make sure the endpoint in your HTML matches exactly what's in API Gateway (e.g., `/signUp` vs `/signup`)
2. **Network Tab**: Use browser dev tools (F12) and check the Network tab to see the exact requests being made
3. **Check Lambda Logs**: Look at CloudWatch logs for your Lambda function to see if it's being invoked
4. **OPTIONS Method**: HTTP APIs automatically handle OPTIONS requests, but verify it's working properly
5. **API Gateway Logs**: Enable logging in API Gateway to see what's happening with your requests 