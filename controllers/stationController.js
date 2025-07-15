// controllers/stationController.js
const stationService = require('../services/stationService');
const { V } = require('../utils/icons');

exports.getStationInfo = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.info} Demande d'informations pour la station ${stationConfig.id}`);
        
        const info = await stationService.getStationInfo(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            data: info
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans getStationInfo pour ${req.stationConfig?.id}:`, error);
        res.status(500).json({
            success: false,
            stationId: req.stationConfig?.id || 'unknown',
            error: error.message
        });
    }
};

exports.getCurrentWeather = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.thermometer} Demande de données météo pour la station ${stationConfig.id}`);
        
        const weatherData = await stationService.getCurrentWeatherData(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: weatherData
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans getCurrentWeather pour ${req.stationConfig?.id}:`, error);
        res.status(500).json({
            success: false,
            stationId: req.stationConfig?.id || 'unknown',
            error: error.message
        });
    }
};

exports.syncSettings = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.gear} Demande de synchronisation des paramètres pour la station ${stationConfig.id}`);
        
        const result = await stationService.syncStationSettings(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            data: result
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans syncSettings pour ${req.stationConfig?.id}:`, error);
        res.status(500).json({
            success: false,
            stationId: req.stationConfig?.id || 'unknown',
            error: error.message
        });
    }
};

exports.updateTime = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.clock} Demande de mise à jour de l'heure pour la station ${stationConfig.id}`);
        
        const result = await stationService.updateStationTime(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            data: result
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans updateTime pour ${req.stationConfig?.id}:`, error);
        res.status(500).json({
            success: false,
            stationId: req.stationConfig?.id || 'unknown',
            error: error.message
        });
    }
};

exports.getDateTime = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.clock} Demande de l'heure de la station ${stationConfig.id}`);
        
        const stationDateTime = await stationService.getVp2DateTime(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            data: {
                stationDateTime: stationDateTime.toISOString(),
                serverDateTime: new Date().toISOString(),
                timezone: stationConfig.timezone?.value || 'Non défini'
            }
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans getDateTime pour ${req.stationConfig?.id}:`, error);
        res.status(500).json({
            success: false,
            stationId: req.stationConfig?.id || 'unknown',
            error: error.message
        });
    }
};

// module.exports = {
//     getStationInfo,
//     getCurrentWeather,
//     syncSettings,
//     updateTime,
//     getDateTime
// };