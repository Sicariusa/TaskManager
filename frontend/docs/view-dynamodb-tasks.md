## How to View Your DynamoDB Tasks

Your tasks are stored in AWS DynamoDB, a NoSQL database service. Here's how you can view your tasks:

### Option 1: Using AWS Console
1. Sign in to the AWS Management Console
2. Go to the DynamoDB service
3. In the navigation pane, choose "Tables"
4. Find your task table (likely named something like `tasks` or `task-table`)
5. Select your table and click on "Explore table items" to view your tasks

### Option 2: Using AWS CLI
If you have AWS CLI configured, you can run:

```bash
aws dynamodb scan --table-name YOUR_TABLE_NAME
```

Replace `YOUR_TABLE_NAME` with your actual DynamoDB table name.

### Option 3: Add a Debug Panel to Your Dashboard

If you want to see the raw data directly in your dashboard, you can add this code to your dashboard.html:

```javascript
// Add this function to your JavaScript
function showRawData() {
    const debugPanel = document.getElementById('debugPanel');
    if (!debugPanel.innerHTML) {
        fetch(`${API_BASE}/getTasks`, {
            headers: { 'Authorization': accessToken }
        })
        .then(res => res.json())
        .then(data => {
            debugPanel.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        });
    } else {
        debugPanel.innerHTML = '';
    }
}

// And add this button and div to your HTML
// <button id="debugBtn" onclick="showRawData()" style="margin-top:10px;background:#333;color:#fff;">Show Raw Data</button>
// <div id="debugPanel" style="margin-top:10px;padding:10px;background:#f0f0f0;border-radius:4px;overflow:auto;max-height:300px;"></div>
```

### Finding Your DynamoDB Table Name

You can find your table name in:

1. Your Lambda environment variables
2. In your AWS CloudFormation stack (if you used it for deployment)
3. In your backend code, look for:
   - Environment variables (`process.env.DYNAMO_TASK_TABLE`)
   - AWS SAM/CloudFormation templates
   - Deployment scripts

The table name is likely set in your backend configuration or environment variables.
