/**
 * Test integration of the restructured project
 */

'use strict';

const path = require('path');
const fs = require('fs');

console.log('Testing project integration...');

// Test main paths
const packageBridgingPath = path.resolve(__dirname, '../packages/bridging');
const packageEthereumPath = path.resolve(__dirname, '../packages/ethereum');
const packageNetworkPath = path.resolve(__dirname, '../packages/network');
const packageFrontendPath = path.resolve(__dirname, '../packages/frontend');

console.log(`Checking packages:`);
console.log(`- Bridging: ${fs.existsSync(packageBridgingPath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- Ethereum: ${fs.existsSync(packageEthereumPath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- Network: ${fs.existsSync(packageNetworkPath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- Frontend: ${fs.existsSync(packageFrontendPath) ? 'OK ✅' : 'Missing ❌'}`);

// Test services paths
const analyticsPath = path.resolve(__dirname, '../services/analytics/index.js');
const oraclePath = path.resolve(__dirname, '../services/oracle/index.js');
const zkProofPath = path.resolve(__dirname, '../services/zk-proof/index.js');
const cachePath = path.resolve(__dirname, '../services/cache/index.js');
const queuePath = path.resolve(__dirname, '../services/queue/index.js');

console.log(`\nChecking services:`);
console.log(`- Analytics: ${fs.existsSync(analyticsPath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- Oracle: ${fs.existsSync(oraclePath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- ZK Proof: ${fs.existsSync(zkProofPath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- Cache: ${fs.existsSync(cachePath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- Queue: ${fs.existsSync(queuePath) ? 'OK ✅' : 'Missing ❌'}`);

// Test key files
const bridgeJsPath = path.resolve(__dirname, '../packages/bridging/bridge.js');
const unifiedDeployPath = path.resolve(__dirname, '../scripts/unified-deploy.js');

console.log(`\nChecking key files:`);
console.log(`- bridge.js: ${fs.existsSync(bridgeJsPath) ? 'OK ✅' : 'Missing ❌'}`);
console.log(`- unified-deploy.js: ${fs.existsSync(unifiedDeployPath) ? 'OK ✅' : 'Missing ❌'}`);

console.log('\nTest completed!');