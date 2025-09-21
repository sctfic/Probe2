// controllers/queryDbController.js
const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');
const units = require('../config/Units.json');
const { sensorTypeMap } = require('../utils/weatherDataParser');
const configManager = require('../services/configManager');

const compositeProbes = require('../config/compositeProbes.json');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Generic function to handle errors
const handleError = (res, stationId, error, controllerName) => {
    console.error(`${V.error} Erreur dans ${controllerName} pour ${stationId}:`, error);
    res.status(error.statusCode || 500).json({
        success: false,
        stationId: stationId || 'unknown',
        error: error.message
    });
};

async function getIntervalSeconds(stationId, sensorRef, startDate, endDate, stepCount = 10000) {
    // 1. Récupère la plage de dates réelle des données

    const dateRange = await influxdbService.queryDateRange(stationId, sensorRef, startDate, endDate);

    if (!dateRange.firstUtc) {
        const err = new Error('Aucune donnée trouvée dans la plage de dates spécifiée.');
        err.statusCode = 404; // Not Found
        throw err;
    }

    // 2. Utilise les dates effectives ou celles fournies
    const startTime = new Date(dateRange.firstUtc);
    const endTime = new Date(dateRange.lastUtc);
    // 3. Calcule l'intervalle optimal
    const totalSeconds  = (endTime.getTime() - startTime.getTime()) / 1000;
    const interval = Math.max(1, Math.round(totalSeconds / parseInt(stepCount)));
    return {
        start: startTime.toISOString().replace('.000Z', 'Z'),
        end: endTime.toISOString().replace('.000Z', 'Z'),
        intervalSeconds: interval
    };
};

function getMetadata(stationId, sensorRefs, { start, end, intervalSeconds }, data) {
    const measurements = [];
    const sensors = [];
    const mix = {};
    const sensorsFnFromMetric = {};

    sensorRefs.forEach(ref => {
        const { type, sensor } = getTypeAndSensor(ref);
        if (type && sensor) {
            const merge = `${type}:${sensor}`;
            measurements.push(type);
            sensors.push(merge);
            if (mix[type]) {
                mix[type].push(merge);
            } else {
                mix[type] = [merge];
            }
            sensorsFnFromMetric[merge] = {
                unit: units?.[type]?.metric || null,
                userUnit: units?.[type]?.user || null,
                fnFromMetric: units?.[type]?.available_units?.[units?.[type]?.user]?.fnFromMetric || null
            };
        }
    });

    return {
        stationId: stationId,
        measurement: mix,
        sensor: sensors,
        queryTime: new Date().toISOString(),
        first: new Date(start).toISOString(),
        last: new Date(end).toISOString(),
        intervalSeconds: intervalSeconds,
        count: data.length,
        unit: null,
        userUnit: null,
        toUserUnit: sensorsFnFromMetric
    };
}

