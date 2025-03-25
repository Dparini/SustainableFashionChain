/**
 * Tokenization Worker
 *
 * Processes tokenization requests from the queue
 */

const { QUEUE_CONFIG } = require('../config/queue');
const queueService = require('../services/queueService');
const bridge = require('../../../bridging/bridge');
const cacheService = require('../services/cacheService');
const notificationService = require('../services/notificationService');

class TokenizationWorker {
    /**
     * Start the worker
     */
    async start() {
        try {
            await queueService.consume(
                QUEUE_CONFIG.queues.TOKENIZATION,
                this.processTokenization.bind(this)
            );
            console.log('Tokenization worker started');
        } catch (error) {
            console.error('Error starting tokenization worker:', error);
            throw error;
        }
    }

    /**
     * Process tokenization request
     * @param {Object} data - Tokenization request data
     */
    async processTokenization(data) {
        console.log('Processing tokenization request:', data);

        try {
            const { batchId, requestId, quantity, warehouseId } = data;

            // Verify batch exists and is eligible for tokenization
            const batch = await cacheService.getBatch(batchId);
            if (!batch) {
                throw new Error(`Batch ${batchId} not found`);
            }

            if (batch.status !== 'STORED') {
                throw new Error(`Batch ${batchId} is not in STORED status`);
            }

            if (batch.tokenizationId) {
                throw new Error(`Batch ${batchId} is already tokenized`);
            }

            // Call bridge service to perform tokenization
            const result = await bridge.tokenizeBatch(batchId, quantity, warehouseId);

            // Update batch status
            batch.tokenizationId = result.transactionHash;
            batch.status = 'TOKENIZED';
            await cacheService.setBatch(batchId, batch);

            // Send notification
            await notificationService.notifyTokenization(
                requestId,
                batchId,
                result.transactionHash,
                quantity
            );

            console.log(`Tokenization completed for batch ${batchId}`);

        } catch (error) {
            console.error('Error processing tokenization:', error);

            // Send failure notification
            await notificationService.notifyTokenizationFailure(
                data.requestId,
                data.batchId,
                error.message
            );

            // Rethrow error for retry mechanism
            throw error;
        }
    }
}

// Create and start worker
const worker = new TokenizationWorker();
worker.start().catch(console.error);

module.exports = worker;