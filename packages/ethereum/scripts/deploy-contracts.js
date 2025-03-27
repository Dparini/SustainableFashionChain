async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy CotToken
  const CotToken = await ethers.getContractFactory("CotToken");
  const cotToken = await CotToken.deploy();
  await cotToken.deployed();
  console.log("CotToken deployed to:", cotToken.address);

  // Deploy ProductNFT
  const ProductNFT = await ethers.getContractFactory("ProductNFT");
  const productNFT = await ProductNFT.deploy();
  await productNFT.deployed();
  console.log("ProductNFT deployed to:", productNFT.address);

  // For demonstration purposes, register a test batch of cotton
  console.log("Registering test cotton batch...");
  const registerTx = await cotToken.registerCertifiedCotton(
    "TEST-COTTON-001",
    ethers.utils.parseEther("100"),
    JSON.stringify({
      origin: "Test Farm",
      certifications: ["Organic"],
      timestamp: Date.now().toString()
    })
  );
  await registerTx.wait();
  console.log("Test cotton batch registered successfully");

  // Save contract addresses to a config file
  const fs = require("fs");
  const contractAddresses = {
    CotToken: cotToken.address,
    ProductNFT: productNFT.address,
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