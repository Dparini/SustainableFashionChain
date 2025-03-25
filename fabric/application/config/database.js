/**
 * Enhanced Database Configuration
 *
 * Configures MongoDB connection with sharding support
 */

const mongoose = require('mongoose');
const { SHARD_CONFIG } = require('./sharding');

// Build connection string based on configuration
const buildConnectionString = () => {
    if (process.env.MONGODB_URI) {
        return process.env.MONGODB_URI;
    }

    // For sharded cluster, connect through mongos routers
    if (process.env.USE_SHARDING === 'true') {
        const mongosHosts = SHARD_CONFIG.mongos
            .map(m => `${m.host}:${m.port}`)
            .join(',');
        return `mongodb://${mongosHosts}/sustainablefashionchain`;
    }

    // Default local connection
    return 'mongodb://localhost:27017/sustainablefashionchain';
};

// Database connection options
const connectionOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    autoIndex: process.env.NODE_ENV !== 'production',
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000
};

/**
 * Initialize sharding for collections
 * @param {mongoose.Connection} db - Database connection
 */
const initializeSharding = async (db) => {
    try {
        // Enable sharding for database
        await db.db.admin().command({ enableSharding: db.name });

        // Configure sharding for collections
        for (const [collection, key] of Object.entries(SHARD_CONFIG.shardKeys)) {
            await db.db.admin().command({
                shardCollection: `${db.name}.${collection}`,
                key
            });
        }

        console.log('Sharding initialized successfully');
    } catch (error) {
        console.error('Error initializing sharding:', error);
        // Don't throw error as sharding might already be configured
    }
};

/**
 * Connect to MongoDB
 * @returns {Promise<boolean>} Connection status
 */
const connectDatabase = async () => {
    try {
        const connectionString = buildConnectionString();
        const connection = await mongoose.connect(connectionString, connectionOptions);

        console.log('Connected to MongoDB successfully');

        // Initialize sharding if enabled
        if (process.env.USE_SHARDING === 'true') {
            await initializeSharding(connection);
        }

        // Log any subsequent errors after initial connection
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        // Handle graceful disconnection when Node process ends
        process.on('SIGINT', async () => {
            await disconnectDatabase();
            process.exit(0);
        });

        return true;
    } catch (error) {
        console.error('MongoDB connection error:', error);

        // In development, we might want to exit on connection failure
        if (process.env.NODE_ENV !== 'production') {
            // Don't exit in production, try to keep the app running
            // process.exit(1);
        }

        return false;
    }
};

/**
 * Disconnect from MongoDB
 * @returns {Promise<boolean>} Disconnection status
 */
const disconnectDatabase = async () => {
    try {
        await mongoose.connection.close();
        console.log('Disconnected from MongoDB');
        return true;
    } catch (error) {
        console.error('Error disconnecting from MongoDB:', error);
        return false;
    }
};

/**
 * Create indexes for collections
 * This should be called after models are defined
 */
const createIndexes = async () => {
    try {
        // Get all models
        const models = mongoose.connection.models;

        // Create indexes for each model
        for (const [name, model] of Object.entries(models)) {
            await model.createIndexes();
            console.log(`Created indexes for ${name} collection`);
        }
    } catch (error) {
        console.error('Error creating indexes:', error);
        throw error;
    }
};

module.exports = {
    connectDatabase,
    disconnectDatabase,
    createIndexes,
    getConnection: () => mongoose.connection
};