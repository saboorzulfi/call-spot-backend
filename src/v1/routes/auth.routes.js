const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/auth.controller");
const authController = new AuthController();

const { jwtMiddleware, authenticateUser } = require("../middlewares/auth.middleware");

// Public routes (no authentication required)
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-otp", authController.verifyOtp);
router.post("/reset-password", authController.resetPassword);
router.post("/refresh-token", authController.refreshToken);
router.post("/login-with-key", authController.loginWithKey);
router.post("/social-login", authController.socialLogin);

// Protected routes (require authentication)
router.use(jwtMiddleware, authenticateUser);
router.get("/profile", authController.getProfile);
router.put("/profile", authController.updateProfile);
router.post("/change-password", authController.changePassword);
router.post("/generate-api-key", authController.generateApiKey);
router.post("/logout", authController.logout);

module.exports = router;
