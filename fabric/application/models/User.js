/**
 * User model for SustainableFashionChain
 *
 * This model handles user authentication and authorization
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Define roles and permissions
const ROLES = {
    ADMIN: 'admin',
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

// User schema
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
    active: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    apiKey: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
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
        user.password = await bcrypt.hash(user.password, 8);
    }

    next();
});

// Generate authentication token
userSchema.methods.generateAuthToken = async function() {
    const user = this;
    const token = jwt.sign(
        { _id: user._id.toString(), role: user.role, orgId: user.organization.id },
        process.env.JWT_SECRET || 'sustainablefashionchain_secret',
        { expiresIn: '24h' }
    );

    user.tokens = user.tokens.concat({ token });
    await user.save();

    return token;
};

// Generate API key
userSchema.methods.generateApiKey = async function() {
    const user = this;
    const apiKey = require('crypto').randomBytes(32).toString('hex');

    user.apiKey = apiKey;
    await user.save();

    return apiKey;
};

// Find user by credentials
userSchema.statics.findByCredentials = async function(username, password) {
    const user = await User.findOne({ username });

    if (!user) {
        throw new Error('Unable to login');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        throw new Error('Unable to login');
    }

    return user;
};

// Check if user has specific permissions
userSchema.methods.hasPermission = function(requiredPermissions) {
    const user = this;
    const rolePermissions = {
        [ROLES.ADMIN]: ['manage_users', 'manage_batches', 'manage_products', 'manage_certifications', 'manage_tokenization', 'view_analytics', 'manage_system'],
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
    const user = this.toObject();

    delete user.password;
    delete user.tokens;
    delete user.apiKey;

    return user;
};

const User = mongoose.model('User', userSchema);

module.exports = {
    User,
    ROLES,
    ORG_TYPES
};