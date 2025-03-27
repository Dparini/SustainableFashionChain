/**
 * Database Sharding Configuration
 *
 * Configures MongoDB sharding setup for horizontal scaling
 */

const SHARD_CONFIG = {
    // Shard servers configuration
    shards: [
        {
            id: 'shard1',
            host: process.env.SHARD1_HOST || 'localhost',
            port: process.env.SHARD1_PORT || 27018
        },
        {
            id: 'shard2',
            host: process.env.SHARD2_HOST || 'localhost',
            port: process.env.SHARD2_PORT || 27019
        },
        {
            id: 'shard3',
            host: process.env.SHARD3_HOST || 'localhost',
            port: process.env.SHARD3_PORT || 27020
        }
    ],

    // Config servers
    configServers: [
        {
            host: process.env.CONFIG1_HOST || 'localhost',
            port: process.env.CONFIG1_PORT || 27021
        },
        {
            host: process.env.CONFIG2_HOST || 'localhost',
            port: process.env.CONFIG2_PORT || 27022
        },
        {
            host: process.env.CONFIG3_HOST || 'localhost',
            port: process.env.CONFIG3_PORT || 27023
        }
    ],

    // Mongos routers
    mongos: [
        {
            host: process.env.MONGOS1_HOST || 'localhost',
            port: process.env.MONGOS1_PORT || 27017
        },
        {
            host: process.env.MONGOS2_HOST || 'localhost',
            port: process.env.MONGOS2_PORT || 27024
        }
    ],

    // Sharding keys for collections
    shardKeys: {
        batches: { farmId: 'hashed' },
        products: { manufacturer: 'hashed' },
        users: { organization: 'hashed' },
        transactions: { timestamp: 1 }  // Range-based sharding for time series data
    },

    // Optional replica set configuration for each shard
    replicaSet: {
        name: 'rs',
        nodes: 3,
        arbiter: true
    },

    // Chunk size in MB
    chunkSize: 64
};

module.exports = {
    SHARD_CONFIG
};