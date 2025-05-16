const mysql = require("mysql2/promise");
const { success, error } = require("./response");
const authService = require("./authService");
require("dotenv").config();

/**
 * Register a new user in Cognito and store additional information in RDS
 */
exports.handler = async (event) => {
  console.log("📥 FULL EVENT:", JSON.stringify(event, null, 2)); // Log the entire event for debugging

  // Check for OPTIONS request - HTTP API might use different structure
  if (event.httpMethod === 'OPTIONS' || (event.requestContext && event.requestContext.http && event.requestContext.http.method === 'OPTIONS')) {
    console.log("📝 Handling OPTIONS request");
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'OPTIONS, GET, POST'
      },
      body: ''
    };
  }

  console.log("📥 Register request received:", JSON.stringify(event, null, 2));

  let conn;
  try {
    const body = JSON.parse(event.body || "{}");
    const { username, email, password, name } = body;

    if (!username || !email || !password) {
      console.warn("⚠️ Missing required fields: username, email, or password");
      return error("Missing required fields: username, email, and password", 400);
    }

    console.log(`🔍 Checking if user exists: ${username} / ${email}`);

    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    const [rows] = await conn.execute(
      "SELECT * FROM Users WHERE username = ? OR email = ?",
      [username, email]
    );

    if (rows.length > 0) {
      console.warn("⚠️ Username or email already registered in database");
      await conn.end();
      return error("Username or email already registered in database", 400);
    }

    let cognitoUser;
    try {
      console.log("🔐 Registering user in Cognito...");
      cognitoUser = await authService.registerUser(username, email, password);
      console.log("✅ Cognito user registered:", cognitoUser);
    } catch (cognitoErr) {
      console.warn("⚠️ Cognito error during registration:", cognitoErr.message);
      if (cognitoErr.message === "User already exists") {
        cognitoUser = await authService.getUserByUsername(username);
        if (!cognitoUser) {
          throw cognitoErr;
        }
        console.log("ℹ️ Recovered existing Cognito user");
      } else {
        throw cognitoErr;
      }
    }

    const userId = cognitoUser.UserSub || cognitoUser.sub;
    console.log("💾 Inserting user into RDS:", { userId, username });

    await conn.execute(
      "INSERT INTO Users (userId, username, email, name, createdAt) VALUES (?, ?, ?, ?, NOW())",
      [userId, username, email, name || username]
    );

    await conn.end();
    console.log("✅ User successfully registered and saved to RDS");

    return success({
      message: "User registered successfully",
      username,
      userId
    });

  } catch (err) {
    console.error("❌ Registration Error:", err);
    if (conn) await conn.end();
    return error(err.message || "Registration failed", 500);
  }
};
