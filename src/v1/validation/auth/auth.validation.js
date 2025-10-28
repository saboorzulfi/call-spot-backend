const { body, validationResult } = require('express-validator');

// Middleware to check validation results
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

// Register validation rules
const validateRegister = [
    body('full_name')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),
    
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    
    validate
];

// Login validation rules
const validateLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    
    validate
];

// Change password validation rules
const validateChangePassword = [
    body('current_password')
        .notEmpty()
        .withMessage('Current password is required'),
    
    body('password')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters long'),
    
    body('confirm_password')
        .notEmpty()
        .withMessage('Confirm password is required')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password confirmation does not match');
            }
            return true;
        }),
    
    validate
];

// Forgot password validation rules
const validateForgotPassword = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    validate
];

// Verify OTP validation rules
const validateVerifyOtp = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('otp_code')
        .notEmpty()
        .withMessage('OTP code is required')
        .isNumeric()
        .withMessage('OTP code must be numeric')
        .isLength({ min: 4, max: 6 })
        .withMessage('OTP code must be between 4 and 6 digits'),
    
    validate
];

// Reset password validation rules
const validateResetPassword = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('otp_code')
        .notEmpty()
        .withMessage('OTP code is required')
        .isNumeric()
        .withMessage('OTP code must be numeric'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    
    validate
];

// Refresh token validation rules
const validateRefreshToken = [
    body('refresh_token')
        .notEmpty()
        .withMessage('Refresh token is required'),
    
    validate
];

// Update profile validation rules
const validateUpdateProfile = [
    body('full_name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),
    
    body('email')
        .optional()
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('phone')
        .optional()
        .trim()
        .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
        .withMessage('Please provide a valid phone number'),
    
    validate
];

module.exports = {
    validateRegister,
    validateLogin,
    validateChangePassword,
    validateForgotPassword,
    validateVerifyOtp,
    validateResetPassword,
    validateRefreshToken,
    validateUpdateProfile
};

