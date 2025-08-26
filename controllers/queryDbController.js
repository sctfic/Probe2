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

async function getIntervalSeconds(stationId, sensorRef, startDate, endDate, stepCount = 100000) {
    // 1. Récupère la plage de dates réelle des données
    const dateRange = await influxdbService.queryDateRange(stationId, sensorRef, startDate, endDate);
    console.log(`Plage de dates réelle pour ${stationId} - ${sensorRef}:`, dateRange);
    // 2. Utilise les dates effectives ou celles fournies
    const startTime = new Date(dateRange.firstUtc);
    const endTime = new Date(dateRange.lastUtc);
    // 3. Calcule l'intervalle optimal
    const totalSeconds  = (endTime.getTime() - startTime.getTime()) / 1000;
    // console.log(`Total de secondes: ${totalSeconds}`, endTime.getTime()/1000, startTime.getTime()/1000);
    return Math.round(totalSeconds / parseInt(stepCount));
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
    
    if (!stationId || !sensorRef) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRef sont requis.' });
    }
    
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
    const { startDate, endDate, stepCount = 100000 } = req.query;
    
    if (!stationId || !sensorRef) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRef sont requis.' });
    }
    
    try {
        console.log(`${V.info} Demande de données brutes pour ${stationId} - ${sensorRef}`);
        const intervalSeconds = await getIntervalSeconds(stationId, sensorRef, startDate, endDate, stepCount);
        const data = await influxdbService.queryRaw(stationId, sensorRef, startDate, endDate, intervalSeconds);
        // formatage des données
        const formattedData = data.map(row => {
            return {
                datetime: row._time,
                value: row._value,
                unit: row.unit
            };
        });
        handleResponse(res, stationId, formattedData, 'tsv');
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRaw');
    }
};

exports.getQueryCandle = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount = 100 } = req.query;
    
    if (!stationId || !sensorRef) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRef sont requis.' });
    }
    
    try {
        console.log(`${V.info} Demande de données candle pour ${stationId} - ${sensorRef} avec ${stepCount} intervalles`);
        const intervalSeconds = await getIntervalSeconds(stationId, sensorRef, startDate, endDate, stepCount);
        const data = await influxdbService.queryCandle(stationId, sensorRef, startDate, endDate, intervalSeconds);
        // formatage des données
        const formattedData = data.map(row => {
            return {
                datetime: row.datetime,
                first: row.first,
                min: row.min,
                avg: row.avg,
                max: row.max,
                last: row.last,
                count: row.count
            };
        });
        handleResponse(res, stationId, formattedData, 'tsv');
    } catch (error) {
        handleError(res, stationId, error, 'getQueryCandle');
    }
};

exports.getQueryWind = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate, stepCount = 10 } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }
    
    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const intervalSeconds = await getIntervalSeconds(stationId, 'speed', startDate, endDate, stepCount);
        console.log(`${V.info} Intervalle calculé: ${intervalSeconds}s pour ${stepCount} étapes`);
        const data = await influxdbService.queryWind(stationId, startDate, endDate, intervalSeconds);
        handleResponse(res, stationId, data);
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWind');
    }
};

exports.getQueryRain = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate, stepCount = 100 } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }
    
    try {
        console.log(`${V.info} Demande de données de pluie pour ${stationId}`);
        const intervalSeconds = await getIntervalSeconds(stationId, 'rainFall', startDate, endDate, stepCount);
        const data = await influxdbService.queryRain(stationId, startDate, endDate, intervalSeconds);
        handleResponse(res, stationId, data, 'tsv');
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRain');
    }
};

exports.clearAllData = async (req, res) => {
    try {
        console.log(`${V.Warn} Demande de suppression de toutes les données du bucket`);
        const success = await influxdbService.clearBucket();
        if (success) {
            res.json({
                success: true,
                message: 'Toutes les données du bucket ont été supprimées avec succès.',
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('La suppression des données du bucket a échoué.');
        }
    } catch (error) {
        handleError(res, 'all-stations', error, 'clearAllData');
    }
};