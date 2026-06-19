// Probe\controllers\queryDbController.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

const influxdbService = require('../services/influxdbService');
const { V, O } = require('../utils/icons');
const unitsProvider = require('../services/unitsProvider');
const configManager = require('../services/configManager');
const probeVersion = require('../package.json').version;

const probesProvider = require('../services/probesProvider');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Generic function to handle errors
const handleError = (res, stationId, error, controllerName) => {
    console.error(`${V.error} Erreur dans ${controllerName} pour ${stationId}:`, error);

    // Détection spécifique des erreurs InfluxDB
    let errorMessage = error.message;
    let statusCode = error.statusCode || 500;

    // Vérifier si c'est une erreur d'authentification InfluxDB
    if (error.message && (
        error.message.toLowerCase().includes('unauthorized') ||
        error.message.toLowerCase().includes('401')
    )) {
        errorMessage = `Erreur d'authentification InfluxDB: Accès non autorisé à la base de données. Vérifiez le token et les permissions dans la configuration InfluxDB.`;
        statusCode = 502; // Bad Gateway - pour indiquer que c'est un problème avec le service backend
    }

    // Autres erreurs InfluxDB spécifiques
    if (error.message && error.message.toLowerCase().includes('influx')) {
        errorMessage = `Erreur InfluxDB: ${error.message}`;
    }

    res.status(statusCode).json({
        success: false,
        stationId: stationId || 'unknown',
        error: errorMessage,
        source: 'database' // Ajout d'un indicateur de source d'erreur
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
    const totalSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const interval = Math.max(1, Math.round(totalSeconds / parseInt(stepCount) / 300)) * 300;
    return {
        start: startTime.toISOString().replace('.000Z', 'Z'),
        end: endTime.toISOString().replace('.000Z', 'Z'),
        intervalSeconds: interval // arrondi à 5min
    };
};


function getMetadata(req, sensorRefs, { start, end, intervalSeconds }, data) {
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
            const units = unitsProvider.getUnits();
            sensorsFnFromMetric[merge] = {
                unit: units?.[type]?.metric || null,
                userUnit: units?.[type]?.user || null,
                fnFromMetric: units?.[type]?.available_units?.[units?.[type]?.user]?.fnFromMetric || null
            };
        }
    });

    return {
        stationId: req.stationConfig.id,
        gps: {
            latitude: req.stationConfig.latitude.desired || req.stationConfig.latitude.lastReadValue,
            longitude: req.stationConfig.longitude.desired || req.stationConfig.longitude.lastReadValue,
            altitude: req.stationConfig.altitude.desired || req.stationConfig.altitude.lastReadValue,
        },
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
        const buckets = influxdbService.getBucketsInfo().filter(b => b.key !== 'Integrators').map(b => b.bucket);
        console.log(buckets);

        // Fetch metadata and date range from all buckets
        const [metadata, dateRangeResults] = await Promise.all([
            influxdbService.getInfluxMetadata(stationId, 100),
            Promise.all(buckets.map(b => influxdbService.queryDateRange(stationId, 'pressure:barometer', null, null, b)))
        ]);
        // Merge date range
        const firstUtc = dateRangeResults.filter(r => r.firstUtc).map(r => r.firstUtc).sort()[0] || null;
        const lastUtc = dateRangeResults.filter(r => r.lastUtc).map(r => r.lastUtc).sort().reverse()[0] || null;
        const dateRange = { firstUtc, lastUtc };

        const allFields = metadata ? Object.entries(metadata)
            .flatMap(([measurementType, sensors]) =>
                sensors.map(sensor => `${measurementType}:${sensor}`)
            ) : [];

        // Ajout des capteurs composites (*_calc)
        const compositeProbes = probesProvider.getProbes();
        if (compositeProbes) {
            Object.keys(compositeProbes).forEach(sensor => {
                const type = unitsProvider.getSensorTypeMap()[sensor];
                if (type) {
                    allFields.push(`${type}:${sensor}`);
                }
            });
        }

        res.json({
            success: true,
            message: 'Success',
            version: probeVersion,
            metadata: {
                stationId: stationId,
                gps: {
                    latitude: req.stationConfig.latitude.desired || req.stationConfig.latitude.lastReadValue,
                    longitude: req.stationConfig.longitude.desired || req.stationConfig.longitude.lastReadValue,
                    altitude: req.stationConfig.altitude.desired || req.stationConfig.altitude.lastReadValue,
                },
                sensor: [...new Set(allFields)].sort(),
                queryTime: new Date().toISOString(),
                first: dateRange.firstUtc,
                last: dateRange.lastUtc,
                unit: unitsProvider.getUnits(),
            },
            measurements: metadata
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryMetadata');
    }
};

function getTypeAndSensor(sensorRef = '') {
    let type, sensor;
    if (sensorRef.includes(':')) {
        [type, sensor] = sensorRef.split(':');
    } else if (unitsProvider.getSensorTypeMap()[sensorRef]) {
        type = unitsProvider.getSensorTypeMap()[sensorRef];
        sensor = sensorRef;
    } else {
        console.log(`${V.Warn} Sensor reference [${sensorRef}] not found in Units.json`);
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
        const data = await influxdbService.queryDateRange(stationId, sensorRef, startDate ? new Date(startDate).getTime() / 1000 : null, endDate ? (new Date(endDate).getTime() + 1000) / 1000 : null);
        res.json({
            success: true,
            message: 'Success',
            version: probeVersion,
            metadata: {
                stationId: stationId,
                gps: {
                    latitude: req.stationConfig.latitude.desired || req.stationConfig.latitude.lastReadValue,
                    longitude: req.stationConfig.longitude.desired || req.stationConfig.longitude.lastReadValue,
                    altitude: req.stationConfig.altitude.desired || req.stationConfig.altitude.lastReadValue,
                },
                measurement: type,
                sensor: sensor,
                queryTime: new Date().toISOString(),
                first: data.firstUtc ? new Date(data.firstUtc).toISOString() : null,
                last: data.lastUtc ? new Date(data.lastUtc).toISOString() : null,
                intervalSeconds: data.count > 1 ? Math.round((new Date(data.lastUtc).getTime() - new Date(data.firstUtc).getTime()) / (data.count - 1)) / 1000 : null,
                count: null,
                unit: null,
                userUnit: unitsProvider.getUnits()?.[type]?.user || '',
                toUserUnit: unitsProvider.getUnits()?.[type]?.available_units?.[unitsProvider.getUnits()?.[type]?.user]?.fnFromMetric || null
            },
            data: []
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRange');
    }
};

async function getCompositeData(stationConfig, probeConfig, start, end, intervalSeconds) {
    // Prepare script context for calculations
    const scriptContext = {};
    const loadedScripts = new Set();

    const compositeProbes = probesProvider.getProbes();
    for (const probeKey in compositeProbes) {
        const probeConfig = compositeProbes[probeKey];
        if (probeConfig.scriptJS) {
            for (const scriptPath of probeConfig.scriptJS) { // charge les scripts specifie dans la config 
                if (!loadedScripts.has(scriptPath)) { // evite de charger plusieurs fois le même script
                    const fullPath = path.join(__dirname, '..', 'public', scriptPath);
                    try {
                        console.log(V.Gyro, 'require ', fullPath);
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
        .replace("%longitude%", stationConfig.longitude.desired || stationConfig.longitude.lastReadValue)
        .replace("%latitude%", stationConfig.latitude.desired || stationConfig.latitude.lastReadValue)
        .replace("%altitude%", stationConfig.altitude.desired || stationConfig.altitude.lastReadValue);

    const fnCalc = vm.runInNewContext(`(${fnCalcStr})`, scriptContext);

    // Fetch needed data from InfluxDB
    const { dataNeeded } = probeConfig;
    const rawData = await influxdbService.queryRaws(stationConfig.id, dataNeeded, start, end, intervalSeconds);
    // Perform calculation for each row
    return rawData.map(row => {
        row.d = row._time;
        const res = fnCalc(row) // d et _time sont disponible pour fnCalc()
        if (typeof res === 'object' && res.d) {
            return res;
        }
        return {
            d: row._time,
            v: res
        }
    }).filter(item => (typeof item.v === 'undefined') || (item.v !== null && !isNaN(item.v)))
}
exports.getQueryRaw = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount: stepCountStr } = req.query;
    const stepCount = stepCountStr ? parseInt(stepCountStr, 10) : 100000;

    try {
        // --- Common setup ---
        const { type, sensor } = getTypeAndSensor(sensorRef);
        const timeInfo = await getIntervalSeconds(stationId, type + ':' + sensor, startDate, endDate, stepCount);
        console.log(`${V.info} Demande de données brutes pour ${stationId} - ${sensorRef}`, timeInfo);
        const { start, end, intervalSeconds } = timeInfo;

        let Data;
        let msg;
        // --- Data Fetching and Processing ---
        if (sensor.endsWith('_calc')) {
            const compositeProbes = probesProvider.getProbes();
            const probeConfig = compositeProbes[sensor];
            if (!probeConfig) {
                const err = new Error(`Calculated sensor configuration not found for ${sensorRef}`);
                err.statusCode = 404;
                throw err;
            }

            Data = await getCompositeData(req.stationConfig, probeConfig, start, end, intervalSeconds);

            msg = 'Calculated data loaded!';
            // } else if (sensor.endsWith('_trend')) {
            //     const integratorProbes = probesProvider.getProbes();
            //     const probeConfig = integratorProbes[sensor];
            //     if (!probeConfig) {
            //         const err = new Error(`Trend sensor configuration not found for ${sensorRef}`);
            //         err.statusCode = 404;
            //         throw err;
            //     }
            //     Data = await getTrendData(req.stationConfig, probeConfig, start, end, intervalSeconds);
            //     msg = 'Trend data loaded!';
        } else {
            // Handle regular sensor
            const rawData = await influxdbService.queryRaw(stationId, type + ':' + sensor, start, end, intervalSeconds);
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
        const units = unitsProvider.getUnits();
        const measurement = units[type];
        const metadata = {
            stationId: stationId,
            gps: {
                latitude: req.stationConfig.latitude.desired || req.stationConfig.latitude.lastReadValue,
                longitude: req.stationConfig.longitude.desired || req.stationConfig.longitude.lastReadValue,
                altitude: req.stationConfig.altitude.desired || req.stationConfig.altitude.lastReadValue,
            },
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
            version: probeVersion,
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
    console.log(`${V.info} getQueryRaws - stationId: ${stationId}, startDate: ${startDate}, endDate: ${endDate}`);
    const stepCount = stepCountStr ? parseInt(stepCountStr, 10) : 100000;
    let sensorRefs = sensorRefsStr.split(',');
    // Retirer les doublons et les valeurs vides
    sensorRefs = sensorRefs.filter((ref, index) => ref && sensorRefs.indexOf(ref) === index);

    if (sensorRefs.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun capteur valide dans sensorRefs.' });
    }

    try {
        // 1. Séparer les capteurs réguliers des capteurs composites
        const regularSensors = [];
        const calcSensors = [];
        const trendSensors = [];

        sensorRefs.forEach(ref => {
            const { type, sensor } = getTypeAndSensor(ref);
            if (sensor && sensor.endsWith('_calc')) {
                calcSensors.push(type + ':' + sensor);
            } else if (sensor && sensor.endsWith('_trend')) {
                trendSensors.push(type + ':' + sensor);
            } else {
                regularSensors.push(type + ':' + sensor);
            }
        });

        // 2. Utiliser le premier capteur pour déterminer la plage de temps
        const firstSensor = regularSensors.length > 0 ? regularSensors[0] : 'pressure:barometer';
        const timeInfo = await getIntervalSeconds(stationId, firstSensor, startDate, endDate, stepCount);

        // 3. Récupérer les données régulières
        let regularData = [];
        if (regularSensors.length > 0) {
            regularData = await influxdbService.queryRaws(stationId, regularSensors, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
        }

        // 4. Récupérer les données composites
        const calcDataResults = [];
        const compositeProbes = probesProvider.getProbes();
        for (const sensorRef of calcSensors) {
            const { sensor } = getTypeAndSensor(sensorRef);
            const probeConfig = compositeProbes[sensor];

            if (!probeConfig) {
                console.error(`${V.error} Configuration non trouvée pour le capteur composite: ${sensorRef}`);
                continue;
            }

            const data = await getCompositeData(req.stationConfig, probeConfig, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
            calcDataResults.push({ sensorRef, data });
        }


        // 5. Combiner les données
        // Convertir les données régulières en Map pour un accès rapide
        const regularDataMap = new Map();
        regularData.forEach(row => {
            regularDataMap.set(row._time, row);
        });

        // Construire le tableau final
        let combinedData = [];

        if (regularDataMap.size > 0) {
            // Utiliser les timestamps des données régulières comme base
            combinedData = Array.from(regularDataMap.entries()).map(([timestamp, row]) => {
                const combinedRow = { _time: timestamp };

                // Copier les valeurs régulières
                Object.keys(row).forEach(key => {
                    if (key !== '_time' && key !== 'result' && key !== 'table') {
                        combinedRow[key] = row[key];
                    }
                });

                // Ajouter les valeurs composites pour ce timestamp
                // console.log(`Adding composite values for timestamp: ${timestamp}`, calcDataResults);
                calcDataResults.forEach(({ sensorRef, data }) => {
                    const matchingPoint = data.find(point => point.d === timestamp);
                    if (matchingPoint) {
                        combinedRow[sensorRef] = matchingPoint.v;
                    }
                });

                return combinedRow;
            });
        } else if (calcDataResults.length > 0) {
            // Si seulement des capteurs composites, utiliser le premier comme base
            const firstCalcData = calcDataResults[0].data;
            combinedData = firstCalcData.map(point => {
                const combinedRow = { _time: point.d, [calcDataResults[0].sensorRef]: point.v };

                // Ajouter les autres capteurs composites
                calcDataResults.slice(1).forEach(({ sensorRef, data }) => {
                    const matchingPoint = data.find(p => p.d === point.d);
                    if (matchingPoint) {
                        combinedRow[sensorRef] = matchingPoint.v;
                    }
                });

                return combinedRow;
            });
        }

        // 6. Formater les données comme dans l'original
        const Data = combinedData.map(row => {
            let result = { d: row._time };
            Object.keys(row).filter(key => key !== '_time' && key !== 'result' && key !== 'table').forEach(key => {
                if (row[key] === null || isNaN(row[key])) {
                    // Laisser null/NaN tel quel
                } else {
                    result[key] = Math.round(row[key] * 100) / 100;
                }
            });
            return result;
        }).sort((a, b) => new Date(a.d) - new Date(b.d));

        // 7. Générer le message
        let msg = 'Full data loaded !';
        if (Data.length === stepCount + 1 && new Date(Data[Data.length - 1].d).getTime() === new Date(timeInfo.end).getTime()) {
            msg = '(!) Last value is current !';
        } else if (Data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }

        // 8. Préparer les métadonnées et répondre
        const metadata = getMetadata(req, sensorRefs, timeInfo, Data);

        res.json({
            success: true,
            message: msg,
            version: probeVersion,
            metadata,
            data: Data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryRaws');
    }
};

exports.getQueryCandle = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount: stepCountStr } = req.query;
    const stepCount = stepCountStr ? parseInt(stepCountStr, 10) : 100;

    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Les paramètres stationId et sensorRef sont requis.' });
    }

    try {
        const { type, sensor } = getTypeAndSensor(sensorRef);
        const timeInfo = await getIntervalSeconds(stationId, type + ':' + sensor, startDate, endDate, stepCount);
        console.log(`${V.info} Demande de données candle pour ${stationId} - ${sensorRef}`, timeInfo);
        const { start, end, intervalSeconds } = timeInfo;

        let Data;
        let msg;

        if (sensor.endsWith('_calc')) {
            const compositeProbes = probesProvider.getProbes();
            const probeConfig = compositeProbes[sensor];
            if (!probeConfig) {
                const err = new Error(`Calculated sensor configuration not found for ${sensorRef}`);
                err.statusCode = 404;
                throw err;
            }

            const rawData = await getCompositeData(req.stationConfig, probeConfig, start, end, intervalSeconds);
            // Format single points as pseudo-candles for compatibility
            Data = rawData.map(row => {
                const v = Math.round(row.v * 100) / 100;
                return {
                    d: row.d,
                    Open: v,
                    High: v,
                    Low: v,
                    Close: v,
                    Mean: v,
                    Count: 1
                };
            });
            console.log(`${V.info} Calculated candle data loaded!`, Data);
            msg = 'Calculated candle data loaded!';
        } else {
            const rawData = await influxdbService.queryCandle(stationId, type + ':' + sensor, start, end, intervalSeconds);
            console.log(`${V.info} Raw candle data loaded!`, rawData);
            Data = rawData.map(row => ({
                d: row.datetime,
                Open: row.first,
                High: row.max,
                Low: row.min,
                Close: row.last,
                Mean: row.avg,
                Count: row.count
            }));
            console.log(`${V.info} Standard candle data loaded!`, Data);
            msg = 'Full data loaded !';
            if (Data.length === stepCount + 1 && new Date(Data[Data.length - 1].d).getTime() === new Date(end).getTime()) {
                msg = '(!) Last value is current !';
            } else if (Data.length < stepCount) {
                msg = '<!> Data missing suspected !';
            }
        }

        const units = unitsProvider.getUnits();
        const measurement = units[type];
        const metadata = {
            stationId: stationId,
            gps: {
                latitude: req.stationConfig.latitude.desired || req.stationConfig.latitude.lastReadValue,
                longitude: req.stationConfig.longitude.desired || req.stationConfig.longitude.lastReadValue,
                altitude: req.stationConfig.altitude.desired || req.stationConfig.altitude.lastReadValue,
            },
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

        res.json({
            success: true,
            message: msg,
            version: probeVersion,
            metadata,
            data: Data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryCandle');
    }
};

exports.getQueryWindRose = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate, stepCount = 10, prefix = '' } = req.query; // prefix est obsolete

    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }
    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const timeInfo = await getIntervalSeconds(stationId, `speed:${prefix}Wind`, startDate, endDate, stepCount);
        const data = await influxdbService.queryWindRose(stationId, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds, prefix);
        let msg = 'Full data loadded !';
        if (data.length == stepCount + 1 && new Date(data[data.length - 1].d).getTime() == timeInfo.end) {
            // data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        const metadata = getMetadata(req, [`speed:${prefix}Wind`, `direction:${prefix}Gust`, `speed:${prefix}Gust`, `direction:${prefix}Wind`], timeInfo, data);

        res.json({
            success: true,
            message: msg,
            version: probeVersion,
            metadata,
            data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWindRose');
    }
};

exports.getQueryVectors = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount = 100 } = req.query;
    let sensor;
    if (sensorRef && sensorRef.includes(":")) {
        sensor = sensorRef.split(":")[1];
    } else if (sensorRef) {
        sensor = sensorRef;
    } else {
        sensor = 'Wind';
    }

    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }

    try {
        let data, msg, metadata;
        console.log('Query sensor :', sensor, sensorRef);
        if (sensor.endsWith('_calc')) {
            // --- Capteur composite (vector:*_calc) ---
            console.log(`${V.info} Demande de données vectorielles calculées pour ${stationId} - ${sensor}`);
            const compositeProbes = probesProvider.getProbes();
            const probeConfig = compositeProbes[sensor];
            if (!probeConfig) {
                const err = new Error(`Calculated sensor configuration not found for ${sensor}`);
                err.statusCode = 404;
                throw err;
            }

            // Utiliser le premier dataNeeded pour déterminer la plage temporelle
            const refSensor = probeConfig.dataNeeded[0];
            const timeInfo = await getIntervalSeconds(stationId, refSensor, startDate, endDate, stepCount);
            data = await getCompositeData(req.stationConfig, probeConfig, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
            msg = 'Calculated data loaded!';

            const units = unitsProvider.getUnits();
            const measurementType = probeConfig.measurement || 'vector';
            const measurement = units[measurementType];
            console.log('measurement : ', measurement);
            metadata = {
                stationId: stationId,
                gps: {
                    latitude: req.stationConfig.latitude.desired || req.stationConfig.latitude.lastReadValue,
                    longitude: req.stationConfig.longitude.desired || req.stationConfig.longitude.lastReadValue,
                    altitude: req.stationConfig.altitude.desired || req.stationConfig.altitude.lastReadValue,
                },
                measurement: measurementType,
                sensor: sensor,
                queryTime: new Date().toISOString(),
                first: timeInfo.start,
                last: timeInfo.end,
                intervalSeconds: timeInfo.intervalSeconds,
                count: data.length,
                unit: measurement?.metric || null,
                userUnit: measurement?.user || null,
                toUserUnit: measurement?.available_units?.[measurement?.user]?.fnFromMetric || null
            };
            // console.log(metadata);
        } else {
            // --- Capteur vent classique ---
            console.log(`${V.info} Demande de données de vent pour ${stationId}`);
            const timeInfo = await getIntervalSeconds(stationId, 'speed:Wind', startDate, endDate, stepCount);
            data = await influxdbService.queryVectors(stationId, sensor, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
            msg = 'Full data loadded !';
            if (data.length == stepCount + 1 && new Date(data[data.length - 1].d).getTime() == timeInfo.end) {
                msg = '(!) Last value is current !';
            } else if (data.length < stepCount) {
                msg = '<!> Data missing suspected !';
            }
            metadata = getMetadata(req, ['speed:' + sensor, 'direction:' + sensor], timeInfo, data);
            metadata.sensor = sensor;
        }

        res.json({
            success: true,
            message: msg,
            version: probeVersion,
            metadata,
            data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryVectors');
    }
};

/**
 * Renvoie le mapping des variables Open-Meteo vers InfluxDB
 * et extrait la liste des variables horaires pour l'API.
 */
function getHistoricalMapping() {
    const mapping = {
        'temperature_2m': { type: 'temperature', sensor: ['outTemp'], convert: (v) => v + 273.15 }, // °C -> K
        'relative_humidity_2m': { type: 'humidity', sensor: ['outHumidity'] },
        'precipitation': { type: 'rain', sensor: ['rainFall'] },
        'et0_fao_evapotranspiration': { type: 'rain', sensor: ['ET'] },
        'wind_speed_10m': { type: 'speed', sensor: ['Wind'], convert: (v) => v / 3.6 }, // km/h -> m/s
        'wind_gusts_10m': { type: 'speed', sensor: ['Gust'], convert: (v) => v / 3.6 }, // km/h -> m/s
        'wind_direction_10m': { type: 'direction', sensor: ['Wind', 'Gust'] },
        'soil_temperature_7_to_28cm': { type: 'temperature', sensor: ['soilTemp'], convert: (v) => v + 273.15, model: 'ERA5-Seamless' }, // °C -> K
        'soil_moisture_7_to_28cm': { type: 'soilMoisture', sensor: ['soilMoisture'], convert: (v) => v * 100, model: 'ERA5-Seamless' },
        'pressure_msl': { type: 'pressure', sensor: ['barometer'] },
        'shortwave_radiation': { type: 'irradiance', sensor: ['solar'] }
    };

    return { mapping, hourly: Object.keys(mapping) };
}

/**
 * Détermine la plage de dates pour la requête Open-Meteo.
 * Gère 3 cas:
 * 1. Bucket vide: de 2000-01-01 jusqu'à aujourd'hui.
 * 2. moreYears param fourni: recule de 'moreYears' années à partir de la plus ancienne date existante.
 * 3. moreYears absent/zéro (appel par cron): complète depuis la dernière date existante jusqu'à aujourd'hui.
 */
async function determineDateRange(stationId, moreYearsParam) {
    const { firstUtc, lastUtc } = await influxdbService.queryDateRange(stationId, 'pressure:barometer', null, null, 'Archives');

    let startDate, endDate;
    let isForward = false;

    let moreYearsValue = parseInt(moreYearsParam || 0, 10);
    if (isNaN(moreYearsValue) || moreYearsValue < 0) moreYearsValue = 0;

    const hasData = firstUtc && new Date(firstUtc).getTime() !== new Date('1970-01-01T00:00:00Z').getTime();

    if (!hasData) {
        // Bucket vide, premier appel
        endDate = new Date();
        if (moreYearsValue > 0) {
            startDate = new Date(endDate);
            startDate.setFullYear(startDate.getFullYear() - moreYearsValue);
        } else {
            startDate = new Date('2000-01-01T00:00:00Z');
        }
    } else {
        // Bucket non vide
        if (moreYearsValue > 0) {
            // Expansion vers le passé
            endDate = new Date(firstUtc);
            startDate = new Date(endDate);
            startDate.setFullYear(startDate.getFullYear() - moreYearsValue);
        } else {
            // Complétion vers le présent (cron)
            // on reprend les 90 dernier jours avant lastUtc pour integre les consolidations
            startDate = new Date(lastUtc);
            startDate.setDate(startDate.getDate() - 90);
            endDate = new Date();
            isForward = true;
        }
    }

    return { startDate, endDate, isForward };
}

/**
 * Appelle l'API Open-Meteo via un stream et renvoie l'objet JSON complet.
 */
async function fetchOpenMeteoArchiveStream(params) {
    const openMeteoUrl = `https://archive-api.open-meteo.com/v1/archive`;
    const response = await axios.get(openMeteoUrl, { params, responseType: 'stream' });
    console.log(`${V.Parabol} Appel à Open-Meteo (stream) avec les paramètres:`, params, response.request.res.responseUrl);

    const stream = response.data;
    if (!stream) {
        throw new Error("Réponse invalide de l'API Open-Meteo.");
    }

    return new Promise((resolve, reject) => {
        let dataString = '';
        stream.on('data', chunk => { dataString += chunk.toString(); });
        stream.on('end', () => {
            try {
                const openMeteoData = JSON.parse(dataString);
                if (!openMeteoData || !openMeteoData.hourly || !openMeteoData.hourly.time) {
                    throw new Error("Format de données JSON invalide de l'API Open-Meteo.");
                }
                resolve(openMeteoData);
            } catch (e) {
                reject(e);
            }
        });
        stream.on('error', err => reject(err));
    });
}

/**
 * Parcourt les données Open-Meteo en ordre inversé (du plus récent au plus ancien),
 * regroupe les points par lots de 31 jours et les écrit dans InfluxDB.
 * Met à jour stationConfig.historical.since après chaque lot (uniquement si expansion passée).
 */
async function processAndWriteHistoricalData(openMeteoData, stationId, stationConfig, isForward) {
    const { mapping } = getHistoricalMapping();
    const { time, ...metrics } = openMeteoData.hourly;

    console.log(`${V.gear} Traitement de ${time.length} points de données en ordre inversé...`);

    let pointsChunk = [];
    let totalPointsWritten = 0;
    const CHUNK_SIZE_DAYS = 31;
    let currentChunkEndDate = time.length > 0 ? new Date(time[time.length - 1] * 1000) : null;

    // Parcourir de la fin (plus récent) vers le début (plus ancien)
    for (let i = time.length - 1; i >= 0; i--) {
        const timestamp = new Date(time[i] * 1000);
        timestamp.setMinutes(0, 0, 0);

        for (const [openMeteoKey, values] of Object.entries(metrics)) {
            const value = values[i];
            if (value !== null && mapping[openMeteoKey]) {
                const { type, sensor, convert } = mapping[openMeteoKey];
                const metricValue = convert ? convert(value) : value;
                for (const s of sensor) {
                    pointsChunk.push(new influxdbService.Point(type)
                        .tag('station_id', stationId)
                        .tag('sensor', s)
                        .tag('source', 'rebuildedHistoricalData')
                        .floatField('value', metricValue.toFixed(2))
                        .timestamp(timestamp));
                }
            }
        }

        // Ajout des vecteurs de vent
        if (metrics.wind_speed_10m && metrics.wind_direction_10m) {
            const Wind = metrics.wind_speed_10m[i];
            const WindDir = metrics.wind_direction_10m[i];
            if (Wind !== null && WindDir !== null) {
                const WindMs = Wind / 3.6;
                const UxWind = Math.round(WindMs * Math.sin(Math.PI * WindDir / 180.0) * 1000) / 1000;
                const VyWind = Math.round(WindMs * Math.cos(Math.PI * WindDir / 180.0) * 1000) / 1000;
                pointsChunk.push(new influxdbService.Point('vector')
                    .tag('station_id', stationId)
                    .floatField('Ux', UxWind)
                    .floatField('Vy', VyWind)
                    .tag('sensor', 'Wind')
                    .tag('source', 'rebuildedHistoricalData')
                    .timestamp(timestamp));
            }
        }

        if (metrics.wind_gusts_10m && metrics.wind_direction_10m) {
            const Gust = metrics.wind_gusts_10m[i];
            const GustDir = metrics.wind_direction_10m[i];
            if (Gust !== null && GustDir !== null) {
                const GustMs = Gust / 3.6;
                const UxGust = Math.round(GustMs * Math.sin(Math.PI * GustDir / 180.0) * 1000) / 1000;
                const VyGust = Math.round(GustMs * Math.cos(Math.PI * GustDir / 180.0) * 1000) / 1000;
                pointsChunk.push(new influxdbService.Point('vector')
                    .tag('station_id', stationId)
                    .floatField('Ux', UxGust)
                    .floatField('Vy', VyGust)
                    .tag('sensor', 'Gust')
                    .tag('source', 'rebuildedHistoricalData')
                    .timestamp(timestamp));
            }
        }

        const daysDiff = currentChunkEndDate ? (currentChunkEndDate - timestamp) / (1000 * 60 * 60 * 24) : 0;

        // Écrire le lot si on a accumulé CHUNK_SIZE_DAYS ou si on est à la fin (i === 0)
        if (pointsChunk.length > 0 && (daysDiff >= CHUNK_SIZE_DAYS || i === 0)) {
            const writtenCount = await influxdbService.writePoints(pointsChunk, 'Archives');
            console.log(V.database, `Écriture d'un lot de ${pointsChunk.length} points dans InfluxDB... (Remonté jusqu'à ${timestamp.toISOString()})`, V.Check);
            totalPointsWritten += writtenCount;

            // Mise à jour de la configuration de la station pour refléter la progression
            if (!stationConfig.historical) stationConfig.historical = {};
            stationConfig.historical.lastRun = new Date().toISOString();

            if (isForward) {
                stationConfig.historical.msg = `${totalPointsWritten} points imported successfully (Mise à jour récente)`;
            } else {
                stationConfig.historical.msg = `${totalPointsWritten} points imported successfully (Remonté jusqu'à ${timestamp.toISOString()})`;
                stationConfig.historical.since = timestamp.getFullYear(); // Enregistre l'année en cours d'exploration seulement pour l'historique
            }

            configManager.autoSaveConfig(stationConfig);

            pointsChunk = [];
            currentChunkEndDate = i > 0 ? new Date(time[i - 1] * 1000) : null;
        }
    }

    return totalPointsWritten;
}

exports.expandDbWithOpenMeteo = async (req, res) => {
    const { stationId } = req.params;
    const stationConfig = req.stationConfig;

    try {
        console.log(V.Travaux, `Expansion de la base de données pour ${stationId} avec les données Open-Meteo.`);

        const latitude = stationConfig.latitude.desired;
        const longitude = stationConfig.longitude.desired;
        const elevation = stationConfig.altitude.desired;

        if (!latitude && !longitude && !elevation) {
            throw new Error("Les coordonnées GPS de la station ne sont pas définies.");
        }

        const { startDate, endDate, isForward } = await determineDateRange(stationId, req.params.moreYears);
        const { mapping } = getHistoricalMapping();

        const modelsMap = {};
        for (const [key, config] of Object.entries(mapping)) {
            const modelStr = config.model ? config.model.toLowerCase().replace(/-/g, '_') : 'default';
            if (!modelsMap[modelStr]) modelsMap[modelStr] = [];
            modelsMap[modelStr].push(key);
        }

        let totalPointsWritten = 0;

        for (const [model, hourlyKeys] of Object.entries(modelsMap)) {
            const params = {
                latitude: latitude.toFixed(2),
                longitude: longitude.toFixed(2),
                elevation: elevation.toFixed(0),
                start_date: '2026-01-01', //startDate.toISOString().split('T')[0],
                end_date: '2026-06-18', //endDate.toISOString().split('T')[0],
                hourly: hourlyKeys.join(','),
                timeformat: 'unixtime'
            };

            if (model !== 'default') {
                params.models = model;
            }

            const openMeteoData = await fetchOpenMeteoArchiveStream(params);
            totalPointsWritten += await processAndWriteHistoricalData(openMeteoData, stationId, stationConfig, isForward);
        }

        if (totalPointsWritten === 0) {
            console.log(`${V.info} Aucune nouvelle donnée à importer.La base de données est peut - être déjà à jour pour cette période.`);
            return res.json({
                success: true,
                version: probeVersion,
                message: `Aucune nouvelle donnée à importer pour la station ${stationId}.`
            });
        }

        res.json({
            success: true,
            stationId: stationId,
            version: probeVersion,
            message: `${totalPointsWritten} points de données historiques ont été importés avec succès pour la station ${stationId}, pour la période[${startDate.toISOString().slice(0, 16).replace('T', ' ')}, ${endDate.toISOString().slice(0, 16).replace('T', ' ')}]`,
            pointsCount: totalPointsWritten,
            startDate,
            endDate
        });

    } catch (error) {
        if (stationConfig && stationConfig.historical) {
            stationConfig.historical.lastRun = new Date().toISOString();
            stationConfig.historical.msg = `Error: ${error.message}`;
            configManager.autoSaveConfig(stationConfig);
        }
        handleError(res, stationId, error, 'expandDbWithOpenMeteo');
    }
};

exports.getOpenMeteoForecast = async (req, res) => {
    const { stationId } = req.params;
    const stationConfig = req.stationConfig;

    try {
        console.log(V.Travaux, `Récupération et écriture des prévisions Open - Meteo pour ${stationId}.`);

        const { latitude, longitude, elevation } = {
            latitude: stationConfig.latitude.desired,
            longitude: stationConfig.longitude.desired,
            elevation: stationConfig.altitude.desired,
        };
        const model = (stationConfig.forecast && stationConfig.forecast.model) || 'icon_eu';

        if (!latitude && !longitude && !elevation) {
            throw new Error("Les coordonnées GPS de la station ne sont pas définies.", stationConfig);
        }

        const historicalEnabled = !!(stationConfig.historical && stationConfig.historical.enabled);
        const forecastEnabled = !!(stationConfig.forecast && stationConfig.forecast.enabled);

        const xx = historicalEnabled ? 30 : 0;
        const yy = forecastEnabled ? 7 : 0;

        if (xx === 0 && yy === 0) {
            console.log(`${V.info} Collecte historique et prévisionnelle désactivée pour la station ${stationId}.`);
            return res.json({
                success: true,
                stationId: stationId,
                version: probeVersion,
                message: "La collecte historique et prévisionnelle est désactivée pour cette station.",
                data: { pastWrittenCount: 0, futureWrittenCount: 0 },
                pointsWritten: 0
            });
        }



        const openMeteoUrl = `https://api.open-meteo.com/v1/forecast`;
        const params = {
            latitude: latitude.toFixed(6),
            longitude: longitude.toFixed(6),
            elevation: elevation.toFixed(0),
            hourly: [
                'temperature_2m',
                'relative_humidity_2m',
                'precipitation',
                'pressure_msl',
                'et0_fao_evapotranspiration',
                'wind_speed_10m',
                'wind_direction_10m',
                'wind_gusts_10m',
                'soil_temperature_18cm',
                'soil_moisture_9_to_27cm',
                'shortwave_radiation'
            ],
            models: model,
            timezone: 'auto',
            forecast_days: yy,
            past_days: xx
        };

        // Appel à l'API de prévisions
        params.hourly = params.hourly.join(',');
        const response = await axios.get(openMeteoUrl, { params });
        const openMeteoData = response.data;
        console.log(`${V.Parabol} Appel à Open-Meteo Forecast avec les paramètres:`, params, response.request.res.responseUrl);

        if (!openMeteoData || !openMeteoData.hourly || !openMeteoData.hourly.time) {
            throw new Error("Format de données JSON invalide de l'API Open-Meteo Forecast.");
        }

        const { time, ...metrics } = openMeteoData.hourly;
        console.log(`${V.gear} Traitement de ${time.length} points de données de prévisions...`);

        let pastPointsChunk = [];
        let futurePointsChunk = [];
        const now = new Date();

        // Mapping sans le préfixe 'open-meteo_'
        const mapping = {
            'temperature_2m': { type: 'temperature', sensor: ['outTemp'], convert: (v) => v + 273.15 }, // °C -> K
            'relative_humidity_2m': { type: 'humidity', sensor: ['outHumidity'] },
            'precipitation': { type: 'rain', sensor: ['rainFall'] },
            'pressure_msl': { type: 'pressure', sensor: ['barometer'] },
            'et0_fao_evapotranspiration': { type: 'rain', sensor: ['ET'] },
            'wind_speed_10m': { type: 'speed', sensor: ['Wind'], convert: (v) => v / 3.6 }, // km/h -> m/s
            'wind_direction_10m': { type: 'direction', sensor: ['Wind', 'Gust'] },
            'wind_gusts_10m': { type: 'speed', sensor: ['Gust'], convert: (v) => v / 3.6 }, // km/h -> m/s
            'soil_temperature_18cm': { type: 'temperature', sensor: ['soilTemp'], convert: (v) => v + 273.15 }, // °C -> K
            'soil_moisture_9_to_27cm': { type: 'soilMoisture', sensor: ['soilMoisture'], convert: (v) => v * 100 },
            'shortwave_radiation': { type: 'irradiance', sensor: ['solar'] }
        };

        for (let i = 0; i < time.length; i++) {
            const localTimestampStr = time[i];
            const timestamp = new Date(localTimestampStr);
            const isPast = timestamp < now;

            const targetChunk = isPast ? pastPointsChunk : futurePointsChunk;
            const sourceTag = isPast ? 'rebuildedHistoricalData' : 'forecast';

            for (const [openMeteoKey, values] of Object.entries(metrics)) {
                const value = values[i];
                if (value !== null && mapping[openMeteoKey]) {
                    const { type, sensor, convert } = mapping[openMeteoKey];
                    const metricValue = convert ? convert(value) : value;
                    sensor.forEach(s => {
                        targetChunk.push(new influxdbService.Point(type)
                            .tag('station_id', stationId)
                            .tag('sensor', s)
                            .tag('source', sourceTag)
                            .floatField('value', parseFloat(metricValue.toFixed(2)))
                            .timestamp(timestamp));
                    });
                }
            }

            if (metrics.wind_speed_10m && metrics.wind_direction_10m) {
                const Wind = metrics.wind_speed_10m[i];
                const WindDir = metrics.wind_direction_10m[i];
                if (Wind !== null && WindDir !== null) {
                    const WindMs = Wind / 3.6;
                    const UxWind = Math.round(WindMs * Math.sin(Math.PI * WindDir / 180.0) * 1000) / 1000;
                    const VyWind = Math.round(WindMs * Math.cos(Math.PI * WindDir / 180.0) * 1000) / 1000;
                    targetChunk.push(new influxdbService.Point('vector')
                        .tag('station_id', stationId)
                        .floatField('Ux', UxWind)
                        .floatField('Vy', VyWind)
                        .tag('sensor', 'Wind')
                        .tag('source', sourceTag)
                        .timestamp(timestamp));
                }
            }

            if (metrics.wind_gusts_10m && metrics.wind_direction_10m) {
                const Gust = metrics.wind_gusts_10m[i];
                const GustDir = metrics.wind_direction_10m[i];
                if (Gust !== null && GustDir !== null) {
                    const GustMs = Gust / 3.6;
                    const UxGust = Math.round(GustMs * Math.sin(Math.PI * GustDir / 180.0) * 1000) / 1000;
                    const VyGust = Math.round(GustMs * Math.cos(Math.PI * GustDir / 180.0) * 1000) / 1000;
                    targetChunk.push(new influxdbService.Point('vector')
                        .tag('station_id', stationId)
                        .floatField('Ux', UxGust)
                        .floatField('Vy', VyGust)
                        .tag('sensor', 'Gust')
                        .tag('source', sourceTag)
                        .timestamp(timestamp));
                }
            }
        }

        let pastWrittenCount = 0;
        let futureWrittenCount = 0;

        if (pastPointsChunk.length > 0) {
            pastWrittenCount = await influxdbService.writePoints(pastPointsChunk, 'Archives');
        }
        if (futurePointsChunk.length > 0) {
            futureWrittenCount = await influxdbService.writePoints(futurePointsChunk, 'Forecasts');
        }

        const nowIso = new Date().toISOString();
        let configChanged = false;
        if (stationConfig.forecast && forecastEnabled) {
            stationConfig.forecast.lastRun = nowIso;
            stationConfig.forecast.msg = `${futureWrittenCount} points de prévisions importés`;
            configChanged = true;
        }
        if (stationConfig.historical && historicalEnabled) {
            stationConfig.historical.lastRun = nowIso;
            stationConfig.historical.msg = `${pastWrittenCount} points d'historique court terme importés`;
            configChanged = true;
        }
        if (configChanged) {
            configManager.autoSaveConfig(stationConfig);
        }

        res.json({
            success: true,
            stationId: stationId,
            version: probeVersion,
            message: `Données Open-Meteo synchronisées : ${pastWrittenCount} points d'historique (bucket Archives) et ${futureWrittenCount} points de prévisions (bucket Forecasts) importés.`,
            data: { pastWrittenCount, futureWrittenCount },
            pointsWritten: pastWrittenCount + futureWrittenCount,
        });

    } catch (error) {
        const nowIso = new Date().toISOString();
        let configChanged = false;
        if (stationConfig && stationConfig.forecast && stationConfig.forecast.enabled) {
            stationConfig.forecast.lastRun = nowIso;
            stationConfig.forecast.msg = `Error: ${error.message}`;
            configChanged = true;
        }
        if (stationConfig && stationConfig.historical && stationConfig.historical.enabled) {
            stationConfig.historical.lastRun = nowIso;
            stationConfig.historical.msg = `Error: ${error.message}`;
            configChanged = true;
        }
        if (configChanged) {
            configManager.autoSaveConfig(stationConfig);
        }
        handleError(res, stationId, error, 'getOpenMeteoForecast');
    }
};