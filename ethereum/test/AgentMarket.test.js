import { expect } from 'chai';
import { network } from 'hardhat';
const { ethers } = await network.create();

describe('Local market execution boundary', () => {
  let owner, trader, token, usd, feed, market;
  beforeEach(async () => {
    [owner, trader] = await ethers.getSigners();
    token = await (await ethers.getContractFactory('CotToken')).deploy(owner.address);
    const reserve = await ethers.getContractAt('CottonReserveRegistry', await token.reserveRegistry());
    await reserve.attestReserve(ethers.id('market-backing'), ethers.parseEther('10000'), ethers.id('cert'), ethers.id('verification'));
    usd = await (await ethers.getContractFactory('DemoUSD')).deploy();
    feed = await (await ethers.getContractFactory('DemoPriceFeed')).deploy();
    market = await (await ethers.getContractFactory('DemoCotMarket')).deploy(await token.getAddress(), await usd.getAddress(), await feed.getAddress());
    await feed.setPrice(172000000n, (await ethers.provider.getBlock('latest')).timestamp);
    await token.mintBatch('market-backing', ethers.parseEther('10000'), 'WH', await market.getAddress());
    await usd.mint(trader.address, 10000n * 10n**6n);
    await usd.mint(await market.getAddress(), 100000n * 10n**6n);
    await usd.connect(trader).approve(await market.getAddress(), 1000n * 10n**6n);
  });
  const deadline = async () => (await ethers.provider.getBlock('latest')).timestamp + 60;
  it('eth_call returns without changing state; buy transfers exact backed balances', async () => {
    const quantity = ethers.parseEther('500');
    const bound = 865n * 10n**6n;
    const expires = await deadline();
    await market.connect(trader).buy.staticCall(quantity, bound, expires);
    expect(await token.balanceOf(trader.address)).to.equal(0);
    await market.connect(trader).buy(quantity, bound, expires);
    expect(await token.balanceOf(trader.address)).to.equal(quantity);
    expect(await usd.balanceOf(trader.address)).to.equal(10000n * 10n**6n - 861720000n);
    expect(await token.totalSupply()).to.equal(ethers.parseEther('10000'));
  });
  it('stale, future and zero-price oracles reject at inclusion', async () => {
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    await feed.setPrice(172000000n, now - 3601);
    await expect(market.connect(trader).buy(ethers.parseEther('1'), 2000000n, await deadline())).to.be.revertedWith('STALE_ORACLE');
    await feed.setPrice(172000000n, now + 10000);
    await expect(market.quote(ethers.parseEther('1'), true)).to.be.revertedWith('INVALID_ORACLE_TIME');
    await feed.setPrice(0, now);
    await expect(market.quote(ethers.parseEther('1'), true)).to.be.revertedWith('INVALID_ORACLE_PRICE');
  });
  it('slippage bound, deadline and insufficient allowance fail closed', async () => {
    await expect(market.connect(trader).buy(ethers.parseEther('500'), 800000000n, await deadline())).to.be.revertedWith('MAX_SLIPPAGE');
    await expect(market.connect(trader).buy(ethers.parseEther('500'), 900000000n, 1)).to.be.revertedWith('TRADE_EXPIRED');
    await usd.connect(trader).approve(await market.getAddress(), 0);
    await expect(market.connect(trader).buy(ethers.parseEther('500'), 900000000n, await deadline())).to.be.revert(ethers);
    expect(await token.balanceOf(trader.address)).to.equal(0);
  });
  it('sell transfers exact balances and never creates new COT', async () => {
    await market.connect(trader).buy(ethers.parseEther('500'), 900000000n, await deadline());
    await token.connect(trader).approve(await market.getAddress(), ethers.parseEther('100'));
    const before = await usd.balanceOf(trader.address);
    await market.connect(trader).sell(ethers.parseEther('100'), 171000000n, await deadline());
    expect(await usd.balanceOf(trader.address)).to.equal(before + 171656000n);
    expect(await token.balanceOf(trader.address)).to.equal(ethers.parseEther('400'));
    expect(await token.totalSupply()).to.equal(ethers.parseEther('10000'));
  });
  it('portfolio bounds are enforced onchain even if a signer bypasses the Python engine', async () => {
    await usd.connect(trader).approve(await market.getAddress(), 10000n * 10n**6n);
    await expect(market.connect(trader).buy(ethers.parseEther('900'), 2000000000n, await deadline())).to.be.revertedWith('MAX_SINGLE_TRADE');
    // Start already near the exposure cap, then try a small trade within the size cap.
    await token.connect(owner).grantRole(await token.MINTER_ROLE(), owner.address);
    const reserve = await ethers.getContractAt('CottonReserveRegistry', await token.reserveRegistry());
    await reserve.attestReserve(ethers.id('near-cap'), ethers.parseEther('3000'), ethers.id('cert2'), ethers.id('v2'));
    await token.mintBatch('near-cap', ethers.parseEther('3000'), 'WH', trader.address);
    await expect(market.connect(trader).buy(ethers.parseEther('500'), 900000000n, await deadline())).to.be.revertedWith('MAX_COT_EXPOSURE');
  });

});
