const hre = require("hardhat");
const { ethers } = hre;
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  console.log("Deploying contracts with the account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance (via provider):", balance.toString());

  // Deploy CotToken
  const CotToken = await ethers.getContractFactory("CotToken");
  const cotTokenTx = await CotToken.deploy(deployer.address);
  const cotToken = await cotTokenTx.waitForDeployment();
  const cotTokenInstance = await hre.ethers.getContractAt("CotToken", cotToken.target);

  console.log("CotToken deployed to:", cotToken.target);

  // Deploy ProductNFT
  const ProductNFT = await ethers.getContractFactory("ProductNFT");
  const productNFTTx = await ProductNFT.deploy(deployer.address);
  const productNFT = await productNFTTx.waitForDeployment();
  console.log("ProductNFT deployed to:", productNFT.target);

  // For demonstration purposes, register a test batch of cotton
  console.log("Registering test cotton batch...");
  const registerTx = await cotTokenInstance.mintBatch(
  "TEST-COTTON-001",
  hre.ethers.parseEther("100"),
  "WH-001", // ID fittizio del magazzino
  deployer.address
);
  await registerTx.wait();
  console.log("Test cotton batch registered successfully");

  // Save contract addresses to a config file
  const fs = require("fs");
  const contractAddresses = {
    CotToken: cotToken.target,
    ProductNFT: productNFT.target,
    deployer: deployer.address
  };

  fs.writeFileSync(
    "contract-addresses.json",
    JSON.stringify(contractAddresses, null, 2)
  );
  console.log("Contract addresses saved to contract-addresses.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });