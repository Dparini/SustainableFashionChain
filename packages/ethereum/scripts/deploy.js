// Script to deploy the Ethereum contracts
const hre = require("hardhat");

async function main() {
  console.log("Deploying contracts to", network.name);

  // Get the signers
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy CotToken
  console.log("Deploying CotToken...");
  const CotToken = await hre.ethers.getContractFactory("CotToken");
  const cotToken = await CotToken.deploy(deployer.address);
  await cotToken.deployed();
  console.log("CotToken deployed to:", cotToken.address);

  // Deploy ProductNFT
  console.log("Deploying ProductNFT...");
  const ProductNFT = await hre.ethers.getContractFactory("ProductNFT");
  const productNFT = await ProductNFT.deploy(deployer.address);
  await productNFT.deployed();
  console.log("ProductNFT deployed to:", productNFT.address);

  // Deploy CircularRewards
  console.log("Deploying CircularRewards...");
  const CircularRewards = await hre.ethers.getContractFactory("CircularRewards");
  const circularRewards = await CircularRewards.deploy(
    deployer.address,
    productNFT.address,
    cotToken.address
  );
  await circularRewards.deployed();
  console.log("CircularRewards deployed to:", circularRewards.address);

  // Grant roles
  console.log("Granting roles...");

  // Grant minter role on CotToken to CircularRewards
  const minterRole = await cotToken.MINTER_ROLE();
  const addMinterTx = await cotToken.addMinter(circularRewards.address);
  await addMinterTx.wait();
  console.log("Granted minter role on CotToken to CircularRewards");

  // Grant bridge role on ProductNFT to CircularRewards
  const bridgeRole = await productNFT.BRIDGE_ROLE();
  const addBridgeTx = await productNFT.addBridge(circularRewards.address);
  await addBridgeTx.wait();
  console.log("Granted bridge role on ProductNFT to CircularRewards");

  // Save the contract addresses
  saveDeployment({
    network: network.name,
    cotToken: cotToken.address,
    productNFT: productNFT.address,
    circularRewards: circularRewards.address,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  });

  console.log("Deployment complete!");
}

// Save deployment info to a file
function saveDeployment(deploymentInfo) {
  const fs = require('fs');
  const path = require('path');

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  // Write deployment info to file
  const filePath = path.join(deploymentsDir, `${deploymentInfo.network}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to ${filePath}`);
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });