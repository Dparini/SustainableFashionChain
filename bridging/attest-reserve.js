'use strict';
const { ethers } = require('ethers');
const fs = require('node:fs/promises');
const path = require('node:path');
const { connectToFabric } = require('./fabric-client');

async function main() {
  const batchId = process.argv[2];
  if (!batchId) throw new Error('Usage: node bridging/attest-reserve.js <batchId>');
  const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_PROVIDER_URL || 'http://127.0.0.1:8545');
  let fabric;
  try {
    if (![1337n, 31337n].includes((await provider.getNetwork()).chainId)) throw new Error('LOCAL_CHAIN_REQUIRED');
    const signer = process.env.SFC_ATTESTOR_KEY ? new ethers.Wallet(process.env.SFC_ATTESTOR_KEY, provider)
      : process.env.SFC_ATTESTOR_LOCAL_INDEX !== undefined ? await provider.getSigner(Number(process.env.SFC_ATTESTOR_LOCAL_INDEX)) : null;
    if (!signer) throw new Error('EXPLICIT_ATTESTOR_SIGNER_REQUIRED');
    fabric = await connectToFabric({ identity: process.env.FABRIC_CERTIFIER_IDENTITY || 'certifier' });
    const batch = JSON.parse((await fabric.contract.evaluateTransaction('queryProduct', batchId)).toString());
    if (!['VERIFIED', 'TOKENIZED'].includes(batch.rwaStatus) || batch.batchId !== batchId || !batch.certificationHash || !batch.fabricVerificationTxId) {
      throw new Error('VERIFIED_FABRIC_BATCH_REQUIRED');
    }
    const file = process.env.CONTRACT_ADDRESSES_FILE || path.resolve(__dirname, '../ethereum/contract-addresses.json');
    const addresses = JSON.parse(await fs.readFile(file));
    const abi = JSON.parse(await fs.readFile(path.resolve(__dirname, '../ethereum/artifacts/contracts/CottonReserveRegistry.sol/CottonReserveRegistry.json'))).abi;
    const registry = new ethers.Contract(addresses.CottonReserveRegistry, abi, signer);
    const tx = await registry.attestReserve(ethers.id(batchId), ethers.parseEther(String(batch.quantityKg)),
      batch.certificationHash, '0x' + batch.fabricVerificationTxId.replace(/^0x/, ''));
    const receipt = await tx.wait();
    console.log(JSON.stringify({ batchId, verifiedKg: batch.quantityKg, certificationHash: batch.certificationHash, attestationTx: receipt.hash }));
  } finally { fabric?.gateway.disconnect(); provider.destroy(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
