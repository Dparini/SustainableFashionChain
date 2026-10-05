import hardhatEthers from '@nomicfoundation/hardhat-ethers';
import hardhatMatchers from '@nomicfoundation/hardhat-ethers-chai-matchers';
import hardhatMocha from '@nomicfoundation/hardhat-mocha';
import 'dotenv/config';

const remoteNetworks = Object.fromEntries(['sepolia', 'mainnet'].flatMap(name => {
  const url = process.env[`${name.toUpperCase()}_URL`];
  return url ? [[name, { type: 'http', url, accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [] }]] : [];
}));

export default {
  plugins: [hardhatEthers, hardhatMatchers, hardhatMocha],
  solidity: {
    version: '0.8.18',
    settings: { optimizer: { enabled: true, runs: 200 }, debug: { revertStrings: 'debug' } },
  },
  networks: {
    default: { type: 'edr-simulated', chainId: 1337 },
    localhost: {
      type: 'http', url: process.env.ETHEREUM_PROVIDER_URL || 'http://127.0.0.1:8545',
      accounts: { mnemonic: 'test test test test test test test test test test test junk' },
    },
    ...remoteNetworks,
  },
};
