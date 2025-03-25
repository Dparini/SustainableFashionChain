/**
 * Message Queue Configuration
 *
 * Configures RabbitMQ connection and queues for asynchronous operations
 */

const amqp = require('amqplib');

// Queue configuration
const QUEUE_CONFIG = {
    // Connection config
    connection: {
        protocol: 'amqp',
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: process.env.RABBITMQ_PORT || 5672,
        username: process.env.RABBITMQ_USER || 'guest',
        password: process.env.RABBITMQ_PASS || 'guest',
        vhost: process.env.RABBITMQ_VHOST || '/',
        heartbeat: 60
    },

    // Queue names
    queues: {
        TOKENIZATION: 'tokenization_queue',
        NOTIFICATION: 'notification_queue',
        ANALYTICS: 'analytics_queue',
        EMAIL: 'email_queue'
    },

    // Exchange names
    exchanges: {
        EVENTS: 'events_exchange'
    },

    // Routing keys
    routingKeys: {
        TOKENIZATION: 'tokenization.*',
        NOTIFICATION: 'notification.*',
        ANALYTICS: 'analytics.*',
        EMAIL: 'email.*'
    },

    // Retry configuration
    retry: {
        count: 3,
        interval: 1000, // 1 second
        backoff: 2 // Exponential backoff multiplier
    }
};

let connection = null;
let channel = null;

/**
 * Initialize RabbitMQ connection
 * @returns {Promise<void>}
 */
const initializeQueue = async () => {
    try {
        // Create connection
        connection = await amqp.connect(QUEUE_CONFIG.connection);

        // Create channel
        channel = await connection.createChannel();

        // Setup exchanges
        await channel.assertExchange(QUEUE_CONFIG.exchanges.EVENTS, 'topic', {
            durable: true
        });

        // Setup queues
        for (const [name, queueName] of Object.entries(QUEUE_CONFIG.queues)) {
            await channel.assertQueue(queueName, {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': `${queueName}_dlx`,
                    'x-dead-letter-routing-key': 'dead-letter'
                }
            });

            // Create dead letter queue
            await channel.assertQueue(`${queueName}_dlq`, {
                durable: true
            });

            // Create dead letter exchange
            await channel.assertExchange(`${queueName}_dlx`, 'direct', {
                durable: true
            });

            // Bind dead letter queue to exchange
            await channel.bindQueue(
                `${queueName}_dlq`,
                `${queueName}_dlx`,
                'dead-letter'
            );

            // Bind queue to main exchange
            await channel.bindQueue(
                queueName,
                QUEUE_CONFIG.exchanges.EVENTS,
                QUEUE_CONFIG.routingKeys[name]
            );
        }

        console.log('Message queue initialized successfully');

        // Handle connection events
        connection.on('error', (error) => {
            console.error('RabbitMQ connection error:', error);
        });

        connection.on('close', () => {
            console.log('RabbitMQ connection closed');
            // Attempt to reconnect after delay
            setTimeout(initializeQueue, 5000);
        });

    } catch (error) {
        console.error('Failed to initialize message queue:', error);
        throw error;
    }
};

/**
 * Get channel instance
 * @returns {Object} RabbitMQ channel
 */
const getChannel = () => {
    if (!channel) {
        throw new Error('Message queue not initialized');
    }
    return channel;
};

/**
 * Close queue connection
 * @returns {Promise<void>}
 */
const closeQueue = async () => {
    try {
        if (channel) {
            await channel.close();
        }
        if (connection) {
            await connection.close();
        }
    } catch (error) {
        console.error('Error closing queue connection:', error);
        throw error;
    }
};

module.exports = {
    initializeQueue,
    getChannel,
    closeQueue,
    QUEUE_CONFIG
};