/**
 * Enhanced User Model
 *
 * This module provides functionality for user management including authentication,
 * authorization, and user profile management.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// JWT secret (in a real application, this would be an environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'sustainablefashionchain-jwt-secret';
const JWT_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = '7d';

// Define roles and permissions
const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    PRODUCER: 'producer',
    MANUFACTURER: 'manufacturer',
    RETAILER: 'retailer',
    CERTIFIER: 'certifier',
    CONSUMER: 'consumer'
};

// Define org types
const ORG_TYPES = {
    FARM: 'farm',
    WAREHOUSE: 'warehouse',
    FACTORY: 'factory',
    CERTIFICATION_BODY: 'certification_body',
    RETAIL_STORE: 'retail_store'
};

// Define the user schema
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: Object.values(ROLES),
        required: true
    },
    organization: {
        id: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: Object.values(ORG_TYPES),
            required: true
        }
    },
    walletAddress: {
        type: String,
        trim: true
    },
    profileImage: {
        type: String
    },
    bio: {
        type: String,
        maxlength: 500
    },
    active: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    passwordResetToken: {
        type: String
    },
    passwordResetExpires: {
        type: Date
    },
    apiKey: {
        type: String
    },
    apiKeyCreated: {
        type: Date
    },
    refreshToken: {
        type: String
    },
    refreshTokenExpires: {
        type: Date
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String
    },
    emailVerificationExpires: {
        type: Date
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    tokens: [{
        token: {
            type: String,
            required: true
        }
    }]
}, {
    timestamps: true
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
    const user = this;

    if (user.isModified('password')) {
        user.password = await bcrypt.hash(user.password, 10);
    }

    next();
});

// Generate authentication token
userSchema.methods.generateAuthToken = async function() {
    const user = this;
    const token = jwt.sign(
        {
            _id: user._id.toString(),
            role: user.role,
            orgId: user.organization.id,
            username: user.username
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );

    // Store token in the user document
    user.tokens = user.tokens.concat({ token });
    await user.save();

    return token;
};

// Generate refresh token
userSchema.methods.generateRefreshToken = async function() {
    const user = this;
    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Set refresh token and expiry
    user.refreshToken = refreshToken;
    user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await user.save();
    return refreshToken;
};

// Generate API key
userSchema.methods.generateApiKey = async function() {
    const user = this;
    const apiKey = crypto.randomBytes(32).toString('hex');

    user.apiKey = apiKey;
    user.apiKeyCreated = new Date();
    await user.save();

    return apiKey;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = async function() {
    const user = this;
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Set reset token and expiry
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 3600000; // 1 hour

    await user.save();
    return resetToken;
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = async function() {
    const user = this;
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Set verification token and expiry
    user.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    user.emailVerificationExpires = Date.now() + 86400000; // 24 hours

    await user.save();
    return verificationToken;
};

// Find user by credentials
userSchema.statics.findByCredentials = async function(username, password) {
    const User = this;

    // Find by username or email
    const user = await User.findOne({
        $or: [
            { username: username },
            { email: username }
        ]
    });

    if (!user) {
        throw new Error('Invalid login credentials');
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
        throw new Error('Account is temporarily locked. Please try again later.');
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        // Increment failed login attempts
        user.failedLoginAttempts += 1;

        // Lock account after 5 failed attempts
        if (user.failedLoginAttempts >= 5) {
            user.lockUntil = Date.now() + 3600000; // 1 hour
        }

        await user.save();
        throw new Error('Invalid login credentials');
    }

    // Reset failed login attempts on successful login
    if (user.failedLoginAttempts > 0) {
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        await user.save();
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    return user;
};

// Find user by API key
userSchema.statics.findByApiKey = async function(apiKey) {
    const User = this;

    const user = await User.findOne({ apiKey });

    if (!user) {
        throw new Error('Invalid API key');
    }

    if (!user.active) {
        throw new Error('User account is inactive');
    }

    return user;
};

// Find user by refresh token
userSchema.statics.findByRefreshToken = async function(refreshToken) {
    const User = this;

    const user = await User.findOne({
        refreshToken,
        refreshTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
        throw new Error('Invalid or expired refresh token');
    }

    return user;
};

// Check if user has specific permissions
userSchema.methods.hasPermission = function(requiredPermissions) {
    const user = this;
    const rolePermissions = {
        [ROLES.ADMIN]: ['manage_users', 'manage_batches', 'manage_products', 'manage_certifications', 'manage_tokenization', 'view_analytics', 'manage_system'],
        [ROLES.MANAGER]: ['manage_batches', 'manage_products', 'manage_certifications', 'view_analytics'],
        [ROLES.PRODUCER]: ['create_batch', 'update_batch', 'view_own_batches', 'request_certification'],
        [ROLES.MANUFACTURER]: ['view_batches', 'create_product', 'update_product', 'view_own_products'],
        [ROLES.RETAILER]: ['view_products', 'sell_product', 'verify_product'],
        [ROLES.CERTIFIER]: ['create_certification', 'update_certification', 'view_certifications'],
        [ROLES.CONSUMER]: ['verify_product', 'view_product_history']
    };

    const userPermissions = rolePermissions[user.role] || [];

    if (typeof requiredPermissions === 'string') {
        return userPermissions.includes(requiredPermissions);
    }

    // Check if user has all required permissions
    return requiredPermissions.every(permission => userPermissions.includes(permission));
};

// Hide private data when converting to JSON
userSchema.methods.toJSON = function() {
    const user = this;
    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.tokens;
    delete userObject.apiKey;
    delete userObject.passwordResetToken;
    delete userObject.passwordResetExpires;
    delete userObject.emailVerificationToken;
    delete userObject.emailVerificationExpires;
    delete userObject.refreshToken;
    delete userObject.refreshTokenExpires;
    delete userObject.failedLoginAttempts;
    delete userObject.lockUntil;

    return userObject;
};

// Create the User model
const User = mongoose.model('User', userSchema);

// Export the model and constants
module.exports = {
    User,
    ROLES,
    ORG_TYPES
};