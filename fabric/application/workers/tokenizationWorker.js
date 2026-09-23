/**
 * Tokenization Worker
 *
 * Processes tokenization requests from the queue
 */

const { QUEUE_CONFIG } = require('../config/queue');
const queueService = require('../services/queueService');
const { createConfiguredBridge } = require('../../../bridging/runtime');
const cacheService = require('../services/cacheService');
const notificationService = require('../notification-service');

class TokenizationWorker {
    constructor(bridge) { this.bridge = bridge; }
    /**
     * Start the worker
     */
    async start() {
        try {
            await require('../config/queue').initializeQueue();
            await require('../config/redis').initializeRedis();
            this.bridge ||= createConfiguredBridge();
            await this.bridge.connectToEthereum();
            await this.bridge.connectToFabric();
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
            const result = await this.bridge.processTokenizationOnMainnet({ batchId, quantity, warehouseId, requestId });

            // Update batch status
            batch.tokenizationId = result.transactionHash;
            batch.status = 'TOKENIZED';
            await cacheService.setBatch(batchId, batch);

            // Send notification
            await notificationService.notifyTokenization(
                'completed', result.transactionHash, batchId, { requestId, quantity }
            );

            console.log(`Tokenization completed for batch ${batchId}`);

        } catch (error) {
            console.error('Error processing tokenization:', error);

            // Send failure notification
            notificationService.notifySystem('Tokenization failed', `Request ${data.requestId}: ${error.message}`, 'danger');

            // Rethrow error for retry mechanism
            throw error;
        }
    }
}

// Create and start worker
const worker = new TokenizationWorker();
if (require.main === module) worker.start().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = worker;
module.exports.TokenizationWorker = TokenizationWorker;
