# Simplified Authentication System

## Overview
The authentication system has been simplified to remove complex role-based permissions and focus on simple account-based authentication.

## What Changed

### 1. Removed Role-Based Middleware
- **Before**: Routes used `roleMiddleware`, `requireAdmin`, `requireCampaignPermission`, etc.
- **After**: Routes only use `jwtMiddleware` and `authenticateUser` for authentication

### 2. Simplified Route Protection
- **Before**: 
  ```javascript
  router.use(jwtMiddleware, roleMiddleware, authenticateUser, statusCheckMiddleware);
  router.post("/", requireAdmin, controller.create);
  ```
- **After**:
  ```javascript
  router.use(jwtMiddleware, authenticateUser, statusCheckMiddleware);
  router.post("/", controller.create);
  ```

### 3. Updated Authentication Flow
- **Before**: JWT → Role Check → Account Verification → Status Check
- **After**: JWT → Account Verification → Status Check

## Current Authentication Flow

### 1. JWT Middleware (`jwtMiddleware`)
- Extracts JWT token from Authorization header
- Verifies token validity
- Attaches decoded user info to `req.user`

### 2. Account Verification (`authenticateUser`)
- Checks if user exists in database
- Verifies account is active and not deleted
- Attaches account object to `req.account`

### 3. Status Check (`statusCheckMiddleware`)
- Verifies account status and permissions
- Ensures account can access the system

## Route Examples

### Campaign Routes
```javascript
// All routes are protected with simple authentication
router.use(jwtMiddleware, authenticateUser, statusCheckMiddleware);

// No role checks needed - all authenticated users can access
router.get("/", campaignController.getAll);
router.post("/", campaignController.create);
router.put("/:id", campaignController.update);
router.delete("/:id", campaignController.delete);
```

### Agent Routes
```javascript
// Simple authentication for all routes
router.use(jwtMiddleware, authenticateUser, statusCheckMiddleware);

// All authenticated users can manage agents
router.post("/", agentController.create);
router.get("/", agentController.getAll);
router.put("/:id", agentController.update);
```

## Benefits of Simplification

1. **Easier to Maintain**: No complex permission logic to manage
2. **Faster Development**: No need to configure roles for new features
3. **Simpler Testing**: Authentication is straightforward
4. **Better Performance**: Fewer middleware checks per request
5. **Easier Debugging**: Clear authentication flow

## Backward Compatibility

- The `role` field is still present in the Account model (defaults to "admin")
- JWT tokens still include role information
- Existing accounts continue to work without changes
- Role field can be used for display purposes if needed

## Security Considerations

- All routes still require valid JWT authentication
- Account status is still verified (active, not deleted)
- Rate limiting and other security measures remain in place
- API key authentication still works for external integrations

## Future Enhancements

If you need to add role-based permissions later, you can:
1. Re-enable the role middleware
2. Add permission checks to specific routes
3. Implement granular permissions based on business requirements

## Files Modified

- `src/v1/routes/campaign.routes.js` - Removed role middleware
- `src/v1/routes/agent.routes.js` - Removed role middleware  
- `src/v1/routes/agentGroup.routes.js` - Removed role middleware
- `src/v1/routes/v1.routes.js` - Updated comments
- `src/v1/controllers/auth.controller.js` - Simplified role logic
- `src/v1/shared/services/jwt/jwt.service.js` - Removed superadmin logic

## Testing the Changes

1. **Login**: Should work with existing accounts
2. **Protected Routes**: Should work for all authenticated users
3. **No Role Errors**: Routes should not require specific roles
4. **Account Verification**: Still ensures valid, active accounts
