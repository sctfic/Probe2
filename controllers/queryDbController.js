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
    const interval = Math.max(1, Math.round(totalSeconds / parseInt(stepCount) / 300) * 300);
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
            latitude: req.stationConfig.latitude.lastReadValue,
            longitude: req.stationConfig.longitude.lastReadValue,
            altitude: req.stationConfig.altitude.lastReadValue,
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
    const start = Date.now();
    try {
        const dateRange = await influxdbService.queryDateRange(stationId, 'pressure:*');
        const _measurements = await influxdbService.getInfluxMetadata(stationId);

        const allFields = Object.entries(_measurements) // liste des sensors en nom long
            .flatMap(([measurementType, measurement]) =>
                (measurement.tags?.sensor || []).map(sensor => `${measurementType}:${sensor}`)
            );

        res.json({
            success: true,
            message: 'Success',
            version: probeVersion,
            metadata: {
                stationId: stationId,
                gps: {
                    latitude: req.stationConfig.latitude.lastReadValue,
                    longitude: req.stationConfig.longitude.lastReadValue,
                    altitude: req.stationConfig.altitude.lastReadValue,
                },
                sensor: [...new Set(allFields)],
                queryTime: new Date().toISOString(),
                first: dateRange.firstUtc,
                last: dateRange.lastUtc,
                unit: unitsProvider.getUnits(),
            },
            measurements: _measurements
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
        const data = await influxdbService.queryDateRange(stationId, sensorRef, startDate ? new Date(startDate).getTime() / 1000 : null, endDate ? (new Date(endDate).getTime() + 1000) / 1000 : null);
        res.json({
            success: true,
            message: 'Success',
            metadata: {
                stationId: stationId,
                gps: {
                    latitude: req.stationConfig.latitude.lastReadValue,
                    longitude: req.stationConfig.longitude.lastReadValue,
                    altitude: req.stationConfig.altitude.lastReadValue,
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

async function getCalculatedData(stationConfig, probeConfig, start, end, intervalSeconds) {
    // console.log(V.info, stationConfig, probeConfig, start, end, intervalSeconds);
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
                        console.log('require ', fullPath);

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
    console.log('fnCalc()', fnCalcStr, fnCalc(0.5, 43.2, 242.01, 45));

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
            Data = await getCalculatedData(req.stationConfig, probeConfig, start, end, intervalSeconds);
            msg = 'Calculated data loaded!';
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
                latitude: req.stationConfig.latitude.lastReadValue,
                longitude: req.stationConfig.longitude.lastReadValue,
                altitude: req.stationConfig.altitude.lastReadValue,
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
    // Retirer les doublons et les valeurs vides
    sensorRefs = sensorRefs.filter((ref, index) => ref && sensorRefs.indexOf(ref) === index);

    if (sensorRefs.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun capteur valide dans sensorRefs.' });
    }

    try {
        // 1. Séparer les capteurs réguliers des capteurs composites
        const regularSensors = [];
        const calcSensors = [];

        sensorRefs.forEach(ref => {
            const { type, sensor } = getTypeAndSensor(ref);
            if (sensor && sensor.endsWith('_calc')) {
                calcSensors.push(type + ':' + sensor);
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

            const data = await getCalculatedData(req.stationConfig, probeConfig, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
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
        const { start, end, intervalSeconds } = await getIntervalSeconds(stationId, sensor, startDate, endDate, stepCount);
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
        if (Data.length == stepCount + 1 && new Date(Data[Data.length - 1].d).getTime() == end) {
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
                gps: {
                    latitude: req.stationConfig.latitude.lastReadValue,
                    longitude: req.stationConfig.longitude.lastReadValue,
                    altitude: req.stationConfig.altitude.lastReadValue,
                },
                measurement: type,
                sensor: sensor,
                queryTime: new Date().toISOString(),
                first: new Date(start).toISOString(),
                last: new Date(end).toISOString(),
                intervalSeconds: intervalSeconds,
                count: Data.length,
                unit: data[0]?.unit || '',
                userUnit: unitsProvider.getUnits()?.[type]?.user || '',
                toUserUnit: unitsProvider.getUnits()?.[type]?.available_units?.[unitsProvider.getUnits()?.[type]?.user]?.fnFromMetric || null
            },
            data: Data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryCandle');
    }
};

exports.getQueryWindRose = async (req, res) => {
    const { stationId } = req.params;
    const { startDate, endDate, stepCount = 10, prefix = '' } = req.query; // prefix peut être vide ou 'open-meteo_'

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
            metadata,
            data
        });
    } catch (error) {
        handleError(res, stationId, error, 'getQueryWindRose');
    }
};

exports.getQueryWindVectors = async (req, res) => {
    const { stationId, sensorRef } = req.params;
    const { startDate, endDate, stepCount = 100 } = req.query;

    if (!stationId) {
        return res.status(400).json({ success: false, error: 'Le paramètre stationId est requis.' });
    }

    try {
        console.log(`${V.info} Demande de données de vent pour ${stationId}`);
        const timeInfo = await getIntervalSeconds(stationId, 'speed:Wind', startDate, endDate, stepCount);
        const data = await influxdbService.queryWindVectors(stationId, sensorRef, timeInfo.start, timeInfo.end, timeInfo.intervalSeconds);
        let msg = 'Full data loadded !';
        if (data.length == stepCount + 1 && new Date(data[data.length - 1].d).getTime() == timeInfo.end) {
            // data.pop(); // supprimer la derniere valeur, qui est la derniere valeur de la plage avant agregation
            msg = '(!) Last value is current !';
        } else if (data.length < stepCount) {
            msg = '<!> Data missing suspected !';
        }
        const metadata = getMetadata(req, ['speed:' + sensorRef, 'direction:' + sensorRef], timeInfo, data);
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

exports.expandDbWithOpenMeteo = async (req, res) => {
    const { stationId } = req.params;
    const stationConfig = req.stationConfig;

    try {
        console.log(V.Travaux, `Expansion de la base de données pour ${stationId} avec les données Open-Meteo.`);

        const { latitude, longitude, elevation } = {
            latitude: stationConfig.latitude.lastReadValue,
            longitude: stationConfig.longitude.lastReadValue,
            elevation: stationConfig.altitude.lastReadValue
        };

        if (!latitude || !longitude) {
            throw new Error("Les coordonnées GPS de la station ne sont pas définies.");
        }

        let moreYearsValue = parseInt(req.params.moreYears || 0, 10);
        if (isNaN(moreYearsValue) || moreYearsValue < 0) moreYearsValue = 0;
        if (moreYearsValue > 20) moreYearsValue = 20;

        const currentYear = new Date().getFullYear();
        let endDate = new Date();
        let startDate;

        const { firstUtc, lastUtc } = (await influxdbService.queryDateRange(stationId, 'open-meteo_barometer'));

        // Validation de stationConfig.historical.since
        let since = parseInt(stationConfig.historical && stationConfig.historical.since, 10);
        const isSinceInvalid = isNaN(since) || since < 1940 || since > currentYear;

        if (isSinceInvalid) {
            // si le parametre stationConfig.historical.since est vide ou invalide, il doit etre defini a l'annee actuelle - 10 
            // (quelque soit moreYears) et on l'utilise comme startDate (01 janvier 00h00 de cette annee la)
            since = currentYear - 10;
            if (!stationConfig.historical) stationConfig.historical = {};
            startDate = new Date(Date.UTC(since, 0, 1, 0, 0, 0));
        } else if (moreYearsValue === 0 && lastUtc && (new Date(lastUtc)) != (new Date('1970-01-01T00:00:00Z'))) {
            // s'il n'y a rien dans moreYears et que lastUtc != 1970 alors startDate = lastUtc moins un jour
            startDate = new Date(lastUtc);
            startDate.setDate(startDate.getDate() - 1);
        } else if (moreYearsValue > 0) {
            // si stationConfig.historical.since est valide et qu'il y a une valeur dans moreYears 
            // alors stationConfig.historical.since -= moreYears on l'utilise comme startDate (01 janvier 00h00 de cette annee la)
            endDate = new Date(Date.UTC(since, 0, 1, 0, 0, 0));
            endDate.setDate(endDate.getDate() + 1);

            since = Math.max(since - moreYearsValue, 1940);
            startDate = new Date(Date.UTC(since, 0, 1, 0, 0, 0));
            console.log(V.info, `startDate: ${startDate.toISOString().split('T')[0]}, endDate: ${endDate.toISOString().split('T')[0]}`);
        } else {
            // si since est valide, moreYears est 0 et pas de lastUtc
            startDate = new Date(Date.UTC(since, 0, 1, 0, 0, 0));
        }

        const openMeteoUrl = `https://archive-api.open-meteo.com/v1/archive`;
        const params = {
            latitude: latitude.toFixed(2),
            longitude: longitude.toFixed(2),
            elevation: elevation.toFixed(0),
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            hourly: [
                'temperature_2m',
                'relative_humidity_2m',
                'precipitation',
                'et0_fao_evapotranspiration',
                'wind_speed_10m',
                'wind_direction_10m',
                'wind_gusts_10m',
                'soil_temperature_7_to_28cm',
                'soil_moisture_7_to_28cm',
                'pressure_msl',
                'shortwave_radiation'
            ],
            timeformat: 'unixtime'
        };

        // Utilisation d'un stream pour éviter de charger tout le JSON en mémoire
        const response = await axios.get(openMeteoUrl, { params, responseType: 'stream' });
        console.log(`${V.Parabol} Appel à Open-Meteo (stream) avec les paramètres:`, params, response.request.res.responseUrl);
        const stream = response.data;
        if (!stream) {
            throw new Error("Réponse invalide de l'API Open-Meteo.");
        }
        let totalPointsWritten = 0;

        const mapping = {
            'temperature_2m': { type: 'temperature', sensor: ['open-meteo_outTemp'], convert: (v) => v + 273.15 }, // °C -> K
            'relative_humidity_2m': { type: 'humidity', sensor: ['open-meteo_outHumidity'] },
            'precipitation': { type: 'rain', sensor: ['open-meteo_rainFall'] },
            'et0_fao_evapotranspiration': { type: 'rain', sensor: ['open-meteo_ET'] },
            'wind_speed_10m': { type: 'speed', sensor: ['open-meteo_Wind'], convert: (v) => v / 3.6 }, // km/h -> m/s
            'wind_gusts_10m': { type: 'speed', sensor: ['open-meteo_Gust'], convert: (v) => v / 3.6 }, // km/h -> m/s
            'wind_direction_10m': { type: 'direction', sensor: ['open-meteo_Wind', 'open-meteo_Gust'] },
            'soil_temperature_7_to_28cm': { type: 'temperature', sensor: ['open-meteo_soilTemp'], convert: (v) => v + 273.15 }, // °C -> K
            'soil_moisture_7_to_28cm': { type: 'soilMoisture', sensor: ['open-meteo_soilMoisture'], convert: (v) => v * 100 },
            'pressure_msl': { type: 'pressure', sensor: ['open-meteo_barometer'] },
            'shortwave_radiation': { type: 'irradiance', sensor: ['open-meteo_solar'] }
        };

        let pointsChunk = [];
        const CHUNK_SIZE_DAYS = 30;
        let lastChunkDate = null;

        // Promesse pour gérer la fin du stream
        await new Promise((resolve, reject) => {
            let openMeteoData;
            let dataString = '';

            stream.on('data', chunk => {
                dataString += chunk.toString();
            });

            stream.on('end', async () => {
                try {
                    openMeteoData = JSON.parse(dataString);
                    dataString = null; // Libérer la chaîne de caractères

                    if (!openMeteoData || !openMeteoData.hourly || !openMeteoData.hourly.time) {
                        throw new Error("Format de données JSON invalide de l'API Open-Meteo.");
                    }

                    const { time, ...metrics } = openMeteoData.hourly;
                    console.log(`${V.gear} Traitement de ${time.length} points de données...`);
                    lastChunkDate = time.length > 0 ? new Date(time[0] * 1000) : null;

                    for (let i = 0; i < time.length; i++) {
                        const timestamp = new Date(time[i] * 1000);
                        timestamp.setMinutes(0, 0, 0);

                        for (const [openMeteoKey, values] of Object.entries(metrics)) {
                            const value = values[i];
                            if (value !== null && mapping[openMeteoKey]) {
                                const { type, sensor, convert } = mapping[openMeteoKey];
                                const metricValue = convert ? convert(value) : value;
                                sensor.forEach(s => {
                                    pointsChunk.push(new influxdbService.Point(type)
                                        .tag('station_id', stationId)
                                        .tag('sensor', s)
                                        .floatField('value', metricValue.toFixed(2))
                                        .timestamp(timestamp));
                                });
                            }
                        }

                        const Wind = metrics.wind_speed_10m[i] / 3.6;
                        const WindDir = metrics.wind_direction_10m[i];
                        const UxWind = Math.round(Wind * Math.sin(Math.PI * WindDir / 180.0) * 1000) / 1000;
                        const VyWind = Math.round(Wind * Math.cos(Math.PI * WindDir / 180.0) * 1000) / 1000;
                        pointsChunk.push(new influxdbService.Point('vector')
                            .tag('station_id', stationId)
                            .floatField('Ux', UxWind)
                            .floatField('Vy', VyWind)
                            .tag('sensor', 'open-meteo_Wind')
                            .timestamp(timestamp));

                        const Gust = metrics.wind_gusts_10m[i] / 3.6;
                        const GustDir = metrics.wind_direction_10m[i];
                        const UxGust = Math.round(Gust * Math.sin(Math.PI * GustDir / 180.0) * 1000) / 1000;
                        const VyGust = Math.round(Gust * Math.cos(Math.PI * GustDir / 180.0) * 1000) / 1000;
                        pointsChunk.push(new influxdbService.Point('vector')
                            .tag('station_id', stationId)
                            .floatField('Ux', UxGust)
                            .floatField('Vy', VyGust)
                            .tag('sensor', 'open-meteo_Gust')
                            .timestamp(timestamp));

                        const daysDiff = (timestamp - lastChunkDate) / (1000 * 60 * 60 * 24);

                        if (pointsChunk.length > 0 && (daysDiff >= CHUNK_SIZE_DAYS || i === time.length - 1)) {
                            const writtenCount = await influxdbService.writePoints(pointsChunk);
                            console.log(V.database, `Écriture d'un lot de ${pointsChunk.length} points dans InfluxDB... (Jusqu'à ${timestamp.toISOString()})`, V.Check);
                            totalPointsWritten += writtenCount;
                            pointsChunk = [];
                            lastChunkDate = timestamp;
                        }
                    }
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });

            stream.on('error', err => {
                reject(err);
            });
        });

        if (totalPointsWritten === 0) {
            console.log(`${V.info} Aucune nouvelle donnée à importer. La base de données est déjà à jour.`);
            return res.json({
                success: true,
                message: `Aucune nouvelle donnée à importer pour la station ${stationId}. La base est à jour.`
            });
        }

        if (stationConfig.historical) {
            stationConfig.historical.lastRun = new Date().toISOString();
            stationConfig.historical.msg = `${totalPointsWritten} points imported successfully.`;
            stationConfig.historical.since = firstUtc != lastUtc ? new Date(firstUtc).getFullYear() - moreYearsValue : startDate.getFullYear();
            configManager.autoSaveConfig(stationConfig);
        }

        res.json({
            success: true,
            stationId: stationId,
            message: `${totalPointsWritten} points de données historiques ont été importés avec succès pour la station ${stationId}, pour la période [${startDate.toISOString().slice(0, 16).replace('T', ' ')}, ${endDate.toISOString().slice(0, 16).replace('T', ' ')}]`,
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
        console.log(V.Travaux, `Récupération et écriture des prévisions Open-Meteo pour ${stationId}.`);

        const { latitude, longitude, elevation } = {
            latitude: stationConfig.latitude.lastReadValue,
            longitude: stationConfig.longitude.lastReadValue,
            elevation: stationConfig.altitude.lastReadValue,
        };
        const model = (stationConfig.forecast && stationConfig.forecast.model) || 'best_match';

        if (!latitude || !longitude) {
            throw new Error("Les coordonnées GPS de la station ne sont pas définies.");
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
            models: 'best_match',
            timezone: 'auto',
            forecast_days: 14 // Récupère 14 jours de prévisions
        };

        // Appel à l'API de prévisions
        const response = await axios.get(openMeteoUrl, { params });
        const openMeteoData = response.data;
        console.log(`${V.Parabol} Appel à Open-Meteo Forecast avec les paramètres:`, params, response.request.res.responseUrl);

        if (!openMeteoData || !openMeteoData.hourly || !openMeteoData.hourly.time) {
            throw new Error("Format de données JSON invalide de l'API Open-Meteo Forecast.");
        }

        const { time, ...metrics } = openMeteoData.hourly;
        console.log(`${V.gear} Traitement de ${time.length} points de données de prévisions...`);
        let pointsChunk = [];
        let totalPointsGenerated = 0;

        // Mapping sans le préfixe 'open-meteo_'
        const mapping = {
            'temperature_2m': { type: 'temperature', sensor: ['outTemp'], convert: (v) => v + 273.15 }, // °C -> K
            'relative_humidity_2m': { type: 'humidity', sensor: ['outHumidity'] },
            'precipitation': { type: 'rain', sensor: ['rainFall'] },
            'et0_fao_evapotranspiration': { type: 'rain', sensor: ['ET'] },
            'wind_speed_10m': { type: 'speed', sensor: ['Wind'], convert: (v) => v / 3.6 }, // km/h -> m/s
            'wind_gusts_10m': { type: 'speed', sensor: ['Gust'], convert: (v) => v / 3.6 }, // km/h -> m/s
            'wind_direction_10m': { type: 'direction', sensor: ['Wind', 'Gust'] },
            'soil_temperature_18cm': { type: 'temperature', sensor: ['soilTemp'], convert: (v) => v + 273.15 }, // °C -> K
            'soil_moisture_9_to_27cm': { type: 'soilMoisture', sensor: ['soilMoisture'], convert: (v) => v * 100 },
            'pressure_msl': { type: 'pressure', sensor: ['barometer'] },
            'shortwave_radiation': { type: 'irradiance', sensor: ['solar'] }
        };

        let timestamp;
        for (let i = 0; i < time.length; i++) {
            // Le temps est déjà un ISO string local à la station.
            // On le traite comme une chaîne pour éviter les conversions de fuseau horaire du serveur.
            const localTimestampStr = time[i];
            timestamp = new Date(localTimestampStr);

            if (timestamp > (new Date())) {
                for (const [openMeteoKey, values] of Object.entries(metrics)) {
                    const value = values[i];
                    if (value !== null && mapping[openMeteoKey]) {
                        const { type, sensor, convert } = mapping[openMeteoKey];
                        const metricValue = convert ? convert(value) : value;
                        sensor.forEach(s => {
                            pointsChunk.push(new influxdbService.Point(type)
                                .tag('station_id', stationId)
                                .tag('sensor', s)
                                .tag('forecast', 'true') // Tag pour les prévisions
                                .floatField('value', metricValue.toFixed(2))
                                .timestamp(timestamp));
                        });
                    }
                }

                const Wind = metrics.wind_speed_10m[i] / 3.6;
                const WindDir = metrics.wind_direction_10m[i];
                const UxWind = Math.round(Wind * Math.sin(Math.PI * WindDir / 180.0) * 1000) / 1000;
                const VyWind = Math.round(Wind * Math.cos(Math.PI * WindDir / 180.0) * 1000) / 1000;
                pointsChunk.push(new influxdbService.Point('vector')
                    .tag('station_id', stationId)
                    .floatField('Ux', UxWind)
                    .floatField('Vy', VyWind)
                    .tag('sensor', 'Wind')
                    .tag('forecast', 'true') // Tag pour les prévisions
                    .timestamp(timestamp));

                const Gust = metrics.wind_gusts_10m[i] / 3.6;
                const GustDir = metrics.wind_direction_10m[i];
                const UxGust = Math.round(Gust * Math.sin(Math.PI * GustDir / 180.0) * 1000) / 1000;
                const VyGust = Math.round(Gust * Math.cos(Math.PI * GustDir / 180.0) * 1000) / 1000;
                pointsChunk.push(new influxdbService.Point('vector')
                    .tag('station_id', stationId)
                    .floatField('Ux', UxGust)
                    .floatField('Vy', VyGust)
                    .tag('sensor', 'Gust')
                    .tag('forecast', 'true') // Tag pour les prévisions
                    .timestamp(timestamp));

                totalPointsGenerated += (Object.keys(mapping).length * 2) + 2; // Estimation grossière du nombre de points
            }
        }

        let writtenCount = 0;
        if (pointsChunk.length > 0) {
            writtenCount = await influxdbService.writePoints(pointsChunk);
            console.log(V.database, `Écriture de ${writtenCount} points de prévisions dans InfluxDB...`, V.Check);
        }

        // Suppression des points de prévisions obsolètes (ceux qui sont déjà passés)
        const now = new Date();
        const deleted = await influxdbService.deleteForecasts(stationId);
        console.log(V.trash, ` Suppression de ${deleted.count} points de prévisions obsolètes pour ${stationId}.`, deleted, V.Check);

        if (stationConfig.forecast) {
            stationConfig.forecast.lastRun = new Date().toISOString();
            stationConfig.forecast.msg = `${writtenCount} points imported, ${deleted.count} deleted.`;
            configManager.autoSaveConfig(stationConfig);
        }

        res.json({
            success: true,
            stationId: stationId,
            message: `${writtenCount} points de données de prévisions ont été importés avec succès pour la station ${stationId}, jusqu'au [${timestamp.toISOString().slice(0, 16).replace('T', ' ')}]`,
            pointsWritten: writtenCount,
            pointsDeleted: deleted,
        });

    } catch (error) {
        if (stationConfig && stationConfig.forecast) {
            stationConfig.forecast.lastRun = new Date().toISOString();
            stationConfig.forecast.msg = `Error: ${error.message}`;
            configManager.autoSaveConfig(stationConfig);
        }
        handleError(res, stationId, error, 'getOpenMeteoForecast');
    }
};