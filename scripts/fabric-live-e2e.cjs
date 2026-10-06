// Opt-in live Fabric test. Downloads pinned official tools into generated state.
// Never runs the samples' broad network.sh down cleanup.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const samplesCommit = '5789681b4f4d24e58fa40f19a69f5496892374b6';
const fabricVersion = '2.5.16';
const caVersion = '1.5.15';
const nodeRuntime = 'hyperledger/fabric-nodeenv:2.5@sha256:17e2d447ca0de5b4e3f6950a1c9b24ecfdeecdd90e111e11d771970d35159bf1';
const id = crypto.randomBytes(4).toString('hex');
const project = `sfc-fabric-${id}`;
const networkName = `sfc_fabric_${id}`;
const runtime = path.join(root, '.runtime', project);
const samples = path.join(runtime, 'samples');
const network = path.join(samples, 'test-network');
const tools = path.join(root, '.runtime', 'fabric-tools');
let api, started = false;
let env;
function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env: env || process.env, ...options });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`${cmd} ${args.slice(0,2).join(' ')} failed (${code}): ${output.slice(-5000)}`)));
  });
}
async function asset(repo, version, namePrefix) {
  const response = await fetch(`https://api.github.com/repos/hyperledger/${repo}/releases/tags/v${version}`);
  if (!response.ok) throw new Error(`Official release metadata: HTTP ${response.status}`);
  const release = await response.json();
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  let name = `${namePrefix}-${os}-${arch}-${version}.tar.gz`;
  let selected = release.assets.find(a => a.name === name);
  if (!selected && os === 'darwin' && arch === 'arm64') {
    name = `${namePrefix}-darwin-amd64-${version}.tar.gz`;
    selected = release.assets.find(a => a.name === name); // Rosetta, as on existing Fabric installations.
  }
  if (!selected) throw new Error(`No official tool binary for ${name}`);
  const file = path.join(tools, selected.name);
  let content;
  try { content = await fs.readFile(file); }
  catch {
    const download = await fetch(selected.browser_download_url);
    if (!download.ok) throw new Error(`Official binary download: HTTP ${download.status}`);
    content = Buffer.from(await download.arrayBuffer());
    await fs.writeFile(file, content, { mode: 0o600 });
  }
  if (selected.digest && selected.digest.startsWith('sha256:') &&
      crypto.createHash('sha256').update(content).digest('hex') !== selected.digest.slice(7)) {
    throw new Error('OFFICIAL_BINARY_DIGEST_MISMATCH');
  }
  await run('tar', ['-xzf', file, '-C', samples]);
}
async function rewrite(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await rewrite(file);
    else if (/\.(yaml|yml|sh)$/.test(entry.name)) {
      let text = await fs.readFile(file, 'utf8');
      text = text.replaceAll('fabric_test', networkName)
        .replace(/hyperledger\/fabric-(peer|orderer|ccenv|nodeenv):latest/g, `hyperledger/fabric-$1:${fabricVersion}`)
        .replaceAll('hyperledger/fabric-ca:latest', `hyperledger/fabric-ca:${caVersion}`);
      text = text.replace(/(- CORE_VM_ENDPOINT=.*)/g, `$1\n      - CORE_CHAINCODE_NODE_RUNTIME=${nodeRuntime}`);
      await fs.writeFile(file, text);
    }
  }
}
(async () => {
  const names = (await run('docker', ['ps', '-a', '--format', '{{.Names}}'])).trim().split('\n');
  if (names.some(n => /^(peer0\.org[12]\.example\.com|orderer\.example\.com|ca_org[12]|ca_orderer|dev-peer0\.org[12]\.example\.com)/.test(n))) {
    throw new Error('EXISTING_FABRIC_NETWORK: refuse to reuse or remove user containers.');
  }
  await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
  await fs.mkdir(tools, { recursive: true, mode: 0o700 });
  console.log('Preparing pinned official Fabric tools and isolated test-network state...');
  await run('git', ['clone', '--depth', '1', 'https://github.com/hyperledger/fabric-samples.git', samples]);
  await run('git', ['fetch', '--depth', '1', 'origin', samplesCommit], { cwd: samples });
  await run('git', ['checkout', '--detach', samplesCommit], { cwd: samples });
  await asset('fabric', fabricVersion, 'hyperledger-fabric');
  await asset('fabric-ca', caVersion, 'hyperledger-fabric-ca');
  await rewrite(network);
  env = { ...process.env, PATH: path.join(samples,'bin') + path.delimiter + process.env.PATH,
    COMPOSE_PROJECT_NAME: project, CONTAINER_CLI_COMPOSE: `docker compose -p ${project}`,
    IMAGE_TAG: fabricVersion, CA_IMAGE_TAG: caVersion, FABRIC_VERSION: fabricVersion, CA_VERSION: caVersion };
  for (const name of ['peer','orderer','ccenv']) await run('docker',['pull',`hyperledger/fabric-${name}:${fabricVersion}`]);
  // Node chaincode runtime follows the major.minor tag, independently of peer patches.
  await run('docker',['pull',nodeRuntime]);
  await run('docker',['pull',`hyperledger/fabric-ca:${caVersion}`]);
  if (process.argv.includes('--prepare-only')) { console.log(`Prepared ${runtime}`); return; }
  console.log('Starting a live two-organization Fabric network with separate CA identities...');
  started = true;
  await run('bash', ['network.sh', 'up', 'createChannel', '-ca', '-c', 'sfcportfolio', '-r', '10', '-d', '2'], { cwd: network });
  const chaincode = path.join(runtime,'chaincode');
  await fs.mkdir(chaincode);
  for (const file of ['index.js','package.json','package-lock.json']) {
    await fs.copyFile(path.join(root,'fabric/chaincode/supplychain',file),path.join(chaincode,file));
  }
  await run('bash',['network.sh','deployCC','-c','sfcportfolio','-ccn','supplychain','-ccp',chaincode,'-ccl','javascript','-r','10','-d','2'],{cwd:network});
  const org = path.join(network,'organizations/peerOrganizations/org1.example.com');
  const caCert = path.join(network,'organizations/fabric-ca/org1/ca-cert.pem');
  const wallet = path.join(runtime,'wallet');
  const { importMsp } = require('../fabric/application/enrollAdmin');
  await importMsp(path.join(org,'users/User1@org1.example.com/msp'),wallet,'producer','Org1MSP');
  for (const role of ['certifier','bridge']) {
    const roleHome = path.join(runtime,'identities',role);
    await run('fabric-ca-client',['register','--caname','ca-org1','--id.name',`sfc-${role}`,
      '--id.secret',`local-${role}-demo`,'--id.type','client','--id.attrs',`sfc.role=${role}:ecert`,'--tls.certfiles',caCert],
      {env:{...env,FABRIC_CA_CLIENT_HOME:org}});
    await run('fabric-ca-client',['enroll','--home',roleHome,'--mspdir',path.join(roleHome,'msp'),
      '--caname','ca-org1','--tls.certfiles',caCert],
      {env:{...env,FABRIC_CA_CLIENT_URL:`https://sfc-${role}:local-${role}-demo@localhost:7054`}});
    await fs.copyFile(path.join(org,'msp/config.yaml'),path.join(roleHome,'msp/config.yaml'));
    await importMsp(path.join(roleHome,'msp'),wallet,role,'Org1MSP');
  }
  const profile = path.join(org,'connection-org1.json');
  const config = path.join(runtime,'fabric-config.json');
  await fs.writeFile(config,JSON.stringify({profilePath:profile,walletPath:wallet,channel:'sfcportfolio',chaincode:'supplychain',
    apiUrl:'http://127.0.0.1:18547/api/v1'}),{mode:0o600});
  const readerKey = crypto.randomBytes(32).toString('hex');
  api = spawn(process.execPath,['fabric/application/app.js'],{cwd:root,env:{...env,
    FABRIC_CONNECTION_PROFILE:profile,FABRIC_WALLET_PATH:wallet,FABRIC_IDENTITY:'producer',FABRIC_CHANNEL:'sfcportfolio',API_PORT:'18547',API_READ_KEY:readerKey,API_ADMIN_KEY:'',ADMIN_USERNAME:'',ADMIN_PASSWORD:'',JWT_SECRET:crypto.randomBytes(32).toString('hex'),START_BRIDGE:'false'},
    stdio:['ignore','ignore','pipe']});
  let apiError = '';api.stderr.on('data',d=>{apiError+=d;});
  for (let attempt=0;;attempt++) {
    try { const response=await fetch('http://127.0.0.1:18547/api/v1/health');if(response.ok)break; }
    catch {}
    if(attempt>=100 || api.exitCode!==null)throw new Error('LIVE_API_START_FAILED:'+apiError.slice(-2000));
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const auth=await fetch('http://127.0.0.1:18547/api/v1/token',{method:'POST',headers:{'x-api-key':readerKey}});
  assert.equal(auth.status,200);
  const token=(await auth.json()).token;
  console.log('Running live Fabric → emitted event → reserve attestation → Ethereum → guarded agent E2E...');
  const output = await run(process.execPath,['scripts/local-e2e.cjs'],{env:{...env,
    SFC_LIVE_FABRIC_CONFIG:config,SFC_FABRIC_READ_TOKEN:token,SFC_TEST_PORT:'18546'}});
  console.log(output);
  await fs.mkdir(path.join(root,'docs/assets'),{recursive:true});
  await fs.writeFile(path.join(root,'docs/assets/live-e2e-summary.json'),JSON.stringify({
    verifiedAt:new Date().toISOString(),fabricVersion,caVersion,samplesCommit,
    fabric:'live two-organization test network with CA identities',ethereum:'isolated local test chain',
    assertions:'Committed verification and approval; stable emitted event; backed COT mint; replay reject/reconcile; garment provenance; ProductNFT mint; Ethereum recycling acknowledged on Fabric; exact eth_call; unsafe proposal rejection; guarded execution; stale oracle rejection; audit hashes',result:'passed'},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(api && api.exitCode===null){const closed=new Promise(resolve=>api.once('exit',resolve));api.kill('SIGTERM');await closed;}
  if(started){
    // Only chaincode containers on this run's uniquely named network are ours.
    const ids=(await run('docker',['ps','-aq','--filter',`network=${networkName}`])).trim().split('\n').filter(Boolean);
    for(const container of ids){
      const data=JSON.parse(await run('docker',['inspect',container]))[0];
      if(data.Name.startsWith('/dev-peer'))await run('docker',['rm','-f',container]);
    }
    const compose=['compose','-p',project,'-f','compose/compose-test-net.yaml','-f','compose/docker/docker-compose-test-net.yaml','-f','compose/compose-ca.yaml','down','--volumes','--remove-orphans'];
    try{await run('docker',compose,{cwd:network});console.log('Stopped only the isolated Fabric test resources.');}
    catch(error){console.error('Generated network cleanup needs attention: '+error.message);process.exitCode=1;}
  }
});
