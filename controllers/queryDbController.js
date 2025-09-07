// controllers/queryDbController.js
const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');
const units = require('../config/Units.json');
const { sensorTypeMap } = require('../utils/weatherDataParser');
const configManager = require('../services/configManager');
const stationMiddleware = require('../middleware/stationMiddleware');
//

// Generic function to handle responses
// const handleResponse = (res, stationId, data, format = 'json', unit = null, message = null) => {
//     if (format === 'tsv') { // visible dans le navigateur comme un fichier csv pas en telechargement
//         res.header('Content-Type', 'text/plain');
//         if (data && data.length > 0) {
//             const headers = Object.keys({d: 'Date', v: 'Value', ...data[0],unit}).join('\t');
//             const rows = data.map(row => Object.values({d: row.d, v: row.v, ...row,unit}).join('\t')).join('\n');
//             res.send(`${headers}\n${rows}`);
//         } else {
//             res.send('');
//         }
//     } else {
//         res.json({
//             success: true,
//             message: message || 'Success',
//             stationId: stationId,
//             timestamp: new Date().toISOString(),
//             unit: unit,
//             data: data
//         });
//     }
// };

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
    return {
        start: startTime.getTime(),
        end: endTime.getTime(),
        intervalSeconds: Math.round(totalSeconds / parseInt(stepCount))
    };
};

exports.getQueryMetadata = async (req, res) => {
    const stationId = req.params.stationId;
    try {
        console.log(`${V.info} Demande de métadonnées pour la station ${stationId}`);
        const _measurements = await influxdbService.getMetadata(stationId);
        const allFields = Object.values(_measurements).flatMap(measurement => measurement.tags.sensor);
        const dateRange = await influxdbService.queryDateRange(stationId, '', 0, new Date().getTime()/1000);

        res.json({
            success: true,
            message: 'Success',
            metadata: {
                stationId: stationId,
                sensor: [...new Set(allFields)],
                queryTime: new Date().toISOString(),
                first: dateRange.firstUtc,
                last: dateRange.lastUtc,
                intervalSeconds: null,
                count: null,
                unit: units,
                userUnit: null,
                toUserUnit: null
            },
            measurements: _measurements
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryMetadata');
    }
};

function getTypeAndSensor(sensorRef='') {
    let type, sensor;
    if (sensorRef.includes(':')) {
        [type, sensor] = sensorRef.split(':');
    } else {
        type = sensorTypeMap[sensorRef];
        sensor = sensorRef;
    }
    return { type, sensor };
}

exports.getQueryRange = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRef sont requis.' });
    }
    
    const { type, sensor } = getTypeAndSensor(sensorRef);
    
    try {
        console.log(`${V.info} Demande de plage de dates pour ${stationId} - ${sensorRef}`);
        const data = await influxdbService.queryDateRange(stationId, sensorRef, startDate ? new Date(startDate).getTime()/1000 : null, endDate ? (new Date(endDate).getTime()+1000)/1000 : null);
        res.json({
            success: true,
            message: 'Success',
            metadata: {
                stationId: stationId,
                sensor: sensor,
                queryTime: new Date().toISOString(),
                first: data.firstUtc ? new Date(data.firstUtc).toISOString() : null,
                last: data.lastUtc ? new Date(data.lastUtc).toISOString() : null,
                intervalSeconds: data.count > 0 ? Math.round((new Date(data.lastUtc).getTime() - new Date(data.firstUtc).getTime()) / data.count)/1000 : null,
                count: data.count,
                unit: data.unit || '',
                userUnit: units?.[type]?.user || '',
                toUserUnit: units?.[type]?.available_units?.[units?.[type]?.user]?.fnFromMetric || null
            },
            data: []
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRange');
    }
};

exports.getQueryRaw = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount: stepCountStr } = req.query;
    const stepCount = stepCountStr ? parseInt(stepCountStr, 10) : 100000;
    
    const { type, sensor } = getTypeAndSensor(sensorRef);
    
    try {
        // console.log(`${V.info} Demande de données brutes pour ${stationId} - ${sensorRef}`);
        const {start, end, intervalSeconds } = await getIntervalSeconds(stationId, sensorRef, startDate, endDate, stepCount);
        // console.log(`${V.info} Intervalle choisi: ${intervalSeconds} secondes`, { start, end, stop: (start+stepCount*intervalSeconds*1000) });
        const data = await influxdbService.queryRaw(stationId, sensorRef, start/1000, end/1000, intervalSeconds);
        // formatage des données
        const Data = data.map(row => {
            return {
                d: row._time,
                v: Math.round(row._value * 100) / 100
            };
        });
        let msg = 'Full data loadded !';
        if (Data.length==stepCount+1 && new Date(Data[Data.length-1].d).getTime()==end) {
            // Data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (Data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        res.json({
            success: true,
            message: msg,
            metadata: {
                stationId: stationId,
                measurement: type,
                sensor: sensor,
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: Data.length,
                unit: data[0]?.unit || '',
                userUnit: units?.[type]?.user || '',
                toUserUnit: units?.[type]?.available_units?.[units?.[type]?.user]?.fnFromMetric || null
            },
            data: Data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRaw');
    }
};

exports.getQueryRaws = async (req, res) => {
    const { stationId, sensorRefs: sensorRefsStr } = req.params;
    const { startDate, endDate, stepCount: stepCountStr } = req.query;
    const stepCount = stepCountStr ? parseInt(stepCountStr, 10) : 100000;

    let sensorRefs = sensorRefsStr.split(',');
    // on retire les doublons, les vides
    sensorRefs = sensorRefs.filter((ref, index) => ref && sensorRefs.indexOf(ref) === index);

    if (sensorRefs.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun capteur valide dans sensorRefs.' });
    }
    const measurements = [];
    const sensors = [];
    const mix = {};
    const sensorsFnFromMetric = {};
    sensorRefs.forEach(ref => {
        const { type, sensor } = getTypeAndSensor(ref);
        measurements.push(type);
        sensors.push(sensor);
        mix[type] = sensor;
        sensorsFnFromMetric[sensor] = {
            unit: units?.[type]?.metric || null,
            userUnit: units?.[type]?.user || null,
            fnFromMetric: units?.[type]?.available_units?.[units?.[type]?.user]?.fnFromMetric || null
        };
    });
    try {
        // Use the first sensor to determine the overall time range and interval
        const { start, end, intervalSeconds } = await getIntervalSeconds(stationId, sensorRefs[0], startDate, endDate, stepCount);

        const data = await influxdbService.queryRaws(stationId, sensorRefs, start / 1000, end / 1000, intervalSeconds);
        // console.log(`${V.info} Donnees recuperees:`, data);
        const Data = data.map(row => {
            let result = {
                d: row._time
            };
            sensors.forEach(ref => {
                result[ref] = Math.round(row[ref] * 100) / 100;
            });
            return result;
        });
        let msg = 'Full data loadded !';
        if (Data.length==stepCount+1 && new Date(Data[Data.length-1].d).getTime()==end) {
            msg = '(!) Last value is current !';
        } else if (Data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }

        res.json({
            success: true,
            message: msg,
            metadata: {
                stationId: stationId,
                measurement: mix,
                sensor: sensors,
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: Data.length,
                unit: null,
                userUnit: null,
                toUserUnit: sensorsFnFromMetric
            },
            data: Data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRaw');
    }
};

exports.getQueryCandle = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount = 100 } = req.query;
    
    const { type, sensor } = getTypeAndSensor(sensorRef);
    
    try {
        // console.log(`${V.info} Demande de données candle pour ${stationId} - ${sensorRef} avec ${stepCount} intervalles`);
        const {start, end, intervalSeconds } = await getIntervalSeconds(stationId, sensor, startDate, endDate, stepCount);
        // console.log(`${V.info} Intervalle choisi: ${intervalSeconds} secondes`, { start, end });
        const data = await influxdbService.queryCandle(stationId, sensor, start/1000, end/1000, intervalSeconds);
        // formatage des données
        const Data = data.map(row => {
            return {
                d: row.datetime,
                first: row.first,
                min: row.min,
                v: row.avg,
                max: row.max,
                last: row.last,
                count: row.count
            };
        });

        let msg = 'Full data loadded !';
        if (Data.length==stepCount+1 && new Date(Data[Data.length-1].d).getTime()==end) {
            // Data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (Data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        res.json({
            success: true,
            message: msg,
            metadata: {
                stationId: stationId,
                measurement: type,
                sensor: sensor,
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: Data.length,
                unit: data[0]?.unit || '',
                userUnit: units?.[type]?.user || '',
                toUserUnit: units?.[type]?.available_units?.[units?.[type]?.user]?.fnFromMetric || null
            },
            data: Data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryCandle');
    }
};

exports.getQueryWindRose = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate, stepCount = 10 } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }
    
    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const {start, end, intervalSeconds } = await getIntervalSeconds(stationId, 'speed', startDate, endDate, stepCount);
        console.log(`${V.info} Intervalle calculé: ${intervalSeconds}s pour ${stepCount} étapes`, { start, end });
        const data = await influxdbService.queryWindRose(stationId, start/1000, end/1000, intervalSeconds);
        let msg = 'Full data loadded !';
        if (data.length==stepCount+1 && new Date(data[data.length-1].d).getTime()==end) {
            // data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        res.json({
            success: true,
            message: msg,
            metadata: {
                stationId: stationId,
                measurement: { "speed": 'Wind', "direction": 'Wind' },
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: data.length,
                unit: units?.['Wind']?.metric || '',
                userUnit: units?.['Wind']?.user || '',
                toUserUnit: units?.['Wind']?.available_units?.[units?.['Wind']?.user]?.fnFromMetric || null
            },
            data: data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWindRose');
    }
};

