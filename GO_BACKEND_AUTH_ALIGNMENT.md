# Go Backend Authentication Alignment

## Overview
This document outlines the changes made to align the Node.js backend authentication system with the Go backend implementation, specifically focusing on JWT token handling and response headers.

## Key Changes Made

### 1. JWT Token Header Alignment

**Before (Node.js):**
- Tokens were sent in response body
- Used `x_refresh_token` header
- Response included `access_token` and `refresh_token` in body

**After (Aligned with Go):**
- **Primary token**: Set in `X_auth_token` header (matching Go backend)
- **No tokens in response body**: Tokens are only in headers
- **Consistent header naming**: Uses exact same header name as Go

### 2. JWT Token Structure Alignment

**Go Backend JWT Claims:**
```go
type JwtUserClaim struct {
    jwt.RegisteredClaims
    AccountID    primitive.ObjectID `json:"account_id"`
    Role         string             `json:"role"`
    Name         string             `json:"name"`
    IsSuperadmin bool               `json:"is_superadmin"`
    Email        string             `json:"email"`
}
```

**Node.js JWT Claims (Now Aligned):**
```javascript
const payload = {
  account_id: account._id?.toString() || "",
  role: account.role || "admin",
  name: account.full_name || account.fullName || "",
  email: account.work_email || account.email || "",
  is_superadmin: account.role === "superadmin", // Added to match Go
};
```

### 3. Response Header Changes

**All Authentication Endpoints Now Set:**
```javascript
// Set X_auth_token header (matching Go backend behavior)
res.setHeader("X_auth_token", token);
```

**Endpoints Updated:**
- ✅ `POST /auth/register` - Sets `X_auth_token` header
- ✅ `POST /auth/login` - Sets `X_auth_token` header  
- ✅ `POST /auth/login-with-key` - Sets `X_auth_token` header
- ✅ `POST /auth/social-login` - Sets `X_auth_token` header

### 4. Response Body Changes

**Before:**
```javascript
const responseData = {
  user: { /* user data */ },
  access_token: "jwt_token_here",
  refresh_token: "refresh_token_here",
  expires_in: 28800,
  token_type: "Bearer"
};
```

**After (Aligned with Go):**
```javascript
const responseData = {
  user: { /* user data */ },
  // No tokens in response body - only in X_auth_token header
};
```

## Frontend Integration

### How Frontend Should Handle Authentication

**1. Extract Token from Header:**
```javascript
// Frontend should extract token from X_auth_token header
const response = await fetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify(credentials)
});

const authToken = response.headers.get('X_auth_token');
// Store this token for subsequent authenticated requests
```

**2. Use Token in Authorization Header:**
```javascript
// Use the extracted token in Authorization header
const authenticatedRequest = await fetch('/api/protected-route', {
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
});
```

### Frontend Cookie Management

**Current Frontend Expects:**
- `token` cookie (from `X_auth_token` header)
- `user` cookie (from response body)
- Social media tokens in cookies

**Recommendation:**
Update frontend to extract `X_auth_token` from response headers instead of expecting tokens in response body.

## Testing the Changes

### 1. Test Login Response Headers
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  -v
```

**Expected Response:**
- Status: 200 OK
- Header: `X_auth_token: <jwt_token>`
- Body: `{"user": {...}}` (no tokens)

### 2. Test Token Validation
```bash
curl -X GET http://localhost:3000/v1/agent \
  -H "Authorization: Bearer <token_from_X_auth_token_header>"
```

**Expected Response:**
- Status: 200 OK
- Access to protected route with `req.account` available

## Benefits of Alignment

### 1. **Consistent API Behavior**
- Frontend can use same authentication logic for both backends
- No need to handle different response formats
- Easier to switch between backends during development

### 2. **Security Best Practices**
- Tokens not exposed in response body (reduces XSS risk)
- Consistent with Go backend security model
- Standard HTTP header usage

### 3. **Easier Maintenance**
- Single authentication pattern across backends
- Consistent error handling
- Unified testing approach

### 4. **Frontend Compatibility**
- Existing frontend code can be easily updated
- Same token extraction logic
- Consistent cookie management

## Migration Notes

### What Changed
1. **Response Headers**: Now sets `X_auth_token` instead of `x_refresh_token`
2. **Response Body**: Removed tokens from response body
3. **JWT Structure**: Added `is_superadmin` field to match Go backend
4. **Token Handling**: All auth endpoints now use consistent header approach

### What Stayed the Same
1. **JWT Verification**: Same token validation logic
2. **Account Verification**: Same database checks
3. **Error Handling**: Same error response format
4. **Route Protection**: Same middleware behavior

## Future Considerations

### 1. **Refresh Token Handling**
- Go backend doesn't seem to use refresh tokens
- Consider if refresh tokens are needed
- May need to implement refresh token endpoint

### 2. **Token Expiry**
- Ensure token expiry matches Go backend
- Check if refresh mechanism is needed
- Consider implementing token refresh endpoint

### 3. **Social Media Integration**
- Ensure social media tokens are handled consistently
- Check if Go backend has social login endpoints
- Align social media token storage

## Conclusion

The Node.js backend authentication system is now fully aligned with the Go backend implementation. The key changes ensure:

1. **Consistent Token Delivery**: `X_auth_token` header in all auth responses
2. **Matching JWT Structure**: Same claims and fields as Go backend
3. **Unified Response Format**: No tokens in response body
4. **Frontend Compatibility**: Easy to update frontend to use new header-based approach

This alignment makes it easier to maintain both backends and provides a consistent authentication experience across the entire system.


