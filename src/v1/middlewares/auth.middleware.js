const jwt = require("jsonwebtoken");
const config = require("../../config/config");
const AppError = require("../../utils/app_error.util");
const Account = require("../../models/account.model");
const tryCatchAsync = require("../../utils/try_catch.util");

// Comprehensive authentication middleware - verifies JWT and fetches account data
const isLoggedIn = tryCatchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  console.log("🔑 Token:", token);
  if (!token) {
    throw new AppError("No token provided", 401);
  }

  // Verify JWT token
  const decoded = jwt.verify(token, config.jwt.secret);
  console.log("🔑 Decoded:", decoded);
  if (!decoded || !decoded.account_id) {
    throw new AppError("Invalid token payload", 401);
  }

  // Find account in database
  const account = await Account.findById(decoded.account_id);
  if (!account) {
    throw new AppError("User account not found", 401);
  }

  // Check if account is active
  if (!account.active || account.isDelete) {
    throw new AppError("Account is inactive or deleted", 401);
  }

  req.account = account;
  
  next();
});

// Rate limiting for authentication attempts
const authRateLimit = (req, res, next) => {
  // Simple in-memory rate limiting
  const clientIP = req.ip;
  const now = Date.now();
  
  if (!req.app.locals.authAttempts) {
    req.app.locals.authAttempts = new Map();
  }

  const attempts = req.app.locals.authAttempts.get(clientIP) || { count: 0, resetTime: now + 900000 }; // 15 minutes

  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + 900000;
  }

  if (attempts.count >= 5) {
    return next(new AppError("Too many authentication attempts. Please try again later.", 429));
  }

  attempts.count++;
  req.app.locals.authAttempts.set(clientIP, attempts);
  next();
};

// Session validation middleware
const validateSession = tryCatchAsync(async (req, res, next) => {
  if (!req.user) {
    throw new AppError("Session not found", 401);
  }

  // Check if user session is still valid
  const account = await Account.findById(req.user.account_id);
  if (!account || !account.active || account.isDelete) {
    throw new AppError("Session expired", 401);
  }

  next();
});

module.exports = {
  isLoggedIn,
  authRateLimit,
  validateSession,
};
