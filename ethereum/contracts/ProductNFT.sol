// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProductNFT
 * @dev ERC721 token representing sustainable fashion products with circular economy features
 */
contract ProductNFT is ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl, Ownable {
    using Counters for Counters.Counter;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    Counters.Counter private _tokenIdCounter;

    // Product data for each NFT
    struct ProductData {
        string fabricProductId;      // ID of the product in Hyperledger Fabric
        string productType;          // Type of product (e.g., T-shirt, Dress)
        string manufacturer;         // ID of the manufacturer
        string[] cottonBatchIds;     // IDs of cotton batches used
        uint256 timestamp;           // When the NFT was minted
        address minter;              // Who minted the NFT
        bool recycled;               // Whether the product has been recycled
    }

    // Mapping from token ID to product data
    mapping(uint256 => ProductData) public productData;

    // Mapping from fabric product ID to token ID
    mapping(string => uint256) public fabricToTokenId;

    // Events
    event ProductMinted(uint256 indexed tokenId, string fabricProductId, string productType);
    event ProductRecycled(uint256 indexed tokenId, address recycler);
    event CircularActionRecorded(uint256 indexed tokenId, string actionType, string details);

    /**
     * @dev Constructor
     * @param admin Address to be granted admin role
     */
    constructor(address admin) ERC721("Sustainable Fashion Product", "SFP") {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
        _transferOwnership(admin);
    }

    /**
     * @dev Mint a new product NFT
     * @param recipient Address that will receive the NFT
     * @param fabricProductId ID of the product in Hyperledger Fabric
     * @param productType Type of product
     * @param manufacturer ID of the manufacturer
     * @param metadataURI URI for the token's metadata
     * @param cottonBatchIds IDs of cotton batches used
     * @return New token ID
     */
    function mintProduct(
        address recipient,
        string memory fabricProductId,
        string memory productType,
        string memory manufacturer,
        string memory metadataURI,
        string memory,  // Reserved ABI slot for existing integrations
        string[] memory cottonBatchIds
    ) public returns (uint256) {
        require(hasRole(MINTER_ROLE, _msgSender()), "ProductNFT: must have minter role to mint");
        require(bytes(fabricProductId).length > 0, "ProductNFT: fabric product ID cannot be empty");
        require(bytes(metadataURI).length > 0, "ProductNFT: metadata URI cannot be empty");
        require(fabricToTokenId[fabricProductId] == 0, "ProductNFT: fabric product ID already used");

        _tokenIdCounter.increment();
        uint256 newTokenId = _tokenIdCounter.current();

        // Store product data
        productData[newTokenId] = ProductData({
            fabricProductId: fabricProductId,
            productType: productType,
            manufacturer: manufacturer,
            cottonBatchIds: cottonBatchIds,
            timestamp: block.timestamp,
            minter: _msgSender(),
            recycled: false
        });

        // Store mapping from fabric ID to token ID
        fabricToTokenId[fabricProductId] = newTokenId;

        // Mint NFT
        _safeMint(recipient, newTokenId);

        // Set token URI
        _setTokenURI(newTokenId, metadataURI);

        // Emit event
        emit ProductMinted(newTokenId, fabricProductId, productType);

        return newTokenId;
    }

    /**
     * @dev Mark a product as recycled
     * @param tokenId ID of the token to recycle
     */
    function recycleProduct(uint256 tokenId) public {
        // Check authorization: either the caller is the token owner or has the bridge role
        require(
            ownerOf(tokenId) == _msgSender() || hasRole(BRIDGE_ROLE, _msgSender()),
            "ProductNFT: must be owner or bridge to recycle"
        );

        // Ensure the token exists
        require(_exists(tokenId), "ProductNFT: token does not exist");

        // Prevent re-recycling if desired
        require(!productData[tokenId].recycled, "ProductNFT: product already recycled");

        // Mark as recycled
        productData[tokenId].recycled = true;

        // Emit event
        emit ProductRecycled(tokenId, _msgSender());
    }

    /**
     * @dev Record a circular economy action for a product
     * @param tokenId ID of the token
     * @param actionType Type of action (e.g., Repair, Reuse)
     * @param details Additional details about the action
     */
    function recordCircularAction(
        uint256 tokenId,
        string memory actionType,
        string memory details
    ) public {
        require(
            ownerOf(tokenId) == _msgSender() || hasRole(BRIDGE_ROLE, _msgSender()),
            "ProductNFT: must be owner or bridge to record action"
        );

        emit CircularActionRecorded(tokenId, actionType, details);
    }

    /**
     * @dev Get the fabricProductId for a token
     * @param tokenId Token ID
     * @return fabricProductId from the product data
     */
    function getFabricId(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "ProductNFT: token does not exist");
        return productData[tokenId].fabricProductId;
    }

    /**
     * @dev Check if a product is recycled
     * @param tokenId Token ID
     * @return Whether the product is recycled
     */
    function isRecycled(uint256 tokenId) public view returns (bool) {
        require(_exists(tokenId), "ProductNFT: token does not exist");
        return productData[tokenId].recycled;
    }

    /**
     * @dev Grant minter role to an address
     * @param minter Address to be granted minter role
     */
    function addMinter(address minter) public onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(MINTER_ROLE, minter);
    }

    /**
     * @dev Grant bridge role to an address
     * @param bridge Address to be granted bridge role
     */
    function addBridge(address bridge) public onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(BRIDGE_ROLE, bridge);
    }

    /**
     * @dev Override functions to support both ERC721Enumerable and ERC721URIStorage
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(
        ERC721,
        ERC721Enumerable,
        ERC721URIStorage,
        AccessControl
    ) returns (bool) {
        return
            ERC721.supportsInterface(interfaceId) ||
            ERC721Enumerable.supportsInterface(interfaceId) ||
            ERC721URIStorage.supportsInterface(interfaceId) ||
            AccessControl.supportsInterface(interfaceId);
    }
}