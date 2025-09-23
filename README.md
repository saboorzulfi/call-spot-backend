# New Backend - Express.js Authentication System

A modern Express.js backend with comprehensive authentication and authorization, converted from Go backend patterns.

## 🚀 Features

- **JWT Authentication** with access and refresh tokens
- **Role-Based Access Control (RBAC)** with granular permissions
- **Account Status Verification** (active, suspended, deleted, expired)
- **Rate Limiting** for security
- **API Key Authentication** for external services
- **Social Media Integration** (TikTok, Facebook, Google)
- **WhatsApp Integration** support
- **AI Agent Management** capabilities
- **Campaign Management** features
- **Comprehensive Error Handling** with structured responses
- **MongoDB Integration** with Mongoose ODM
- **TypeScript** for type safety
- **Security Middleware** (Helmet, CORS, Rate Limiting)

## 🏗️ Architecture

This backend follows the same file and folder structure as the original `roof-backend` but is converted from Go to Express.js:

```
src/
├── config/           # Configuration management
├── models/           # Database models (MongoDB/Mongoose)
├── utils/            # Utility functions
├── v1/               # API version 1
│   ├── controllers/  # Business logic controllers
│   ├── interfaces/   # TypeScript interfaces
│   ├── middlewares/  # Authentication & authorization middleware
│   ├── routes/       # API route definitions
│   ├── shared/       # Shared services (JWT, etc.)
│   └── types/        # Type definitions
├── app.ts            # Express application setup
├── database.ts       # Database connection
└── server.ts         # Server entry point
```

## 🔐 Authentication Flow

### 1. **JWT Middleware Chain**
```
Request → isLoggedIn → roleMiddleware → statusCheckMiddleware → Route Handler
```

- **`isLoggedIn`**: JWT token verification and user context creation
- **`roleMiddleware`**: Role validation and permission assignment
- **`statusCheckMiddleware`**: Account status verification

### 2. **Role Hierarchy**
```typescript
enum UserRole {
  SUPERADMIN = "superadmin",      // Full access
  ADMIN = "admin",                // Administrative access
  SUBADMIN = "subadmin",          // Limited admin access
  OBSERVER = "observer",          // Read-only access
  CUSTOMER_SUPPORT = "customer-support"  // Restricted access
}
```

### 3. **Permission System**
```typescript
interface IRolePermissions {
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_manage_users: boolean;
  can_manage_settings: boolean;
  can_access_analytics: boolean;
  can_manage_campaigns: boolean;
  can_manage_integrations: boolean;
}
```

## 📋 API Endpoints

### **Public Routes** (No Authentication Required)
- `POST /v1/auth/register` - User registration
- `POST /v1/auth/login` - User login
- `POST /v1/auth/forgot-password` - Password recovery
- `POST /v1/auth/verify-otp` - OTP verification
- `POST /v1/auth/reset-password` - Password reset
- `POST /v1/auth/refresh-token` - Token refresh
- `POST /v1/auth/social-login` - Social media login

### **Protected Routes** (Require Authentication)
- `POST /v1/auth/logout` - User logout
- `GET /v1/auth/profile` - Get user profile
- `PUT /v1/auth/profile` - Update user profile
- `PUT /v1/auth/change-password` - Change password
- `POST /v1/auth/generate-api-key` - Generate API key

### **Admin Routes** (Require Admin Access)
- `GET /v1/auth/users` - User management

### **System Routes**
- `GET /health` - Health check
- `GET /` - API information

## 🛠️ Installation

### Prerequisites
- Node.js 18+ 
- MongoDB 5+
- Redis (optional, for production)

### Setup
1. **Clone and install dependencies**
   ```bash
   cd new-backend
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   # Ensure MongoDB is running
   mongod
   ```

4. **Build and Run**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm run build
   npm start
   ```

## ⚙️ Configuration

### Environment Variables
```bash
# Server
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
MONGODB_URI=mongodb://localhost:27017/new_backend

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRY=8h
JWT_REFRESH_EXPIRY=7d

# Authentication
BCRYPT_ROUNDS=8
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=15

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🔒 Security Features

### **Account Status Verification**
- Active account check
- Deleted account check
- Suspended account check
- Expired account check
- Account lockout (5 failed attempts = 15-minute lockout)

### **Rate Limiting**
- Authentication attempts: 5 per 15 minutes
- General API: 100 requests per 15 minutes
- Configurable per route

### **Token Security**
- JWT token validation
- Token expiry warnings
- Refresh token support
- API key authentication
- Social media token authentication

## 📊 Database Models

### **Account Model**
Comprehensive account model matching the Go backend with:
- Core identity fields
- Contact information
- Authentication & role data
- Social media integration
- Business features
- WhatsApp integration
- AI & Agent features
- Settings & preferences
- Subscription details
- API key information

### **Auto-Increment Model**
For generating sequential document numbers.

## 🧪 Testing

### **Test Routes**
Added `/test-auth` routes to verify authentication:
- `GET /test-auth/test` - Basic authentication test
- `GET /test-auth/admin-test` - Admin access test
- `GET /test-auth/superadmin-test` - Super admin access test
- `GET /test-auth/role-test` - Role-based access test

### **Testing Steps**
1. **Register/Login**: Use `/v1/auth/register` or `/v1/auth/login`
2. **Get Token**: Extract JWT token from response headers
3. **Test Authentication**: Use token in `Authorization: Bearer <token>` header
4. **Verify Roles**: Test different role-based routes
5. **Check Permissions**: Verify permission-based access control

## 🚀 Development

### **Scripts**
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run test         # Run tests
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
```

### **Code Structure**
- **Controllers**: Business logic and request handling
- **Middlewares**: Authentication, authorization, and validation
- **Models**: Database schemas and business logic
- **Routes**: API endpoint definitions
- **Services**: Reusable business logic (JWT, etc.)
- **Utils**: Helper functions and utilities

## 🔄 Migration from Go Backend

### **Key Conversions**
1. **JWT Middleware**: `JwtMiddleware` → `jwtMiddleware`
2. **Role Middleware**: `RoleMiddleware` → `roleMiddleware`
3. **Status Check**: `StatusCheckMiddleware` → `statusCheckMiddleware`
4. **Error Handling**: Go errors → Express error middleware
5. **Response Format**: Go structs → Express JSON responses

### **Maintained Patterns**
- Same middleware chain order
- Same role hierarchy and permissions
- Same account status verification logic
- Same JWT claims structure
- Same response headers and format

## 📈 Monitoring & Health

### **Health Check**
- Database connectivity
- Service status
- Environment information
- Version details

### **Logging**
- Request logging with timestamps
- Error logging with stack traces
- Authentication success/failure logging
- Rate limiting notifications

## 🚨 Error Handling

### **Structured Error Responses**
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": "Additional information"
  },
  "status_code": 400
}
```

### **Error Types**
- Validation errors
- Authentication errors
- Authorization errors
- Database errors
- JWT errors
- Rate limiting errors

## 🔮 Future Enhancements

- [ ] Redis integration for caching
- [ ] Email service implementation
- [ ] File upload service
- [ ] WebSocket support for real-time features
- [ ] Advanced analytics and monitoring
- [ ] Multi-tenant support
- [ ] API documentation with Swagger
- [ ] Docker containerization
- [ ] CI/CD pipeline setup

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For questions and support, please contact the development team.

---

**Built with ❤️ using Express.js, TypeScript, and MongoDB**
