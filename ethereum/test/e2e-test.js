import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { expect } from 'chai';
import { ethers } from 'ethers';

const require = createRequire(import.meta.url);
const axios = require('axios');
const api = axios.create({
  baseURL: process.env.API_URL || 'http://127.0.0.1:3001/api/v1',
  timeout: 30000,
});
const rpcUrl = process.env.ETHEREUM_PROVIDER_URL || 'http://127.0.0.1:8545';
const addressFile = process.env.CONTRACT_ADDRESSES_FILE || new URL('../contract-addresses.json', import.meta.url);
const addresses = JSON.parse(readFileSync(addressFile, 'utf8'));
const cotTokenAbi = JSON.parse(readFileSync(new URL('../artifacts/contracts/CotToken.sol/CotToken.json', import.meta.url), 'utf8')).abi;
const productNFTAbi = JSON.parse(readFileSync(new URL('../artifacts/contracts/ProductNFT.sol/ProductNFT.json', import.meta.url), 'utf8')).abi;
const batchId = `COTTON-${Date.now()}`;
const productId = `SHIRT-${Date.now()}`;
const cottonAmount = 3n;

async function waitFor(path, predicate) {
  let data;
  for (let attempt = 0; attempt < 40; attempt++) {
    ({ data } = await api.get(path));
    if (predicate(data)) return data;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${path}: ${JSON.stringify(data)}`);
}

describe('Live supply chain, tokenization, NFT and recycling flow', function () {
  this.timeout(120000);
  let provider;
  let signer;
  let ownerAddress;
  let tokenRecipientAddress;
  let cotToken;
  let productNFT;
  let tokenId;

  before(async () => {
    if (!process.env.API_TOKEN && !process.env.API_KEY) {
      throw new Error('Set API_TOKEN or API_KEY and start the API, Fabric, Ethereum node and bridge before test:e2e.');
    }
    const token = process.env.API_TOKEN || (await api.post('/token', {}, {
      headers: { 'x-api-key': process.env.API_KEY },
    })).data.token;
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    provider = new ethers.JsonRpcProvider(rpcUrl);
    signer = process.env.ETHEREUM_PRIVATE_KEY
      ? new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, provider)
      : await provider.getSigner(Number(process.env.ETHEREUM_SIGNER_INDEX || 0));
    ownerAddress = await signer.getAddress();
    tokenRecipientAddress = process.env.TOKEN_RECIPIENT_ADDRESS || ownerAddress;
    cotToken = new ethers.Contract(process.env.COT_TOKEN_ADDRESS || addresses.CotToken, cotTokenAbi, signer);
    productNFT = new ethers.Contract(process.env.PRODUCT_NFT_ADDRESS || addresses.ProductNFT, productNFTAbi, signer);
    await provider.getNetwork();
  });

  after(() => provider?.destroy());

  it('registers and stores a cotton batch on Fabric', async () => {
    const created = await api.post('/batches', {
      id: batchId, farmID: 'E2E Farm', quantity: 10,
      organic: true, fairTrade: true, harvestDate: '2026-09-27', location: 'Farm',
    });
    expect(created.status).to.equal(201);
    const stored = await api.post(`/batches/${batchId}/store`, { warehouseId: 'E2E-WH' });
    expect(stored.data.batch.status).to.equal('STORED');
  });

  it('mints CotTokens after Fabric approval and records the receipt on Fabric', async () => {
    const balanceBefore = await cotToken.balanceOf(tokenRecipientAddress);
    const requested = await api.post('/tokenize', {
      batchID: batchId, quantity: Number(cottonAmount), warehouseID: 'E2E-WH',
    });
    expect(requested.status).to.equal(201);
    const requestId = requested.data.requestID;
    const approved = await api.post(`/tokenize/${requestId}/approve`);
    expect(approved.data.request.status).to.equal('APPROVED');
    const completed = await waitFor(`/products/${requestId}`, data => data.status === 'COMPLETED');
    expect(completed.ethereumTransactionId).to.match(/^0x[\da-fA-F]{64}$/);
    expect(await cotToken.balanceOf(tokenRecipientAddress)).to.equal(balanceBefore + ethers.parseEther(cottonAmount.toString()));
    const batch = (await api.get(`/batches/${batchId}`)).data;
    expect(batch.status).to.equal('TOKENIZED');
  });

  it('creates a finished product from the tokenized cotton', async () => {
    const response = await api.post('/finished-products', {
      id: productId, type: 'finished', manufacturer: 'E2E Maker',
      batchIds: [batchId], productDate: '2026-09-27',
    });
    expect(response.status).to.equal(201);
    expect(response.data.product.status).to.equal('FINISHED');
    expect(response.data.product.batchIDs).to.deep.equal([batchId]);
  });

  it('mints a ProductNFT and records its token ID on Fabric', async () => {
    const response = await api.post(`/products/${productId}/mint-nft`, {
      ownerAddress, metadataURI: `ipfs://${productId}`,
    });
    expect(response.status).to.equal(202);
    expect(response.data.product.status).to.equal('NFT_MINT_PENDING');
    const minted = await waitFor(`/products/${productId}`, data => data.status === 'TOKENIZED' && data.nftTokenId);
    tokenId = BigInt(minted.nftTokenId);
    expect(await productNFT.ownerOf(tokenId)).to.equal(ownerAddress);
    expect(await productNFT.fabricToTokenId(productId)).to.equal(tokenId);
  });

  it('propagates Ethereum recycling to the Fabric product', async () => {
    const transaction = await productNFT.recycleProduct(tokenId);
    await transaction.wait();
    const recycled = await waitFor(`/products/${productId}`, data => data.status === 'RECYCLING_INITIATED');
    expect(recycled.nftTokenId).to.equal(tokenId.toString());
    expect((await productNFT.productData(tokenId)).recycled).to.equal(true);
  });
});
