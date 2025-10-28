const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/auth.controller");
const authController = new AuthController();

const { isLoggedIn } = require("../middlewares/auth.middleware");

// Public routes (no authentication required)
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-otp", authController.verifyOtp);
router.post("/reset-password", authController.resetPassword);
router.post("/refresh-token", authController.refreshToken);

// Protected routes (require authentication)
router.use(isLoggedIn);
router.post("/change-password", authController.changePassword);
router.post("/generate-api-key", authController.generateApiKey);
router.post("/logout", authController.logout);

module.exports = router;
