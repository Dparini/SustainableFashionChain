'use strict';
const { ethers } = require('ethers');

// This relay has mint authority, never backing-attestation authority.
class VerifiedRelay {
  constructor({ token, fabric, confirmations = 1 }) {
    this.token = token;
    this.fabric = fabric;
    this.confirmations = confirmations;
  }

  async relay(event, recipient) {
    if (!/^(0x)?[a-fA-F0-9]{64}$/.test(event.fabricTxId || '')) throw new Error('MISSING_FABRIC_TX');
    if (!event.requestId || !event.batchId || !event.warehouseId) throw new Error('INVALID_BRIDGE_EVENT');
    const fabricTxId = `0x${event.fabricTxId.replace(/^0x/, '')}`;
    const amount = ethers.parseEther(String(event.quantity));
    if (amount <= 0n) throw new Error('INVALID_BRIDGE_AMOUNT');
    const eventId = await this.token.eventIdFor(fabricTxId, event.batchId, amount);
    let receipt;
    let replay = false;
    if (await this.token.processedEvents(eventId)) {
      // Recover mined receipt after a lost Fabric acknowledgment / process restart.
      const logs = await this.token.queryFilter(this.token.filters.VerifiedEventMinted(eventId));
      if (logs.length !== 1 || logs[0].args.recipient.toLowerCase() !== recipient.toLowerCase()) {
        throw new Error('REPLAY_RECONCILIATION_MISMATCH');
      }
      receipt = await logs[0].getTransactionReceipt();
      if (!receipt || receipt.status !== 1) throw new Error('MISSING_MINED_RECEIPT');
      await this.token.runner.provider.waitForTransaction(receipt.hash, this.confirmations);
      replay = true;
    } else {
      const tx = await this.token.mintVerifiedBatch(fabricTxId, event.batchId, amount,
        event.warehouseId, recipient);
      receipt = await tx.wait(this.confirmations);
      if (!receipt || receipt.status !== 1) throw new Error('MINT_NOT_CONFIRMED');
    }
    await this.fabric.submitTransaction('completeTokenization', event.requestId, receipt.hash);
    return { transactionHash: receipt.hash, eventId, reconciled: replay };
  }
}

module.exports = { VerifiedRelay };
