// controllers/stationController.js
const stationService = require('../services/stationService');
const { withStationLamps } = require('../middleware/stationMiddleware');

const setStationTime = async (req, res) => {
    return await stationService.updateStationTime(req.stationConfig);
};

const getCurrentConditions = async (req, res) => {
    return await stationService.fetchCurrentConditions(req.stationConfig);
};

const getArchiveData = async (req, res) => {
    if (!req.stationConfig.lastArchiveDate) {
        await stationService.updateArchiveConfiguration(req.stationConfig);
        req.stationConfig.lastArchiveDate = '2020-01-01T00:00:00.000Z';
    }
    const startDate = req.stationConfig.lastArchiveDate;
    console.log(`[Archive Download] Requête pour ${req.stationConfig.id} à partir de ${startDate ? startDate : 'la dernière archive'}`);
    return await stationService.downloadArchiveData(req.stationConfig, startDate ? new Date(startDate) : undefined);
};

const syncStationSettings = async (req, res) => {
    const result = await stationService.syncStationSettings(req.stationConfig);
    res.json(result);
};
const syncSettings = async (req, res) => {
    try {
        const result = await stationService.syncStationSettings(req.stationConfig);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

module.exports = {
    setStationTime: withStationLamps(setStationTime),
    getCurrentConditions: withStationLamps(getCurrentConditions),
    getArchiveData: withStationLamps(getArchiveData),
    syncStationSettings: withStationLamps(syncStationSettings),
    syncSettings: withStationLamps(syncSettings)
};
