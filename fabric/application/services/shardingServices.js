/**
 * Sharding Service
 *
 * Manages shard-specific operations and monitoring for MongoDB sharded cluster
 */

const mongoose = require('mongoose');
const { SHARD_CONFIG } = require('../config/sharding');

class ShardingService {
    constructor() {
        this.db = mongoose.connection;
    }

    /**
     * Get sharding status
     * @returns {Promise<Object>} Sharding status
     */
    async getStatus() {
        try {
            const status = await this.db.db.admin().command({ listShards: 1 });
            const balancerStatus = await this.db.db.admin().command({ balancerStatus: 1 });
            const config = await this.db.db.admin().command({ getShardMap: 1 });

            return {
                shards: status.shards,
                balancer: balancerStatus,
                config
            };
        } catch (error) {
            console.error('Error getting sharding status:', error);
            throw error;
        }
    }

    /**
     * Get collection distribution
     * @param {string} collectionName - Collection name
     * @returns {Promise<Object>} Collection distribution
     */
    async getCollectionDistribution(collectionName) {
        try {
            const stats = await this.db.db.command({
                collStats: collectionName,
                scale: 1024 * 1024 // Convert to MB
            });

            return {
                shardDistribution: stats.shards,
                totalChunks: stats.chunks,
                avgChunkSize: stats.avgObjSize,
                totalDataSize: stats.size,
                totalDocuments: stats.count
            };
        } catch (error) {
            console.error(`Error getting distribution for ${collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Rebalance chunks across shards
     * @returns {Promise<boolean>} Success status
     */
    async rebalanceChunks() {
        try {
            // Start balancer if not running
            await this.db.db.admin().command({ balancerStart: 1 });

            // Wait for balancing to complete
            let balancerRunning = true;
            while (balancerRunning) {
                const status = await this.db.db.admin().command({ balancerStatus: 1 });
                balancerRunning = status.inBalancerRound;
                if (balancerRunning) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            return true;
        } catch (error) {
            console.error('Error rebalancing chunks:', error);
            throw error;
        }
    }

    /**
     * Get shard metrics
     * @returns {Promise<Object>} Shard metrics
     */
    async getMetrics() {
        try {
            const metrics = {
                shards: {},
                total: {
                    size: 0,
                    documents: 0,
                    chunks: 0
                }
            };

            // Get metrics for each collection
            for (const collectionName of Object.keys(SHARD_CONFIG.shardKeys)) {
                const distribution = await this.getCollectionDistribution(collectionName);

                metrics.total.size += distribution.totalDataSize;
                metrics.total.documents += distribution.totalDocuments;
                metrics.total.chunks += distribution.totalChunks;

                // Aggregate by shard
                for (const [shardId, shardStats] of Object.entries(distribution.shardDistribution)) {
                    if (!metrics.shards[shardId]) {
                        metrics.shards[shardId] = {
                            size: 0,
                            documents: 0,
                            chunks: 0
                        };
                    }

                    metrics.shards[shardId].size += shardStats.size;
                    metrics.shards[shardId].documents += shardStats.count;
                    metrics.shards[shardId].chunks += shardStats.chunks;
                }
            }

            return metrics;
        } catch (error) {
            console.error('Error getting shard metrics:', error);
            throw error;
        }
    }

    /**
     * Monitor shard health
     * @returns {Promise<Object>} Shard health status
     */
    async monitorHealth() {
        try {
            const health = {
                shards: {},
                configServers: {},
                mongos: {}
            };

            // Check shard servers
            for (const shard of SHARD_CONFIG.shards) {
                try {
                    const conn = await mongoose.createConnection(
                        `mongodb://${shard.host}:${shard.port}`,
                        { serverSelectionTimeoutMS: 2000 }
                    );
                    const status = await conn.db.admin().serverStatus();
                    health.shards[shard.id] = {
                        status: 'healthy',
                        connections: status.connections,
                        memory: status.mem,
                        uptime: status.uptime
                    };
                    await conn.close();
                } catch (error) {
                    health.shards[shard.id] = {
                        status: 'unhealthy',
                        error: error.message
                    };
                }
            }

