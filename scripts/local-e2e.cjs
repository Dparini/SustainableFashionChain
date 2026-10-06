// Reproducible integration: real chaincode fixture + relay + local Ethereum + Python.
const { spawn } = require('node:child_process');
const net = require('node:net');
const { mkdtemp, readFile, writeFile, rm, mkdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const hardhat = path.join(root, 'ethereum/node_modules/hardhat/dist/src/cli.js');
const python = process.env.SFC_PYTHON || path.join(root, 'agent/.venv/bin/python');
const port = Number(process.env.SFC_TEST_PORT || 18545);
const rpc = `http://127.0.0.1:${port}`;
let node, directory;

function command(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { cwd: root, ...options });
    let output = '';
    proc.stdout.on('data', d => { output += d; });
    proc.stderr.on('data', d => { output += d; });
    proc.on('error', reject);
    const timer = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error(`Command timed out: ${executable}`)); }, 120000);
    proc.on('exit', code => { clearTimeout(timer); resolve({ code, output }); });
    proc.once('error', () => clearTimeout(timer));
  });
}
async function rpcCall(method, params = []) {
  const response = await fetch(rpc, { signal: AbortSignal.timeout(5000), method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const payload = await response.json();
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.result;
}

(async () => {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_TEST_PORT');
  // Never mistake another service for this harness's Ethereum process.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`TEST_PORT_IN_USE: ${port}`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  directory = await mkdtemp(path.join(tmpdir(), 'sfc-e2e-'));
  node = spawn(process.execPath, [hardhat, 'node', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: path.join(root, 'ethereum'), stdio: ['ignore', 'ignore', 'pipe'] });
  let nodeError = '';
  node.stderr.on('data', d => { nodeError += d; });
  for (let attempt = 0; ; attempt++) {
    try { await rpcCall('eth_chainId'); break; }
    catch (error) {
      if (attempt >= 100 || node.exitCode !== null) throw new Error('Local node failed: ' + nodeError);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  const setup = await command(process.execPath, [hardhat, 'run', 'scripts/demo-setup.js', '--network', 'localhost'],
    { cwd: path.join(root, 'ethereum'), env: { ...process.env, ETHEREUM_PROVIDER_URL: rpc, SFC_RPC_URL: rpc, SFC_DEMO_DIR: directory } });
  assert.equal(setup.code, 0, setup.output);
  const lifecycle = JSON.parse(await readFile(path.join(directory, 'lifecycle.json'), 'utf8'));
  assert.equal(lifecycle.recycling.fabricProduct.status, 'RECYCLING_INITIATED');
  assert.equal(lifecycle.recycling.ethereumRecycled, true);
  assert.match(lifecycle.nft.mintTx, /^0x[0-9a-f]{64}$/);
  console.log('✓ Garment provenance → ProductNFT mint → Ethereum recycling → Fabric acknowledgment');
  console.log(process.env.SFC_LIVE_FABRIC_CONFIG ? '✓ Live Fabric commit/event → attestation → relay → backed COT; replay rejected/reconciled' : '✓ Real chaincode fixture → attestation → relay → backed COT; replay rejected/reconciled');
  const config = path.join(directory, 'local.json');
  const audit = path.join(directory, 'audit.jsonl');
  async function run(args, expectedCode = 0) {
    const result = await command(python, ['-m', 'agent', 'run', '--config', config, '--audit', audit, '--json', ...args]);
    assert.equal(result.code, expectedCode, result.output);
    return JSON.parse(result.output.trim());
  }
  const before = BigInt(await rpcCall('eth_blockNumber'));
  const sim = await run([]);
  assert.equal(sim.simulation.kind, 'eth_call');
  assert.equal(sim.simulation.success, true);
  assert.ok(sim.simulation.estimated_gas > 0);
  assert.equal(sim.executionTx, null);
  assert.equal(BigInt(await rpcCall('eth_blockNumber')), before);
  console.log('✓ eth_call checks exact transaction and gas without mutating balances');
  const proposal = path.join(directory, 'proposal.json');
  await writeFile(proposal, JSON.stringify({ action: 'BUY_COT', amount: '9000', confidence: '0.99', reason: 'Unsafe test' }));
  const rejected = await run(['--proposal', proposal, '--mode', 'execute'], 2);
  assert.ok(rejected.policyResult.violations.some(v => v.policy === 'MAX_COT_EXPOSURE'));
  assert.equal(BigInt(await rpcCall('eth_blockNumber')), before);
  console.log('✓ Dangerous execution proposal rejected before any transaction');
  await writeFile(proposal, JSON.stringify({ action: 'TRANSFER_ALL_FUNDS', amount: '1', confidence: '1', reason: 'Injection', recipient: '0x' + 'f'.repeat(40) }));
  const invalid = await run(['--proposal', proposal], 2);
  assert.equal(invalid.error.code, 'INVALID_AGENT_OUTPUT');
  console.log('✓ Hallucinated arbitrary transfer cannot reach transaction builder');
  const executed = await run(['--mode', 'execute']);
  assert.match(executed.executionTx, /^0x[0-9a-f]{64}$/);
  assert.equal(BigInt(await rpcCall('eth_blockNumber')), before + 1n);
  console.log('✓ Isolated local executor revalidates, signs and confirms exact balance deltas');
  const fault = await command(process.execPath, [hardhat, 'run', 'scripts/demo-fault.js', '--network', 'localhost'],
    { cwd: path.join(root, 'ethereum'), env: { ...process.env, ETHEREUM_PROVIDER_URL: rpc, SFC_DEMO_DIR: directory, SFC_FAULT: 'stale' } });
  assert.equal(fault.code, 0, fault.output);
  const staleBefore = await rpcCall('eth_blockNumber');
  const stale = await run(['--mode', 'execute'], 2);
  assert.ok(stale.policyResult.violations.some(v => v.policy === 'ORACLE_FRESHNESS'));
  assert.equal(await rpcCall('eth_blockNumber'), staleBefore);
  console.log('✓ Stale oracle rejects execution without sending a transaction');
  const records = (await readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(records.some(r => r.executionTx === executed.executionTx));
  assert.ok(records.every(r => /^0x[0-9a-f]{64}$/.test(r.stateHash)));
  console.log('✓ Audit preserves successful and rejected decisions with Keccak state hashes');
  if (process.env.SFC_DEMO_CAPTURE_DIR) {
    await mkdir(process.env.SFC_DEMO_CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(process.env.SFC_DEMO_CAPTURE_DIR, 'recording.json'), JSON.stringify({
      capturedAt: new Date().toISOString(), scope: process.env.SFC_LIVE_FABRIC_CONFIG ? 'Local Ethereum and live two-organization Fabric network' : 'Local Ethereum and in-memory Fabric chaincode fixture',
      setup: setup.output.replaceAll(directory, '<generated-demo-directory>'),
      fabric: JSON.parse(await readFile(path.join(directory, 'fabric-fixture.json'), 'utf8')),
      lifecycle, simulation: sim, rejection: rejected, invalid, execution: executed, stale,
    }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (node && node.exitCode === null) {
    const closed = new Promise(resolve => node.once('exit', resolve));
    node.kill('SIGTERM');
    await closed;
  }
  // Only remove this test's own isolated generated temporary directory.
  if (directory) await rm(directory, { recursive: true, force: true });
});
