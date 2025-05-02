#!/bin/bash

# Create a temporary directory for the build
rm -rf dist
mkdir dist

# Install production dependencies
npm ci --production

# Copy necessary files
cp -r node_modules dist/
cp -r controllers dist/
cp -r middleware dist/
cp -r models dist/
cp -r routes dist/
cp -r utils dist/ 2>/dev/null || :
cp app.js dist/
cp lambda.js dist/
cp .env dist/ 2>/dev/null || :

# Create the ZIP file
cd dist
zip -r ../function.zip .
cd ..

# Clean up
rm -rf dist

echo "Deployment package created: function.zip" 