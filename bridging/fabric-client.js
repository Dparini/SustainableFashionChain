'use strict';

// Shared Fabric 2.4+ Gateway connection, retaining existing X.509 wallet files.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const grpc = require('@grpc/grpc-js');
const { connect, signers, hash } = require('@hyperledger/fabric-gateway');

const defaultProfile = path.resolve(__dirname, '../fabric/network/organizations/peerOrganizations/org1.example.com/connection-org1.json');
const defaultWallet = path.resolve(__dirname, '../fabric/application/wallet');

async function readIdentity(walletPath, label) {
  if (!/^[\w.-]+$/.test(label) || label === '.' || label === '..') throw new Error('Invalid Fabric identity label');
  const identity = JSON.parse(await fs.readFile(path.join(walletPath, `${label}.id`), 'utf8'));
  if (identity.type !== 'X.509' || !identity.mspId || !identity.credentials?.certificate || !identity.credentials?.privateKey) {
    throw new Error('A complete X.509 Fabric wallet identity is required');
  }
  return identity;
}

async function connectionOptions(options = {}) {
  const profilePath = options.profilePath || process.env.FABRIC_CONNECTION_PROFILE || defaultProfile;
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  const identity = await readIdentity(options.walletPath || process.env.FABRIC_WALLET_PATH || defaultWallet,
    options.identity || process.env.FABRIC_IDENTITY || 'admin');
  const organization = Object.values(profile.organizations || {}).find(org => org.mspid === identity.mspId);
  const peerName = options.peerName || process.env.FABRIC_PEER_NAME || organization?.peers?.[0];
  const peer = profile.peers?.[peerName];
  if (!peer?.url) throw new Error(`Gateway peer ${peerName || '(unspecified)'} is missing from the connection profile`);
  const url = new URL(options.endpoint || process.env.FABRIC_GATEWAY_ENDPOINT || peer.url);
  const localhost = options.asLocalhost ?? process.env.FABRIC_AS_LOCALHOST !== 'false';
  const endpoint = `${localhost ? 'localhost' : url.hostname}:${url.port || '7051'}`;
  let credentials;
  if (url.protocol === 'grpcs:') {
    const roots = peer.tlsCACerts?.pem || (peer.tlsCACerts?.path && await fs.readFile(path.resolve(path.dirname(profilePath), peer.tlsCACerts.path)));
    if (!roots) throw new Error('TLS root certificate is required for the Fabric Gateway');
    credentials = grpc.credentials.createSsl(Buffer.from(Array.isArray(roots) ? roots.join('\n') : roots));
  } else if (url.protocol === 'grpc:') {
    credentials = grpc.credentials.createInsecure();
  } else {
    throw new Error('Fabric Gateway endpoint must use grpc:// or grpcs://');
  }
  const privateKey = crypto.createPrivateKey(identity.credentials.privateKey);
  const certificate = new crypto.X509Certificate(identity.credentials.certificate);
  if (!certificate.checkPrivateKey(privateKey)) throw new Error('Fabric certificate and private key do not match');
  const curve = privateKey.asymmetricKeyDetails?.namedCurve;
  if (!['prime256v1', 'secp384r1'].includes(curve)) throw new Error('Fabric identity must use P-256 or P-384');
  const authority = options.hostAlias || process.env.FABRIC_GATEWAY_HOST_ALIAS || peer.grpcOptions?.['ssl-target-name-override'] || url.hostname;
  return {
    endpoint, credentials,
    clientOptions: { 'grpc.ssl_target_name_override': authority, 'grpc.default_authority': authority },
    identity: { mspId: identity.mspId, credentials: Buffer.from(identity.credentials.certificate) },
    signer: signers.newPrivateKeySigner(privateKey), hash: curve === 'secp384r1' ? hash.sha384 : hash.sha256,
  };
}

async function connectToFabric(options = {}) {
  const config = await connectionOptions(options);
  const client = new grpc.Client(config.endpoint, config.credentials, config.clientOptions);
  let gateway;
  try {
    gateway = connect({ client, identity: config.identity, signer: config.signer, hash: config.hash,
      evaluateOptions: () => ({ deadline: Date.now() + 30000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30000 }),
      submitOptions: () => ({ deadline: Date.now() + 30000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });
    const network = gateway.getNetwork(options.channel || process.env.FABRIC_CHANNEL || 'sustainchannel');
    const rawContract = network.getContract(options.chaincode || process.env.FABRIC_CHAINCODE || 'supplychain');
    // Gateway returns Uint8Array. Preserve the Buffer results consumed by existing APIs.
    const contract = {
      evaluateTransaction: async (...args) => Buffer.from(await rawContract.evaluateTransaction(...args)),
      submitTransaction: async (...args) => Buffer.from(await rawContract.submitTransaction(...args)),
      submitWithReceipt: async (name, ...args) => {
        const transaction = await rawContract.submitAsync(name, { arguments: args });
        const status = await transaction.getStatus();
        if (!status.successful) throw new Error(`FABRIC_COMMIT_FAILED:${status.code}`);
        return { result: Buffer.from(transaction.getResult()), transactionId: transaction.getTransactionId() };
      },
    };
    let closed = false;
    const disconnect = () => { if (!closed) { closed = true; gateway.close(); client.close(); } };
    return { gateway: { disconnect }, network, contract };
  } catch (error) {
    gateway?.close(); client.close(); throw error;
  }
}

module.exports = { connectToFabric, connectionOptions, readIdentity, defaultProfile, defaultWallet };
