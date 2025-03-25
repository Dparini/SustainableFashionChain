/**
 * Cache Middleware
 *
 * Provides caching middleware for Express routes
 */

const cacheService = require('../services/cacheService');
const { CACHE_TTL } = require('../config/redis');

/**
 * Generate cache key from request
 * @param {Object} req - Express request object
 * @returns {string} Cache key
 */
const generateCacheKey = (req) => {
    const parts = [
        req.originalUrl,
        req.method,
        req.user ? req.user.id : 'anonymous'
    ];

    // Add query parameters to key if present
    if (Object.keys(req.query).length > 0) {
        parts.push(JSON.stringify(req.query));
    }

    // Add body to key for POST/PUT requests
    if (['POST', 'PUT'].includes(req.method) && Object.keys(req.body).length > 0) {
        parts.push(JSON.stringify(req.body));
    }

    return parts.join(':');
};

/**
 * Cache middleware factory
 * @param {number} ttl - Cache TTL in seconds
 * @returns {Function} Express middleware function
 */
const cache = (ttl = CACHE_TTL.MEDIUM) => {
    return async (req, res, next) => {
        // Skip caching for non-GET requests unless explicitly configured
        if (req.method !== 'GET' && ttl !== CACHE_TTL.SHORT) {
            return next();
        }

        const key = generateCacheKey(req);

        try {
            // Try to get from cache
            const cachedData = await cacheService.get(key);

            if (cachedData) {
                // Add cache hit header
                res.set('X-Cache', 'HIT');
                return res.json(cachedData);
            }

            // Cache miss - store original send
            const originalSend = res.json;

            // Override res.json method
            res.json = async function (data) {
                // Restore original method
                res.json = originalSend;

                // Cache the response
                await cacheService.set(key, data, ttl);

                // Add cache miss header
                res.set('X-Cache', 'MISS');

                // Send the response
                return originalSend.call(this, data);
            };

            next();
        } catch (error) {
            console.error('Cache middleware error:', error);
            next();
        }
    };
};

/**
 * Clear cache for specific routes
 * @param {string|string[]} routes - Route(s) to clear
 * @returns {Function} Express middleware function
 */
const clearCache = (routes) => {
    return async (req, res, next) => {
        try {
            const routesToClear = Array.isArray(routes) ? routes : [routes];

            for (const route of routesToClear) {
                await cacheService.clearByPrefix(route);
            }

            next();
        } catch (error) {
            console.error('Clear cache middleware error:', error);
            next();
        }
    };
};

module.exports = {
    cache,
    clearCache
};