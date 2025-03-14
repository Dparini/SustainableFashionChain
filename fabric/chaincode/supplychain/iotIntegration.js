/**
 * IoT Integration Module for SustainableFashionChain
 *
 * This module provides functionality for integrating IoT devices with the blockchain,
 * enabling automated data collection and verification throughout the supply chain.
 */

'use strict';

// IoT device types supported by the integration
const IOT_DEVICE_TYPES = {
    TEMPERATURE_SENSOR: 'temperature_sensor',
    HUMIDITY_SENSOR: 'humidity_sensor',
    GPS_TRACKER: 'gps_tracker',
    RFID_READER: 'rfid_reader',
    CHEMICAL_SENSOR: 'chemical_sensor',
    WATER_USAGE_METER: 'water_usage_meter',
    ENERGY_METER: 'energy_meter',
    CAMERA: 'camera'
};

// IoT data sources
const DATA_SOURCES = {
    FARM: 'farm',
    TRANSPORTATION: 'transportation',
    WAREHOUSE: 'warehouse',
    PROCESSING: 'processing',
    MANUFACTURING: 'manufacturing',
    RETAIL: 'retail'
};

class IoTIntegration {
    constructor(ctx) {
        this.ctx = ctx;
    }

    /**
     * Register a new IoT device in the system
     *
     * @param {string} deviceId - Unique identifier for the device
     * @param {string} deviceType - Type of IoT device from IOT_DEVICE_TYPES
     * @param {string} location - Physical location of the device
     * @param {string} owner - Organization that owns the device
     * @param {string} dataSource - Source category from DATA_SOURCES
     * @param {Object} metadata - Additional device metadata
     * @returns {Object} Registered device information
     */
    async registerDevice(deviceId, deviceType, location, owner, dataSource, metadata) {
        // Validate inputs
        if (!deviceId || !deviceType || !location || !owner || !dataSource) {
            throw new Error('Missing required parameters for device registration');
        }

        if (!Object.values(IOT_DEVICE_TYPES).includes(deviceType)) {
            throw new Error(`Invalid device type: ${deviceType}`);
        }

        if (!Object.values(DATA_SOURCES).includes(dataSource)) {
            throw new Error(`Invalid data source: ${dataSource}`);
        }

        // Check if device already exists
        const deviceKey = `iot_device_${deviceId}`;
        const deviceAsBytes = await this.ctx.stub.getState(deviceKey);
        if (deviceAsBytes && deviceAsBytes.length > 0) {
            throw new Error(`Device with ID ${deviceId} already exists`);
        }

        // Create device object
        const device = {
            id: deviceId,
            type: deviceType,
            location: location,
            owner: owner,
            dataSource: dataSource,
            metadata: metadata || {},
            status: 'ACTIVE',
            registrationDate: new Date().toISOString(),
            lastCalibratedDate: new Date().toISOString(),
            dataCount: 0,
            lastDataTimestamp: null
        };

        // Store on the ledger
        await this.ctx.stub.putState(deviceKey, Buffer.from(JSON.stringify(device)));

        // Return the registered device
        return device;
    }

    /**
     * Submit data from an IoT device to the blockchain
     *
     * @param {string} deviceId - ID of the registered IoT device
     * @param {string} productId - ID of the product/batch being monitored
     * @param {Object} data - The sensor data being reported
     * @param {string} timestamp - Timestamp when the data was collected
     * @param {string} signature - Digital signature of the data for verification
     * @returns {Object} Recorded data entry
     */
    async submitDeviceData(deviceId, productId, data, timestamp, signature) {
        // Validate inputs
        if (!deviceId || !productId || !data || !timestamp) {
            throw new Error('Missing required parameters for data submission');
        }

        // Check if device exists
        const deviceKey = `iot_device_${deviceId}`;
        const deviceAsBytes = await this.ctx.stub.getState(deviceKey);
        if (!deviceAsBytes || deviceAsBytes.length === 0) {
            throw new Error(`Device with ID ${deviceId} does not exist`);
        }

        const device = JSON.parse(deviceAsBytes.toString());

        // Check if product/batch exists
        const productAsBytes = await this.ctx.stub.getState(productId);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product/batch with ID ${productId} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());

