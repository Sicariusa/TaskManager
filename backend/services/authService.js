const AWS = require('aws-sdk');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
const crypto = require('crypto');
require('dotenv').config();

AWS.config.update({ region: process.env.AWS_REGION });

// Debug logging for configuration
console.log('Cognito Configuration:', {
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_APP_CLIENT_ID,
  region: process.env.AWS_REGION,
  hasClientSecret: !!process.env.COGNITO_APP_CLIENT_SECRET
});

const poolData = {
  UserPoolId: process.env.COGNITO_USER_POOL_ID,
  ClientId: process.env.COGNITO_APP_CLIENT_ID,
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

// Initialize Cognito Identity Provider
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

/**
 * Calculate SECRET_HASH
 */
const calculateSecretHash = (username) => {
  const message = username + process.env.COGNITO_APP_CLIENT_ID;
  const hmac = crypto.createHmac('sha256', process.env.COGNITO_APP_CLIENT_SECRET);
  hmac.update(message);
  const hash = hmac.digest('base64');
  
  // Debug logging for SECRET_HASH calculation
  console.log('SECRET_HASH Calculation:', {
    username,
    clientId: process.env.COGNITO_APP_CLIENT_ID,
    message,
    hash
  });
  
  return hash;
};

/**
 * Register a New User
 */
exports.registerUser = (username, email, password) => {
  const params = {
    ClientId: process.env.COGNITO_APP_CLIENT_ID,
    Username: username,
    Password: password,
    SecretHash: calculateSecretHash(username),
    UserAttributes: [
      {
        Name: 'email',
        Value: email
      }
    ]
  };

  // Debug logging for registration attempt
  console.log('Registration Attempt:', {
    username,
    email,
    hasSecretHash: !!params.SecretHash
  });

  return new Promise((resolve, reject) => {
    cognitoIdentityServiceProvider.signUp(params, (err, data) => {
      if (err) {
        console.error('Registration Error Details:', {
          name: err.name,
          message: err.message,
          code: err.code,
          stack: err.stack
        });
        return reject(err);
      }
      resolve(data);
    });
  });
};

/**
 * Login User
 */
exports.loginUser = (username, password) => {
  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: process.env.COGNITO_APP_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
      SECRET_HASH: calculateSecretHash(username)
    }
  };

  // Debug logging for login attempt
  console.log('Login Attempt:', {
    username,
    hasSecretHash: !!params.AuthParameters.SECRET_HASH
  });

  return new Promise((resolve, reject) => {
    cognitoIdentityServiceProvider.initiateAuth(params, (err, data) => {
      if (err) {
        console.error('Login Error Details:', {
          name: err.name,
          message: err.message,
          code: err.code,
          stack: err.stack
        });
        return reject(err);
      }
      resolve(data.AuthenticationResult.IdToken);
    });
  });
};
