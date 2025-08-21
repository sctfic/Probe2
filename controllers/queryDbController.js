// controllers/queryDbController.js
const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');

// Generic function to handle responses
const handleResponse = (res, stationId, data, format = 'json') => {
    if (format === 'tsv') { // visible dans le navigateur comme un fichier csv pas en telechargement
        res.header('Content-Type', 'text/plain');
        if (data && data.length > 0) {
            const headers = Object.keys(data[0]).join('\t');
            const rows = data.map(row => Object.values(row).join('\t')).join('\n');
            res.send(`${headers}\n${rows}`);
        } else {
            res.send('');
        }
    } else {
        res.json({
            success: true,
            stationId: stationId,
            timestamp: new Date().toISOString(),
            data: data
        });
    }
};

// Generic function to handle errors
const handleError = (res, stationId, error, controllerName) => {
    console.error(`${V.error} Erreur dans ${controllerName} pour ${stationId}:`, error);
    res.status(500).json({
        success: false,
        stationId: stationId || 'unknown',
        error: error.message
    });
};

exports.getQueryMetadata = async (req, res) => {
    const stationId = req.params.stationId;
    try {
        console.log(`${V.info} Demande de métadonnées pour la station ${stationId}`);
        const data = await influxdbService.getMetadata(stationId);
        handleResponse(res, stationId, data);
    } catch (error) {
        handleError(res, stationId, error, 'getQueryMetadata');
    }
};

exports.getQueryRange = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate } = req.query;
    try {
        console.log(`${V.info} Demande de plage de dates pour ${stationId} - ${sensorRef}`);
        const data = await influxdbService.queryDateRange(stationId, sensorRef, startDate, endDate);
        handleResponse(res, stationId, data);
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRange');
    }
};

exports.getQueryRaw = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate } = req.query;
    try {
        console.log(`${V.info} Demande de données brutes pour ${stationId} - ${sensorRef}`);
        const data = await influxdbService.queryRaw(stationId, sensorRef, startDate, endDate);
        // formatage des données
        const formattedData = data.map(row => {
            return {
                datetime: row._time,
                value: row._value
            };
        });
        handleResponse(res, stationId, formattedData, 'tsv');
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRaw');
    }
};

exports.getQueryWind = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate } = req.query;
    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const data = await influxdbService.queryWind(stationId, startDate, endDate);
        handleResponse(res, stationId, data);
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWind');
    }
};

exports.getQueryRain = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate } = req.query;
    try {
        console.log(`${V.info} Demande de données de pluie pour ${stationId}`);
        const data = await influxdbService.queryRain(stationId, startDate, endDate);
        handleResponse(res, stationId, data, 'tsv');
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRain');
    }
};

exports.getQueryCandle = async (req, res) => {
    const { stationId } = req.params;
    const { sensorRef, startDate, endDate } = req.query;
    if (!sensorRef) {
        return res.status(400).json({ success: false, error: 'Le paramètre sensorRef est requis.' });
    }
    try {
        console.log(`${V.info} Demande de données candle pour ${stationId} - ${sensorRef}`);
        const data = await influxdbService.queryCandle(stationId, sensorRef, startDate, endDate);
        handleResponse(res, stationId, data, 'tsv');
    } catch (error) {
        handleError(res, stationId, error, 'getQueryCandle');
    }
};