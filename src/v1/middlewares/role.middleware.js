const AppError = require("../../utils/app_error.util");

// Role permissions mapping
const ROLE_PERMISSIONS = {
  superadmin: {
    can_create: true,
    can_read: true,
    can_update: true,
    can_delete: true,
    can_manage_users: true,
    can_manage_settings: true,
    can_access_analytics: true,
    can_manage_campaigns: true,
    can_manage_integrations: true,
    can_manage_agent_groups: true,
  },
  admin: {
    can_create: true,
    can_read: true,
    can_update: true,
    can_delete: false,
    can_manage_users: true,
    can_manage_settings: true,
    can_access_analytics: true,
    can_manage_campaigns: true,
    can_manage_integrations: true,
    can_manage_agent_groups: true,
  },
  subadmin: {
    can_create: true,
    can_read: true,
    can_update: true,
    can_delete: false,
    can_manage_users: false,
    can_manage_settings: false,
    can_access_analytics: true,
    can_manage_campaigns: true,
    can_manage_integrations: false,
    can_manage_agent_groups: true,
  },
  observer: {
    can_create: false,
    can_read: true,
    can_update: false,
    can_delete: false,
    can_manage_users: false,
    can_manage_settings: false,
    can_access_analytics: true,
    can_manage_campaigns: false,
    can_manage_integrations: false,
    can_manage_agent_groups: false,
  },
  "customer-support": {
    can_create: false,
    can_read: true,
    can_update: false,
    can_delete: false,
    can_manage_users: false,
    can_manage_settings: false,
    can_access_analytics: false,
    can_manage_campaigns: false,
    can_manage_integrations: false,
    can_manage_agent_groups: false,
  },
};

// Role middleware - attaches role permissions to request
const roleMiddleware = (req, res, next) => {
  try {
    if (!req.user || !req.user.role) {
      throw new AppError("User role not found", 401);
    }

    const userRole = req.user.role.toLowerCase();
    const permissions = ROLE_PERMISSIONS[userRole];

    if (!permissions) {
      throw new AppError("Invalid user role", 403);
    }

    req.userPermissions = permissions;
    req.userRole = userRole;
    next();
  } catch (error) {
    next(error);
  }
};

// Require specific role(s)
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        throw new AppError("User role not found", 401);
      }

      const userRole = req.user.role.toLowerCase();
      if (!allowedRoles.includes(userRole)) {
        throw new AppError("Insufficient role permissions", 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Require super admin role
const requireSuperAdmin = (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "superadmin") {
      throw new AppError("Super admin access required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require admin or super admin role
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
      throw new AppError("Admin access required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require specific permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    try {
      if (!req.userPermissions || !req.userPermissions[permission]) {
        throw new AppError("Insufficient permissions", 403);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Require read permission
const requireReadPermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_read) {
      throw new AppError("Read permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require write permission
const requireWritePermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_update) {
      throw new AppError("Write permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require user management permission
const requireUserManagementPermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_manage_users) {
      throw new AppError("User management permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require settings permission
const requireSettingsPermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_manage_settings) {
      throw new AppError("Settings permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require analytics permission
const requireAnalyticsPermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_access_analytics) {
      throw new AppError("Analytics permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require campaign permission
const requireCampaignPermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_manage_campaigns) {
      throw new AppError("Campaign management permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require integration permission
const requireIntegrationPermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_manage_integrations) {
      throw new AppError("Integration permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require agent group management permission
const requireAgentGroupManagementPermission = (req, res, next) => {
  try {
    if (!req.userPermissions || !req.userPermissions.can_manage_agent_groups) {
      throw new AppError("Agent group management permission required", 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  roleMiddleware,
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requirePermission,
  requireReadPermission,
  requireWritePermission,
  requireUserManagementPermission,
  requireSettingsPermission,
  requireAnalyticsPermission,
  requireCampaignPermission,
  requireIntegrationPermission,
  requireAgentGroupManagementPermission,
};
