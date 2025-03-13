async function main() {
  const SustainableFashion = await ethers.getContractFactory("SustainableFashion");
  const contract = await SustainableFashion.deploy();
  await contract.deployed();
  console.log("SustainableFashion deployed to:", contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
