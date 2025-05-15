const mysql = require("mysql2/promise");
const { success, error } = require("../common/response");
const authService = require("../services/authService");
require("dotenv").config();

exports.login = async (event) => {
    try {
      // Parse request body
      const body = JSON.parse(event.body || "{}");
      const { username, password } = body;
      
      if (!username || !password) {
        return error("Missing required fields: username and password", 400);
      }
  
      // Login with Cognito - get all tokens
      const authResult = await authService.loginUser(username, password);
      
      // Debug log the auth result
      console.log('Auth Result in login handler:', {
        hasAuthResult: !!authResult,
        authResultKeys: authResult ? Object.keys(authResult) : [],
        idTokenExists: !!authResult?.IdToken,
        accessTokenExists: !!authResult?.AccessToken,
        refreshTokenExists: !!authResult?.RefreshToken
      });
      
      // Fetch user details from RDS for additional profile info
      const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });
  
      const [rows] = await conn.execute(
        "SELECT * FROM Users WHERE username = ?",
        [username]
      );
  
      await conn.end();
  
      // Get user profile if it exists
      const userProfile = rows.length > 0 ? {
        id: rows[0].userId,
        username: rows[0].username,
        email: rows[0].email,
        name: rows[0].name,
        lastLogin: new Date().toISOString()
      } : null;
      
      // Create tokens object with proper fallbacks
      const tokens = {
        idToken: authResult?.IdToken || null,
        accessToken: authResult?.AccessToken || null,
        refreshToken: authResult?.RefreshToken || null
      };
      
      // Debug log the final tokens object
      console.log('Final tokens object:', {
        hasIdToken: !!tokens.idToken,
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken
      });
  
      return success({
        message: "Login successful",
        tokens,
        profile: userProfile
      });
    } catch (err) {
      console.error("Login Error:", err);
      return error(err.message || "Login failed", 401);
    }
  };
  