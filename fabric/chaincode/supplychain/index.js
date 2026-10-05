'use strict';

const { Contract } = require('fabric-contract-api');

function transactionTimestamp(ctx) {
    const { seconds, nanos } = ctx.stub.getTxTimestamp();
    return (BigInt(seconds.toString()) * 1000n + BigInt(Math.floor(nanos / 1000000))).toString();
}

class SupplyChainContract extends Contract {

    async initLedger(ctx) {
        // Nothing to initialize
    }

    // Register a new product in the supply chain
    async registerProduct(ctx, id, type, origin, timestamp, certifications, metadata) {
        const existing = await ctx.stub.getState(id);
        if (existing && existing.length) throw new Error('RECORD_ALREADY_EXISTS');

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

        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());
        if (product.batchId) throw new Error("USE_COTTON_STATE_MACHINE");

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

        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());
        if (product.batchId) throw new Error("USE_COTTON_STATE_MACHINE");
        product.status = newStatus;

        if (additionalData) {
            const dataObj = JSON.parse(additionalData);
            const reserved = new Set(['batchId', 'quantity', 'quantityKg', 'rwaStatus', 'certificationHash',
                'fabricVerificationTxId', 'verifiedAt', 'verifiedBy', 'type', 'id', 'tokenizationId',
                'pendingTokenizationId', 'currentCustody', 'producer', 'farmId']);
            if (Object.keys(dataObj).some(key => reserved.has(key))) throw new Error('PROTECTED_RWA_FIELDS');
            // Merge application metadata only.
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

        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());
        if (product.batchId) throw new Error("USE_COTTON_STATE_MACHINE");

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
        const quantityKg = Number(quantity);
        if (!id || !farmId || !Number.isFinite(quantityKg) || quantityKg <= 0) throw new Error('INVALID_COTTON_BATCH');
        const existing = await ctx.stub.getState(id);
        if (existing && existing.length) throw new Error('BATCH_ALREADY_EXISTS');

        const batch = {
            id,
            batchId: id,
            origin: location,
            producer: farmId,
            quantityKg,
            certificationHash: null,
            createdAt: transactionTimestamp(ctx),
            verifiedAt: null,
            rwaStatus: 'PRODUCED',
            type: 'cotton',
            farmId,
            quantity: quantityKg,
            organic: organic === 'true',
            fairTrade: fairTrade === 'true',
            harvestDate,
            status: 'HARVESTED',
            location,
            currentCustody: farmId,
            custodyHistory: [{
                holder: farmId,
                timestamp: transactionTimestamp(ctx),
                location: location
            }],
            certifications: [],
            tokenizationId: null,
            history: [{
                type: 'Creation',
                actor: farmId,
                timestamp: transactionTimestamp(ctx),
                details: 'Cotton batch registered on blockchain'
            }]
        };

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(batch)));
        return JSON.stringify(batch);
    }

    async verifyCottonBatch(ctx, id, certificationHash) {
        if (!ctx.clientIdentity.assertAttributeValue('sfc.role', 'certifier')) throw new Error('CERTIFIER_REQUIRED');
        if (!/^0x[0-9a-fA-F]{64}$/.test(certificationHash) || /^0x0{64}$/.test(certificationHash)) {
            throw new Error('INVALID_CERTIFICATION_HASH');
        }
        const bytes = await ctx.stub.getState(id);
        if (!bytes || !bytes.length) throw new Error('BATCH_NOT_FOUND');
        const batch = JSON.parse(bytes.toString());
        if (batch.status !== 'STORED' || batch.rwaStatus !== 'PRODUCED') throw new Error('BATCH_NOT_VERIFIABLE');
        batch.certificationHash = certificationHash;
        batch.verifiedAt = transactionTimestamp(ctx);
        batch.verifiedBy = ctx.clientIdentity.getID();
        batch.fabricVerificationTxId = ctx.stub.getTxID();
        batch.rwaStatus = 'VERIFIED';
        await ctx.stub.putState(id, Buffer.from(JSON.stringify(batch)));
        ctx.stub.setEvent('CottonBatchVerified', Buffer.from(JSON.stringify(batch)));
        return JSON.stringify(batch);
    }

    async storeCottonBatch(ctx, id, warehouseId) {
        const batchAsBytes = await ctx.stub.getState(id);
        if (!batchAsBytes || batchAsBytes.length === 0) throw new Error(`Batch ${id} does not exist`);
        const batch = JSON.parse(batchAsBytes.toString());
        if (batch.type !== 'cotton' || batch.status !== 'HARVESTED') {
            throw new Error(`Batch ${id} must be harvested cotton to enter storage`);
        }
        batch.status = 'STORED';
        batch.location = warehouseId;
        batch.currentCustody = warehouseId;
        batch.history.push({
            type: 'Stored', actor: ctx.clientIdentity.getID(),
            timestamp: transactionTimestamp(ctx), details: `Stored at warehouse ${warehouseId}`
        });
        await ctx.stub.putState(id, Buffer.from(JSON.stringify(batch)));
        return JSON.stringify(batch);
    }

    // Request tokenization for a cotton batch
    async requestTokenization(ctx, requestId, batchId, quantity, warehouseId) {

        const batchAsBytes = await ctx.stub.getState(batchId);
        if (!batchAsBytes || batchAsBytes.length === 0) {
            throw new Error(`Batch ${batchId} does not exist`);
        }

        const batch = JSON.parse(batchAsBytes.toString());

        // Validate that the batch is in a warehouse and not already tokenized
        if (batch.status !== 'STORED') {
            throw new Error(`Batch ${batchId} must be in STORED status to be tokenized`);
        }
        if (batch.rwaStatus !== 'VERIFIED' || !batch.certificationHash) throw new Error('VERIFIED_BACKING_REQUIRED');
        if (batch.currentCustody !== warehouseId) throw new Error('WAREHOUSE_MISMATCH');
        if (batch.pendingTokenizationId) throw new Error('TOKENIZATION_ALREADY_PENDING');
        const existingRequest = await ctx.stub.getState(requestId);
        if (existingRequest && existingRequest.length) throw new Error('REQUEST_ALREADY_EXISTS');

        if (batch.tokenizationId) {
            throw new Error(`Batch ${batchId} has already been tokenized`);
        }

        // Validate the quantity
        const requestedQuantity = Number(quantity);
        if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > batch.quantity) {
            throw new Error(`Invalid tokenization quantity. Must be between 0 and ${batch.quantity}`);
        }

        // Create tokenization request
        const tokenizationRequest = {
            id: requestId,
            batchId,
            quantity: requestedQuantity,
            warehouseId,
            status: 'PENDING',
            timestamp: transactionTimestamp(ctx),
            requester: ctx.clientIdentity.getID(),
            approver: null,
            approvalTimestamp: null,
            ethereumTransactionId: null
        };

        // Store the tokenization request
        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(tokenizationRequest)));
        batch.pendingTokenizationId = requestId;

        // Update batch history
        batch.history.push({
            type: 'TokenizationRequested',
            actor: ctx.clientIdentity.getID(),
            timestamp: transactionTimestamp(ctx),
            details: `Tokenization requested for ${requestedQuantity} kg at warehouse ${warehouseId}`
        });

        await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));

        return JSON.stringify(tokenizationRequest);
    }

    // Approve a tokenization request
    async approveTokenizationRequest(ctx, requestId) {
        if (!ctx.clientIdentity.assertAttributeValue('sfc.role', 'certifier')) throw new Error('CERTIFIER_REQUIRED');

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
        request.approvalTimestamp = transactionTimestamp(ctx);

        // Store updated request
        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(request)));

        // Get the batch
        const batchAsBytes = await ctx.stub.getState(request.batchId);
        if (!batchAsBytes || batchAsBytes.length === 0) {
            throw new Error(`Batch ${request.batchId} does not exist`);
        }

        const batch = JSON.parse(batchAsBytes.toString());
        if (batch.rwaStatus !== 'VERIFIED' || batch.pendingTokenizationId !== requestId) throw new Error('VERIFIED_BACKING_REQUIRED');

        // Update batch history
        batch.history.push({
            type: 'TokenizationApproved',
            actor: ctx.clientIdentity.getID(),
            timestamp: transactionTimestamp(ctx),
            details: `Tokenization request ${requestId} approved for ${request.quantity} kg`
        });

        await ctx.stub.putState(request.batchId, Buffer.from(JSON.stringify(batch)));

        ctx.stub.setEvent('TokenizationRequested', Buffer.from(JSON.stringify({
            requestId, batchId: request.batchId, quantity: request.quantity,
            warehouseId: request.warehouseId
        })));

        return JSON.stringify(request);
    }

    // Complete tokenization with Ethereum transaction
    async completeTokenization(ctx, requestId, ethereumTransactionId) {
        if (!ctx.clientIdentity.assertAttributeValue('sfc.role', 'bridge')) throw new Error('BRIDGE_REQUIRED');
        if (!/^0x[0-9a-fA-F]{64}$/.test(ethereumTransactionId)) throw new Error('INVALID_ETHEREUM_RECEIPT');

        const requestAsBytes = await ctx.stub.getState(requestId);
        if (!requestAsBytes || requestAsBytes.length === 0) {
            throw new Error(`Tokenization request ${requestId} does not exist`);
        }

        const request = JSON.parse(requestAsBytes.toString());
        if (request.status === 'COMPLETED' && request.ethereumTransactionId === ethereumTransactionId) {
            const batch = JSON.parse((await ctx.stub.getState(request.batchId)).toString());
            return JSON.stringify({ request, batch });
        }

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
        batch.rwaStatus = 'TOKENIZED';
        batch.tokenizedKg = request.quantity;

        // Update batch history
        batch.history.push({
            type: 'TokenizationCompleted',
            actor: ctx.clientIdentity.getID(),
            timestamp: transactionTimestamp(ctx),
            details: `Tokenization completed on Ethereum with transaction ${ethereumTransactionId}`
        });

        await ctx.stub.putState(request.batchId, Buffer.from(JSON.stringify(batch)));

        return JSON.stringify({ request, batch });
    }

    async requestNFTMinting(ctx, productId, recipient, metadataURI) {
        const productAsBytes = await ctx.stub.getState(productId);
        if (!productAsBytes || productAsBytes.length === 0) throw new Error(`Product ${productId} does not exist`);
        const product = JSON.parse(productAsBytes.toString());
        if (product.status !== 'FINISHED' || product.nftTokenId) {
            throw new Error(`Product ${productId} must be finished and not already minted`);
        }
        if (!/^0x[0-9a-fA-F]{40}$/.test(recipient) || !metadataURI) {
            throw new Error('A valid recipient and metadata URI are required');
        }
        product.status = 'NFT_MINT_PENDING';
        await ctx.stub.putState(productId, Buffer.from(JSON.stringify(product)));
        ctx.stub.setEvent('NFTMintingRequested', Buffer.from(JSON.stringify({
            productId, productType: product.type, manufacturer: product.manufacturer,
            cottonBatchIds: product.batchIDs, recipient, metadataURI
        })));
        return JSON.stringify(product);
    }

    // Mint NFT for a product
    async mintNFT(ctx, productId, nftTokenId) {

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
            timestamp: transactionTimestamp(ctx),
            details: `NFT minted on Ethereum with token ID ${nftTokenId}`
        });

        await ctx.stub.putState(productId, Buffer.from(JSON.stringify(product)));

        return JSON.stringify(product);
    }

    // Create a finished product from cotton batches
    async createFinishedProduct(ctx, productId, productType, manufacturer, batchIds, productDate) {

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
                timestamp: transactionTimestamp(ctx)
            }],
            history: [{
                type: 'Creation',
                actor: manufacturer,
                timestamp: transactionTimestamp(ctx),
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
