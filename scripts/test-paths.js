/**
 * Script to test path references in the restructured project
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Test importing services from their new locations
async function testServiceImports() {
  console.log('Testing service imports...');

  try {
    // Test importing analytics service
    const analyticsService = require('../services/analytics');
    console.log('✅ Successfully imported analytics service');
  } catch (error) {
    console.error('❌ Failed to import analytics service:', error.message);
  }

  try {
    // Test importing oracle service
    const oracleService = require('../services/oracle');
    console.log('✅ Successfully imported oracle service');
  } catch (error) {
    console.error('❌ Failed to import oracle service:', error.message);
  }

  try {
    // Test importing zk-proof service
    const zkProofService = require('../services/zk-proof');
    console.log('✅ Successfully imported zk-proof service');
  } catch (error) {
    console.error('❌ Failed to import zk-proof service:', error.message);
  }

  try {
    // Test importing cache service
    const cacheService = require('../services/cache');
    console.log('✅ Successfully imported cache service');
  } catch (error) {
    console.error('❌ Failed to import cache service:', error.message);
  }

  try {
    // Test importing queue service
    const queueService = require('../services/queue');
    console.log('✅ Successfully imported queue service');
  } catch (error) {
    console.error('❌ Failed to import queue service:', error.message);
  }
}

// Test file paths
function testFilePaths() {
  console.log('\nTesting file paths...');

  const pathsToCheck = [
    '../packages/bridging/bridge.js',
    '../packages/ethereum/hardhat.config.js',
    '../packages/network/application/index.js',
    '../services/analytics/index.js',
    '../services/oracle/index.js',
    '../services/zk-proof/index.js',
    '../services/cache/index.js',
    '../services/queue/index.js'
  ];

  pathsToCheck.forEach(p => {
    const fullPath = path.resolve(__dirname, p);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ File exists: ${p}`);
    } else {
      console.log(`❌ File doesn't exist: ${p}`);
    }
  });
}

// Main function
async function main() {
  console.log('Testing project structure...\n');

  await testServiceImports();
  testFilePaths();

  console.log('\nTesting complete!');
}

main().catch(error => {
  console.error('Test failed with error:', error);
});