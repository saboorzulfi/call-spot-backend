# Centralized Authentication System

## Overview
The authentication system has been centralized to use a single `isLoggedIn` middleware that automatically verifies JWT tokens and fetches account data for all protected routes. All middleware functions use `tryCatchAsync` for consistent error handling.

## How It Works

### 1. Centralized Authentication in v1.routes.js
```javascript
// Apply authentication middleware to all protected routes
// This ensures req.account is available in all controllers
router.use(isLoggedIn);

// All routes below this line are automatically protected
router.use("/agent", agentRoutes);
router.use("/agent-group", agentGroupRoutes);
router.use("/campaign", campaignRoutes);
```

### 2. Single Authentication Middleware
The `isLoggedIn` middleware in `auth.middleware.js` does everything in one step:
- ✅ Extracts JWT token from Authorization header
- ✅ Verifies JWT token validity
- ✅ Fetches account data from database
- ✅ Checks if account is active and not deleted
- ✅ Attaches `req.account` and `req.user` to request object
- ✅ Uses `tryCatchAsync` for consistent error handling

### 3. Automatic Account Data in Controllers
All controllers automatically have access to:
```javascript
// req.account - Full account object from database
req.account._id          // Account ID
req.account.full_name    // Account name
req.account.email        // Account email
req.account.role         // Account role
req.account.active       // Account status

// req.user - Decoded JWT payload
req.user.account_id      // Account ID from token
req.user.role            // Role from token
req.user.name            // Name from token
```

## Route Structure

### Before (Complex)
```javascript
// Each route file had its own authentication
router.use(jwtMiddleware, authenticateUser, statusCheckMiddleware);
```

### After (Simple)
```javascript
// Authentication handled centrally in v1.routes.js
// Individual route files just define endpoints
router.get("/", controller.getAll);
router.post("/", controller.create);
```

## Error Handling with tryCatchAsync

### Consistent Error Handling
All authentication middleware functions use `tryCatchAsync` for consistent error handling:

```javascript
// Before: Manual try-catch blocks
const isLoggedIn = async (req, res, next) => {
  try {
    // authentication logic
  } catch (error) {
    next(error);
  }
};

// After: Clean with tryCatchAsync
const isLoggedIn = tryCatchAsync(async (req, res, next) => {
  // authentication logic
  // errors are automatically caught and passed to next()
});
```

### Benefits of tryCatchAsync
1. **Cleaner Code**: No repetitive try-catch blocks
2. **Consistent Error Handling**: All errors follow the same pattern
3. **Automatic Error Propagation**: Errors automatically passed to Express error handler
4. **Better Maintainability**: Easier to read and modify

## Example Controller Usage

### Campaign Controller
```javascript
class CampaignController {
  // Create new campaign
  create = tryCatchAsync(async (req, res, next) => {
    // req.account is automatically available
    const accountId = req.account._id;
    
    const campaignData = {
      ...req.body,
      account_id: accountId  // Use account ID from authenticated user
    };

    // Create campaign logic...
  });

  // Get campaigns for account
  getAll = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;  // Always available
    
    // Fetch campaigns for this specific account
    const result = await this.campaignRepo.findByAccount(accountId, options);
    
    return AppResponse.success(res, result, "Success");
  });
}
```

### Agent Controller
```javascript
class AgentController {
  create = tryCatchAsync(async (req, res, next) => {
    // req.account automatically available
    const accountId = req.account._id;
    
    // Create agent for this account...
  });
}
```

## Benefits

### 1. **Centralized Control**
- All authentication logic in one place
- Easy to modify authentication behavior
- Consistent across all routes

### 2. **Automatic Account Data**
- No need to manually fetch account in each controller
- `req.account` is always available
- Consistent account data structure

### 3. **Simplified Route Files**
- Route files focus only on endpoint definitions
- No authentication middleware imports needed
- Cleaner, more maintainable code

### 4. **Better Performance**
- Single database query per request
- No duplicate authentication checks
- Efficient middleware chain

### 5. **Easier Testing**
- Mock `req.account` in tests
- No need to mock multiple middleware functions
- Simpler test setup

### 6. **Consistent Error Handling**
- All middleware uses `tryCatchAsync`
- Uniform error response format
- Better debugging experience

## Security Features

### 1. **JWT Verification**
- Validates token signature
- Checks token expiration
- Verifies token payload structure

### 2. **Account Validation**
- Ensures account exists in database
- Checks account is active
- Verifies account is not deleted

### 3. **Automatic Access Control**
- All routes automatically protected
- Account isolation (users can only access their own data)
- No accidental public endpoints

## Usage Examples

### Creating New Routes
```javascript
// 1. Add route to v1.routes.js
router.use("/new-feature", newFeatureRoutes);

// 2. Create route file (no authentication needed)
const router = express.Router();
router.get("/", controller.getAll);
router.post("/", controller.create);

// 3. Controller automatically has req.account
class NewFeatureController {
  getAll = tryCatchAsync(async (req, res, next) => {
    const accountId = req.account._id;  // Always available
    // Your logic here...
  });
}
```

### Accessing Account Data
```javascript
// Basic account info
const accountId = req.account._id;
const accountName = req.account.full_name;
const accountEmail = req.account.email;

// Account status
const isActive = req.account.active;
const isDeleted = req.account.isDelete;

// Account metadata
const createdAt = req.account.created_at;
const lastLogin = req.account.last_login;
```

## Error Handling

### Authentication Errors
- **No Token**: 401 "No token provided"
- **Invalid Token**: 401 "Invalid token"
- **Expired Token**: 401 "Token expired"
- **Account Not Found**: 401 "User account not found"
- **Inactive Account**: 401 "Account is inactive or deleted"

### Automatic Error Responses
All authentication errors are automatically handled and return proper HTTP status codes and error messages.

## Testing

### Mock req.account in Tests
```javascript
// In your test files
const mockReq = {
  account: {
    _id: "mock-account-id",
    full_name: "Test User",
    email: "test@example.com",
    active: true
  },
  user: {
    account_id: "mock-account-id",
    role: "admin"
  }
};

// Test your controller methods
const result = await controller.create(mockReq, mockRes, mockNext);
```

## Migration Notes

### What Changed
1. **Route Files**: Removed individual authentication middleware
2. **v1.routes.js**: Added centralized `isLoggedIn` middleware
3. **Controllers**: Now automatically have `req.account` available
4. **Middleware**: Simplified to single authentication function
5. **Error Handling**: All middleware now uses `tryCatchAsync`

### What Stayed the Same
1. **JWT Token Format**: No changes to token structure
2. **Account Model**: Database schema unchanged
3. **Error Handling**: Same error responses
4. **Security**: Same level of protection

## Future Enhancements

### Easy to Add
1. **Role-Based Access**: Add role checks in `isLoggedIn` middleware
2. **Rate Limiting**: Add rate limiting to authentication
3. **Audit Logging**: Log authentication attempts
4. **Multi-Factor Auth**: Extend authentication logic
5. **Session Management**: Add session validation

The system is designed to be easily extensible while maintaining the simplicity of centralized authentication and consistent error handling with `tryCatchAsync`.
