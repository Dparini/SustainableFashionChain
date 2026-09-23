/**
 * Analytics Service for SustainableFashionChain
 *
 * This service provides analytics capabilities for the SustainableFashionChain application,
 * including data aggregation, metrics calculation, and trend analysis for the supply chain.
 */

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// Load contract ABIs
let CotTokenABI;
let ProductNFTABI;
try {
  CotTokenABI = require('../../ethereum/artifacts/contracts/CotToken.sol/CotToken.json').abi;
  ProductNFTABI = require('../../ethereum/artifacts/contracts/ProductNFT.sol/ProductNFT.json').abi;
} catch (error) {
  console.warn('Could not load Ethereum contract ABIs:', error.message);
}

class AnalyticsService {
  constructor() {
    this.fabricNetwork = null;
    this.fabricContract = null;
    this.cotTokenContract = null;
    this.productNFTContract = null;
    this.ethereumProvider = null;

    // Cache for analytics data
    this.cache = {
      batchMetrics: null,
      productMetrics: null,
      tokenizationMetrics: null,
      sustainabilityMetrics: null,
      lastUpdate: null,
      cacheTTL: 15 * 60 * 1000 // 15 minutes in milliseconds
    };
  }

  /**
   * Initialize the service by connecting to the blockchain networks
   */
  async initialize() {
    try {
      await this.connectToFabric();
      await this.connectToEthereum();
      console.log('Analytics service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize analytics service:', error);
      return false;
    }
  }

  /**
   * Connect to the Hyperledger Fabric network
   */
  async connectToFabric() {
    try {
      // Load connection profile
      const ccpPath = path.resolve(__dirname, '..', '..', 'network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
      const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

      // Create a new wallet for identity
      const walletPath = path.join(process.cwd(), 'wallet');
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      // Check if admin identity exists
      const identity = await wallet.get('admin');
      if (!identity) {
        throw new Error('Admin identity not found in wallet. Run enrollAdmin.js first');
      }

      // Create a new gateway instance
      const gateway = new Gateway();
      await gateway.connect(ccp, {
        wallet,
        identity: 'admin',
        discovery: { enabled: true, asLocalhost: true }
      });

      // Get the network and contract
      const network = await gateway.getNetwork('mychannel');
      const contract = network.getContract('supplychain');

      this.fabricNetwork = network;
      this.fabricContract = contract;
      console.log('Connected to Fabric network');
      return true;
    } catch (error) {
      console.error('Failed to connect to Fabric:', error);
      throw error;
    }
  }

  /**
   * Connect to the Ethereum network
   */
  async connectToEthereum() {
    try {
      // Get contract addresses
      let contractAddresses;
      try {
        contractAddresses = require('../../ethereum/contract-addresses.json');
      } catch (error) {
        console.warn('Could not load contract addresses:', error.message);
        return false;
      }

      // Connect to Ethereum
      const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_PROVIDER_URL || 'http://localhost:8545');
      this.ethereumProvider = provider;

      // Initialize contracts
      if (CotTokenABI && contractAddresses.CotToken) {
        this.cotTokenContract = new ethers.Contract(contractAddresses.CotToken, CotTokenABI, provider);
      }

      if (ProductNFTABI && contractAddresses.ProductNFT) {
        this.productNFTContract = new ethers.Contract(contractAddresses.ProductNFT, ProductNFTABI, provider);
      }

      console.log('Connected to Ethereum network');
      return true;
    } catch (error) {
      console.error('Failed to connect to Ethereum:', error);
      return false;
    }
  }

