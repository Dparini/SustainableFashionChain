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
  await cotToken.waitForDeployment();
  console.log("CotToken deployed to:", await cotToken.getAddress());

  // Deploy ProductNFT
  console.log("Deploying ProductNFT...");
  const ProductNFT = await hre.ethers.getContractFactory("ProductNFT");
  const productNFT = await ProductNFT.deploy(deployer.address);
  await productNFT.waitForDeployment();
  console.log("ProductNFT deployed to:", await productNFT.getAddress());

  // Deploy CircularRewards
  console.log("Deploying CircularRewards...");
  const CircularRewards = await hre.ethers.getContractFactory("CircularRewards");
  const circularRewards = await CircularRewards.deploy(
    deployer.address,
    await productNFT.getAddress(),
    await cotToken.getAddress()
  );
  await circularRewards.waitForDeployment();
  console.log("CircularRewards deployed to:", await circularRewards.getAddress());

  // Save the contract addresses
  saveDeployment({
    network: network.name,
    cotToken: await cotToken.getAddress(),
    productNFT: await productNFT.getAddress(),
    circularRewards: await circularRewards.getAddress(),
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

  // Also save to contract-addresses.json in the root directory
  fs.writeFileSync(
    path.join(__dirname, '../contract-addresses.json'),
    JSON.stringify({
      CotToken: deploymentInfo.cotToken,
      ProductNFT: deploymentInfo.productNFT,
      CircularRewards: deploymentInfo.circularRewards,
      deployer: deploymentInfo.deployer
    }, null, 2)
  );

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