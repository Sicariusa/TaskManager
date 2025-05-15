const jwt = require('jsonwebtoken');
const jwkToPem = require('jwk-to-pem');
const fetch = require('node-fetch');
require('dotenv').config();

// Cache for JWKs
let jwksCache = {};

/**
 * Verifies a JWT token from Cognito and returns decoded payload
 * @param {string} token - JWT token to verify
 * @returns {Promise<object>} - Decoded token payload
 */
const verifyToken = async (token) => {
  try {
    // Decode the token header and payload
    const tokenSections = token.split('.');
    if (tokenSections.length < 2) {
      throw new Error('Invalid token structure');
    }
    
    const headerJSON = Buffer.from(tokenSections[0], 'base64').toString('utf8');
    const header = JSON.parse(headerJSON);
    const kid = header.kid;
    
    const payloadJSON = Buffer.from(tokenSections[1], 'base64').toString('utf8');
    const payload = JSON.parse(payloadJSON);
    
    console.log('Token payload:', {
      iss: payload.iss,
      aud: payload.client_id,
      sub: payload.sub,
      username: payload.username,
      exp: new Date(payload.exp * 1000).toISOString(),
      iat: new Date(payload.iat * 1000).toISOString()
    });
    
    // Extract region and userPoolId from the issuer
    // Format: https://cognito-idp.{region}.amazonaws.com/{userPoolId}
    const issuerParts = payload.iss.split('https://cognito-idp.')[1].split('.amazonaws.com/');
    const region = issuerParts[0];
    const userPoolId = issuerParts[1];
    
    console.log(`Extracted from token - Region: ${region}, User Pool ID: ${userPoolId}`);
    
    // Get the JWKs for this issuer if not cached
    const issuerKey = `${region}:${userPoolId}`;
    if (!jwksCache[issuerKey]) {
      const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
      
      console.log(`Fetching JWKs from: ${jwksUrl}`);
      const response = await fetch(jwksUrl);
      jwksCache[issuerKey] = await response.json();
      console.log('JWKs fetched successfully');
    }
    
    const jwks = jwksCache[issuerKey];
    console.log(`Token KID: ${kid}`);
    
    // Find the JWK with the matching kid
    const key = jwks.keys.find(key => key.kid === kid);
    if (!key) {
      console.error('Available KIDs:', jwks.keys.map(k => k.kid));
      throw new Error(`Invalid token: Key ID ${kid} not found in JWKs`);
    }
    
    // Convert JWK to PEM if not already cached
    if (!jwksCache[kid]) {
      jwksCache[kid] = jwkToPem(key);
    }
    
    // Verify the token
    return new Promise((resolve, reject) => {
      // Extract issuer and audience from token payload for verification
      const expectedIssuer = payload.iss;
      
      console.log('Using token-based verification parameters:', {
        issuer: expectedIssuer
      });
      
      jwt.verify(
        token,
        jwksCache[kid],
        {
          issuer: expectedIssuer
        },
        (err, decoded) => {
          if (err) {
            console.error('Token verification error:', err.message);
            return reject(err);
          }
          console.log('Token verified successfully');
          resolve(decoded);
        }
      );
    });
  } catch (err) {
    console.error('Token verification failed:', err.message);
    throw new Error('Invalid or expired token');
  }
};

module.exports = { verifyToken }; 