const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { connectionOptions, connectToFabric, readIdentity } = require('../bridging/fabric-client');
const { importMsp } = require('../fabric/application/enrollAdmin');

async function fixture(t, curve = 'prime256v1') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfc-gateway-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const msp = path.join(root, 'msp');
  await fs.mkdir(path.join(msp, 'signcerts'), { recursive: true });
  await fs.mkdir(path.join(msp, 'keystore'));
  const key = path.join(msp, 'keystore/key.pem');
  const cert = path.join(msp, 'signcerts/cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', `ec_paramgen_curve:${curve}`, '-nodes', '-keyout', key, '-out', cert, '-subj', '/CN=gateway-test', '-days', '1'], { stdio: 'ignore' });
  const walletPath = path.join(root, 'wallet');
  await importMsp(msp, walletPath, 'admin', 'Org1MSP');
  const profilePath = path.join(root, 'connection.json');
  const profile = {
    organizations: { Org1: { mspid: 'Org1MSP', peers: ['peer0.org1'] } },
    peers: { 'peer0.org1': { url: 'grpcs://peer0.org1:7051', tlsCACerts: { pem: await fs.readFile(cert, 'utf8') } } },
  };
  await fs.writeFile(profilePath, JSON.stringify(profile));
  return { root, msp, walletPath, profilePath, profile, identity: 'admin' };
}

for (const curve of ['prime256v1', 'secp384r1']) {
  test(`Fabric Gateway signs verifiable ${curve} messages from an existing wallet`, async t => {
    const f = await fixture(t, curve);
    const options = await connectionOptions(f);
    assert.equal(options.endpoint, 'localhost:7051');
    assert.equal(options.clientOptions['grpc.ssl_target_name_override'], 'peer0.org1');
    const message = Buffer.from('Fabric gateway signature regression');
    const signature = await options.signer(options.hash(message));
    const algorithm = curve === 'prime256v1' ? 'sha256' : 'sha384';
    const certificate = new crypto.X509Certificate(options.identity.credentials);
    assert.equal(crypto.verify(algorithm, message, certificate.publicKey, signature), true);
    assert.equal(crypto.verify(algorithm, Buffer.from('tampered'), certificate.publicKey, signature), false);
    const connection = await connectToFabric(f);
    assert.equal(typeof connection.contract.submitTransaction, 'function');
    connection.gateway.disconnect();
    connection.gateway.disconnect();
    assert.equal((await fs.stat(path.join(f.walletPath, 'admin.id'))).mode & 0o777, 0o600);
    await assert.rejects(importMsp(f.msp, f.walletPath, 'admin', 'Org1MSP'), { code: 'EEXIST' });
  });
}

test('Fabric Gateway rejects identity traversal and missing TLS roots', async t => {
  const f = await fixture(t);
  await assert.rejects(readIdentity(f.walletPath, '../admin'), /Invalid/);
  delete f.profile.peers['peer0.org1'].tlsCACerts;
  await fs.writeFile(f.profilePath, JSON.stringify(f.profile));
  await assert.rejects(connectionOptions(f), /TLS root/);
});

test('Fabric Gateway rejects a mismatched wallet key', async t => {
  const f = await fixture(t);
  const identity = await readIdentity(f.walletPath, 'admin');
  identity.credentials.privateKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  await fs.writeFile(path.join(f.walletPath, 'admin.id'), JSON.stringify(identity));
  await assert.rejects(connectionOptions(f), /do not match/);
});

test('Fabric Gateway preserves remote endpoints when localhost discovery is disabled', async t => {
  const f = await fixture(t);
  const config = await connectionOptions({ ...f, asLocalhost: false });
  assert.equal(config.endpoint, 'peer0.org1:7051');
});