exports.getQueryWindVectors = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate, stepCount = 100 } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }
    
    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const {start, end, intervalSeconds } = await getIntervalSeconds(stationId, 'speed', startDate, endDate, stepCount);
        console.log(`${V.info} Intervalle calculé: ${intervalSeconds}s pour ${stepCount} étapes`, { start, end });
        const data = await influxdbService.queryWindVectors(stationId, start/1000, end/1000, intervalSeconds);
        let msg = 'Full data loadded !';
        if (data.length==stepCount+1 && new Date(data[data.length-1].d).getTime()==end) {
            // data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        res.json({
            success: true,
            message: msg,
            metadata: {
                stationId: stationId,
                sensor: ['Wind', 'Gust'],
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: data.length,
                unit: units?.['Wind']?.metric || '',
                userUnit: units?.['Wind']?.user || '',
                toUserUnit: units?.['Wind']?.available_units?.[units?.['Wind']?.user]?.fnFromMetric || null
            },
            data: data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWindVectors');
    }
};

exports.clearAllData = async (req, res) => {
    try {
        console.log(`${V.Warn} Demande de suppression de toutes les données du bucket`);
        const success = await influxdbService.clearBucket();
        // force lastArchiveDate au 01/08/2025 et enregistre la conig
        req.params.stationId = 'VP2_Serramoune';
        stationMiddleware.loadStationConfig(req, res, () => {});
        req.stationConfig.lastArchiveDate = '2025-08-25T00:00:00.000Z';
        configManager.autoSaveConfig(req.stationConfig);

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