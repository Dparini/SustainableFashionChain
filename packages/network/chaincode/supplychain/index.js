'use strict';

const { Contract } = require('fabric-contract-api');

class SupplyChainContract extends Contract {

    async initLedger(ctx) {
        console.info('============= Initializing Ledger ===========');
        // Nothing to initialize
    }

    // Register a new product in the supply chain
    async registerProduct(ctx, id, type, origin, timestamp, certifications, metadata) {
        console.info('============= Register Product ===========');

        const product = {
            id,
            type, // cotton, silk, or finished product
            origin,
            timestamp,
            certifications: JSON.parse(certifications),
            metadata: JSON.parse(metadata),
            status: 'REGISTERED',
            custodyHistory: [{
                holder: origin,
                timestamp: timestamp
            }]
        };

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(product)));
        return JSON.stringify(product);
    }

    // Transfer custody of a product to a new holder
    async transferCustody(ctx, id, newHolder, timestamp, location) {
        console.info('============= Transfer Custody ===========');

        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());

        // Add new custody record
        product.custodyHistory.push({
            holder: newHolder,
            timestamp: timestamp,
            location: location
        });

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(product)));
        return JSON.stringify(product);
    }

    // Update product status (e.g., harvested, processed, manufactured, etc.)
    async updateStatus(ctx, id, newStatus, timestamp, additionalData) {
        console.info('============= Update Status ===========');

        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());
        product.status = newStatus;

        if (additionalData) {
            const dataObj = JSON.parse(additionalData);
            // Merge additional data with product data
            Object.keys(dataObj).forEach(key => {
                product[key] = dataObj[key];
            });
        }

        product.statusHistory = product.statusHistory || [];
        product.statusHistory.push({
            status: newStatus,
            timestamp: timestamp
        });

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(product)));
        return JSON.stringify(product);
    }

    // Add certification to a product
    async addCertification(ctx, id, certType, certId, issuer, timestamp) {
        console.info('============= Add Certification ===========');

        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());

        const certification = {
            type: certType,
            id: certId,
            issuer: issuer,
            timestamp: timestamp
        };

        product.certifications = product.certifications || [];
        product.certifications.push(certification);

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(product)));
        return JSON.stringify(product);
    }

    // Register a cotton batch
    async registerCottonBatch(ctx, id, farmId, quantity, organic, fairTrade, harvestDate, location) {
        console.info('============= Register Cotton Batch ===========');

        const batch = {
            id,
            type: 'cotton',
            farmId,
            quantity: parseFloat(quantity),
            organic: organic === 'true',
            fairTrade: fairTrade === 'true',
            harvestDate,
            status: 'HARVESTED',
            location,
            currentCustody: farmId,
            custodyHistory: [{
                holder: farmId,
                timestamp: Date.now().toString(),
                location: location
            }],
            certifications: [],
            tokenizationId: null,
            history: [{
                type: 'Creation',
                actor: farmId,
                timestamp: Date.now().toString(),
                details: 'Cotton batch registered on blockchain'
            }]
        };

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(batch)));
        return JSON.stringify(batch);
    }

    // Request tokenization for a cotton batch
    async requestTokenization(ctx, requestId, batchId, quantity, warehouseId) {
        console.info('============= Request Tokenization ===========');

        const batchAsBytes = await ctx.stub.getState(batchId);
        if (!batchAsBytes || batchAsBytes.length === 0) {
            throw new Error(`Batch ${batchId} does not exist`);
        }

        const batch = JSON.parse(batchAsBytes.toString());

        // Validate that the batch is in a warehouse and not already tokenized
        if (batch.status !== 'STORED') {
            throw new Error(`Batch ${batchId} must be in STORED status to be tokenized`);
        }

        if (batch.tokenizationId) {
            throw new Error(`Batch ${batchId} has already been tokenized`);
        }

        // Validate the quantity
        const requestedQuantity = parseFloat(quantity);
        if (requestedQuantity <= 0 || requestedQuantity > batch.quantity) {
            throw new Error(`Invalid tokenization quantity. Must be between 0 and ${batch.quantity}`);
        }

        // Create tokenization request
        const tokenizationRequest = {
            id: requestId,
            batchId,
            quantity: requestedQuantity,
            warehouseId,
            status: 'PENDING',
            timestamp: Date.now().toString(),
            requester: ctx.clientIdentity.getID(),
            approver: null,
            approvalTimestamp: null,
            ethereumTransactionId: null
        };

        // Store the tokenization request
        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(tokenizationRequest)));

        // Update batch history
        batch.history.push({
            type: 'TokenizationRequested',
            actor: ctx.clientIdentity.getID(),
            timestamp: Date.now().toString(),
            details: `Tokenization requested for ${requestedQuantity} kg at warehouse ${warehouseId}`
        });

        await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));

        return JSON.stringify(tokenizationRequest);
    }

    // Approve a tokenization request
    async approveTokenizationRequest(ctx, requestId) {
        console.info('============= Approve Tokenization Request ===========');

        const requestAsBytes = await ctx.stub.getState(requestId);
        if (!requestAsBytes || requestAsBytes.length === 0) {
            throw new Error(`Tokenization request ${requestId} does not exist`);
        }

        const request = JSON.parse(requestAsBytes.toString());

        // Validate request is in PENDING status
        if (request.status !== 'PENDING') {
            throw new Error(`Tokenization request ${requestId} is not in PENDING status`);
        }

        // Update request status
        request.status = 'APPROVED';
        request.approver = ctx.clientIdentity.getID();
        request.approvalTimestamp = Date.now().toString();

        // Store updated request
        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(request)));

        // Get the batch
        const batchAsBytes = await ctx.stub.getState(request.batchId);
        if (!batchAsBytes || batchAsBytes.length === 0) {
            throw new Error(`Batch ${request.batchId} does not exist`);
        }

        const batch = JSON.parse(batchAsBytes.toString());

        // Update batch history
        batch.history.push({
            type: 'TokenizationApproved',
            actor: ctx.clientIdentity.getID(),
            timestamp: Date.now().toString(),
            details: `Tokenization request ${requestId} approved for ${request.quantity} kg`
        });

        await ctx.stub.putState(request.batchId, Buffer.from(JSON.stringify(batch)));

        return JSON.stringify(request);
    }

    // Complete tokenization with Ethereum transaction
    async completeTokenization(ctx, requestId, ethereumTransactionId) {
        console.info('============= Complete Tokenization ===========');

        const requestAsBytes = await ctx.stub.getState(requestId);
        if (!requestAsBytes || requestAsBytes.length === 0) {
            throw new Error(`Tokenization request ${requestId} does not exist`);
        }

        const request = JSON.parse(requestAsBytes.toString());

        // Validate request is in APPROVED status
        if (request.status !== 'APPROVED') {
            throw new Error(`Tokenization request ${requestId} is not in APPROVED status`);
        }

        // Update request status
        request.status = 'COMPLETED';
        request.ethereumTransactionId = ethereumTransactionId;

        // Store updated request
        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(request)));

        // Get the batch
        const batchAsBytes = await ctx.stub.getState(request.batchId);
        if (!batchAsBytes || batchAsBytes.length === 0) {
            throw new Error(`Batch ${request.batchId} does not exist`);
        }

        const batch = JSON.parse(batchAsBytes.toString());

        // Update batch with tokenization info
        batch.tokenizationId = ethereumTransactionId;
        batch.status = 'TOKENIZED';

        // Update batch history
        batch.history.push({
            type: 'TokenizationCompleted',
            actor: ctx.clientIdentity.getID(),
            timestamp: Date.now().toString(),
            details: `Tokenization completed on Ethereum with transaction ${ethereumTransactionId}`
        });

        await ctx.stub.putState(request.batchId, Buffer.from(JSON.stringify(batch)));

        return JSON.stringify({ request, batch });
    }

    // Mint NFT for a product
    async mintNFT(ctx, productId, nftTokenId) {
        console.info('============= Mint NFT ===========');

        const productAsBytes = await ctx.stub.getState(productId);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${productId} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());

        // Validate product hasn't already been minted as NFT
        if (product.nftTokenId) {
            throw new Error(`Product ${productId} already has an NFT token ID`);
        }

        // Update product with NFT token ID
        product.nftTokenId = nftTokenId;
        product.status = 'TOKENIZED';

        // Update product history
        if (!product.history) {
            product.history = [];
        }

        product.history.push({
            type: 'NFTMinted',
            actor: ctx.clientIdentity.getID(),
            timestamp: Date.now().toString(),
            details: `NFT minted on Ethereum with token ID ${nftTokenId}`
        });

        await ctx.stub.putState(productId, Buffer.from(JSON.stringify(product)));

        return JSON.stringify(product);
    }

    // Create a finished product from cotton batches
    async createFinishedProduct(ctx, productId, productType, manufacturer, batchIds, productDate) {
        console.info('============= Create Finished Product ===========');

        // Validate input
        if (!productId || !productType || !manufacturer || !batchIds || !productDate) {
            throw new Error('Missing required parameters');
        }

        const batchIdArray = JSON.parse(batchIds);
        if (!Array.isArray(batchIdArray) || batchIdArray.length === 0) {
            throw new Error('At least one batch ID is required');
        }

        // Check if product already exists
        const existingProductAsBytes = await ctx.stub.getState(productId);
        if (existingProductAsBytes && existingProductAsBytes.length > 0) {
            throw new Error(`Product ${productId} already exists`);
        }

        // Get and validate all batches
        const materials = [];
        for (const batchId of batchIdArray) {
            const batchAsBytes = await ctx.stub.getState(batchId);
            if (!batchAsBytes || batchAsBytes.length === 0) {
                throw new Error(`Batch ${batchId} does not exist`);
            }

            const batch = JSON.parse(batchAsBytes.toString());

            // Create material entry based on batch
            materials.push({
                batchId: batchId,
                type: batch.type,
                percentage: 100 / batchIdArray.length, // Equal distribution for now
                sustainable: batch.organic === true // Consider organic as sustainable
            });
        }

        // Create finished product
        const product = {
            id: productId,
            type: productType,
            manufacturer: manufacturer,
            productDate: productDate,
            materials: materials,
            batchIDs: batchIdArray,
            status: 'FINISHED',
            nftTokenId: null,
            custodyHistory: [{
                holder: manufacturer,
                timestamp: Date.now().toString()
            }],
            history: [{
                type: 'Creation',
                actor: manufacturer,
                timestamp: Date.now().toString(),
                details: `Finished product created from ${batchIdArray.length} batch(es)`
            }]
        };

        await ctx.stub.putState(productId, Buffer.from(JSON.stringify(product)));
        return JSON.stringify(product);
    }

    // Query a specific product
    async queryProduct(ctx, id) {
        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }
        return productAsBytes.toString();
    }

    // Query cotton batches by type
    async queryProductsByType(ctx, type) {
        const startKey = '';
        const endKey = '';
        const allResults = [];

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }

            if (record.type === type) {
                allResults.push(record);
            }
            result = await iterator.next();
        }

        return JSON.stringify(allResults);
    }

    // Query all batches
    async queryAllBatches(ctx) {
        const startKey = '';
        const endKey = '';
        const allResults = [];

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }

            // Only include cotton/silk batches
            if (record.type === 'cotton' || record.type === 'silk') {
                allResults.push(record);
            }
            result = await iterator.next();
        }

        return JSON.stringify(allResults);
    }

    // Query all products
    async queryAllProducts(ctx) {
        const startKey = '';
        const endKey = '';
        const allResults = [];

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }

            // Only include finished products
            if (record.type !== 'cotton' && record.type !== 'silk') {
                allResults.push(record);
            }
            result = await iterator.next();
        }

        return JSON.stringify(allResults);
    }

    // Get tokenization request by ID
    async getTokenizationRequest(ctx, requestId) {
        const requestAsBytes = await ctx.stub.getState(requestId);
        if (!requestAsBytes || requestAsBytes.length === 0) {
            throw new Error(`Tokenization request ${requestId} does not exist`);
        }
        return requestAsBytes.toString();
    }

    // Query all pending tokenization requests
    async queryPendingTokenizationRequests(ctx) {
        const startKey = '';
        const endKey = '';
        const allResults = [];

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }

            // Include only tokenization requests with PENDING status
            if (record.status === 'PENDING' && record.batchId) {
                allResults.push(record);
            }
            result = await iterator.next();
        }

        return JSON.stringify(allResults);
    }

    // Query all approved tokenization requests
    async queryApprovedTokenizationRequests(ctx) {
        const startKey = '';
        const endKey = '';
        const allResults = [];

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }

            // Include only tokenization requests with APPROVED status
            if (record.status === 'APPROVED' && record.batchId) {
                allResults.push(record);
            }
            result = await iterator.next();
        }

        return JSON.stringify(allResults);
    }
}

module.exports = SupplyChainContract;