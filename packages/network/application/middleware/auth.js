/**
 * Authentication middleware for SustainableFashionChain
 *
 * This module provides middleware functions for authentication and authorization
 * of users in the application. It supports role-based access control to protect
 * routes based on user roles.
 */

'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// In a production environment, use environment variables for secrets
const JWT_SECRET = process.env.JWT_SECRET || 'sustainablefashionchain-secret-key';
const JWT_EXPIRES_IN = '24h';

// User roles and their hierarchy
const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    PRODUCER: 'producer',
    MANUFACTURER: 'manufacturer',
    RETAILER: 'retailer',
    CERTIFIER: 'certifier',
    CONSUMER: 'consumer'
};

// Role permissions matrix
const PERMISSIONS = {
    [ROLES.ADMIN]: ['*'], // Admin has all permissions
    [ROLES.MANAGER]: ['read:*', 'write:batches', 'write:products', 'write:certifications', 'approve:tokenization'],
    [ROLES.PRODUCER]: ['read:batches', 'write:batches', 'read:certifications'],
    [ROLES.MANUFACTURER]: ['read:batches', 'read:certifications', 'write:products'],
    [ROLES.RETAILER]: ['read:products', 'read:batches', 'read:certifications'],
    [ROLES.CERTIFIER]: ['read:batches', 'write:certifications'],
    [ROLES.CONSUMER]: ['read:products', 'verify:products']
};

/**
 * Generate a JWT token for a user
 *
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
const generateToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
            role: user.role,
            email: user.email
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

/**
 * Hash a password using bcrypt
 *
 * @param {String} password - Plain text password
 * @returns {Promise<String>} Hashed password
 */
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

/**
 * Verify a password against a hash
 *
 * @param {String} password - Plain text password
 * @param {String} hash - Hashed password
 * @returns {Promise<Boolean>} True if password matches hash
 */
const verifyPassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

/**
 * Middleware to verify JWT token
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = (req, res, next) => {
    // Get token from header, cookies, or query parameter
    const token = req.headers.authorization?.split(' ')[1] ||
                 req.cookies?.token ||
                 req.query?.token;

    if (!token) {
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.redirect('/login');
    }
};

/**
 * Middleware to check user role
 *
 * @param {String|Array} roles - Required role(s) to access the route
 * @returns {Function} Middleware function
 */
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.redirect('/login');
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (userRole === ROLES.ADMIN || allowedRoles.includes(userRole)) {
            return next(); // Admin or specific role is allowed
        }

        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this resource',
            error: { status: 403 }
        });
    };
};

/**
 * Middleware to check specific permissions
 *
 * @param {String|Array} requiredPermissions - Required permission(s) to access the route
 * @returns {Function} Middleware function
 */
const authorizePermission = (requiredPermissions) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.redirect('/login');
        }

        const userRole = req.user.role;
        const userPermissions = PERMISSIONS[userRole] || [];
        const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

        // Check if user has the required permissions
        const hasPermission = required.every(permission => {
            // Admin has all permissions
            if (userRole === ROLES.ADMIN || userPermissions.includes('*')) {
                return true;
            }

            // Check for wildcard matches (e.g., 'read:*' matches 'read:batches')
            return userPermissions.some(p => {
                if (p.endsWith(':*')) {
                    const prefix = p.split(':')[0];
                    return permission.startsWith(prefix + ':');
                }
                return p === permission;
            });
        });

        if (hasPermission) {
            return next();
        }

        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this resource',
            error: { status: 403 }
        });
    };
};

/**
 * Generate a cryptographically secure random token
 *
 * @param {Number} length - Length of the token
 * @returns {String} Random token
 */
const generateRandomToken = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

// Export functions and constants
module.exports = {
    ROLES,
    PERMISSIONS,
    generateToken,
    hashPassword,
    verifyPassword,
    authenticateToken,
    authorizeRole,
    authorizePermission,
    generateRandomToken
};