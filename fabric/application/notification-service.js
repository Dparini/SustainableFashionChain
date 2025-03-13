/**
 * Real-time Notification Service
 *
 * This module provides WebSocket-based real-time notifications for supply chain events.
 * It broadcasts events to connected clients and maintains notification history.
 */

'use strict';

const WebSocket = require('ws');
const EventEmitter = require('events');
const uuid = require('uuid').v4;

class NotificationService {
    constructor() {
        this.emitter = new EventEmitter();
        this.clients = new Map(); // Map of client ID to WebSocket connection
        this.history = []; // Store recent notifications for new clients
        this.maxHistory = 50; // Maximum number of notifications to keep in history
    }

    /**
     * Initialize WebSocket server
     * @param {Object} server - HTTP server instance
     */
    initialize(server) {
        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', (ws) => {
            const clientId = uuid();
            this.clients.set(clientId, ws);

            console.log(`Client connected: ${clientId}`);

            // Send notification history to new client
            this.sendHistory(ws);

            // Handle client messages
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);

                    // Handle acknowledgment
                    if (data.type === 'ack' && data.id) {
                        console.log(`Notification ${data.id} acknowledged by client ${clientId}`);
                    }

                    // Handle subscription to specific channels
                    if (data.type === 'subscribe' && data.channels) {
                        ws.channels = data.channels;
                        console.log(`Client ${clientId} subscribed to channels: ${data.channels.join(', ')}`);
                    }
                } catch (error) {
                    console.error('Error processing client message:', error);
                }
            });

            // Handle client disconnection
            ws.on('close', () => {
                console.log(`Client disconnected: ${clientId}`);
                this.clients.delete(clientId);
            });

            // Set initial channels (all by default)
            ws.channels = ['batches', 'certifications', 'products', 'tokenization', 'system'];
        });

        console.log('WebSocket notification service initialized');
    }

    /**
     * Send notification history to a new client
     * @param {WebSocket} ws - WebSocket connection
     */
    sendHistory(ws) {
        if (this.history.length > 0) {
            const historyPacket = {
                type: 'history',
                notifications: this.history
            };
            ws.send(JSON.stringify(historyPacket));
        }
    }

    /**
     * Add notification to history
     * @param {Object} notification - Notification object
     */
    addToHistory(notification) {
        this.history.unshift(notification);

        // Trim history if it exceeds maximum size
        if (this.history.length > this.maxHistory) {
            this.history = this.history.slice(0, this.maxHistory);
        }
    }

    /**
     * Send notification to all connected clients
     * @param {Object} notification - Notification object
     */
    broadcast(notification) {
        // Add timestamp if not present
        if (!notification.timestamp) {
            notification.timestamp = new Date().toISOString();
        }

        // Add unique ID if not present
        if (!notification.id) {
            notification.id = uuid();
        }

        // Add to history
        this.addToHistory(notification);

        // Broadcast to connected clients
        this.clients.forEach((ws, clientId) => {
            // Only send if client is subscribed to this channel
            if (ws.readyState === WebSocket.OPEN &&
                (!notification.channel ||
                 ws.channels.includes(notification.channel))) {

                ws.send(JSON.stringify(notification));
            }
        });

        // Emit event for other server components
        this.emitter.emit('notification', notification);

        return notification;
    }

    /**
     * Send a batch-related notification
     * @param {string} event - Event type
     * @param {string} batchId - Batch ID
     * @param {Object} data - Additional data
     */
    notifyBatch(event, batchId, data = {}) {
        return this.broadcast({
            type: 'notification',
            channel: 'batches',
            event: event,
            title: this.getBatchTitle(event, batchId),
            message: this.getBatchMessage(event, batchId, data),
            batchId: batchId,
            data: data,
            severity: this.getSeverity(event),
            icon: 'box-seam'
        });
    }

    /**
     * Send a certification-related notification
     * @param {string} event - Event type
     * @param {string} certId - Certification ID
     * @param {string} batchId - Batch ID
     * @param {Object} data - Additional data
     */
    notifyCertification(event, certId, batchId, data = {}) {
        return this.broadcast({
            type: 'notification',
            channel: 'certifications',
            event: event,
            title: this.getCertificationTitle(event, certId),
            message: this.getCertificationMessage(event, certId, batchId, data),
            certId: certId,
            batchId: batchId,
            data: data,
            severity: this.getSeverity(event),
            icon: 'patch-check'
        });
    }

    /**
     * Send a product-related notification
     * @param {string} event - Event type
     * @param {string} productId - Product ID
     * @param {Object} data - Additional data
     */
    notifyProduct(event, productId, data = {}) {
        return this.broadcast({
            type: 'notification',
            channel: 'products',
            event: event,
            title: this.getProductTitle(event, productId),
            message: this.getProductMessage(event, productId, data),
            productId: productId,
            data: data,
            severity: this.getSeverity(event),
            icon: 'bag'
        });
    }

    /**
     * Send a tokenization-related notification
     * @param {string} event - Event type
     * @param {string} tokenId - Token ID
     * @param {string} batchId - Batch ID
     * @param {Object} data - Additional data
     */
    notifyTokenization(event, tokenId, batchId, data = {}) {
        return this.broadcast({
            type: 'notification',
            channel: 'tokenization',
            event: event,
            title: this.getTokenizationTitle(event, tokenId),
            message: this.getTokenizationMessage(event, tokenId, batchId, data),
            tokenId: tokenId,
            batchId: batchId,
            data: data,
            severity: this.getSeverity(event),
            icon: 'coin'
        });
    }

    /**
     * Send a system notification
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     * @param {string} severity - Notification severity
     */
    notifySystem(title, message, severity = 'info') {
        return this.broadcast({
            type: 'notification',
            channel: 'system',
            event: 'system',
            title: title,
            message: message,
            severity: severity,
            icon: 'info-circle'
        });
    }

    /**
     * Get batch notification title
     * @param {string} event - Event type
     * @param {string} batchId - Batch ID
     */
    getBatchTitle(event, batchId) {
        switch (event) {
            case 'created':
                return 'New Batch Created';
            case 'updated':
                return 'Batch Updated';
            case 'transferred':
                return 'Batch Custody Transferred';
            case 'stored':
                return 'Batch Stored in Warehouse';
            default:
                return `Batch ${batchId} ${event}`;
        }
    }

    /**
     * Get batch notification message
     * @param {string} event - Event type
     * @param {string} batchId - Batch ID
     * @param {Object} data - Additional data
     */
    getBatchMessage(event, batchId, data) {
        switch (event) {
            case 'created':
                return `New cotton batch ${batchId} has been registered by ${data.farmId || 'a producer'}.`;
            case 'updated':
                return `Batch ${batchId} information has been updated.`;
            case 'transferred':
                return `Batch ${batchId} custody transferred from ${data.fromCustody || 'previous holder'} to ${data.toCustody || 'new holder'}.`;
            case 'stored':
                return `Batch ${batchId} has been stored in warehouse ${data.warehouseId || 'unknown'}.`;
            default:
                return `An update has occurred for batch ${batchId}.`;
        }
    }

    /**
     * Get certification notification title
     * @param {string} event - Event type
     * @param {string} certId - Certification ID
     */
    getCertificationTitle(event, certId) {
        switch (event) {
            case 'added':
                return 'New Certification Added';
            case 'verified':
                return 'Certification Verified';
            case 'expiring':
                return 'Certification Expiring Soon';
            case 'expired':
                return 'Certification Expired';
            default:
                return `Certification ${certId} ${event}`;
        }
    }

    /**
     * Get certification notification message
     * @param {string} event - Event type
     * @param {string} certId - Certification ID
     * @param {string} batchId - Batch ID
     * @param {Object} data - Additional data
     */
    getCertificationMessage(event, certId, batchId, data) {
        switch (event) {
            case 'added':
                return `New ${data.certType || ''} certification ${certId} has been added to batch ${batchId}.`;
            case 'verified':
                return `Certification ${certId} for batch ${batchId} has been verified by ${data.verifier || 'a certifier'}.`;
            case 'expiring':
                return `Certification ${certId} for batch ${batchId} will expire in ${data.daysRemaining || 'few'} days.`;
            case 'expired':
                return `Certification ${certId} for batch ${batchId} has expired.`;
            default:
                return `An update has occurred for certification ${certId}.`;
        }
    }

    /**
     * Get product notification title
     * @param {string} event - Event type
     * @param {string} productId - Product ID
     */
    getProductTitle(event, productId) {
        switch (event) {
            case 'created':
                return 'New Product Created';
            case 'nft_minted':
                return 'Product NFT Minted';
            case 'verified':
                return 'Product Verification';
            default:
                return `Product ${productId} ${event}`;
        }
    }

    /**
     * Get product notification message
     * @param {string} event - Event type
     * @param {string} productId - Product ID
     * @param {Object} data - Additional data
     */
    getProductMessage(event, productId, data) {
        switch (event) {
            case 'created':
                return `New product ${productId} (${data.productType || 'unknown type'}) has been created by ${data.manufacturer || 'a manufacturer'}.`;
            case 'nft_minted':
                return `NFT has been minted for product ${productId} with token ID ${data.tokenId || 'unknown'}.`;
            case 'verified':
                return `Product ${productId} has been verified by ${data.verifier || 'someone'}.`;
            default:
                return `An update has occurred for product ${productId}.`;
        }
    }

    /**
     * Get tokenization notification title
     * @param {string} event - Event type
     * @param {string} tokenId - Token ID
     */
    getTokenizationTitle(event, tokenId) {
        switch (event) {
            case 'requested':
                return 'Tokenization Requested';
            case 'approved':
                return 'Tokenization Approved';
            case 'completed':
                return 'Tokenization Completed';
            case 'transferred':
                return 'Tokens Transferred';
            default:
                return `Tokenization ${event}`;
        }
    }

    /**
     * Get tokenization notification message
     * @param {string} event - Event type
     * @param {string} tokenId - Token ID
     * @param {string} batchId - Batch ID
     * @param {Object} data - Additional data
     */
    getTokenizationMessage(event, tokenId, batchId, data) {
        switch (event) {
            case 'requested':
                return `Tokenization has been requested for batch ${batchId} (${data.quantity || 'unknown'} kg).`;
            case 'approved':
                return `Tokenization request for batch ${batchId} has been approved.`;
            case 'completed':
                return `Tokenization completed for batch ${batchId}. Token ID: ${tokenId}.`;
            case 'transferred':
                return `Tokens for batch ${batchId} have been transferred from ${data.from || 'previous owner'} to ${data.to || 'new owner'}.`;
            default:
                return `A tokenization update has occurred for batch ${batchId}.`;
        }
    }

    /**
     * Get notification severity based on event type
     * @param {string} event - Event type
     */
    getSeverity(event) {
        // Map events to severity levels
        const severityMap = {
            created: 'info',
            updated: 'info',
            transferred: 'info',
            added: 'info',
            verified: 'success',
            expiring: 'warning',
            expired: 'danger',
            requested: 'info',
            approved: 'success',
            completed: 'success',
            nft_minted: 'success'
        };

        return severityMap[event] || 'info';
    }

    /**
     * Subscribe to notifications
     * @param {function} callback - Callback function
     */
    subscribe(callback) {
        this.emitter.on('notification', callback);
    }

    /**
     * Unsubscribe from notifications
     * @param {function} callback - Callback function
     */
    unsubscribe(callback) {
        this.emitter.off('notification', callback);
    }
}

// Create and export singleton instance
const notificationService = new NotificationService();
module.exports = notificationService;