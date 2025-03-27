/**
 * Authentication Controller
 *
 * Handles user authentication, registration, and account management
 */

const { User, ROLES, ORG_TYPES } = require('../models/User');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../utils/emailService');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'sustainablefashionchain-jwt-secret';
const JWT_EXPIRY = '24h';

/**
 * Register a new user
 * @route POST /api/auth/register
 */
exports.register = async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, role, organization } = req.body;

        // Validate required fields
        if (!username || !email || !password || !firstName || !lastName || !role) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Validate role
        if (!Object.values(ROLES).includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Validate organization if provided
        if (organization) {
            if (!organization.name || !organization.type) {
                return res.status(400).json({ error: 'Organization name and type are required' });
            }

            if (!Object.values(ORG_TYPES).includes(organization.type)) {
                return res.status(400).json({ error: 'Invalid organization type' });
            }
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { username },
                { email }
            ]
        });

        if (existingUser) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Create organization ID if not provided
        const orgId = organization && organization.id ? organization.id : `org-${crypto.randomBytes(8).toString('hex')}`;

        // Create new user
        const user = new User({
            username,
            email,
            password,
            firstName,
            lastName,
            role,
            organization: {
                id: orgId,
                name: organization ? organization.name : 'Individual',
                type: organization ? organization.type : ORG_TYPES.RETAIL_STORE
            }
        });

        // Generate email verification token
        const verificationToken = await user.generateEmailVerificationToken();

        // Save user
        await user.save();

        // Send verification email
        await sendVerificationEmail(user.email, verificationToken, req);

        // Generate JWT token
        const token = await user.generateAuthToken();

        // Generate refresh token
        const refreshToken = await user.generateRefreshToken();

        res.status(201).json({
            message: 'User registered successfully. Please check your email to verify your account.',
            user: user.toJSON(),
            token,
            refreshToken
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again later.' });
    }
};

/**
 * Login user
 * @route POST /api/auth/login
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user and check password
        const user = await User.findByCredentials(username, password);

        // Check if user is active
        if (!user.active) {
            return res.status(403).json({ error: 'Account is inactive. Please contact an administrator.' });
        }

        // Generate JWT token
        const token = await user.generateAuthToken();

        // Generate refresh token
        const refreshToken = await user.generateRefreshToken();

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        res.status(200).json({
            message: 'Login successful',
            user: user.toJSON(),
            token,
            refreshToken
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: error.message || 'Invalid login credentials' });
    }
};

/**
 * Refresh token
 * @route POST /api/auth/refresh-token
 */
exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        // Find user by refresh token
        const user = await User.findByRefreshToken(refreshToken);

        // Generate new JWT token
        const token = await user.generateAuthToken();

        // Generate new refresh token
        const newRefreshToken = await user.generateRefreshToken();

        res.status(200).json({
            message: 'Token refreshed successfully',
            token,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
};

/**
 * Logout user
 * @route POST /api/auth/logout
 */
exports.logout = async (req, res) => {
    try {
        // Remove the current token
        req.user.tokens = req.user.tokens.filter(token => token.token !== req.token);

        // Clear refresh token
        req.user.refreshToken = null;
        req.user.refreshTokenExpires = null;

        await req.user.save();

        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed. Please try again later.' });
    }
};

/**
 * Logout from all devices
 * @route POST /api/auth/logout-all
 */
exports.logoutAll = async (req, res) => {
    try {
        // Remove all tokens
        req.user.tokens = [];

        // Clear refresh token
        req.user.refreshToken = null;
        req.user.refreshTokenExpires = null;

        await req.user.save();

        res.status(200).json({ message: 'Logged out from all devices successfully' });
    } catch (error) {
        console.error('Logout all error:', error);
        res.status(500).json({ error: 'Logout failed. Please try again later.' });
    }
};

/**
 * Get current user profile
 * @route GET /api/auth/profile
 */
exports.getProfile = async (req, res) => {
    try {
        res.status(200).json({ user: req.user.toJSON() });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to retrieve profile' });
    }
};

/**
 * Update user profile
 * @route PUT /api/auth/profile
 */
exports.updateProfile = async (req, res) => {
    try {
        const updates = req.body;
        const allowedUpdates = ['firstName', 'lastName', 'bio', 'walletAddress', 'profileImage'];
        const isValidOperation = Object.keys(updates).every(update => allowedUpdates.includes(update));

        if (!isValidOperation) {
            return res.status(400).json({ error: 'Invalid updates' });
        }

        // Update fields
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                req.user[field] = updates[field];
            }
        });

        await req.user.save();

        res.status(200).json({
            message: 'Profile updated successfully',
            user: req.user.toJSON()
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

/**
 * Change password
 * @route POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        // Verify current password
        const user = await User.findByCredentials(req.user.username, currentPassword);

        // Update password
        user.password = newPassword;
        await user.save();

        // Invalidate all tokens except current one
        user.tokens = user.tokens.filter(token => token.token === req.token);
        await user.save();

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(400).json({ error: error.message || 'Failed to change password' });
    }
};

/**
 * Request password reset
 * @route POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Find user by email
        const user = await User.findOne({ email });

        if (!user) {
            // Don't reveal that the user doesn't exist
            return res.status(200).json({ message: 'If your email exists in our system, you will receive a password reset link shortly.' });
        }

        // Generate reset token
        const resetToken = await user.generatePasswordResetToken();

        // Send password reset email
        await sendPasswordResetEmail(user.email, resetToken, req);

        res.status(200).json({ message: 'If your email exists in our system, you will receive a password reset link shortly.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
};

/**
 * Reset password
 * @route POST /api/auth/reset-password/:token
 */
exports.resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ error: 'New password is required' });
        }

        // Hash token for comparison
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user by token
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Password reset token is invalid or has expired' });
        }

        // Update password and clear reset token
        user.password = newPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        // Invalidate all tokens
        user.tokens = [];

        await user.save();

        res.status(200).json({ message: 'Password has been reset successfully. Please log in with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
};

/**
 * Verify email
 * @route GET /api/auth/verify-email/:token
 */
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        // Hash token for comparison
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user by token
        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Email verification token is invalid or has expired' });
        }

        // Mark email as verified and clear verification token
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;

        await user.save();

        res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
};

/**
 * Generate API key
 * @route POST /api/auth/api-key
 */
exports.generateApiKey = async (req, res) => {
    try {
        // Generate new API key
        const apiKey = await req.user.generateApiKey();

        res.status(200).json({
            message: 'API key generated successfully',
            apiKey
        });
    } catch (error) {
        console.error('API key generation error:', error);
        res.status(500).json({ error: 'Failed to generate API key' });
    }
};

/**
 * Delete API key
 * @route DELETE /api/auth/api-key
 */
exports.deleteApiKey = async (req, res) => {
    try {
        // Remove API key
        req.user.apiKey = undefined;
        req.user.apiKeyCreated = undefined;

        await req.user.save();

        res.status(200).json({ message: 'API key deleted successfully' });
    } catch (error) {
        console.error('API key deletion error:', error);
        res.status(500).json({ error: 'Failed to delete API key' });
    }
};

// Helper function to send verification email
async function sendVerificationEmail(email, token, req) {
    const verificationURL = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${token}`;

    const subject = 'Email Verification - SustainableFashionChain';
    const html = `
        <h1>Email Verification</h1>
        <p>Thank you for registering with SustainableFashionChain.</p>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationURL}" style="display: inline-block; background-color: #198754; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
        <p>If you did not create an account, please ignore this email.</p>
    `;

    await sendEmail(email, subject, html);
}

// Helper function to send password reset email
async function sendPasswordResetEmail(email, token, req) {
    const resetURL = `${req.protocol}://${req.get('host')}/reset-password/${token}`;

    const subject = 'Password Reset - SustainableFashionChain';
    const html = `
        <h1>Password Reset</h1>
        <p>You are receiving this email because you (or someone else) has requested a password reset for your account.</p>
        <p>Please click the link below to reset your password:</p>
        <a href="${resetURL}" style="display: inline-block; background-color: #198754; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    `;

    await sendEmail(email, subject, html);
}