require("dotenv").config();

const config = {
  server: {
    port: process.env.SERVER_PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },
  
  database: {
    uri: process.env.MONGODB_URI || `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`,

    options: {
    }
  },
  
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || "",
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || "new:",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiry: process.env.JWT_EXPIRY || "8h",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
    apiKeyExpiry: process.env.JWT_API_KEY_EXPIRY || "30d",
    socialExpiry: process.env.JWT_SOCIAL_EXPIRY || "24h",
    issuer: process.env.JWT_ISSUER || "new-backend",
    audience: process.env.JWT_AUDIENCE || "new-backend-users",
  },
  auth: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    otpExpiry: parseInt(process.env.OTP_EXPIRY) || 600000, // 10 minutes
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 900000, // 15 minutes
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 900000,
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5,
  },
  
  security: {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      allowedOrigins: process.env.ALLOWED_ORIGINS || "*",
      credentials: true,
    },
    helmet: {
      enabled: process.env.HELMET_ENABLED !== "false",
    },
  },
  
  features: {
    enable2FA: process.env.ENABLE_2FA === "true",
    enableSocialLogin: process.env.ENABLE_SOCIAL_LOGIN === "true",
    enableApiKeyAuth: process.env.ENABLE_API_KEY_AUTH !== "false",
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== "false",
    enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== "false",
    enableRealtimeNotifications: process.env.ENABLE_REALTIME_NOTIFICATIONS === "true",
  },
  
  social: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
    },
    facebook: {
      appId: process.env.FACEBOOK_APP_ID || "",
      appSecret: process.env.FACEBOOK_APP_SECRET || "",
      redirectUri: process.env.FACEBOOK_REDIRECT_URI || "",
    },
    tiktok: {
      clientKey: process.env.TIKTOK_CLIENT_KEY || "",
      clientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
      redirectUri: process.env.TIKTOK_REDIRECT_URI || "",
    },
  },
  
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
  },
  
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "",
    },
    elevenLabs: {
      apiKey: process.env.ELEVEN_LABS_API_KEY || "",
    },
  },
  
  email: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    username: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASS || "",
  },
  
  storage: {
    type: process.env.STORAGE_TYPE || "local",
    local: {
      path: process.env.LOCAL_STORAGE_PATH || "./uploads",
    },
    s3: {
      bucketName: process.env.AWS_BUCKET_NAME,
      bucketRegion: process.env.AWS_BUCKET_REGION,
      bucketAccessKeyId: process.env.AWS_BUCKET_ACCESS_KEY_ID,
      bucketSecretKeyId: process.env.AWS_BUCKET_SECRET_KEY_ID,
    },
  },
  
  monitoring: {
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== "false",
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED === "true",
      port: parseInt(process.env.METRICS_PORT) || 9090,
    },
  },
};

module.exports = config;
