/**
 * Notification Worker
 *
 * Processes notifications from the queue
 */

const { QUEUE_CONFIG } = require('../config/queue');
const queueService = require('../services/queueService');
const notificationService = require('../services/notificationService');
const emailService = require('../utils/emailService');

class NotificationWorker {
    /**
     * Start the worker
     */
    async start() {
        try {
            await queueService.consume(
                QUEUE_CONFIG.queues.NOTIFICATION,
                this.processNotification.bind(this)
            );
            console.log('Notification worker started');
        } catch (error) {
            console.error('Error starting notification worker:', error);
            throw error;
        }
    }

    /**
     * Process notification
     * @param {Object} data - Notification data
     */
    async processNotification(data) {
        console.log('Processing notification:', data);

        try {
            const { type, recipients, message, metadata } = data;

            // Send web notification
            await notificationService.broadcast({
                type,
                message,
                metadata,
                timestamp: new Date().toISOString()
            });

            // Send email notifications if required
            if (data.sendEmail && recipients && recipients.length > 0) {
                for (const recipient of recipients) {
                    await emailService.sendNotificationEmail(
                        recipient.email,
                        message.title,
                        message.body,
                        metadata.actionUrl,
                        metadata.actionText
                    );
                }
            }

            console.log(`Notification processed successfully: ${type}`);

        } catch (error) {
            console.error('Error processing notification:', error);
            throw error;
        }
    }

    /**
     * Process email notification
     * @param {Object} data - Email notification data
     */
    async processEmailNotification(data) {
        try {
            const { to, subject, html, text } = data;
            await emailService.sendEmail(to, subject, html, text);
            console.log(`Email sent to ${to}`);
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }
}

// Create and start worker
const worker = new NotificationWorker();
worker.start().catch(console.error);

module.exports = worker;