  /**
   * Get batch metrics from Hyperledger Fabric
   */
  async getBatchMetrics() {
    if (this.cache.batchMetrics && this.cache.lastUpdate &&
        (Date.now() - this.cache.lastUpdate < this.cache.cacheTTL)) {
      return this.cache.batchMetrics;
    }

    try {
      if (!this.fabricContract) {
        await this.connectToFabric();
      }

      // Query all batches
      const result = await this.fabricContract.evaluateTransaction('queryProductsByType', 'cotton');
      const batches = JSON.parse(result.toString());

      // Calculate metrics
      const metrics = {
        totalCount: batches.length,
        organicCount: 0,
        fairTradeCount: 0,
        tokenizedCount: 0,
        certifiedCount: 0,
        totalWeight: 0,
        byStatus: {},
        byOrigin: {},
        monthlyProduction: {},
      };

      batches.forEach(batch => {
        // Count by type of certification
        if (batch.organic) metrics.organicCount++;
        if (batch.fairTrade) metrics.fairTradeCount++;
        if (batch.tokenizationId) metrics.tokenizedCount++;
        if (batch.certifications && batch.certifications.length > 0) metrics.certifiedCount++;

        // Accumulate total weight
        metrics.totalWeight += parseFloat(batch.quantity || 0);

        // Count by status
        metrics.byStatus[batch.status] = (metrics.byStatus[batch.status] || 0) + 1;

        // Count by origin
        metrics.byOrigin[batch.origin] = (metrics.byOrigin[batch.origin] || 0) + 1;

        // Group by month for production trend
        if (batch.harvestDate) {
          const date = new Date(batch.harvestDate);
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

          if (!metrics.monthlyProduction[monthYear]) {
            metrics.monthlyProduction[monthYear] = {
              total: 0,
              organic: 0,
              nonOrganic: 0,
              weight: 0
            };
          }

          metrics.monthlyProduction[monthYear].total += 1;
          if (batch.organic) {
            metrics.monthlyProduction[monthYear].organic += 1;
          } else {
            metrics.monthlyProduction[monthYear].nonOrganic += 1;
          }
          metrics.monthlyProduction[monthYear].weight += parseFloat(batch.quantity || 0);
        }
      });

      // Convert monthly production to array for easy charting
      const monthlyData = Object.keys(metrics.monthlyProduction)
        .sort() // Sort by date
        .map(month => ({
          month,
          ...metrics.monthlyProduction[month]
        }));

      metrics.monthlyProductionData = monthlyData;

      // Update cache
      this.cache.batchMetrics = metrics;
      this.cache.lastUpdate = Date.now();

      return metrics;
    } catch (error) {
      console.error('Error getting batch metrics:', error);
      throw error;
    }
  }

  /**
   * Get product metrics from Hyperledger Fabric
   */
  async getProductMetrics() {
    if (this.cache.productMetrics && this.cache.lastUpdate &&
        (Date.now() - this.cache.lastUpdate < this.cache.cacheTTL)) {
      return this.cache.productMetrics;
    }

    try {
      if (!this.fabricContract) {
        await this.connectToFabric();
      }

      // Query finished products
      const result = await this.fabricContract.evaluateTransaction('queryProductsByType', 'finished');
      const products = JSON.parse(result.toString());

      // Calculate metrics
      const metrics = {
        totalCount: products.length,
        nftCount: 0,
        byManufacturer: {},
        bySustainabilityScore: {
          high: 0,   // 80-100%
          medium: 0, // 50-79%
          low: 0     // 0-49%
        },
        materialUsage: {},
        certificationCounts: {}
      };

      products.forEach(product => {
        // Count products with NFTs
        if (product.nftTokenId) metrics.nftCount++;

        // Count by manufacturer
        metrics.byManufacturer[product.manufacturer] = (metrics.byManufacturer[product.manufacturer] || 0) + 1;

        // Calculate sustainability score based on materials
        if (product.materials && product.materials.length > 0) {
          const sustainableMaterials = product.materials.filter(m => m.sustainable);
          const sustainabilityScore = sustainableMaterials.length / product.materials.length;

          if (sustainabilityScore >= 0.8) {
            metrics.bySustainabilityScore.high++;
          } else if (sustainabilityScore >= 0.5) {
            metrics.bySustainabilityScore.medium++;
          } else {
            metrics.bySustainabilityScore.low++;
          }

          // Track material usage
          product.materials.forEach(material => {
            if (!metrics.materialUsage[material.type]) {
              metrics.materialUsage[material.type] = {
                total: 0,
                sustainable: 0
              };
            }
            metrics.materialUsage[material.type].total++;

            if (material.sustainable) {
              metrics.materialUsage[material.type].sustainable++;
            }
          });
        }

        // Count certifications
        if (product.certifications && product.certifications.length > 0) {
          product.certifications.forEach(cert => {
            metrics.certificationCounts[cert.type] = (metrics.certificationCounts[cert.type] || 0) + 1;
          });
        }
      });

      // Update cache
      this.cache.productMetrics = metrics;
      if (!this.cache.lastUpdate) {
        this.cache.lastUpdate = Date.now();
      }

      return metrics;
    } catch (error) {
      console.error('Error getting product metrics:', error);
      throw error;
    }
  }

