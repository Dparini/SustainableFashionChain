/**
 * API endpoint for minting NFTs
 * This is used by the frontend to request NFT minting for products
 */

'use strict';

// Function to mint an NFT for a product
async function mintNFT(req, res, contract) {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ error: 'Missing required parameter: productId' });
        }

        // Get product data
        const productResult = await contract.evaluateTransaction('GetProduct', productId);
        const product = JSON.parse(productResult.toString());

        // Check if product already has an NFT
        if (product.nftTokenId) {
            return res.status(400).json({ error: 'Product already has an NFT minted' });
        }

        // In a real system, this would call the bridge service to mint an NFT on Ethereum
        // For this demo, we'll simulate it by generating a mock NFT token ID
        const nftTokenId = Math.floor(Math.random() * 1000000).toString();

        // Update product with NFT token ID
        await contract.submitTransaction('MintNFT', productId, nftTokenId);

        // Return success response
        res.status(200).json({
            message: 'NFT minted successfully',
            productId,
            nftTokenId
        });
    } catch (error) {
        console.error(`Error minting NFT: ${error}`);
        res.status(500).json({ error: error.message });
    }
}

// Export the function
module.exports = mintNFT;