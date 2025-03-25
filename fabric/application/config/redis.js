/**
 * Redis Configuration
 *
 * Configures Redis connection and cluster settings for distributed caching
 */

const Redis = require('ioredis');

// Redis configuration
const REDIS_CONFIG = {
    // Single node config
    single: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        retryStrategy: (times) => {
            return Math.min(times * 50, 2000);
        }
    },

    // Cluster config
    cluster: [
        {
            host: process.env.REDIS_CLUSTER_1_HOST || 'localhost',
            port: process.env.REDIS_CLUSTER_1_PORT || 6379
        },
        {
            host: process.env.REDIS_CLUSTER_2_HOST || 'localhost',
            port: process.env.REDIS_CLUSTER_2_PORT || 6380
        },
        {
            host: process.env.REDIS_CLUSTER_3_HOST || 'localhost',
            port: process.env.REDIS_CLUSTER_3_PORT || 6381
        }
    ],

    // Default options
    options: {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        scaleReads: 'slave'
    }
};

// Cache TTL defaults (in seconds)
const CACHE_TTL = {
    SHORT: 300,      // 5 minutes
    MEDIUM: 3600,    // 1 hour
    LONG: 86400,     // 24 hours
    WEEK: 604800     // 1 week
};

// Key prefixes for different types of data
const KEY_PREFIXES = {
    BATCH: 'batch:',
    PRODUCT: 'product:',
    USER: 'user:',
    TOKEN: 'token:',
    ANALYTICS: 'analytics:'
};

let redisClient;

/**
 * Initialize Redis connection
 * @returns {Promise<Redis>} Redis client instance
 */
const initializeRedis = async () => {
    try {
        if (process.env.REDIS_CLUSTER_MODE === 'true') {
            // Initialize cluster connection
            redisClient = new Redis.Cluster(REDIS_CONFIG.cluster, {
                ...REDIS_CONFIG.options,
                redisOptions: REDIS_CONFIG.single
            });
        } else {
            // Initialize single node connection
            redisClient = new Redis(REDIS_CONFIG.single);
        }

        redisClient.on('error', (error) => {
            console.error('Redis connection error:', error);
        });

        redisClient.on('connect', () => {
            console.log('Connected to Redis successfully');
        });

        return redisClient;
    } catch (error) {
        console.error('Failed to initialize Redis:', error);
        throw error;
    }
};

/**
 * Get Redis client instance
 * @returns {Redis} Redis client
 */
const getRedisClient = () => {
    if (!redisClient) {
        throw new Error('Redis client not initialized');
    }
    return redisClient;
};

module.exports = {
    initializeRedis,
    getRedisClient,
    CACHE_TTL,
    KEY_PREFIXES
};