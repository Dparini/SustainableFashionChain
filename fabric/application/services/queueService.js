/**
 * Queue Service
 *
 * Provides message queue functionality for asynchronous operations
 */

const { getChannel, QUEUE_CONFIG } = require('../config/queue');

class QueueService {
    constructor() {
        this.channel = getChannel();
    }

    /**
     * Publish message to queue
     * @param {string} routingKey - Routing key
     * @param {Object} data - Message data
     * @param {Object} options - Additional options
     * @returns {Promise<boolean>} Success status
     */
    async publish(routingKey, data, options = {}) {
        try {
            const message = Buffer.from(JSON.stringify(data));

            await this.channel.publish(
                QUEUE_CONFIG.exchanges.EVENTS,
                routingKey,
                message,
                {
                    persistent: true,
                    ...options
                }
            );

            return true;
        } catch (error) {
            console.error(`Error publishing message to ${routingKey}:`, error);
            return false;
        }
    }

    /**
     * Consume messages from queue
     * @param {string} queueName - Queue name
     * @param {Function} handler - Message handler function
     * @param {Object} options - Additional options
     * @returns {Promise<void>}
     */
    async consume(queueName, handler, options = {}) {
        try {
            await this.channel.consume(
                queueName,
                async (msg) => {
                    if (!msg) return;

                    try {
                        const data = JSON.parse(msg.content.toString());
                        await handler(data);
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error(`Error processing message from ${queueName}:`, error);

                        // Check retry count
                        const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;

                        if (retryCount <= QUEUE_CONFIG.retry.count) {
                            // Retry with exponential backoff
                            const delay = QUEUE_CONFIG.retry.interval * Math.pow(QUEUE_CONFIG.retry.backoff, retryCount - 1);

                            setTimeout(() => {
                                this.channel.publish(
                                    QUEUE_CONFIG.exchanges.EVENTS,
                                    msg.fields.routingKey,
                                    msg.content,
                                    {
                                        headers: {
                                            'x-retry-count': retryCount
                                        }
                                    }
                                );
                                this.channel.ack(msg);
                            }, delay);
                        } else {
                            // Move to dead letter queue
                            console.log(`Moving message to DLQ after ${retryCount} retries`);
                            this.channel.reject(msg, false);
                        }
                    }
                },
                {
                    noAck: false,
                    ...options
                }
            );

            console.log(`Consuming messages from ${queueName}`);
        } catch (error) {
            console.error(`Error setting up consumer for ${queueName}:`, error);
            throw error;
        }
    }

    /**
     * Publish tokenization request
     * @param {Object} data - Tokenization data
     * @returns {Promise<boolean>} Success status
     */
    async publishTokenization(data) {
        return this.publish('tokenization.request', data);
    }

    /**
     * Publish notification
     * @param {Object} data - Notification data
     * @returns {Promise<boolean>} Success status
     */
    async publishNotification(data) {
        return this.publish('notification.send', data);
    }

    /**
     * Publish analytics event
     * @param {Object} data - Analytics data
     * @returns {Promise<boolean>} Success status
     */
    async publishAnalytics(data) {
        return this.publish('analytics.event', data);
    }

    /**
     * Publish email request
     * @param {Object} data - Email data
     * @returns {Promise<boolean>} Success status
     */
    async publishEmail(data) {
        return this.publish('email.send', data);
    }
}

// Export singleton instance
const queueService = new QueueService();
module.exports = queueService;