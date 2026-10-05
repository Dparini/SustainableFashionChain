import { network } from 'hardhat';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { ethers } = await network.create();
const config = JSON.parse(readFileSync(resolve(process.env.SFC_DEMO_DIR || '../.runtime', 'local.json')));
const feed = await ethers.getContractAt('DemoPriceFeed', config.DemoPriceFeed);
if (process.env.SFC_FAULT === 'stale') {
  await (await feed.setPrice(172000000n, (await ethers.provider.getBlock('latest')).timestamp - 3601)).wait();
} else {
  throw new Error('UNKNOWN_DEMO_FAULT');
}
