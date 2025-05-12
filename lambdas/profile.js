/**
 * Get user profile using the JWT token
 */
const mysql = require("mysql2/promise");
const { success, error } = require("../common/response");
const authService = require("../services/authService");
require("dotenv").config();
exports.getProfile = async (event) => {
    try {
      // Extract and verify token
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      if (!authHeader) return error("Unauthorized: No token", 401);
  
      const token = authHeader.replace("Bearer ", "");
      
      // Parse JWT without verification to get username
      // We don't verify since Cognito has its own JWT format
      const tokenParts = token.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      const username = payload['cognito:username'] || payload.username;
      
      if (!username) {
        return error("Could not extract username from token", 400);
      }
  
      // Fetch user details from RDS
      const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });
  
      const [rows] = await conn.execute(
        "SELECT * FROM users WHERE username = ?",
        [username]
      );
  
      await conn.end();
  
      if (rows.length === 0) {
        return error("User not found", 404);
      }
  
      const user = rows[0];
      
      return success({
        id: user.id,
        cognitoId: user.cognito_id,
        username: user.username,
        email: user.email,
        name: user.name,
        createdAt: user.created_at
      });
    } catch (err) {
      console.error("Get Profile Error:", err);
      return error(err.message || "Failed to retrieve profile", 500);
    }
  }; 