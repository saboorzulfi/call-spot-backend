const jwt = require("jsonwebtoken");
const config = require("../../config/config");
const AppError = require("../../utils/app_error.util");
const Account = require("../../models/account.model");
const tryCatchAsync = require("../../utils/try_catch.util");

// Comprehensive authentication middleware - verifies JWT and fetches account data
const isLoggedIn = tryCatchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    throw new AppError("No token provided", 401);
  }

  // Verify JWT token
  const decoded = jwt.verify(token, config.jwt.secret);
  
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

  // Attach both account and user to request for use in controllers
  req.account = account;
  req.user = decoded;
  
  next();
});

// Legacy middlewares for backward compatibility (if needed elsewhere)
const jwtMiddleware = tryCatchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    throw new AppError("No token provided", 401);
  }

  const decoded = jwt.verify(token, config.jwt.secret);
  req.user = decoded;
  next();
});

// Authenticate user middleware (legacy)
const authenticateUser = tryCatchAsync(async (req, res, next) => {
  const user = req.user;
  
  if (!user) {
    throw new AppError("User not found in request", 401);
  }

  // Check if user exists in database
  const account = await Account.findById(user.account_id);
  if (!account) {
    throw new AppError("User account not found", 401);
  }

  // Check if account is active
  if (!account.active || account.isDelete) {
    throw new AppError("Account is inactive or deleted", 401);
  }

  // Attach account to request
  req.account = account;
  next();
});

// Optional authentication middleware
const optionalAuth = tryCatchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (token) {
    await jwtMiddleware(req, res, () => {
      authenticateUser(req, res, next);
    });
  } else {
    next();
  }
});

// API Key authentication middleware
const apiKeyAuth = tryCatchAsync(async (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  
  if (!apiKey) {
    throw new AppError("API key required", 401);
  }

  // Find account by API key
  const account = await Account.findOne({
    "api_key_info.key": apiKey,
    isDelete: false,
    active: true,
  });

  if (!account) {
    throw new AppError("Invalid API key", 403);
  }

  // Check if API key is expired
  if (account.api_key_info.expires_at && new Date() > account.api_key_info.expires_at) {
    throw new AppError("API key expired", 403);
  }

  req.account = account;
  next();
});

// Social media token authentication middleware
const socialTokenAuth = tryCatchAsync(async (req, res, next) => {
  const tiktokToken = req.headers["x-tiktok-token"];
  const facebookToken = req.headers["x-facebook-token"];
  const googleToken = req.headers["x-google-token"];

  let account = null;

  if (tiktokToken) {
    account = await Account.findOne({
      tiktok_access_token: tiktokToken,
      isDelete: false,
      active: true,
    });
  } else if (facebookToken) {
    account = await Account.findOne({
      facebook_access_token: facebookToken,
      isDelete: false,
      active: true,
    });
  } else if (googleToken) {
    account = await Account.findOne({
      "google_data.id_token": googleToken,
      isDelete: false,
      active: true,
    });
  }

  if (!account) {
    throw new AppError("Invalid social media token", 401);
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
  jwtMiddleware,
  authenticateUser,
  optionalAuth,
  apiKeyAuth,
  socialTokenAuth,
  authRateLimit,
  validateSession,
};
