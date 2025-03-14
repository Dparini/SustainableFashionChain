import React, { useState, useEffect } from 'react';
import { Camera, Leaf, Recycle, Shield, Share2 } from 'lucide-react';

const ProductInteractionScreen = () => {
    const [product, setProduct] = useState(null);
    const [showQR, setShowQR] = useState(false);
    const [circularActions, setCircularActions] = useState([]);

    useEffect(() => {
        // Fetch product details
        const fetchProductDetails = async () => {
            // Mock product data - replace with actual API call
            const mockProduct = {
                id: 'PROD001',
                name: 'Organic Cotton T-Shirt',
                manufacturer: 'EcoFashion',
                materials: [
                    { type: 'Organic Cotton', percentage: 95, sustainable: true },
                    { type: 'Elastane', percentage: 5, sustainable: false }
                ],
                certifications: ['GOTS', 'Fair Trade'],
                productionDate: new Date(),
                sustainabilityScore: 92,
                carbonImpact: {
                    saved: '5.2 kg CO2',
                    percentage: 45
                },
                waterSaved: '2100 liters',
                verificationUrl: 'https://sustainablefashionchain.com/verify/PROD001'
            };
            setProduct(mockProduct);
        };

        fetchProductDetails();
    }, []);

    const handleCircularAction = async (actionType) => {
        try {
            // Mock API call for circular action
            const response = await fetch('/api/circular-actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: product.id,
                    actionType
                })
            });

            const result = await response.json();

            if (result.success) {
                const newAction = {
                    type: actionType,
                    date: new Date(),
                    points: result.rewardPoints,
                    impact: result.impact
                };

                setCircularActions([...circularActions, newAction]);

                alert(`You earned ${result.rewardPoints} points for ${actionType}!`);
            }
        } catch (error) {
            console.error('Circular action error:', error);
            alert('Failed to record action');
        }
    };

    const openVerificationUrl = async () => {
        if (product?.verificationUrl) {
            window.open(product.verificationUrl, '_blank');
        }
    };

    const generateQRCode = () => {
        if (!product) return null;

        // Basic QR code generation using a third-party service
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(product.verificationUrl)}`;

        return (
            <div className="flex flex-col items-center mt-4">
                <img
                    src={qrUrl}
                    alt="Product Verification QR Code"
                    className="w-[200px] h-[200px]"
                />
                <p className="mt-2 text-gray-600">
                    Scan to verify product authenticity
                </p>
            </div>
        );
    };

    if (!product) {
        return (
            <div className="flex items-center justify-center h-full">
                <p>Loading product details...</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 max-w-2xl">
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold">{product.name}</h1>
                <p className="text-gray-600">{product.manufacturer}</p>
            </div>

            {/* Sustainability Score */}
            <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold mb-2">Sustainability Score</h2>
                <div className="flex items-center">
                    <div
                        className="w-16 h-16 rounded-full bg-green-500
                        flex items-center justify-center mr-4"
                    >
                        <span className="text-white text-2xl font-bold">
                            {product.sustainabilityScore}
                        </span>
                    </div>
                    <div>
                        <p className="text-green-600">High Sustainability</p>
                        <p className="text-gray-600">
                            {product.materials.filter(m => m.sustainable).length}
                            /{product.materials.length} Materials Sustainable
                        </p>
                    </div>
                </div>
            </div>

            {/* Environmental Impact */}
            <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold mb-2">Environmental Impact</h2>
                <div className="flex justify-between">
                    <div className="text-center">
                        <p className="text-blue-600 font-bold">
                            {product.carbonImpact.saved}
                        </p>
                        <p className="text-gray-600">CO2 Saved</p>
                    </div>
                    <div className="text-center">
                        <p className="text-green-600 font-bold">
                            {product.waterSaved}
                        </p>
                        <p className="text-gray-600">Water Saved</p>
                    </div>
                </div>
            </div>

            {/* Certifications */}
            <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold mb-2">Certifications</h2>
                <div className="flex flex-wrap gap-2">
                    {product.certifications.map(cert => (
                        <span
                            key={cert}
                            className="bg-green-200 px-3 py-1 rounded-full text-green-800"
                        >
                            {cert}
                        </span>
                    ))}
                </div>
            </div>

            {/* Circular Economy Actions */}
            <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold mb-4">Circular Economy Actions</h2>
                <div className="flex justify-between">
                    <button
                        className="flex flex-col items-center"
                        onClick={() => handleCircularAction('recycle')}
                    >
                        <Recycle className="text-green-600" size={32} />
                        <span className="mt-2 text-green-600">Recycle</span>
                    </button>
                    <button
                        className="flex flex-col items-center"
                        onClick={() => handleCircularAction('repair')}
                    >
                        <Shield className="text-blue-600" size={32} />
                        <span className="mt-2 text-blue-600">Repair</span>
                    </button>
                    <button
                        className="flex flex-col items-center"
                        onClick={() => handleCircularAction('resell')}
                    >
                        <Share2 className="text-purple-600" size={32} />
                        <span className="mt-2 text-purple-600">Resell</span>
                    </button>
                </div>
            </div>

            {/* Circular Actions History */}
            {circularActions.length > 0 && (
                <div className="bg-gray-100 rounded-lg p-4 mb-4">
                    <h2 className="text-lg font-semibold mb-2">
                        Circular Actions History
                    </h2>
                    {circularActions.map((action, index) => (
                        <div
                            key={index}
                            className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200"
                        >
                            <div>
                                <p className="font-bold capitalize">
                                    {action.type}
                                </p>
                                <p className="text-gray-600">
                                    {action.date.toLocaleDateString()}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-green-600 font-bold">
                                    +{action.points} Points
                                </p>
                                {action.impact && (
                                    <p className="text-gray-600">
                                        {action.impact}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-between">
                <button
                    className="bg-green-500 text-white px-4 py-2 rounded-lg flex items-center"
                    onClick={() => setShowQR(!showQR)}
                >
                    <Camera className="mr-2" size={20} />
                    {showQR ? 'Hide QR' : 'Show QR'}
                </button>
                <button
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center"
                    onClick={openVerificationUrl}
                >
                    <Leaf className="mr-2" size={20} />
                    Verify Product
                </button>
            </div>

            {/* QR Code */}
            {showQR && generateQRCode()}
        </div>
    );
};

export default ProductInteractionScreen;