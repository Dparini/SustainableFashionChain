const path = require('node:path');
const fs = require('node:fs');
const OptimizedBridge = require('./bridge');

function createConfiguredBridge() {
  const file = process.env.BRIDGE_CONFIG;
  const config = file ? JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) : {};
  const fromEnv = {
    ethereumRpcUrl: process.env.ETHEREUM_PROVIDER_URL,
    ethereumPrivateKey: process.env.ETHEREUM_PRIVATE_KEY,
    ethereumMnemonic: process.env.ETHEREUM_MNEMONIC,
    sidechainBridgeAddress: process.env.SIDECHAIN_BRIDGE_ADDRESS,
    cotTokenAddress: process.env.COT_TOKEN_ADDRESS,
    productNFTAddress: process.env.PRODUCT_NFT_ADDRESS,
    abiDir: process.env.BRIDGE_ABI_DIR,
    fabricConnectionProfilePath: process.env.FABRIC_CONNECTION_PROFILE,
    fabricWalletPath: process.env.FABRIC_WALLET_PATH,
    fabricUserName: process.env.FABRIC_IDENTITY,
    fabricChannelName: process.env.FABRIC_CHANNEL,
    fabricContractName: process.env.FABRIC_CHAINCODE,
  };
  Object.assign(config, Object.fromEntries(Object.entries(fromEnv).filter(([, value]) => value !== undefined)));
  config.fabricUserName ||= 'admin';
  config.fabricChannelName ||= 'sustainchannel';
  config.fabricContractName ||= 'supplychain';
  const required = ['ethereumRpcUrl', 'sidechainBridgeAddress', 'cotTokenAddress', 'productNFTAddress', 'abiDir', 'fabricConnectionProfilePath', 'fabricWalletPath'];
  const missing = required.filter(key => !config[key]);
  if (!config.ethereumPrivateKey && !config.ethereumMnemonic) missing.push('ethereumPrivateKey or ethereumMnemonic');
  if (missing.length) throw new Error(`Missing bridge configuration: ${missing.join(', ')}. Set BRIDGE_CONFIG to a JSON configuration file or provide the corresponding environment variables.`);
  return new OptimizedBridge(config);
}
module.exports = { createConfiguredBridge };
