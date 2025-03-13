# Circular Economy Sequence

## Process Steps

1. **Product Creation**
   - Actor: Fashion Manufacturer
   - System: Hyperledger Fabric
   - Action: Call `CreateProduct()` with cotton batch IDs and product details
   - Result: Product registered on Fabric with traceable materials

2. **NFT Creation Request**
   - Actor: Bridge Service
   - System: Bridge Service
   - Action: Detect new product creation
   - Result: NFT minting request queued

3. **NFT Minting**
   - Actor: Bridge Service
   - System: Ethereum
   - Action: Call `ProductNFT.mintProduct()` with supply chain data
   - Result: NFT created with provenance metadata

4. **NFT-Product Linking**
   - Actor: Bridge Service
   - System: Hyperledger Fabric
   - Action: Call `MintNFT()` with Ethereum token ID
   - Result: Product record updated with NFT reference

5. **Product Sale**
   - Actor: Manufacturer → Retailer → Consumer
   - System: Ethereum + Physical World
   - Action: Transfer NFT ownership with physical product
   - Result: Consumer owns both physical product and digital NFT

6. **Product Use Phase**
   - Actor: Consumer
   - System: -
   - Action: Normal product usage
   - Result: -

7. **Circular Economy Actions**
   - Actor: Consumer
   - System: Ethereum
   - Action: One of the following:

   A. **Resell Action**
      - Call `ProductNFT.transferFrom()` to new owner
      - Record action via `CircularRewards.issueReward()`
      - Result: NFT transferred, rewards tokens issued

   B. **Recycle Action**
      - Return product to recycling partner
      - Recycler calls `NFT.recycleProduct()`
      - Bridge calls `CircularRewards.issueReward()`
      - Result: NFT marked as recycled, rewards tokens issued

   C. **Repair Action**
      - Repair product at authorized partner
      - Partner records action via `CircularRewards.issueReward()`
      - Result: Action recorded, rewards tokens issued

8. **Token Usage**
   - Actor: Consumer
   - System: Ethereum
   - Action: Use reward tokens in ecosystem
   - Possible uses:
     - Purchase new sustainable products
     - Access premium services
     - Trade on token markets

9. **Material Recovery (for recycled items)**
   - Actor: Recycling Partner
   - System: Hyperledger Fabric
   - Action: Register recovered materials
   - Result: Materials re-enter supply chain