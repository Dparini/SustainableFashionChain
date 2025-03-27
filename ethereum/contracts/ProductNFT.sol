// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract ProductNFT is ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    Counters.Counter private _tokenIdCounter;

    struct ProductData {
        string fabricProductId;
        string productType;
        string manufacturer;
        string[] cottonBatchIds;
        uint256 timestamp;
        address minter;
        bool recycled;
        address[] owners;
    }

    mapping(uint256 => ProductData) public productData;
    mapping(string => uint256) public fabricToTokenId;

    event ProductMinted(uint256 indexed tokenId, string fabricProductId, string productType);
    event ProductRecycled(uint256 indexed tokenId, address recycler);
    event CircularActionRecorded(uint256 indexed tokenId, string actionType, string details);

    constructor(address admin) ERC721("Sustainable Fashion Product", "SFP") {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
    }

    function mintProduct(
        address recipient,
        string memory fabricProductId,
        string memory productType,
        string memory manufacturer,
        string memory metadataURI,
        string memory tokenURI_,  // Unused parameter to match previous implementation
        string[] memory cottonBatchIds
    ) public returns (uint256) {
        require(hasRole(MINTER_ROLE, _msgSender()), "ProductNFT: must have minter role to mint");
        require(fabricToTokenId[fabricProductId] == 0, "ProductNFT: fabric product ID already used");

        _tokenIdCounter.increment();
        uint256 newTokenId = _tokenIdCounter.current();

        address[] memory owners = new address[](1);
        owners[0] = recipient;

        productData[newTokenId] = ProductData({
            fabricProductId: fabricProductId,
            productType: productType,
            manufacturer: manufacturer,
            cottonBatchIds: cottonBatchIds,
            timestamp: block.timestamp,
            minter: _msgSender(),
            recycled: false,
            owners: owners
        });

        fabricToTokenId[fabricProductId] = newTokenId;

        _safeMint(recipient, newTokenId);
        _setTokenURI(newTokenId, metadataURI);

        emit ProductMinted(newTokenId, fabricProductId, productType);

        return newTokenId;
    }

    function recycleProduct(uint256 tokenId) public {
        // Allow both owner and bridge role to recycle
        require(
            ownerOf(tokenId) == _msgSender() || hasRole(BRIDGE_ROLE, _msgSender()),
            "ProductNFT: must be owner or bridge to recycle"
        );

        // Prevent re-recycling
        require(!productData[tokenId].recycled, "ProductNFT: product already recycled");

        // Mark as recycled
        productData[tokenId].recycled = true;

        // Emit event
        emit ProductRecycled(tokenId, _msgSender());
    }

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

    // Other standard ERC721 overrides...
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _generateTokenURI(uint256 tokenId) internal view returns (string memory) {
        ProductData storage product = productData[tokenId];

        string memory batchIds = "";
        for (uint i = 0; i < product.cottonBatchIds.length; i++) {
            if (i > 0) {
                batchIds = string(abi.encodePacked(batchIds, ", "));
            }
            batchIds = string(abi.encodePacked(batchIds, product.cottonBatchIds[i]));
        }

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Sustainable Fashion Product #',
                        toString(tokenId),
                        '", "description": "A sustainable fashion product with verified supply chain on blockchain", ',
                        '"attributes": [',
                        '{"trait_type": "Product Type", "value": "', product.productType, '"}, ',
                        '{"trait_type": "Manufacturer", "value": "', product.manufacturer, '"}, ',
                        '{"trait_type": "Recycled", "value": "', product.recycled ? 'Yes' : 'No', '"}, ',
                        '{"trait_type": "Cotton Batches", "value": "', batchIds, '"}',
                        ']}'
                    )
                )
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;

        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);

        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

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

    function addMinter(address minter) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "ProductNFT: must have admin role to add minter");
        grantRole(MINTER_ROLE, minter);
    }

    function addBridge(address bridge) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "ProductNFT: must have admin role to add bridge");
        grantRole(BRIDGE_ROLE, bridge);
    }
}