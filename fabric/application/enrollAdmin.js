'use strict';

// Use the maintained Go Fabric CA client; no legacy JavaScript crypto SDK.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { X509Certificate, createPrivateKey } = require('node:crypto');
const { defaultProfile, defaultWallet } = require('../../bridging/fabric-client');
const run = promisify(execFile);

async function importMsp(mspPath, walletPath, label, mspId) {
    if (!/^[\w.-]+$/.test(label) || ['.', '..'].includes(label)) throw new Error('Invalid identity label');
    const readSingle = async directory => {
        const files = (await fs.readdir(directory, { withFileTypes: true })).filter(file => file.isFile());
        if (files.length !== 1) throw new Error(`Expected one credential file in ${directory}`);
        return fs.readFile(path.join(directory, files[0].name), 'utf8');
    };
    const certificate = await readSingle(path.join(mspPath, 'signcerts'));
    const privateKey = await readSingle(path.join(mspPath, 'keystore'));
    if (!new X509Certificate(certificate).checkPrivateKey(createPrivateKey(privateKey))) {
        throw new Error('MSP certificate and private key do not match');
    }
    await fs.mkdir(walletPath, { recursive: true, mode: 0o700 });
    // Never overwrite an existing identity or relax its permissions.
    await fs.writeFile(path.join(walletPath, `${label}.id`), JSON.stringify({
        credentials: { certificate, privateKey }, mspId, type: 'X.509', version: 1,
    }), { mode: 0o600, flag: 'wx' });
}

async function main() {
    const walletPath = process.env.FABRIC_WALLET_PATH || defaultWallet;
    const label = process.env.FABRIC_IDENTITY || 'admin';
    if (!/^[\w.-]+$/.test(label) || ['.', '..'].includes(label)) throw new Error('Invalid identity label');
    try {
        await fs.access(path.join(walletPath, `${label}.id`));
        console.log(`Identity ${label} already exists in the wallet`);
        return;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const profilePath = process.env.FABRIC_CONNECTION_PROFILE || defaultProfile;
    const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
    const organization = profile.organizations?.[process.env.FABRIC_ORG || 'Org1'];
    const mspId = process.env.FABRIC_MSP_ID || organization?.mspid;
    if (!mspId) throw new Error('FABRIC_MSP_ID or an organization MSP ID is required');
    if (process.env.FABRIC_MSP_PATH) {
        await importMsp(process.env.FABRIC_MSP_PATH, walletPath, label, mspId);
        return;
    }
    const caName = process.env.FABRIC_CA_NAME || organization?.certificateAuthorities?.[0];
    const ca = profile.certificateAuthorities?.[caName];
    if (!ca?.url) throw new Error('CA not found in connection profile; set FABRIC_CA_NAME');
    if (!process.env.FABRIC_CA_ENROLLMENT_SECRET) throw new Error('FABRIC_CA_ENROLLMENT_SECRET is required, or use FABRIC_MSP_PATH to import an enrolled identity');
    const url = new URL(ca.url);
    url.username = process.env.FABRIC_CA_ENROLLMENT_ID || 'admin';
    url.password = process.env.FABRIC_CA_ENROLLMENT_SECRET;
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sfc-ca-'));
    try {
        const args = ['enroll', '--home', home, '--mspdir', path.join(home, 'msp')];
        if (ca.caName) args.push('--caname', ca.caName);
        if (url.protocol === 'https:') {
            const roots = ca.tlsCACerts?.pem || (ca.tlsCACerts?.path && await fs.readFile(path.resolve(path.dirname(profilePath), ca.tlsCACerts.path)));
            if (!roots) throw new Error('CA TLS root certificate is required');
            const rootPath = path.join(home, 'ca.pem');
            await fs.writeFile(rootPath, Array.isArray(roots) ? roots.join('\n') : roots);
            args.push('--tls.certfiles', rootPath);
        }
        try {
            // Pass credentials through the environment, never shell interpolation or argv.
            await run(process.env.FABRIC_CA_CLIENT_BIN || 'fabric-ca-client', args, {
                env: { ...process.env, FABRIC_CA_CLIENT_URL: url.toString() }, timeout: 60000,
            });
        } catch (error) {
            // CA output may contain the enrollment URL; do not log captured output.
            throw new Error(error.code === 'ENOENT' ? 'Install the Fabric CA client binary or set FABRIC_CA_CLIENT_BIN' : 'Fabric CA enrollment failed; check CA connectivity, TLS and enrollment credentials');
        }
        await importMsp(path.join(home, 'msp'), walletPath, label, mspId);
        console.log(`Enrolled ${label} into the Fabric wallet`);
    } finally {
        await fs.rm(home, { recursive: true, force: true });
    }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { importMsp, main };
