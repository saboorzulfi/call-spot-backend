require("dotenv").config();

const config = {
  server: {
    port: process.env.SERVER_PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },
  randomCharacters: process.env.RANDOM_CHARACTERS,
  database: {
    uri:  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`,

    options: {
    }
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
  
  storage: {
    s3: {
      bucketName: process.env.AWS_BUCKET_NAME,
      bucketRegion: process.env.AWS_BUCKET_REGION,
      bucketAccessKeyId: process.env.AWS_BUCKET_ACCESS_KEY_ID,
      bucketSecretKeyId: process.env.AWS_BUCKET_SECRET_KEY_ID,
    },
  },

  // FreeSWITCH ESL Configuration
  esl: {
    enabled: process.env.FREESWITCH_ENABLED !== 'false', // Default to true, set to 'false' to disable
    host: process.env.ESL_HOST || '127.0.0.1',
    port: parseInt(process.env.ESL_PORT) || 8021,
    password: process.env.ESL_PASSWORD || 'ClueCon',
  },

  // Dialer Configuration
  dialer: {
    maxRounds: parseInt(process.env.MAX_ROUNDS) || 1,
    agentRingSeconds: parseInt(process.env.AGENT_RING_SECONDS) || 20,
    leadRingSeconds: parseInt(process.env.LEAD_RING_SECONDS) || 25,
    // Hardcoded dialing prefixes per request
    agentPrefix: 'sofia/gateway/didlogic/',
    leadPrefix: 'sofia/gateway/didlogic/',
    // For reference: DID used for inbound (not used directly in code yet)
    didNumber: '442039960029',
  },

  // SIP trunk details for reference/config (FreeSWITCH gateway should be named 'didlogic')
  siptrunk: {
    gatewayName: 'didlogic',
    ip: 'sip.uk.didlogic.net',
    username: '52762',
    password: 'AU7183GHAh',
    network: {
      externalSipIp: '172.31.46.80',
      externalRtpIp: '172.31.46.80',
    }
  },

  // TikTok OAuth Configuration
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirectUri: process.env.TIKTOK_REDIRECT_URI,
    oauthTokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
  },
};

module.exports = config;
