const jwt = require("jsonwebtoken");
const config = require("../../../../config/config");
const AppError = require("../../../../utils/app_error.util");

class JWTService {
  constructor() {
    this.secret = config.jwt.secret;
    this.issuer = config.jwt.issuer;
    this.audience = config.jwt.audience;
  }

  // Generate access token (matching Go backend)
  generateAccessToken(payload) {
    try {
      console.log("🔑 Payload:", payload,this.secret, config.jwt.expiry);
      const token = jwt.sign(payload, this.secret, {
        expiresIn: config.jwt.expiry,
      });
      return token;
    } catch (error) {
      throw new AppError("Failed to generate access token", 500);
    }
  }

  // Generate refresh token
  generateRefreshToken(payload) {
    try {
      const token = jwt.sign(payload, this.secret, {
        expiresIn: config.jwt.refreshExpiry,
        issuer: this.issuer,
        audience: this.audience,
        algorithm: "HS256",
      });
      return token;
    } catch (error) {
      throw new AppError("Failed to generate refresh token", 500);
    }
  }

  // Generate API key token
  generateApiKeyToken(payload) {
    try {
      const token = jwt.sign(payload, this.secret, {
        expiresIn: config.jwt.apiKeyExpiry,
        issuer: this.issuer,
        audience: this.audience,
        algorithm: "HS256",
      });
      return token;
    } catch (error) {
      throw new AppError("Failed to generate API key token", 500);
    }
  }

  // Generate social media token
  generateSocialToken(payload) {
    try {
      const token = jwt.sign(payload, this.secret, {
        expiresIn: config.jwt.socialExpiry,
        issuer: this.issuer,
        audience: this.audience,
        algorithm: "HS256",
      });
      return token;
    } catch (error) {
      throw new AppError("Failed to generate social token", 500);
    }
  }

  // Verify token
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["HS256"],
      });
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError("Token has expired", 401, "TOKEN_EXPIRED");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError("Invalid token", 401, "INVALID_TOKEN");
      } else if (error instanceof jwt.NotBeforeError) {
        throw new AppError("Token not active yet", 401, "TOKEN_NOT_ACTIVE");
      } else {
        throw new AppError("Token verification failed", 401, "TOKEN_VERIFICATION_FAILED");
      }
    }
  }

  // Decode token without verification (for debugging)
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      throw new AppError("Failed to decode token", 400);
    }
  }

  // Check if token is expired
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  // Get token expiry time
  getTokenExpiryTime(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return null;
      }
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  // Check if token expires soon (within 5 minutes)
  isTokenExpiringSoon(token, minutes = 5) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return false;
      }
      const expiryTime = decoded.exp * 1000;
      const fiveMinutesFromNow = Date.now() + (minutes * 60 * 1000);
      return expiryTime <= fiveMinutesFromNow;
    } catch (error) {
      return false;
    }
  }

  // Generate token with custom expiry
  generateTokenWithExpiry(payload, expiry) {
    try {
      const token = jwt.sign(payload, this.secret, {
        expiresIn: expiry,
        issuer: this.issuer,
        audience: this.audience,
        algorithm: "HS256",
      });
      return token;
    } catch (error) {
      throw new AppError("Failed to generate token with custom expiry", 500);
    }
  }

  // Refresh access token using refresh token
  refreshAccessToken(refreshToken) {
    try {
      const decoded = this.verifyToken(refreshToken);
      
      // Generate new access token with same payload
      const newAccessToken = this.generateAccessToken({
        account_id: decoded.account_id,
        role: decoded.role,
        name: decoded.name,
        email: decoded.email,
      });
      
      return newAccessToken;
    } catch (error) {
      throw new AppError("Failed to refresh access token", 401);
    }
  }

  // Validate token structure
  validateTokenStructure(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded !== null && typeof decoded === "object";
    } catch (error) {
      return false;
    }
  }

  // Get token payload without verification
  getTokenPayload(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }

  // Check if token format is valid
  isValidTokenFormat(token) {
    if (!token || typeof token !== "string") {
      return false;
    }
    
    // Check if token has 3 parts separated by dots
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }
    
    // Check if parts are valid base64
    try {
      parts.forEach(part => {
        if (part) {
          Buffer.from(part, "base64");
        }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  // Generate auth token for account (main method)
  generateAuthToken(account) {
    const payload = {
      account_id: account._id?.toString() || "",
      role: account.role || "admin",
      name: account.full_name || account.fullName || "",
      email: account.work_email || account.email || "",
    };

    return this.generateAccessToken(payload);
  }

  // Generate complete auth response
  generateAuthResponse(account) {
    const payload = {
      account_id: account._id?.toString() || "",
      role: account.role || "admin",
      name: account.full_name || account.fullName || "",
      email: account.work_email || account.email || "",
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: this.getExpiryInSeconds(config.jwt.expiry),
      token_type: "Bearer",
    };
  }

  // Helper method to get expiry in seconds
  getExpiryInSeconds(expiry) {
    const units = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (match && match[1] && match[2]) {
      const value = parseInt(match[1]);
      const unit = match[2];
      return value * units[unit];
    }

    // Default to 8 hours if parsing fails
    return 8 * 3600;
  }
}

module.exports = JWTService;
