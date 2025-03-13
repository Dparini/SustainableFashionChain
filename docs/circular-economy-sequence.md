# Cotton Tokenization Sequence

## Process Steps

1. **Cotton Batch Registration**
   - Actor: Cotton Farmer
   - System: Hyperledger Fabric
   - Action: Call `CreateCottonBatch()` with details (quantity, location, harvest date)
   - Result: Batch ID created on Fabric

2. **Certification**
   - Actor: Certification Body (e.g., Organic, Fair Trade)
   - System: Hyperledger Fabric
   - Action: Call `AddCertification()` with certification details
   - Result: Certifications linked to batch

3. **Transport & Storage**
   - Actor: Logistics Provider → Warehouse
   - System: Hyperledger Fabric
   - Action: Call `TransferCustody()` with transport details
   - Result: Batch custody updated to warehouse

4. **Tokenization Request**
   - Actor: Warehouse
   - System: Hyperledger Fabric
   - Action: Call `RequestTokenization()` with quantity
   - Result: Request created and flagged for approval

5. **Request Verification**
   - Actor: Authorized Verifier
   - System: Hyperledger Fabric
   - Action: Call `ApproveTokenizationRequest()`
   - Result: Request status changed to "Approved"

6. **Bridge Detection**
   - Actor: Blockchain Bridge
   - System: Bridge Service
   - Action: Poll for approved tokenization requests
   - Result: Request queued for processing

7. **Token Minting**
   - Actor: Bridge Service
   - System: Ethereum
   - Action: Call `CotToken.mintBatch()` with batch details
   - Result: ERC-20 tokens created on Ethereum

8. **Confirmation**
   - Actor: Bridge Service
   - System: Hyperledger Fabric
   - Action: Call `CompleteTokenization()` with Ethereum TX details
   - Result: Batch linked to Ethereum tokens

9. **Token Trading**
   - Actor: Market Participants (Traders, Manufacturers)
   - System: Ethereum (DEX, direct transfer)
   - Action: Buy/sell tokens representing physical cotton
   - Result: Digital asset traded while physical asset remains in warehouse

10. **Token Redemption (Optional)**
    - Actor: Token Holder
    - System: Bridge Service
    - Action: Request physical delivery of cotton
    - Result: Tokens burned, physical cotton released