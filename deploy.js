const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

// Create dist directory
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true });
}
fs.mkdirSync('dist');

// Create package.json
const packageJson = {
  name: "task-manager-lambda",
  version: "1.0.0",
  dependencies: {
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
};

fs.writeFileSync('dist/package.json', JSON.stringify(packageJson, null, 2));

// Install dependencies
console.log('Installing dependencies...');
execSync('npm install --production', { cwd: 'dist', stdio: 'inherit' });

// Copy project files
const directories = [
  'controllers',
  'middleware',
  'models',
  'routes',
  'config',
  'services'  // Added services directory
];

directories.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`Copying ${dir}...`);
    fs.mkdirSync(`dist/${dir}`, { recursive: true });
    fs.cpSync(dir, `dist/${dir}`, { recursive: true });
  }
});

// Copy individual files
['app.js', 'lambda.js'].forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`Copying ${file}...`);
    fs.copyFileSync(file, `dist/${file}`);
  }
});

// Copy .env.lambda to .env
if (fs.existsSync('.env.lambda')) {
  console.log('Copying .env.lambda to .env...');
  fs.copyFileSync('.env.lambda', 'dist/.env');
}

// Create zip file
console.log('Creating zip file...');
const output = fs.createWriteStream('function.zip');
const archive = archiver('zip', {
  zlib: { level: 9 }
});

output.on('close', () => {
  console.log(`Zip file created: ${archive.pointer()} bytes`);
  // Clean up
  fs.rmSync('dist', { recursive: true });
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory('dist/', false);
archive.finalize(); 