        // Verify data signature if provided
        if (signature) {
            // In a real implementation, this would validate the signature
            // For this prototype, we just log that verification was attempted
            console.log(`Signature verification for device ${deviceId} data would happen here`);
        }

        // Create IoT data record
        const dataId = `iot_data_${deviceId}_${Date.now()}`;
        const dataRecord = {
            id: dataId,
            deviceId: deviceId,
            deviceType: device.type,
            productId: productId,
            timestamp: timestamp,
            data: data,
            verified: signature ? true : false,
            abnormalFlag: this.detectAbnormalData(device.type, data),
            location: device.location
        };

        // Store data on the ledger
        await this.ctx.stub.putState(dataId, Buffer.from(JSON.stringify(dataRecord)));

        // Update device record
        device.dataCount += 1;
        device.lastDataTimestamp = timestamp;
        await this.ctx.stub.putState(deviceKey, Buffer.from(JSON.stringify(device)));

        // Update product/batch with IoT data reference
        if (!product.iotData) {
            product.iotData = [];
        }

        // Add a reference to the IoT data
        product.iotData.push({
            dataId: dataId,
            deviceType: device.type,
            timestamp: timestamp,
            summary: this.summarizeData(device.type, data),
            abnormalFlag: this.detectAbnormalData(device.type, data)
        });

        // If abnormal data detected, add a warning to the product history
        if (this.detectAbnormalData(device.type, data)) {
            if (!product.history) {
                product.history = [];
            }

            product.history.push({
                type: 'AbnormalDataDetected',
                timestamp: new Date().toISOString(),
                details: `Abnormal ${device.type} data detected: ${JSON.stringify(this.summarizeData(device.type, data))}`
            });
        }

        // Store updated product/batch
        await this.ctx.stub.putState(productId, Buffer.from(JSON.stringify(product)));

