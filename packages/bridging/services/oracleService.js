const { ethers } = require('ethers');
const ChainlinkAggregatorV3Interface = require('../contracts/ChainlinkAggregatorV3Interface.json');

class OracleService {
    constructor() {
        this.provider = new ethers.providers.JsonRpcProvider(
            process.env.ETHEREUM_PROVIDER_URL || 'http://localhost:8545'
        );
    }

    /**
     * Get real-time commodity price from Chainlink oracle
     * @param {string} priceFeedAddress - Chainlink price feed contract address
     * @returns {Promise<number>} Current price
     */
    async getCommodityPrice(priceFeedAddress) {
        try {
            const priceFeed = new ethers.Contract(
                priceFeedAddress,
                ChainlinkAggregatorV3Interface.abi,
                this.provider
            );

            const roundData = await priceFeed.latestRoundData();
            const price = roundData.answer.div(10 ** 8); // Adjust decimals based on price feed

            return price.toNumber();
        } catch (error) {
            console.error('Oracle price retrieval error:', error);
            throw new Error('Failed to retrieve commodity price');
        }
    }

    /**
     * Get real-time weather data for a specific region
     * @param {string} location - Geographic coordinates
     * @returns {Promise<Object>} Weather data
     */
    async getWeatherData(location) {
        // Integration with weather oracle service
        // Placeholder for future implementation
        return {
            temperature: 25.5,
            humidity: 65,
            precipitation: 0.2,
            windSpeed: 12
        };
    }

    /**
     * Get carbon credit verification data
     * @param {string} projectId - Carbon credit project identifier
     * @returns {Promise<Object>} Carbon credit verification details
     */
    async verifyCarbonCredits(projectId) {
        // Placeholder for carbon credit verification via oracle
        return {
            verified: true,
            credits: 1000,
            projectType: 'Reforestation',
            validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        };
    }
}

module.exports = new OracleService();