const mysql = require("mysql2/promise");
const { success, error } = require("./response");
const authService = require("./authService");
require("dotenv").config();

exports.handler = async (event) => {
  console.log("📥 Login request received:", JSON.stringify(event, null, 2));

  try {
    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { username, password } = body;

    if (!username || !password) {
      console.warn("⚠️ Missing required login fields");
      return error("Missing required fields: username and password", 400);
    }

    console.log(`🔐 Attempting login for user: ${username}`);

    // Login with Cognito - get tokens
    const authResult = await authService.loginUser(username, password);

    console.log("✅ Cognito login successful. Token info:", {
      hasAuthResult: !!authResult,
      idTokenExists: !!authResult?.IdToken,
      accessTokenExists: !!authResult?.AccessToken,
      refreshTokenExists: !!authResult?.RefreshToken
    });

    // Connect to RDS
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    const [rows] = await conn.execute(
      "SELECT * FROM Users WHERE username = ?",
      [username]
    );

    await conn.end();

    const userProfile = rows.length > 0 ? {
      id: rows[0].userId,
      username: rows[0].username,
      email: rows[0].email,
      name: rows[0].name,
      lastLogin: new Date().toISOString()
    } : null;

    if (!userProfile) {
      console.warn(`⚠️ No user profile found in DB for username: ${username}`);
    }

    const tokens = {
      accessToken: authResult?.AccessToken || null
      // Uncomment below if needed:
      // idToken: authResult?.IdToken || null,
      // refreshToken: authResult?.RefreshToken || null
    };

    console.log("🎟️ Final token package ready:", tokens);

    return success({
      message: "Login successful",
      tokens,
      profile: userProfile
    });

  } catch (err) {
    console.error("❌ Login Error:", err);
    return error(err.message || "Login failed", 401);
  }
};