  /**
   * Get tokenization metrics from Ethereum
   */
  async getTokenizationMetrics() {
    if (this.cache.tokenizationMetrics && this.cache.lastUpdate &&
        (Date.now() - this.cache.lastUpdate < this.cache.cacheTTL)) {
      return this.cache.tokenizationMetrics;
    }

    try {
      const metrics = {
        totalTokenized: 0,
        totalTokenValue: 0,
        circularEconomyActions: {
          recycle: 0,
          repair: 0,
          resell: 0,
          upcycle: 0
        },
        nftsByType: {}
      };

      // Check that Ethereum contracts are initialized
      if (!this.cotTokenContract || !this.productNFTContract) {
        await this.connectToEthereum();

        if (!this.cotTokenContract || !this.productNFTContract) {
          return {
            error: "Ethereum contracts not available",
            mockData: true,
            totalTokenized: 65,
            totalTokenValue: 147520,
            circularEconomyActions: {
              recycle: 28,
              repair: 42,
              resell: 35,
              upcycle: 15
            }
          };
        }
      }

      // Get CotToken metrics
      try {
        if (this.cotTokenContract) {
          const totalSupply = await this.cotTokenContract.totalSupply();
          metrics.totalTokenized = parseFloat(ethers.formatEther(totalSupply));

          // Estimate value (in a real system, you'd get this from an oracle)
          metrics.totalTokenValue = metrics.totalTokenized * 30; // Example: $30 per kg
        }
      } catch (error) {
        console.error('Error getting CotToken metrics:', error);
      }

      // Get ProductNFT metrics
      try {
        if (this.productNFTContract) {
          // This would require custom functions on the contract to get these metrics
          // For now, we'll use mock data
          metrics.circularEconomyActions = {
            recycle: 28,
            repair: 42,
            resell: 35,
            upcycle: 15
          };
        }
      } catch (error) {
        console.error('Error getting ProductNFT metrics:', error);
      }

      // Update cache
      this.cache.tokenizationMetrics = metrics;
      if (!this.cache.lastUpdate) {
        this.cache.lastUpdate = Date.now();
      }

      return metrics;
    } catch (error) {
      console.error('Error getting tokenization metrics:', error);
      throw error;
    }
  }

