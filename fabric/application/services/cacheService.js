/**
 * Cache Service
 *
 * Provides caching functionality for the application using Redis
 */

const { getRedisClient, CACHE_TTL, KEY_PREFIXES } = require('../config/redis');

class CacheService {
    get redis() {
        return getRedisClient();
    }

    /**
     * Get item from cache
     * @param {string} key - Cache key
     * @returns {Promise<any>} Cached value
     */
    async get(key) {
        try {
            const value = await this.redis.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Set item in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in seconds
     * @returns {Promise<boolean>} Success status
     */
    async set(key, value, ttl = CACHE_TTL.MEDIUM) {
        try {
            await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
            return true;
        } catch (error) {
            console.error(`Cache set error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete item from cache
     * @param {string} key - Cache key
     * @returns {Promise<boolean>} Success status
     */
    async delete(key) {
        try {
            await this.redis.del(key);
            return true;
        } catch (error) {
            console.error(`Cache delete error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Clear all cache
     * @returns {Promise<boolean>} Success status
     */
    async clear() {
        try {
            await this.redis.flushall();
            return true;
        } catch (error) {
            console.error('Cache clear error:', error);
            return false;
        }
    }

    /**
     * Get cached batch
     * @param {string} batchId - Batch ID
     * @returns {Promise<any>} Cached batch data
     */
    async getBatch(batchId) {
        return this.get(`${KEY_PREFIXES.BATCH}${batchId}`);
    }

    /**
     * Cache batch data
     * @param {string} batchId - Batch ID
     * @param {any} batchData - Batch data to cache
     * @returns {Promise<boolean>} Success status
     */
    async setBatch(batchId, batchData) {
        return this.set(`${KEY_PREFIXES.BATCH}${batchId}`, batchData, CACHE_TTL.MEDIUM);
    }

    /**
     * Get cached product
     * @param {string} productId - Product ID
     * @returns {Promise<any>} Cached product data
     */
    async getProduct(productId) {
        return this.get(`${KEY_PREFIXES.PRODUCT}${productId}`);
    }

    /**
     * Cache product data
     * @param {string} productId - Product ID
     * @param {any} productData - Product data to cache
     * @returns {Promise<boolean>} Success status
     */
    async setProduct(productId, productData) {
        return this.set(`${KEY_PREFIXES.PRODUCT}${productId}`, productData, CACHE_TTL.MEDIUM);
    }

    /**
     * Get cached analytics
     * @param {string} metric - Analytics metric name
     * @returns {Promise<any>} Cached analytics data
     */
    async getAnalytics(metric) {
        return this.get(`${KEY_PREFIXES.ANALYTICS}${metric}`);
    }

    /**
     * Cache analytics data
     * @param {string} metric - Analytics metric name
     * @param {any} data - Analytics data to cache
     * @returns {Promise<boolean>} Success status
     */
    async setAnalytics(metric, data) {
        return this.set(`${KEY_PREFIXES.ANALYTICS}${metric}`, data, CACHE_TTL.SHORT);
    }

    /**
     * Clear cache by prefix
     * @param {string} prefix - Key prefix to clear
     * @returns {Promise<boolean>} Success status
     */
    async clearByPrefix(prefix) {
        try {
            const keys = await this.redis.keys(`${prefix}*`);
            if (keys.length > 0) {
                await this.redis.del(keys);
            }
            return true;
        } catch (error) {
            console.error(`Cache clear error for prefix ${prefix}:`, error);
            return false;
        }
    }
}

// Export singleton instance
const cacheService = new CacheService();
module.exports = cacheService;