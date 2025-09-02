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
        const data = await influxdbService.getMetadata(stationId);

        res.json({
            success: true,
            message: 'Success',
            metadata: {
                stationId: stationId,
                sensor: data._field,
                queryTime: new Date().toISOString(),
                first: null,
                last: null,
                intervalSeconds: null,
                count: null,
                unit: units,
                userUnit: null,
                toUserUnit: null
            },
            data: data
        });
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
        const data = await influxdbService.queryDateRange(stationId, sensorRef, startDate ? new Date(startDate).getTime()/1000 : null, endDate ? (new Date(endDate).getTime()+1000)/1000 : null);
        res.json({
            success: true,
            message: 'Success',
            metadata: {
                stationId: stationId,
                sensor: sensorRef,
                queryTime: new Date().toISOString(),
                first: data.firstUtc ? new Date(data.firstUtc).toISOString() : null,
                last: data.lastUtc ? new Date(data.lastUtc).toISOString() : null,
                intervalSeconds: data.count > 0 ? Math.round((new Date(data.lastUtc).getTime() - new Date(data.firstUtc).getTime()) / data.count)/1000 : null,
                count: data.count,
                unit: data.unit || '',
                userUnit: units?.[sensorTypeMap[sensorRef]]?.user || '',
                toUserUnit: units?.[sensorTypeMap[sensorRef]]?.avaible_units?.[units?.[sensorTypeMap[sensorRef]]?.user]?.fnFromMetric || null
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
    
    if (!stationId || !sensorRef) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRef sont requis.' });
    } else if (sensorRef === 'speed') {
        // n'est pas pris en charge par QueryRaw
        // return res.status(400).json({ success: false, error: '"speed" n\'est pas pris en charge par QueryRaw.' });
    }
    
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
                measurement: sensorTypeMap[sensorRef],
                sensor: sensorRef,
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: Data.length,
                unit: data[0]?.unit || '',
                userUnit: units?.[sensorTypeMap[sensorRef]]?.user || '',
                toUserUnit: units?.[sensorTypeMap[sensorRef]]?.avaible_units?.[units?.[sensorTypeMap[sensorRef]]?.user]?.fnFromMetric || null
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

    if (!stationId || !sensorRefsStr) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRefs sont requis.' });
    }

    let sensorRefs = sensorRefsStr.split(',');
    // on retire les doublons, les vides
    sensorRefs = sensorRefs.filter((ref, index) => ref && sensorRefs.indexOf(ref) === index);

    if (sensorRefs.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun capteur valide dans sensorRefs.' });
    }

    try {
        // Use the first sensor to determine the overall time range and interval
        const { start, end, intervalSeconds } = await getIntervalSeconds(stationId, sensorRefs[0], startDate, endDate, stepCount);

        const data = await influxdbService.queryRaws(stationId, sensorRefs, start / 1000, end / 1000, intervalSeconds);
        const Data = data.map(row => {
            let result = {
                d: row._time
            };
            sensorRefs.forEach(ref => {
                result[ref] = Math.round(row[ref] * 100) / 100;
            });
            return result;
        });
        let msg = 'Full data loadded !';
        if (Data.length==stepCount+1 && new Date(Data[Data.length-1].d).getTime()==end) {
            // Data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (Data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        // object avec une propriete au nom de chaque sensorTypeMap[ref] contenant l'unité user, metric et fnFromMetric
        const measurementUnits = sensorRefs.reduce((acc, ref) => {
            // si acc[sensorTypeMap[ref]] n'existe pas, l'initialiser
            if (!acc[sensorTypeMap[ref]]) {
                acc[sensorTypeMap[ref]] = [ref];
            } else {
                acc[sensorTypeMap[ref]].push(ref);
            }
            return acc;
        }, {});
        const sensorsFnFromMetric = sensorRefs.reduce((acc, ref) => {
            // si acc[sensorTypeMap[ref]] n'existe pas, l'initialiser
            acc[ref] = {
                unit: units?.[sensorTypeMap[ref]]?.metric,
                userUnit: units?.[sensorTypeMap[ref]]?.user,
                toUserUnit: units?.[sensorTypeMap[ref]]?.avaible_units?.[units?.[sensorTypeMap[ref]]?.user]?.fnFromMetric,
            };
            return acc;
        }, {});

        res.json({
            success: true,
            message: msg,
            metadata: {
                stationId: stationId,
                measurement: measurementUnits,
                sensor: sensorRefs,
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
    
    if (!stationId || !sensorRef) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRef sont requis.' });
    }
    
    try {
        // console.log(`${V.info} Demande de données candle pour ${stationId} - ${sensorRef} avec ${stepCount} intervalles`);
        const {start, end, intervalSeconds } = await getIntervalSeconds(stationId, sensorRef, startDate, endDate, stepCount);
        // console.log(`${V.info} Intervalle choisi: ${intervalSeconds} secondes`, { start, end });
        const data = await influxdbService.queryCandle(stationId, sensorRef, start/1000, end/1000, intervalSeconds);
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
                sensor: sensorRef,
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: Data.length,
                unit: data[0]?.unit || '',
                userUnit: units?.[sensorTypeMap[sensorRef]]?.user || '',
                toUserUnit: units?.[sensorTypeMap[sensorRef]]?.avaible_units?.[units?.[sensorTypeMap[sensorRef]]?.user]?.fnFromMetric || null
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
                sensor: ['speed', 'gust'],
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: data.length,
                unit: units?.['speed']?.metric || '',
                userUnit: units?.['speed']?.user || '',
                toUserUnit: units?.['speed']?.avaible_units?.[units?.['speed']?.user]?.fnFromMetric || null
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
                sensor: ['speed', 'gust'],
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: data.length,
                unit: units?.['speed']?.metric || '',
                userUnit: units?.['speed']?.user || '',
                toUserUnit: units?.['speed']?.avaible_units?.[units?.['speed']?.user]?.fnFromMetric || null
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