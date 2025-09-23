const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../../config/config");
const AppError = require("../../utils/app_error.util");
const AppResponse = require("../../utils/response.util");
const Account = require("../../models/account.model");
const JWTService = require("../shared/services/jwt/jwt.service");
const tryCatchAsync = require("../../utils/try_catch.util");
const statusCode = require("../../utils/status_code.util");

class AuthController {
    constructor() {
        this.jwtService = new JWTService();
    }

    // Register new user
    register = tryCatchAsync(async (req, res, next) => {
        const { full_name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await Account.findOne({
            $or: [{ email }, { work_email: email }],
            isDelete: false,
        });

        if (existingUser) {
            throw new AppError("User with this email already exists", 409);
        }

        // Create new account with default role
        const account = new Account({
            full_name,
            work_email: email,
            email,
            password,
            role: "admin", // Default role for all users
        });

        await account.save();

        // Generate JWT token
        const token = this.jwtService.generateAuthToken(account);

        // Set X_auth_token header (matching Go backend behavior)
        res.setHeader("X_auth_token", token);

        const responseData = {
            user: {
                id: account._id,
                full_name: account.full_name,
                email: account.work_email,
                role: account.role,
            },
            // Don't include token in response body since it's in header
        };

        return AppResponse.success(res, responseData, "User registered successfully", statusCode.CREATED);
    });

    // Login user
    login = tryCatchAsync(async (req, res, next) => {
        const { email, password } = req.body;

        // Find user by email
        const user = await Account.findOne({
            $or: [{ email }, { work_email: email }],
            isDelete: false,
            active: true,
        });

        if (!user) {
            throw new AppError("Invalid credentials", 401);
        }

        // Check password
        const isPasswordValid = await user.isPasswordCorrect(password, user.password);
        if (!isPasswordValid) {
            throw new AppError("Invalid credentials", 401);
        }

        // Check if account is locked
        if (user.numberOfAttempts >= 5) {
            const lockoutTime = 15 * 60 * 1000; // 15 minutes
            const lastAttempt = user.updated_at;

            if (Date.now() - lastAttempt < lockoutTime) 
                throw new AppError("Account is temporarily locked due to too many failed attempts", 423);
            

            user.numberOfAttempts = 0;
        }

        const authResponse = this.jwtService.generateAuthResponse(user);


        user.last_login = new Date();
        user.numberOfAttempts = 0;
        await user.save();

        res.setHeader("X_auth_token", authResponse.access_token);
        
        const responseData = {
            user: {
                ...authResponse,
                id: user._id,
                full_name: user.full_name,
                email: user.work_email,
                role: user.role,
            },
        };

        return AppResponse.success(res, responseData, "Login successful", statusCode.OK);
    });

    loginWithKey = tryCatchAsync(async (req, res, next) => {
        const { api_key } = req.body;

        if (!api_key) {
            throw new AppError("API key is required", 400);
        }

        // Find user by API key
        const user = await Account.findOne({
            "api_key_info.key": api_key,
            isDelete: false,
            active: true,
        });

        if (!user) {
            throw new AppError("Invalid API key", 401);
        }

        // Check if API key is expired
        if (user.api_key_info.expires_at && new Date() > user.api_key_info.expires_at) {
            throw new AppError("API key has expired", 401);
        }

        // Generate JWT token
        const token = this.jwtService.generateAuthToken(user);

        // Update last login
        user.last_login = new Date();
        await user.save();

        // Set X_auth_token header (matching Go backend behavior)
        res.setHeader("X_auth_token", token);

        const responseData = {
            user: {
                id: user._id,
                full_name: user.full_name,
                email: user.work_email,
                role: user.role,
            },
            // Don't include token in response body since it's in header
        };

        return AppResponse.success(res, responseData, "Login with API key successful", statusCode.OK);
    });

    // Forgot password
    forgotPassword = tryCatchAsync(async (req, res, next) => {
        const { email } = req.body;

        // Find user by email
        const user = await Account.findOne({
            $or: [{ email }, { work_email: email }],
            isDelete: false,
            active: true,
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save OTP to user account
        user.otpCode = otpCode;
        user.otpExpiry = otpExpiry;
        user.otpVerified = false;
        await user.save();

        // TODO: Send OTP via email
        // EmailService.forgotPassword(user, otpCode);

        const responseData = {
            email: user.work_email || user.email,
            expires_in: 10 * 60, // 10 minutes in seconds
        };

        return AppResponse.success(res, responseData, "OTP sent to your email", statusCode.OK);
    });

    // Verify OTP
    verifyOtp = tryCatchAsync(async (req, res, next) => {
        const { email, otp_code } = req.body;

        // Find user by email
        const user = await Account.findOne({
            $or: [{ email }, { work_email: email }],
            isDelete: false,
            active: true,
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Check if OTP exists and is not expired
        if (!user.otpCode || !user.otpExpiry || user.otpVerified) {
            throw new AppError("Invalid or expired OTP", 400);
        }

        if (Date.now() > user.otpExpiry) {
            throw new AppError("OTP has expired", 400);
        }

        // Check OTP code
        if (user.otpCode !== parseInt(otp_code)) {
            // Increment failed attempts
            user.numberOfAttempts = (user.numberOfAttempts || 0) + 1;

            // Lock account after 5 failed attempts
            if (user.numberOfAttempts >= 5) {
                user.active = false;
                await user.save();
                throw new AppError("Account locked due to too many failed OTP attempts", 423);
            }

            await user.save();
            throw new AppError("Invalid OTP code", 400);
        }

        // Mark OTP as verified
        user.otpVerified = true;
        user.numberOfAttempts = 0;
        await user.save();

        const responseData = {
            email: user.work_email || user.email,
            otp_verified: true,
        };

        return AppResponse.success(res, responseData, "OTP verified successfully", statusCode.OK);
    });

    // Reset password
    resetPassword = tryCatchAsync(async (req, res, next) => {
        const { email, new_password } = req.body;

        // Find user by email
        const user = await Account.findOne({
            $or: [{ email }, { work_email: email }],
            isDelete: false,
            active: true,
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Check if OTP was verified
        if (!user.otpVerified) {
            throw new AppError("OTP must be verified before resetting password", 400);
        }

        // Update password
        user.password = new_password;
        user.otpCode = null;
        user.otpExpiry = null;
        user.otpVerified = false;
        user.numberOfAttempts = 0;
        await user.save();

        return AppResponse.success(res, {}, "Password reset successfully", statusCode.OK);
    });

    // Refresh token
    refreshToken = tryCatchAsync(async (req, res, next) => {
        const refreshToken = req.headers["x_refresh_token"] || req.body.refresh_token;

        if (!refreshToken) {
            throw new AppError("Refresh token is required", 400);
        }

        // Generate new access token
        const newAccessToken = this.jwtService.refreshAccessToken(refreshToken);

        const responseData = {
            access_token: newAccessToken,
        };

        return AppResponse.success(res, responseData, "Token refreshed successfully", statusCode.OK);
    });

    // Logout
    logout = tryCatchAsync(async (req, res, next) => {
        // In a stateless JWT system, logout is handled client-side
        // You can implement token blacklisting here if needed

        return AppResponse.success(res, {}, "Logged out successfully", statusCode.OK);
    });

    // Get user profile
    getProfile = tryCatchAsync(async (req, res, next) => {
        const user = req.account;

        const responseData = {
            user: {
                id: user._id,
                full_name: user.full_name,
                email: user.work_email || user.email,
                role: user.role,
                profile_image: user.profile_image_path || user.profileImage,
                created_at: user.created_at,
                last_login: user.last_login,
            },
        };

        return AppResponse.success(res, responseData, "Profile retrieved successfully", statusCode.OK);
    });

    // Update user profile
    updateProfile = tryCatchAsync(async (req, res, next) => {
        const user = req.account;
        const { full_name, profile_image_path } = req.body;

        // Update fields
        if (full_name) {
            user.full_name = full_name;
        }

        if (profile_image_path) {
            user.profile_image_path = profile_image_path;
            user.profileImage = profile_image_path;
        }

        await user.save();

        const responseData = {
            user: {
                id: user._id,
                full_name: user.full_name,
                email: user.work_email || user.email,
                role: user.role,
                profile_image: user.profile_image_path || user.profileImage,
            },
        };

        return AppResponse.success(res, responseData, "Profile updated successfully", statusCode.OK);
    });

    // Change password
    changePassword = tryCatchAsync(async (req, res, next) => {
        const user = req.account;
        const { current_password, new_password } = req.body;

        // Verify current password
        const isCurrentPasswordValid = await user.isPasswordCorrect(current_password, user.password);
        if (!isCurrentPasswordValid) {
            throw new AppError("Current password is incorrect", 400);
        }

        // Update password
        user.password = new_password;
        await user.save();

        return AppResponse.success(res, {}, "Password changed successfully", statusCode.OK);
    });

    // Generate API key
    generateApiKey = tryCatchAsync(async (req, res, next) => {
        const user = req.account;
        const { permissions = [], expires_in = "30d" } = req.body;

        // Generate API key
        const apiKey = this.jwtService.generateApiKeyToken({
            account_id: user._id.toString(),
            role: user.role,
            name: user.full_name,
            email: user.work_email || user.email,
        });

        // Calculate expiry date
        const expiryDate = new Date();
        if (expires_in.includes("d")) {
            const days = parseInt(expires_in);
            expiryDate.setDate(expiryDate.getDate() + days);
        } else if (expires_in.includes("h")) {
            const hours = parseInt(expires_in);
            expiryDate.setHours(expiryDate.getHours() + hours);
        }

        // Save API key info to user account
        user.api_key_info = {
            key: apiKey,
            permissions,
            created_at: new Date(),
            expires_at: expiryDate,
        };

        await user.save();

        const responseData = {
            api_key: apiKey,
            permissions,
            expires_at: expiryDate,
        };

        return AppResponse.success(res, responseData, "API key generated successfully", statusCode.OK);
    });

    // Social login
    socialLogin = tryCatchAsync(async (req, res, next) => {
        const { provider, token, user_data } = req.body;

        let account = null;

        // Find or create account based on provider
        switch (provider) {
            case "tiktok":
                account = await Account.findOne({
                    tiktok_access_token: token,
                    isDelete: false,
                });
                break;
            case "facebook":
                account = await Account.findOne({
                    facebook_access_token: token,
                    isDelete: false,
                });
                break;
            case "google":
                account = await Account.findOne({
                    "google_data.id_token": token,
                    isDelete: false,
                });
                break;
            default:
                throw new AppError("Unsupported social login provider", 400);
        }

        if (!account) {
            // Create new account for social login
            account = new Account({
                full_name: user_data.name,
                work_email: user_data.email,
                email: user_data.email,
                password: Math.random().toString(36).slice(-8), // Random password
                role: "admin",
                [`${provider}_access_token`]: token,
            });

            await account.save();
        }

        // Generate JWT token
        const authResponse = this.jwtService.generateAuthResponse(account);

        const responseData = {
            user: {
                id: account._id,
                full_name: account.full_name,
                email: account.work_email || account.email,
                role: account.role,
            },
            ...authResponse,
        };

        return AppResponse.success(res, responseData, "Social login successful", statusCode.OK);
    });
}

module.exports = AuthController;
