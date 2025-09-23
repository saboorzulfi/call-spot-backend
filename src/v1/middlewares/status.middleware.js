const AppError = require("../../utils/app_error.util");

// Status check middleware - verifies account status
const statusCheckMiddleware = (req, res, next) => {
  try {
    if (!req.account) {
      throw new AppError("Account not found", 401);
    }

    // Check if account is active
    if (!req.account.active) {
      throw new AppError("Account is inactive", 403);
    }

    // Check if account is deleted
    if (req.account.isDelete) {
      throw new AppError("Account is deleted", 403);
    }

    // Check current status
    if (req.account.currentStatus === "inactive" || req.account.currentStatus === "suspended") {
      throw new AppError("Account is suspended or inactive", 403);
    }

    // Check expiry date
    if (req.account.expiryDate && new Date() > req.account.expiryDate) {
      throw new AppError("Account has expired", 403);
    }

    // Check number of attempts (for lockout)
    if (req.account.numberOfAttempts >= 5) {
      const lockoutTime = 15 * 60 * 1000; // 15 minutes
      const lastAttempt = req.account.updated_at;
      
      if (Date.now() - lastAttempt < lockoutTime) {
        throw new AppError("Account is temporarily locked due to too many failed attempts", 423);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Require active account
const requireActiveAccount = (req, res, next) => {
  try {
    if (!req.account || !req.account.active) {
      throw new AppError("Active account required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require feature enabled
const requireFeatureEnabled = (featureName) => {
  return (req, res, next) => {
    try {
      if (!req.account || !req.account.active) {
        throw new AppError("Active account required", 403);
      }

      // Check if specific feature is enabled for the account
      // This can be extended based on your feature flag system
      const featureEnabled = req.account[`${featureName}_enabled`];
      
      if (featureEnabled === false) {
        throw new AppError(`Feature ${featureName} is not enabled for this account`, 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Require valid subscription
const requireValidSubscription = (req, res, next) => {
  try {
    if (!req.account) {
      throw new AppError("Account not found", 401);
    }

    // Check subscription dates
    if (req.account.subscription_end_date) {
      const endDate = new Date(req.account.subscription_end_date);
      if (Date.now() > endDate) {
        throw new AppError("Subscription has expired", 403);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Require valid API key
const requireValidApiKey = (req, res, next) => {
  try {
    if (!req.account || !req.account.api_key_info || !req.account.api_key_info.key) {
      throw new AppError("Valid API key required", 403);
    }

    // Check if API key is expired
    if (req.account.api_key_info.expires_at && new Date() > req.account.api_key_info.expires_at) {
      throw new AppError("API key has expired", 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Require within limits
const requireWithinLimits = (limitType) => {
  return (req, res, next) => {
    try {
      if (!req.account) {
        throw new AppError("Account not found", 401);
      }

      // Check various limits based on limitType
      // This can be extended based on your limit system
      switch (limitType) {
        case "api_calls":
          // Check API call limits
          break;
        case "storage":
          // Check storage limits
          break;
        case "users":
          // Check user limits
          break;
        default:
          // Unknown limit type
          break;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Require healthy account
const requireHealthyAccount = (req, res, next) => {
  try {
    if (!req.account) {
      throw new AppError("Account not found", 401);
    }

    // Check account health indicators
    const isHealthy = req.account.active && 
                     !req.account.isDelete && 
                     req.account.currentStatus === "active";

    if (!isHealthy) {
      throw new AppError("Account is not in a healthy state", 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  statusCheckMiddleware,
  requireActiveAccount,
  requireFeatureEnabled,
  requireValidSubscription,
  requireValidApiKey,
  requireWithinLimits,
  requireHealthyAccount,
};
