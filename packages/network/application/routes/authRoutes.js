/**
 * Authentication Routes
 *
 * Defines routes for user authentication, registration, and account management
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Rate limiting for authentication
const rateLimit = require('express-rate-limit');

// Rate limiter for login attempts (5 per minute)
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // 5 requests per window
    message: 'Too many login attempts. Please try again after 1 minute.'
});

// Rate limiter for account creation (3 per hour)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 requests per window
    message: 'Too many accounts created. Please try again after an hour.'
});

// Public routes

/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access Public
 */
router.post('/register', registerLimiter, authController.register);

/**
 * @route POST /api/auth/login
 * @description Login user and get tokens
 * @access Public
 */
router.post('/login', loginLimiter, authController.login);

/**
 * @route POST /api/auth/refresh-token
 * @description Refresh access token using refresh token
 * @access Public
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @route POST /api/auth/forgot-password
 * @description Request password reset
 * @access Public
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @route POST /api/auth/reset-password/:token
 * @description Reset password using token
 * @access Public
 */
router.post('/reset-password/:token', authController.resetPassword);

/**
 * @route GET /api/auth/verify-email/:token
 * @description Verify email using token
 * @access Public
 */
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes (require authentication)

/**
 * @route POST /api/auth/logout
 * @description Logout user
 * @access Private
 */
router.post('/logout', authenticateToken, authController.logout);

/**
 * @route POST /api/auth/logout-all
 * @description Logout from all devices
 * @access Private
 */
router.post('/logout-all', authenticateToken, authController.logoutAll);

/**
 * @route GET /api/auth/profile
 * @description Get current user profile
 * @access Private
 */
router.get('/profile', authenticateToken, authController.getProfile);

/**
 * @route PUT /api/auth/profile
 * @description Update user profile
 * @access Private
 */
router.put('/profile', authenticateToken, authController.updateProfile);

/**
 * @route POST /api/auth/change-password
 * @description Change password
 * @access Private
 */
router.post('/change-password', authenticateToken, authController.changePassword);

/**
 * @route POST /api/auth/api-key
 * @description Generate API key
 * @access Private
 */
router.post('/api-key', authenticateToken, authController.generateApiKey);

/**
 * @route DELETE /api/auth/api-key
 * @description Delete API key
 * @access Private
 */
router.delete('/api-key', authenticateToken, authController.deleteApiKey);

module.exports = router;