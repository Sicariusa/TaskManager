# Windows PowerShell deployment script

# First, let's create all necessary files if they don't exist

# Create lambda.js if it doesn't exist
if (-not (Test-Path "lambda.js")) {
    @'
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');

// Remove the direct server start since Lambda will handle this
if (app.listen) {
  const listen = app.listen.bind(app);
  app.listen = () => {
    console.warn('Attempted to call app.listen in Lambda environment');
    return app;
  };
  app._listen = listen;
}

// Create serverless handler
const handler = serverlessExpress({
  app,
  respondWithErrors: true,
  logSettings: {
    level: 'debug'
  }
});

exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event));
  return handler(event, context);
};
'@ | Out-File -FilePath "lambda.js" -Encoding UTF8
}

# Create .env.lambda if it doesn't exist
if (-not (Test-Path ".env.lambda")) {
    @'
NODE_ENV=lambda
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
JWT_SECRET=your_jwt_secret
'@ | Out-File -FilePath ".env.lambda" -Encoding UTF8
}

# Clean up any existing artifacts
if (Test-Path dist) {
    Remove-Item -Path dist -Recurse -Force
}
if (Test-Path function.zip) {
    Remove-Item -Path function.zip -Force
}

# Create dist directory
New-Item -ItemType Directory -Path dist

# Create a fresh package.json with only the dependencies we need
@'
{
  "name": "task-manager-lambda",
  "version": "1.0.0",
  "dependencies": {
    "@vendia/serverless-express": "^4.10.4",
    "express": "^4.18.2",
    "sequelize": "^6.33.0",
    "mysql2": "^3.6.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "aws-sdk": "^2.1502.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath "dist\package.json" -Encoding UTF8

Write-Host "Installing dependencies..."

# Create necessary directories
$directories = @(
    "dist\controllers",
    "dist\middleware",
    "dist\models",
    "dist\routes",
    "dist\config",
    "dist\services"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force
    }
}

# Install dependencies in the dist folder
Set-Location dist
npm install --production --no-package-lock
Set-Location ..

Write-Host "Copying project files..."

# Copy project files if they exist
$sourceDirs = @("controllers", "middleware", "models", "routes", "config", "services")
foreach ($dir in $sourceDirs) {
    if (Test-Path $dir) {
        Write-Host "Copying $dir..."
        Copy-Item -Path "$dir\*" -Destination "dist\$dir" -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Copy individual files
$filesToCopy = @{
    "app.js" = "dist\app.js"
    "lambda.js" = "dist\lambda.js"
    ".env.lambda" = "dist\.env"
}

foreach ($file in $filesToCopy.Keys) {
    if (Test-Path $file) {
        Write-Host "Copying $file..."
        Copy-Item -Path $file -Destination $filesToCopy[$file] -Force
    }
}

Write-Host "Creating zip file..."

# Create the ZIP file
Compress-Archive -Path "dist\*" -DestinationPath "function.zip" -Force

# Clean up
Remove-Item -Path dist -Recurse -Force

Write-Host "Deployment package created: function.zip"

# Show the size of the zip file
if (Test-Path function.zip) {
    $zipSize = (Get-Item function.zip).Length / 1MB
    Write-Host "Zip file size: $([math]::Round($zipSize, 2)) MB"

    # Show the contents of the zip
    Write-Host "`nZip contents:"
    Expand-Archive -Path function.zip -DestinationPath temp_list -Force
    Get-ChildItem -Path temp_list -Recurse | Where-Object { !$_.PSIsContainer } | Select-Object FullName
    Remove-Item -Path temp_list -Recurse -Force
} 