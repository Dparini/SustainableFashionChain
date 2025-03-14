/*
 * This script enrolls an admin user for the client application
 */

'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Load the network configuration
        const ccpPath = path.resolve(__dirname, '..', 'network', 'connection-org1.json');

        // Ensure the file exists
        if (!fs.existsSync(ccpPath)) {
            throw new Error(`Connection profile not found at ${ccpPath}`);
        }

        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Safely extract CA information
        const caInfo = ccp.certificateAuthorities && ccp.certificateAuthorities['ca.org1.example.com'];
        if (!caInfo) {
            throw new Error('CA configuration not found in connection profile');
        }

        const caTLSCACerts = caInfo.tlsCACerts && caInfo.tlsCACerts.pem;
        const caName = caInfo.caName || 'ca-org1';

        // Create a new CA client for interacting with the CA
        const ca = new FabricCAServices(caInfo.url,
            caTLSCACerts ? { trustedRoots: caTLSCACerts, verify: false } : null,
            caName
        );

        // Create a new file system based wallet for managing identities
        const walletPath = path.join(__dirname, 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the admin user
        const identity = await wallet.get('admin');
        if (identity) {
            console.log('An identity for the admin user "admin" already exists in the wallet');
            return;
        }

        // Enroll the admin user, and import the new identity into the wallet
        const enrollment = await ca.enroll({
            enrollmentID: 'admin',
            enrollmentSecret: 'adminpw'
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: ccp.organizations.Org1.mspid || 'Org1MSP',
            type: 'X.509',
        };

        await wallet.put('admin', x509Identity);
        console.log('Successfully enrolled admin user "admin" and imported it into the wallet');

    } catch (error) {
        console.error(`Failed to enroll admin user: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

main();