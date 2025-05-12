const jwt = require('jsonwebtoken');
const jwkToPem = require('jwk-to-pem');
const fetch = require('node-fetch');
require('dotenv').config();

// Cache for JWKs
let jwks = null;
let jwkCache = {};

/**
 * Verifies a JWT token from Cognito and returns decoded payload
 * @param {string} token - JWT token to verify
 * @returns {Promise<object>} - Decoded token payload
 */
const verifyToken = async (token) => {
  try {
    // Get the JWKs if not cached
    if (!jwks) {
      const userPoolId = process.env.COGNITO_USER_POOL_ID;
      const jwksUrl = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
      
      const response = await fetch(jwksUrl);
      jwks = await response.json();
    }
    
    // Decode the token header to get the kid
    const tokenSections = token.split('.');
    if (tokenSections.length < 2) {
      throw new Error('Invalid token');
    }
    
    const headerJSON = Buffer.from(tokenSections[0], 'base64').toString('utf8');
    const header = JSON.parse(headerJSON);
    const kid = header.kid;
    
    // Find the JWK with the matching kid
    const key = jwks.keys.find(key => key.kid === kid);
    if (!key) {
      throw new Error('Invalid token: Key ID not found');
    }
    
    // Convert JWK to PEM if not already cached
    if (!jwkCache[kid]) {
      jwkCache[kid] = jwkToPem(key);
    }
    
    // Verify the token
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        jwkCache[kid],
        {
          issuer: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
          audience: process.env.COGNITO_APP_CLIENT_ID
        },
        (err, decoded) => {
          if (err) {
            return reject(err);
          }
          resolve(decoded);
        }
      );
    });
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
};

module.exports = { verifyToken }; 