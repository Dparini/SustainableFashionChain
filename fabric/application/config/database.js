/**
 * Database Configuration
 *
 * Configures MongoDB connection for the application
 */

const mongoose = require('mongoose');

// Default MongoDB URI (local)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sustainablefashionchain';

// Connection options
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    autoIndex: process.env.NODE_ENV !== 'production', // Don't build indexes in production
};

/**
 * Connect to MongoDB
 */
const connectDatabase = async () => {
    try {
        await mongoose.connect(MONGODB_URI, options);
        console.log('Connected to MongoDB successfully');

        // Log any subsequent errors after initial connection
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        // Handle graceful disconnection when Node process ends
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('MongoDB connection closed due to app termination');
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

module.exports = {
    connectDatabase,
    disconnectDatabase,
    getConnection: () => mongoose.connection
};