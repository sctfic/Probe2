// controllers/stationController.js
const stationService = require('../services/stationService');
const { withStationLamps } = require('../middleware/stationMiddleware');

const setStationTime = async (req, res) => {
    return await stationService.updateStationTime(req.stationConfig);
};

const setStationLocation = async (req, res) => {
    const { latitude, longitude, elevation } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof elevation !== 'number') {
        res.status(400).json({ error: 'Les paramètres latitude, longitude et elevation sont requis et doivent être des nombres.' });
        return;
    }
    return await stationService.updateStationLocation(req.stationConfig, { latitude, longitude, elevation });
};

const setStationTimezone = async (req, res) => {
    const { type, index, offsetGMT } = req.body;
    if (!type || (type === 'preset' && typeof index !== 'number') || (type === 'custom' && typeof offsetGMT !== 'number')) {
        res.status(400).json({ error: 'Les paramètres "type" et "index" ou "offsetGMT" sont requis.' });
        return;
    }
    return await stationService.updateStationTimezone(req.stationConfig, { type, index, offsetGMT });
};

const getCurrentConditions = async (req, res) => {
    return await stationService.fetchCurrentConditions(req.stationConfig);
};

const getStationSettings = async (req, res) => {
    return await stationService.fetchStationSettings(req.stationConfig);
};

const getArchiveData = async (req, res) => {
    const { startDate } = req.query;
    if (startDate && isNaN(new Date(startDate).getTime())) {
        res.status(400).json({ error: "Format de startDate invalide. Utilisez le format ISO 8601." });
        return;
    }
    console.log(`[Archive Download] Requête pour ${req.stationConfig.id} à partir de ${startDate ? startDate : 'la dernière archive'}`);
    return await stationService.downloadArchiveData(req.stationConfig, startDate ? new Date(startDate) : undefined);
};

const receiveArchiveData = async (req, res) => {
    const { stationConfig, body: archiveData } = req;

    if (!Array.isArray(archiveData) || archiveData.length === 0) {
        return res.status(400).json({ error: 'Les données d\'archive doivent être un tableau non vide.' });
    }

    try {
        const result = await stationService.saveReceivedArchiveData(stationConfig, archiveData);
        if (result.status === 'error') {
            return res.status(400).json(result);
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error(`[receiveArchiveData] Erreur: ${error.message}`);
        return res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
};

module.exports = {
    setStationTime: withStationLamps(setStationTime),
    setStationLocation: withStationLamps(setStationLocation),
    setStationTimezone: withStationLamps(setStationTimezone),
    getCurrentConditions: withStationLamps(getCurrentConditions),
    getStationSettings: withStationLamps(getStationSettings),
    receiveArchiveData,
    getArchiveData: withStationLamps(getArchiveData)
};