  /**
   * Get sustainability metrics
   */
  async getSustainabilityMetrics() {
    if (this.cache.sustainabilityMetrics && this.cache.lastUpdate &&
        (Date.now() - this.cache.lastUpdate < this.cache.cacheTTL)) {
      return this.cache.sustainabilityMetrics;
    }

    try {
      // Combine data from different sources
      const batchMetrics = await this.getBatchMetrics();
      const productMetrics = await this.getProductMetrics();

      // Calculate sustainability metrics
      const metrics = {
        organicPercentage: batchMetrics.totalCount > 0
          ? (batchMetrics.organicCount / batchMetrics.totalCount * 100).toFixed(1)
          : 0,
        highSustainabilityProductsPercentage: productMetrics.totalCount > 0
          ? (productMetrics.bySustainabilityScore.high / productMetrics.totalCount * 100).toFixed(1)
          : 0,

        // Environmental impact estimates (these would be calculated based on real data in a production system)
        environmentalImpact: {
          carbonReduction: '48.2', // tonnes
          waterSaved: '12.4', // million liters
          landEfficiency: '38', // percent improvement
          chemicalReduction: '52.7' // percent reduction
        },

        // Certifications breakdown
        certifications: productMetrics.certificationCounts || {}
      };

      // Update cache
      this.cache.sustainabilityMetrics = metrics;
      if (!this.cache.lastUpdate) {
        this.cache.lastUpdate = Date.now();
      }

      return metrics;
    } catch (error) {
      console.error('Error getting sustainability metrics:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData() {
    try {
      const [batchMetrics, productMetrics, tokenizationMetrics, sustainabilityMetrics] =
        await Promise.all([
          this.getBatchMetrics(),
          this.getProductMetrics(),
          this.getTokenizationMetrics(),
          this.getSustainabilityMetrics()
        ]);

      return {
        batchMetrics,
        productMetrics,
        tokenizationMetrics,
        sustainabilityMetrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get supply chain activity data (for timelines)
   */
  async getSupplyChainActivity(timespan = '30d') {
    try {
      if (!this.fabricContract) {
        await this.connectToFabric();
      }

      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();

      switch (timespan) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30); // Default to 30 days
      }

      // Query recent activities (this would need to be implemented in the chaincode)
      // For now, we'll generate mock data

      // Prepare timeline data structure
      const timeline = {
        batchRegistrations: [],
        certifications: [],
        tokenizations: [],
        productCreations: []
      };

      // Generate mock timeline data
      const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      let currentDate = new Date(startDate);

      for (let i = 0; i < days; i++) {
        const dateStr = currentDate.toISOString().split('T')[0];

        // Add some randomness to the data
        timeline.batchRegistrations.push({
          date: dateStr,
          count: Math.floor(Math.random() * 5) + 1 // 1-5 registrations per day
        });

        timeline.certifications.push({
          date: dateStr,
          count: Math.floor(Math.random() * 4) // 0-3 certifications per day
        });

        timeline.tokenizations.push({
          date: dateStr,
          count: Math.floor(Math.random() * 3) // 0-2 tokenizations per day
        });

        timeline.productCreations.push({
          date: dateStr,
          count: Math.floor(Math.random() * 2) // 0-1 products per day
        });

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        timespan,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        timeline
      };
    } catch (error) {
      console.error('Error getting supply chain activity:', error);
      throw error;
    }
  }

  /**
   * Generate a sustainability report
   */
  async generateSustainabilityReport() {
    try {
      const [batchMetrics, productMetrics, sustainabilityMetrics] =
        await Promise.all([
          this.getBatchMetrics(),
          this.getProductMetrics(),
          this.getSustainabilityMetrics()
        ]);

      return {
        title: "Sustainability Report",
        generatedAt: new Date().toISOString(),
        organicProduction: {
          total: batchMetrics.organicCount,
          percentage: sustainabilityMetrics.organicPercentage,
          yearlyGrowth: "+28.5%" // This would be calculated from historical data
        },
        sustainableProducts: {
          high: productMetrics.bySustainabilityScore.high,
          medium: productMetrics.bySustainabilityScore.medium,
          low: productMetrics.bySustainabilityScore.low,
          percentageHighlySustainable: sustainabilityMetrics.highSustainabilityProductsPercentage
        },
        environmentalImpact: sustainabilityMetrics.environmentalImpact,
        certifications: {
          types: Object.keys(sustainabilityMetrics.certifications).map(cert => ({
            name: cert,
            count: sustainabilityMetrics.certifications[cert]
          }))
        },
        recommendations: [
          "Increase organic cotton sourcing by 15% to meet sustainability goals",
          "Expand fair trade certifications to more farms",
          "Reduce water usage in manufacturing by implementing recycling systems",
          "Transition more products to use recycled materials"
        ]
      };
    } catch (error) {
      console.error('Error generating sustainability report:', error);
      throw error;
    }
  }

  /**
   * Analyze circular economy performance
   */
  async analyzeCircularEconomy() {
    try {
      const tokenizationMetrics = await this.getTokenizationMetrics();
      const productMetrics = await this.getProductMetrics();

      // Calculate total circular actions
      const circularActions = tokenizationMetrics.circularEconomyActions;
      const totalActions = Object.values(circularActions).reduce((a, b) => a + b, 0);

      // Calculate circular percentage (what percentage of products had circular actions)
      const circularPercentage = productMetrics.totalCount > 0
        ? (totalActions / productMetrics.totalCount * 100).toFixed(1)
        : 0;

      return {
        totalCircularActions: totalActions,
        circularPercentage,
        actionBreakdown: circularActions,
        impactEstimates: {
          wasteReduction: (totalActions * 2.5).toFixed(1) + ' kg', // Estimated waste saved per action
          co2Saved: (totalActions * 5).toFixed(1) + ' kg', // Estimated CO2 saved per action
          waterSaved: (totalActions * 1000).toFixed(0) + ' liters' // Estimated water saved per action
        }
      };
    } catch (error) {
      console.error('Error analyzing circular economy:', error);
      throw error;
    }
  }

  /**
   * Clear the analytics cache
   */
  clearCache() {
    this.cache = {
      batchMetrics: null,
      productMetrics: null,
      tokenizationMetrics: null,
      sustainabilityMetrics: null,
      lastUpdate: null,
      cacheTTL: this.cache.cacheTTL
    };
    console.log('Analytics cache cleared');
    return true;
  }

  /**
   * Set the cache time-to-live
   */
  setCacheTTL(ttlMinutes) {
    if (ttlMinutes > 0) {
      this.cache.cacheTTL = ttlMinutes * 60 * 1000;
      console.log(`Analytics cache TTL set to ${ttlMinutes} minutes`);
      return true;
    }
    return false;
  }
}

// Create and export a singleton instance
const analyticsService = new AnalyticsService();
module.exports = analyticsService;