import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const GovernanceDAO = () => {
    const [proposals, setProposals] = useState([]);
    const [userVotingPower, setUserVotingPower] = useState(0);
    const [userWallet, setUserWallet] = useState(null);
    const [newProposal, setNewProposal] = useState({
        title: '',
        description: '',
        targetContract: '',
        votingPeriod: 7
    });

    useEffect(() => {
        const connectWallet = async () => {
            if (window.ethereum) {
                try {
                    const accounts = await window.ethereum.request({
                        method: 'eth_requestAccounts'
                    });
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    const address = await signer.getAddress();
                    setUserWallet(address);

                    // Mock voting power
                    setUserVotingPower(Math.floor(Math.random() * 100));
                } catch (error) {
                    console.error('Wallet connection error:', error);
                }
            }
        };

        const fetchProposals = async () => {
            const mockProposals = [
                {
                    id: 1,
                    title: 'Add Carbon Credit Tokenization',
                    description: 'Implement a new mechanism to tokenize carbon credits for sustainable fashion supply chain.',
                    proposer: '0x1234...',
                    votesFor: 450,
                    votesAgainst: 150,
                    status: 'Active',
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                },
                {
                    id: 2,
                    title: 'Increase Sustainability Threshold',
                    description: 'Raise the minimum sustainability score required for products in the marketplace.',
                    proposer: '0x5678...',
                    votesFor: 350,
                    votesAgainst: 250,
                    status: 'Active',
                    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
                }
            ];
            setProposals(mockProposals);
        };

        connectWallet();
        fetchProposals();
    }, []);

    const handleVote = async (proposalId, voteType) => {
        if (!userWallet) {
            alert('Please connect wallet first');
            return;
        }

        try {
            // Mock voting mechanism
            console.log(`Voting ${voteType} for proposal ${proposalId}`);
            alert(`Voted ${voteType} successfully`);
        } catch (error) {
            console.error('Voting error:', error);
            alert('Voting failed');
        }
    };

    const handleCreateProposal = async (e) => {
        e.preventDefault();
        if (!userWallet) {
            alert('Please connect wallet first');
            return;
        }

        try {
            // Mock proposal creation
            const newProposalObj = {
                ...newProposal,
                id: proposals.length + 1,
                proposer: userWallet,
                votesFor: 0,
                votesAgainst: 0,
                status: 'Active',
                endDate: new Date(Date.now() + newProposal.votingPeriod * 24 * 60 * 60 * 1000)
            };

            setProposals([...proposals, newProposalObj]);

            // Reset form
            setNewProposal({
                title: '',
                description: '',
                targetContract: '',
                votingPeriod: 7
            });

            alert('Proposal created successfully');
        } catch (error) {
            console.error('Proposal creation error:', error);
            alert('Failed to create proposal');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">
                    SustainableFashionChain Governance
                </h1>
                {userWallet ? (
                    <div className="flex items-center space-x-4">
                        <span className="text-green-600 font-semibold">
                            Connected: {userWallet.substring(0, 6)}...{userWallet.substring(userWallet.length - 4)}
                        </span>
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                            Voting Power: {userVotingPower}
                        </span>
                    </div>
                ) : (
                    <button
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                        Connect Wallet
                    </button>
                )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Active Proposals Section */}
                <div>
                    <h2 className="text-2xl font-semibold mb-4">Active Proposals</h2>
                    {proposals.map(proposal => (
                        <div
                            key={proposal.id}
                            className="bg-white border rounded-lg p-4 mb-4 shadow-md"
                        >
                            <h3 className="text-xl font-bold mb-2">
                                {proposal.title}
                            </h3>
                            <p className="text-gray-600 mb-4">
                                {proposal.description}
                            </p>
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <span className="text-green-600 mr-4">
                                        For: {proposal.votesFor}
                                    </span>
                                    <span className="text-red-600">
                                        Against: {proposal.votesAgainst}
                                    </span>
                                </div>
                                <span className="text-sm text-gray-500">
                                    Ends: {proposal.endDate.toLocaleDateString()}
                                </span>
                            </div>
                            <div className="flex space-x-4">
                                <button
                                    className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
                                    onClick={() => handleVote(proposal.id, 'For')}
                                >
                                    Vote For
                                </button>
                                <button
                                    className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700"
                                    onClick={() => handleVote(proposal.id, 'Against')}
                                >
                                    Vote Against
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Create Proposal Section */}
                <div>
                    <h2 className="text-2xl font-semibold mb-4">Create New Proposal</h2>
                    <form
                        onSubmit={handleCreateProposal}
                        className="bg-white border rounded-lg p-4 shadow-md"
                    >
                        <div className="mb-4">
                            <label className="block text-gray-700 font-bold mb-2">
                                Proposal Title
                            </label>
                            <input
                                type="text"
                                value={newProposal.title}
                                onChange={(e) => setNewProposal({
                                    ...newProposal,
                                    title: e.target.value
                                })}
                                className="w-full px-3 py-2 border rounded"
                                placeholder="Enter proposal title"
                                required
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-gray-700 font-bold mb-2">
                                Description
                            </label>
                            <textarea
                                value={newProposal.description}
                                onChange={(e) => setNewProposal({
                                    ...newProposal,
                                    description: e.target.value
                                })}
                                className="w-full px-3 py-2 border rounded"
                                placeholder="Describe your proposal"
                                rows="4"
                                required
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-gray-700 font-bold mb-2">
                                Target Contract
                            </label>
                            <input
                                type="text"
                                value={newProposal.targetContract}
                                onChange={(e) => setNewProposal({
                                    ...newProposal,
                                    targetContract: e.target.value
                                })}
                                className="w-full px-3 py-2 border rounded"
                                placeholder="Contract address (optional)"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-gray-700 font-bold mb-2">
                                Voting Period (Days)
                            </label>
                            <input
                                type="number"
                                value={newProposal.votingPeriod}
                                onChange={(e) => setNewProposal({
                                    ...newProposal,
                                    votingPeriod: parseInt(e.target.value)
                                })}
                                className="w-full px-3 py-2 border rounded"
                                min="1"
                                max="30"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
                        >
                            Create Proposal
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default GovernanceDAO;