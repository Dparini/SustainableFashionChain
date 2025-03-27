const fs = require("fs");
const path = require("path");

// Inserisci qui gli indirizzi corretti dopo il deploy
const addresses = {
  CotToken: "0x1234567890abcdef1234567890abcdef12345678",
  ProductNFT: "0xabcdef1234567890abcdef1234567890abcdef12",
  deployer: "0xfeed1234567890abcdef1234567890abcdefbeef"
};

const outputPath = path.join(__dirname, "../contract-addresses.json");

fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
console.log(`✅ contract-addresses.json creato in ${outputPath}`);