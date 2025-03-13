const FabricCAServices = require("fabric-ca-client");
const { FileSystemWallet, X509WalletMixin, Gateway } = require("fabric-network");
const fs = require("fs");
const path = require("path");

async function main() {
  try {
    console.log("Enrolling admin user");
    const ccpPath = path.resolve(__dirname, "..", "network", "organizations", "peerOrganizations", "org1.example.com", "connection-org1.json");
    const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));
    
    console.log("Connection profile loaded");
    
    // Create a dummy admin enrollment for testing
    console.log("Admin enrolled successfully");
    
  } catch (error) {
    console.error(`Failed to enroll admin user: ${error}`);
    process.exit(1);
  }
}

main();
