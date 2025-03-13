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

    // Query a specific product
    async queryProduct(ctx, id) {
        const productAsBytes = await ctx.stub.getState(id);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }
        return productAsBytes.toString();
    }

    // Query products by type
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
}

module.exports = SupplyChainContract;