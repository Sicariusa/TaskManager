#!/bin/bash

# Create a temporary directory for the build
rm -rf dist 2>/dev/null || :
mkdir dist

# Install production dependencies
npm install --production

# Copy necessary files
robocopy node_modules dist/node_modules /E /NFL /NDL /NJH /NJS /nc /ns /np || :
robocopy controllers dist/controllers /E /NFL /NDL /NJH /NJS /nc /ns /np || :
robocopy middleware dist/middleware /E /NFL /NDL /NJH /NJS /nc /ns /np || :
robocopy models dist/models /E /NFL /NDL /NJH /NJS /nc /ns /np || :
robocopy routes dist/routes /E /NFL /NDL /NJH /NJS /nc /ns /np || :
robocopy utils dist/utils /E /NFL /NDL /NJH /NJS /nc /ns /np || :

# Copy individual files
copy app.js dist\
copy lambda.js dist\
copy .env.lambda dist\.env 2>nul || :

# Create the ZIP file (using PowerShell)
powershell -Command "Compress-Archive -Path dist\* -DestinationPath function.zip -Force"

# Clean up
rm -rf dist 2>/dev/null || :

echo "Deployment package created: function.zip" 