        // Return the data record
        return dataRecord;
    }

    /**
     * Query IoT data for a specific product/batch
     *
     * @param {string} productId - ID of the product/batch
     * @param {string} deviceType - Optional filter by device type
     * @param {string} startTime - Optional start timestamp for time range filtering
     * @param {string} endTime - Optional end timestamp for time range filtering
     * @returns {Array} Array of IoT data records
     */
    async queryProductIoTData(productId, deviceType, startTime, endTime) {
        // Check if product/batch exists
        const productAsBytes = await this.ctx.stub.getState(productId);
        if (!productAsBytes || productAsBytes.length === 0) {
            throw new Error(`Product/batch with ID ${productId} does not exist`);
        }

        const product = JSON.parse(productAsBytes.toString());

        // If product has no IoT data, return empty array
        if (!product.iotData || product.iotData.length === 0) {
            return [];
        }

        // Filter IoT data references based on criteria
        let filteredDataRefs = product.iotData;

        if (deviceType) {
            filteredDataRefs = filteredDataRefs.filter(ref => ref.deviceType === deviceType);
        }

        if (startTime) {
            filteredDataRefs = filteredDataRefs.filter(ref => new Date(ref.timestamp) >= new Date(startTime));
        }

        if (endTime) {
            filteredDataRefs = filteredDataRefs.filter(ref => new Date(ref.timestamp) <= new Date(endTime));
        }

        // Retrieve full data records
        const dataRecords = [];
        for (const ref of filteredDataRefs) {
            const dataAsBytes = await this.ctx.stub.getState(ref.dataId);
            if (dataAsBytes && dataAsBytes.length > 0) {
                dataRecords.push(JSON.parse(dataAsBytes.toString()));
            }
        }

        return dataRecords;
    }

    /**
     * Update the status of an IoT device
     *
     * @param {string} deviceId - ID of the device to update
     * @param {string} status - New status (ACTIVE, INACTIVE, MAINTENANCE, DECOMMISSIONED)
     * @param {string} reason - Reason for the status change
     * @returns {Object} Updated device information
     */
    async updateDeviceStatus(deviceId, status, reason) {
        // Valid status values
        const validStatuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'];

        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
        }

        // Get the device
        const deviceKey = `iot_device_${deviceId}`;
        const deviceAsBytes = await this.ctx.stub.getState(deviceKey);
        if (!deviceAsBytes || deviceAsBytes.length === 0) {
            throw new Error(`Device with ID ${deviceId} does not exist`);
        }

        const device = JSON.parse(deviceAsBytes.toString());

        // Update status
        device.status = status;

        // Record the status change in device history
        if (!device.statusHistory) {
            device.statusHistory = [];
        }

        device.statusHistory.push({
            from: device.status,
            to: status,
            timestamp: new Date().toISOString(),
            reason: reason || 'Not specified'
        });

        // Store updated device
        await this.ctx.stub.putState(deviceKey, Buffer.from(JSON.stringify(device)));

        return device;
    }

    /**
     * Record device calibration event
     *
     * @param {string} deviceId - ID of the device being calibrated
     * @param {string} calibratedBy - ID of person or system that performed calibration
     * @param {Object} calibrationData - Calibration parameters and results
     * @returns {Object} Updated device information
     */
    async recordCalibration(deviceId, calibratedBy, calibrationData) {
        // Get the device
        const deviceKey = `iot_device_${deviceId}`;
        const deviceAsBytes = await this.ctx.stub.getState(deviceKey);
        if (!deviceAsBytes || deviceAsBytes.length === 0) {
            throw new Error(`Device with ID ${deviceId} does not exist`);
        }

        const device = JSON.parse(deviceAsBytes.toString());

        // Update calibration information
        device.lastCalibratedDate = new Date().toISOString();

        // Record calibration history
        if (!device.calibrationHistory) {
            device.calibrationHistory = [];
        }

        device.calibrationHistory.push({
            timestamp: new Date().toISOString(),
            calibratedBy: calibratedBy,
            data: calibrationData || {}
        });

        // Store updated device
        await this.ctx.stub.putState(deviceKey, Buffer.from(JSON.stringify(device)));

        return device;
    }

    /**
     * Analyze IoT data for a product to generate sustainability metrics
     *
     * @param {string} productId - ID of the product/batch to analyze
     * @returns {Object} Sustainability metrics based on IoT data
     */
    async analyzeSustainabilityMetrics(productId) {
        // Get all IoT data for the product
        const iotData = await this.queryProductIoTData(productId);

        // If no data, return empty metrics
        if (iotData.length === 0) {
            return {
                productId,
                timestamp: new Date().toISOString(),
                metrics: {},
                dataPoints: 0
            };
        }

        // Group data by device type
        const dataByType = {};
        for (const data of iotData) {
            if (!dataByType[data.deviceType]) {
                dataByType[data.deviceType] = [];
            }
            dataByType[data.deviceType].push(data);
        }

        // Calculate metrics based on device types
        const metrics = {};

        // Water usage metrics
        if (dataByType[IOT_DEVICE_TYPES.WATER_USAGE_METER]) {
            const waterData = dataByType[IOT_DEVICE_TYPES.WATER_USAGE_METER];
            metrics.waterUsage = {
                total: waterData.reduce((sum, data) => sum + data.data.usage, 0),
                average: waterData.reduce((sum, data) => sum + data.data.usage, 0) / waterData.length,
                unit: 'liters',
                comparisonToIndustryAverage: this.calculateIndustryComparison('water', waterData)
            };
        }

        // Energy usage metrics
        if (dataByType[IOT_DEVICE_TYPES.ENERGY_METER]) {
            const energyData = dataByType[IOT_DEVICE_TYPES.ENERGY_METER];
            metrics.energyUsage = {
                total: energyData.reduce((sum, data) => sum + data.data.usage, 0),
                average: energyData.reduce((sum, data) => sum + data.data.usage, 0) / energyData.length,
                unit: 'kWh',
                comparisonToIndustryAverage: this.calculateIndustryComparison('energy', energyData)
            };
        }

        // Chemical usage metrics
        if (dataByType[IOT_DEVICE_TYPES.CHEMICAL_SENSOR]) {
            const chemicalData = dataByType[IOT_DEVICE_TYPES.CHEMICAL_SENSOR];
            metrics.chemicalUsage = {
                readings: chemicalData.length,
                averageLevel: chemicalData.reduce((sum, data) => sum + data.data.level, 0) / chemicalData.length,
                safetyThreshold: this.getSafetyThreshold('chemical'),
                exceedances: chemicalData.filter(data => data.data.level > this.getSafetyThreshold('chemical')).length
            };
        }

        // Storage condition metrics
        if (dataByType[IOT_DEVICE_TYPES.TEMPERATURE_SENSOR] && dataByType[IOT_DEVICE_TYPES.HUMIDITY_SENSOR]) {
            const tempData = dataByType[IOT_DEVICE_TYPES.TEMPERATURE_SENSOR];
            const humidityData = dataByType[IOT_DEVICE_TYPES.HUMIDITY_SENSOR];

            metrics.storageConditions = {
                averageTemperature: tempData.reduce((sum, data) => sum + data.data.temperature, 0) / tempData.length,
                temperatureUnit: 'Celsius',
                averageHumidity: humidityData.reduce((sum, data) => sum + data.data.humidity, 0) / humidityData.length,
                humidityUnit: '%',
                optimalConditionPercentage: this.calculateOptimalConditions(tempData, humidityData)
            };
        }

        // Transportation metrics
        if (dataByType[IOT_DEVICE_TYPES.GPS_TRACKER]) {
            const gpsData = dataByType[IOT_DEVICE_TYPES.GPS_TRACKER];

            metrics.transportation = {
                totalDistance: this.calculateTotalDistance(gpsData),
                distanceUnit: 'km',
                carbonFootprint: this.calculateCarbonFootprint(gpsData),
                carbonUnit: 'kg CO2'
            };
        }

        return {
            productId,
            timestamp: new Date().toISOString(),
            metrics: metrics,
            dataPoints: iotData.length
        };
    }

    // Helper methods

    /**
     * Summarize IoT data based on device type for display purposes
     */
    summarizeData(deviceType, data) {
        switch(deviceType) {
            case IOT_DEVICE_TYPES.TEMPERATURE_SENSOR:
                return {
                    temperature: data.temperature,
                    unit: data.unit || 'Celsius'
                };
            case IOT_DEVICE_TYPES.HUMIDITY_SENSOR:
                return {
                    humidity: data.humidity,
                    unit: '%'
                };
            case IOT_DEVICE_TYPES.WATER_USAGE_METER:
                return {
                    usage: data.usage,
                    unit: data.unit || 'liters'
                };
            case IOT_DEVICE_TYPES.ENERGY_METER:
                return {
                    usage: data.usage,
                    unit: data.unit || 'kWh'
                };
            case IOT_DEVICE_TYPES.CHEMICAL_SENSOR:
                return {
                    chemical: data.chemical || 'unspecified',
                    level: data.level,
                    unit: data.unit || 'ppm'
                };
            case IOT_DEVICE_TYPES.GPS_TRACKER:
                return {
                    latitude: data.latitude,
                    longitude: data.longitude,
                    speed: data.speed,
                    speedUnit: data.speedUnit || 'km/h'
                };
            default:
                return data;
        }
    }

    /**
     * Detect abnormal data readings based on device type and thresholds
     */
    detectAbnormalData(deviceType, data) {
        switch(deviceType) {
            case IOT_DEVICE_TYPES.TEMPERATURE_SENSOR:
                // Alert if temperature is outside a normal range for cotton storage
                return data.temperature < 15 || data.temperature > 30;

            case IOT_DEVICE_TYPES.HUMIDITY_SENSOR:
                // Alert if humidity is outside a normal range for cotton storage
                return data.humidity < 35 || data.humidity > 65;

            case IOT_DEVICE_TYPES.WATER_USAGE_METER:
                // Alert for unusually high water usage
                return data.usage > 1000; // Example threshold in liters

            case IOT_DEVICE_TYPES.ENERGY_METER:
                // Alert for unusually high energy usage
                return data.usage > 500; // Example threshold in kWh

            case IOT_DEVICE_TYPES.CHEMICAL_SENSOR:
                // Alert if chemical level exceeds safety threshold
                return data.level > this.getSafetyThreshold(data.chemical || 'default');

            default:
                return false;
        }
    }

    /**
     * Get safety threshold for a specific chemical or sensor type
     */
    getSafetyThreshold(type) {
        // These would be defined based on industry standards and regulations
        const thresholds = {
            'chemical': 50, // Default threshold
            'pesticide': 10,
            'dye': 20,
            'water': 1000,
            'energy': 500
        };

        return thresholds[type] || thresholds['chemical'];
    }

    /**
     * Calculate industry comparison for sustainability metrics
     */
    calculateIndustryComparison(metricType, data) {
        // Industry averages (would come from a database in production)
        const industryAverages = {
            'water': 2000, // liters per kg of cotton
            'energy': 15,  // kWh per kg of cotton
        };

        if (!industryAverages[metricType]) {
            return "No industry benchmark available";
        }

        const totalUsage = data.reduce((sum, item) => sum + item.data.usage, 0);
        const percentDifference = ((industryAverages[metricType] - totalUsage) / industryAverages[metricType]) * 100;

        return {
            industryAverage: industryAverages[metricType],
            percentDifference: percentDifference.toFixed(2),
            isBetter: percentDifference > 0
        };
    }

    /**
     * Calculate percentage of time product spent in optimal storage conditions
     */
    calculateOptimalConditions(tempData, humidityData) {
        // Define optimal ranges
        const optimalTemp = { min: 18, max: 25 }; // Celsius
        const optimalHumidity = { min: 40, max: 60 }; // Percentage

        // Count optimal readings
        let optimalCount = 0;
        const tempTimeMap = {};

        // Map temperature readings by timestamp
        tempData.forEach(data => {
            tempTimeMap[data.timestamp] = data.data.temperature;
        });

        // Check each humidity reading timestamp for corresponding optimal temp
        humidityData.forEach(data => {
            const temp = tempTimeMap[data.timestamp];
            if (temp !== undefined) {
                if (temp >= optimalTemp.min && temp <= optimalTemp.max &&
                    data.data.humidity >= optimalHumidity.min && data.data.humidity <= optimalHumidity.max) {
                    optimalCount++;
                }
            }
        });

        // Calculate percentage
        return (optimalCount / humidityData.length * 100).toFixed(2);
    }

    /**
     * Calculate total distance traveled based on GPS data
     */
    calculateTotalDistance(gpsData) {
        let totalDistance = 0;

        // Sort by timestamp
        const sortedData = [...gpsData].sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        // Calculate distance between consecutive points
        for (let i = 1; i < sortedData.length; i++) {
            const point1 = sortedData[i-1].data;
            const point2 = sortedData[i].data;

            totalDistance += this.haversineDistance(
                point1.latitude, point1.longitude,
                point2.latitude, point2.longitude
            );
        }

        return totalDistance.toFixed(2);
    }

    /**
     * Calculate carbon footprint from transportation
     */
    calculateCarbonFootprint(gpsData) {
        // Simplified calculation: distance * emission factor
        const distance = parseFloat(this.calculateTotalDistance(gpsData));
        const emissionFactor = 0.1; // kg CO2 per km (simplified)

        return (distance * emissionFactor).toFixed(2);
    }

    /**
     * Calculate distance between two points using Haversine formula
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in km
        return distance;
    }

    /**
     * Convert degrees to radians
     */
    deg2rad(deg) {
        return deg * (Math.PI/180);
    }
}

module.exports = {
    IoTIntegration,
    IOT_DEVICE_TYPES,
    DATA_SOURCES
};