exports.getQueryMetadata = async (req, res) => {
    const stationId = req.params.stationId;
    try {
        console.log(`${V.info} Demande de métadonnées pour la station ${stationId}`);
        const _measurements = await influxdbService.getMetadata(stationId);
        const allFields = Object.entries(_measurements)
            .flatMap(([measurementType, measurement]) => 
                (measurement.tags?.sensor || []).map(sensor => `${measurementType}:${sensor}`)
            );
        const dateRange = await influxdbService.queryDateRange(stationId, '', 0, Math.round(new Date().getTime()/1000));

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
    } else if (sensorTypeMap[sensorRef]) {
        type = sensorTypeMap[sensorRef];
        sensor = sensorRef;
    } else {
        console.log(`${V.Warn} Sensor reference ${sensorRef} not found in Units.json`);
        type = null;
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
                intervalSeconds: data.count > 1 ? Math.round((new Date(data.lastUtc).getTime() - new Date(data.firstUtc).getTime()) / (data.count - 1))/1000 : null,
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

async function getCalculatedData(stationConfig, probeConfig, start, end, intervalSeconds) {
// console.log(V.info, stationConfig, probeConfig, start, end, intervalSeconds);
    // Prepare script context for calculations
    const scriptContext = {};
    const loadedScripts = new Set();

    for (const probeKey in compositeProbes) {
        const probeConfig = compositeProbes[probeKey];
        if (probeConfig.scriptJS) {
            for (const scriptPath of probeConfig.scriptJS) { // charge les scripts specifie dans la config 
                if (!loadedScripts.has(scriptPath)) { // evite de charger plusieurs fois le même script
                    const fullPath = path.join(__dirname, '..', 'public', scriptPath);
                    try {
                        const requiredModule = require(fullPath); // charge le script
                        Object.assign(scriptContext, requiredModule); // ajoute les fonctions exportees au contexte
                        loadedScripts.add(scriptPath); // marque le script comme charge
                    } catch (e) {
                        console.error(`${V.error} Failed to load script ${scriptPath} for current conditions:`, e);
                    }
                }
            }
        }
    }

    // Prepare calculation function from fnCalc string
    const fnCalcStr = probeConfig.fnCalc
        .replace("%longitude%", stationConfig.longitude.lastReadValue)
        .replace("%latitude%", stationConfig.latitude.lastReadValue)
        .replace("%altitude%", stationConfig.altitude.lastReadValue);

    const fnCalc = vm.runInNewContext(`(${fnCalcStr})`, scriptContext);
    // Fetch needed data from InfluxDB
    const { dataNeeded } = probeConfig;
    const rawData = await influxdbService.queryRaws(stationConfig.id, dataNeeded, start, end, intervalSeconds);
    // Perform calculation for each row
    return rawData.map(row => {
        row.d = row._time;
        return {
            d: row._time,
            v: fnCalc(row) // d et _time sont disponible pour fnCalc()
        }
    }).filter(item => item.v !== null && !isNaN(item.v))
}
exports.getQueryRaw = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount: stepCountStr } = req.query;
    const stepCount = stepCountStr ? parseInt(stepCountStr, 10) : 100000;

    try {
        // --- Common setup ---
        const { type, sensor } = getTypeAndSensor(sensorRef);
        const timeInfo = await getIntervalSeconds(stationId, 'barometer', startDate, endDate, stepCount);
        const { start, end, intervalSeconds } = timeInfo;

        let Data;
        let msg;

        // --- Data Fetching and Processing ---
        if (sensor.endsWith('_calc')) {
            const probeConfig = compositeProbes[sensor];
            if (!probeConfig) {
                const err = new Error(`Calculated sensor configuration not found for ${sensorRef}`);
                err.statusCode = 404;
                throw err;
            }
            Data = await getCalculatedData(req.stationConfig, probeConfig, start, end, intervalSeconds);
            msg = 'Calculated data loaded!';
        } else {
            // Handle regular sensor
            const rawData = await influxdbService.queryRaw(stationId, type+':'+sensor, start, end, intervalSeconds);
            Data = rawData.map(row => ({
                d: row._time,
                v: Math.round(row._value * 100) / 100
            }));

            msg = 'Full data loadded !';
            if (Data.length === stepCount + 1 && new Date(Data[Data.length - 1].d).getTime() === new Date(end).getTime()) {
                msg = '(!) Last value is current !';
            } else if (Data.length < stepCount) {
                msg = '<!> Data missing suspected !';
            }
        }
        // Prepare metadata for the response
        const measurement = units[type];
        const metadata = {
            stationId: stationId,
            measurement: type,
            sensor: sensor,
            queryTime: new Date().toISOString(),
            first: start,
            last: end,
            intervalSeconds: intervalSeconds,
            count: Data.length,
            unit: measurement?.metric || null,
            userUnit: measurement?.user || null,
            toUserUnit: measurement?.available_units?.[measurement.user]?.fnFromMetric || null
        };
        // --- Common Response ---
        res.json({
            success: true,
            message: msg,
            metadata,
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
    try {
        // Use the first sensor to determine the overall time range and interval
        const timeInfo = await getIntervalSeconds(stationId, sensorRefs[0], startDate, endDate, stepCount);
        const data = await influxdbService.queryRaws(stationId, sensorRefs, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
        const Data = data.map(row => {
            let result = { d: row._time };
            // pour chaque key on arrondi à 2 décimales
            Object.keys(row).filter(key => key !== '_time' && key !== 'result' && key !== 'table').forEach(key => {
                result[key] = Math.round(row[key] * 100) / 100;
            });
            return result;
        });

        let msg = 'Full data loadded !';
        if (Data.length === stepCount + 1 && new Date(Data[Data.length - 1].d).getTime() === new Date(timeInfo.end).getTime()) {
            msg = '(!) Last value is current !';
        } else if (Data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }

        const metadata = getMetadata(stationId, sensorRefs, timeInfo, Data);

        res.json({
            success: true,
            message: msg,
            metadata,
            data: Data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRaws');
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
        const data = await influxdbService.queryCandle(stationId, sensor, start, end, intervalSeconds);
        // formatage des données
        const Data = data.map(row => {
            return {
                d: row.datetime,
                Open: row.first,
                High: row.max,
                Low: row.min,
                Close: row.last,
                Mean: row.avg,
                Count: row.count
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

exports.getQueryWindRose = async (req, res) => { // https://observablehq.com/@julesblm/wind-rose
    const { stationId } = req.params;
    const { startDate, endDate, stepCount = 10 } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }
    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const timeInfo = await getIntervalSeconds(stationId, 'speed:Wind', startDate, endDate, stepCount);
        const data = await influxdbService.queryWindRose(stationId, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
        let msg = 'Full data loadded !';
        if (data.length==stepCount+1 && new Date(data[data.length-1].d).getTime()==timeInfo.end) {
            // data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        const metadata = getMetadata(stationId, ['speed:Wind', 'direction:Gust', 'speed:Gust', 'direction:Wind'], timeInfo, data);

        res.json({
            success: true,
            message: msg,
            metadata,
            data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWindRose');
    }
};

exports.getQueryWindVectors = async (req, res) => {
    const { stationId, sensorRef='Wind' } = req.params;
    const { startDate, endDate, stepCount = 100 } = req.query;
    
    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }
    if (sensorRef !== 'Wind' && sensorRef !== 'Gust') {sensorRef = 'Wind';}
    
    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const timeInfo = await getIntervalSeconds(stationId, 'speed:Wind', startDate, endDate, stepCount);
        const data = await influxdbService.queryWindVectors(stationId, sensorRef, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
        let msg = 'Full data loadded !';
        if (data.length==stepCount+1 && new Date(data[data.length-1].d).getTime()==timeInfo.end) {
            // data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        const metadata = getMetadata(stationId, ['speed:'+sensorRef, 'direction:'+sensorRef], timeInfo, data);
        metadata.sensor = sensorRef;
        res.json({
            success: true,
            message: msg,
            metadata,
            data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWindVectors');
    }
};

exports.clearAllData = async (req, res) => {
    try {
        console.log(`${V.Warn} Demande de suppression de toutes les données du bucket`);
        // const success = await influxdbService.clearBucket();
        // force lastArchiveDate au 01/08/2025 et enregistre la conig
        req.params.stationId = 'VP2_Serramoune';
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