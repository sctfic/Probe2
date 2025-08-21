// controllers/stationController.js
const stationService = require('../services/stationService');
const influxdbService = require('../services/influxdbService');
const configManager = require('../services/configManager');
const { V } = require('../utils/icons');

exports.getStationInfo = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.info} Demande d'informations pour la station ${stationConfig.id}`);
        
        const info = await stationService.getStationInfo(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
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
exports.getArchiveData = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.Parabol} Demande de données d'archive pour la station ${stationConfig.id}`);
        
        const archiveData = await stationService.downloadArchiveData(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: archiveData
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans getArchiveData pour ${req.stationConfig?.id}:`, error);
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
        // autosave config
        configManager.autoSaveConfig(stationConfig);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: result,
            settings: stationConfig
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
            timestamp: new Date().toISOString(),
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
            timestamp: new Date().toISOString(),
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

exports.queryInfluxDB = async (req, res) => {
    try {
        const { stationId } = req.params;
        let { sensorRefs, nbrStep, grouping, startDate, endDate } = req.query;
        // exemple d'URL : http://probe2.lpz.ovh/api/station/VP2_Serramoune/query?sensorRefs=inTemp&nbrStep=12&grouping=avg
        // &startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:59:59.999Z

        // Pour les requêtes GET, sensorRefs peut être une chaîne de caractères séparée par des virgules
        if (typeof sensorRefs === 'string') {
            sensorRefs = sensorRefs.split(',');
        }

        console.log(`${V.database} Demande de données InfluxDB pour la station ${stationId}`);

        const queryParams = {
            stationId,
            sensorRefs,
            nbrStep,
            grouping,
            startDate,
            endDate
        };

        const results = await influxdbService.queryData(queryParams);

        res.json({
            success: true,
            stationId: stationId,
            timestamp: new Date().toISOString(),
            data: results
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans queryInfluxDB pour ${req.params.stationId}:`, error);
        res.status(500).json({
            success: false,
            stationId: req.params.stationId || 'unknown',
            error: error.message
        });
    }
};

// module.exports = {
//     getStationInfo,
//     getCurrentWeather,
//     getArchiveData,
//     syncSettings,
//     updateTime,
//     getDateTime,
//     queryInfluxDB
// };