            // Check config servers
            for (const [index, server] of SHARD_CONFIG.configServers.entries()) {
                try {
                    const conn = await mongoose.createConnection(
                        `mongodb://${server.host}:${server.port}`,
                        { serverSelectionTimeoutMS: 2000 }
                    );
                    const status = await conn.db.admin().serverStatus();
                    health.configServers[`config${index + 1}`] = {
                        status: 'healthy',
                        uptime: status.uptime
                    };
                    await conn.close();
                } catch (error) {
                    health.configServers[`config${index + 1}`] = {
                        status: 'unhealthy',
                        error: error.message
                    };
                }
            }

            // Check mongos routers
            for (const [index, router] of SHARD_CONFIG.mongos.entries()) {
                try {
                    const conn = await mongoose.createConnection(
                        `mongodb://${router.host}:${router.port}`,
                        { serverSelectionTimeoutMS: 2000 }
                    );
                    const status = await conn.db.admin().serverStatus();
                    health.mongos[`router${index + 1}`] = {
                        status: 'healthy',
                        connections: status.connections,
                        uptime: status.uptime
                    };
                    await conn.close();
                } catch (error) {
                    health.mongos[`router${index + 1}`] = {
                        status: 'unhealthy',
                        error: error.message
                    };
                }
            }

            return health;
        } catch (error) {
            console.error('Error monitoring shard health:', error);
            throw error;
        }
    }

    /**
     * Analyze shard distribution and recommend rebalancing
     * @returns {Promise<Object>} Distribution analysis
     */
    async analyzeDistribution() {
        try {
            const metrics = await this.getMetrics();
            const numShards = Object.keys(metrics.shards).length;
            const optimalChunksPerShard = Math.floor(metrics.total.chunks / numShards);

            const analysis = {
                optimal: {
                    chunksPerShard: optimalChunksPerShard,
                    documentsPerShard: Math.floor(metrics.total.documents / numShards),
                    sizePerShard: Math.floor(metrics.total.size / numShards)
                },
                imbalances: []
            };

            // Analyze each shard
            for (const [shardId, stats] of Object.entries(metrics.shards)) {
                const chunkImbalance = stats.chunks - optimalChunksPerShard;
                if (Math.abs(chunkImbalance) > optimalChunksPerShard * 0.1) { // 10% threshold
                    analysis.imbalances.push({
                        shardId,
                        type: chunkImbalance > 0 ? 'overloaded' : 'underloaded',
                        chunkDifference: Math.abs(chunkImbalance),
                        recommendedAction: chunkImbalance > 0 ? 'migrate_from' : 'migrate_to'
                    });
                }
            }

            return analysis;
        } catch (error) {
            console.error('Error analyzing distribution:', error);
            throw error;
        }
    }

    /**
     * Auto-balance shards if needed
     * @returns {Promise<Object>} Balance result
     */
    async autoBalance() {
        try {
            const analysis = await this.analyzeDistribution();

            if (analysis.imbalances.length === 0) {
                return {
                    balanced: true,
                    message: 'No balancing needed'
                };
            }

            // Start balancing
            await this.rebalanceChunks();

            // Monitor progress
            const startTime = Date.now();
            let attempts = 0;
            const maxAttempts = 10;
            let balanced = false;

            while (!balanced && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                const newAnalysis = await this.analyzeDistribution();
                balanced = newAnalysis.imbalances.length === 0;
                attempts++;
            }

            return {
                balanced,
                timeSpent: Date.now() - startTime,
                attempts,
                message: balanced ? 'Balancing completed' : 'Balancing incomplete'
            };

        } catch (error) {
            console.error('Error in auto-balance:', error);
            throw error;
        }
    }
}

// Export singleton instance
const shardingService = new ShardingService();
module.exports = shardingService;