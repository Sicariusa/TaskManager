const mysql = require("mysql2/promise");
const { success, error } = require("../../common/response");
const authService = require("../../services/authService");
require("dotenv").config();

/**
 * Register a new user in Cognito and store additional information in RDS
 */
exports.register = async (event) => {
  let conn;
  try {
    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { username, email, password, name } = body;
    
    if (!username || !email || !password) {
      return error("Missing required fields: username, email, and password", 400);
    }

    // Create database connection
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Check if user already exists in RDS
    const [rows] = await conn.execute(
      "SELECT * FROM Users WHERE username = ? OR email = ?",
      [username, email]
    );

    // If user exists in RDS, return error
    if (rows.length > 0) {
      await conn.end();
      return error("Username or email already registered in database", 400);
    }

    let cognitoUser;
    try {
      // Try to register user in Cognito
      cognitoUser = await authService.registerUser(username, email, password);
    } catch (cognitoErr) {
      // If user already exists in Cognito but not in RDS
      if (cognitoErr.message === "User already exists") {
        // Get existing user from Cognito
        cognitoUser = await authService.getUserByUsername(username);
        if (!cognitoUser) {
          // If we can't get the user details, return the original error
          throw cognitoErr;
        }
      } else {
        // For other Cognito errors, throw them to be caught by outer catch
        throw cognitoErr;
      }
    }

    // Insert user into RDS with Cognito ID
    await conn.execute(
      "INSERT INTO Users (userId, username, email, name, createdAt) VALUES (?, ?, ?, ?, NOW())",
      [cognitoUser.UserSub || cognitoUser.sub, username, email, name || username]
    );

    await conn.end();

    return success({
      message: "User registered successfully",
      username: username,
      userId: cognitoUser.UserSub || cognitoUser.sub
    });
  } catch (err) {
    console.error("Registration Error:", err);
    if (conn) await conn.end();
    return error(err.message || "Registration failed", 500);
  }
};

/**
 * Login user with Cognito and return the JWT token
 */

