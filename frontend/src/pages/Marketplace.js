import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const Marketplace = () => {
    const [listings, setListings] = useState([]);
    const [selectedListing, setSelectedListing] = useState(null);
    const [userWallet, setUserWallet] = useState(null);

    useEffect(() => {
        const connectWallet = async () => {
            if (window.ethereum) {
                try {
                    const accounts = await window.ethereum.request({
                        method: 'eth_requestAccounts'
                    });
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    setUserWallet(await signer.getAddress());
                } catch (error) {
                    console.error('Wallet connection error:', error);
                }
            }
        };

        const fetchListings = async () => {
            const mockListings = [
                {
                    id: 'nft1',
                    name: 'Sustainable Cotton T-Shirt',
                    description: 'Organic cotton t-shirt with full traceability',
                    price: 0.1,
                    image: '/api/placeholder/300/200',
                    seller: '0x1234...',
                    tokenId: '1234'
                },
                {
                    id: 'nft2',
                    name: 'Recycled Denim Jacket',
                    description: 'Upcycled denim jacket with circular economy NFT',
                    price: 0.25,
                    image: '/api/placeholder/300/200',
                    seller: '0x5678...',
                    tokenId: '5678'
                }
            ];
            setListings(mockListings);
        };

        connectWallet();
        fetchListings();
    }, []);

    const handleListingSelect = (listing) => {
        setSelectedListing(listing);
    };

    const handlePurchase = async () => {
        if (!userWallet) {
            alert('Please connect wallet first');
            return;
        }

        try {
            console.log('Purchasing listing:', selectedListing);
            alert(`Purchased ${selectedListing.name}`);
            setSelectedListing(null);
        } catch (error) {
            console.error('Purchase error:', error);
            alert('Purchase failed');
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold mb-6">
                Sustainable Fashion Marketplace
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {listings.map(listing => (
                    <div
                        key={listing.id}
                        className="bg-white border rounded-lg shadow-md overflow-hidden"
                    >
                        <img
                            src={listing.image}
                            alt={listing.name}
                            className="w-full h-48 object-cover"
                        />
                        <div className="p-4">
                            <h2 className="text-xl font-semibold mb-2">
                                {listing.name}
                            </h2>
                            <p className="text-gray-600 mb-2">
                                {listing.description}
                            </p>
                            <p className="font-bold mb-4">
                                Price: {listing.price} ETH
                            </p>
                            <button
                                className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
                                onClick={() => handleListingSelect(listing)}
                            >
                                View Details
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {selectedListing && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg max-w-md w-full p-6">
                        <h2 className="text-2xl font-bold mb-4">
                            {selectedListing.name}
                        </h2>
                        <img
                            src={selectedListing.image}
                            alt={selectedListing.name}
                            className="w-full h-64 object-cover rounded-lg mb-4"
                        />
                        <p className="mb-2">{selectedListing.description}</p>
                        <p className="font-bold mb-2">
                            Price: {selectedListing.price} ETH
                        </p>
                        <p className="text-gray-600 mb-4">
                            Seller: {selectedListing.seller}
                        </p>
                        <div className="flex justify-between">
                            <button
                                className="bg-gray-300 text-black py-2 px-4 rounded"
                                onClick={() => setSelectedListing(null)}
                            >
                                Close
                            </button>
                            <button
                                className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
                                onClick={handlePurchase}
                            >
                                Purchase
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Marketplace;