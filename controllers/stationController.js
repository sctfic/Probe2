// controllers/stationController.js
const stationService = require('../services/stationService');
const influxdbService = require('../services/influxdbService');
const cronService = require('../services/cronService');
const configManager = require('../services/configManager');
const network = require('../services/networkService');
const { queryDateRange } = require('../services/influxdbService');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const compositeProbes = require('../config/compositeProbes.json');
const { sensorTypeMap } = require('../utils/weatherDataParser');
const units = require('../config/Units.json');
const { V } = require('../utils/icons');

exports.testTcpIp = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.info} Demande d'informations pour la station ${stationConfig.id}`);
        
        const telnet = await network.testTCPIP(req.stationConfig);
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: telnet
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
exports.getStationInfo = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.info} Demande d'informations pour la station ${stationConfig.id}`);
        
        const info = await stationService.getStationInfo(req, stationConfig);
        
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

/**
 * Calculates and appends composite probe data to the weather data object.
 * This function is designed to be used with both live and cached data.
 * @param {object} weatherData - The core weather data object.
 * @param {object} stationConfig - The configuration for the station.
 * @returns {Promise<object>} The weather data object enriched with calculated values.
 */
async function calculateAndAppendcompositeProbes(weatherData, stationConfig) {
    try {
        // 1. Prepare script context (can be cached for performance)
        const scriptContext = {};
        const loadedScripts = new Set();

        for (const probeKey in compositeProbes) {
            const probeConfig = compositeProbes[probeKey];
            if (probeConfig.scriptJS) {
                for (const scriptPath of probeConfig.scriptJS) { // charge les scripts specifie dans la config
                    if (!loadedScripts.has(scriptPath)) { // evite de charger plusieurs fois le même script
                        const fullPath = path.join(__dirname, '..', 'public', scriptPath);
                        try {
                            console.log(`${V.gear} Loading script ${scriptPath} for current conditions`);
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

        // 2. Calculate values for each composite probe
        for (const probeKey in compositeProbes) {
            let allDataAvailable = true;
            const probeConfig = compositeProbes[probeKey];
            const calcInput = {};
            for (const key in probeConfig.currentMap) {
                if (probeConfig.currentMap[key] === 'timestamp') {
                    calcInput[key] = new Date().toISOString();
                } else if (!weatherData[probeConfig.currentMap[key]]) {
                    console.log(V.Warn, `Missing data ${key} for`, probeConfig.currentMap);
                    console.log(V.Warn, `verrifier ${probeKey}.currentMap['${key}'] la valeur est inconnue dans les current-conditions`);
                    allDataAvailable = false;
                    break;
                } else {
                    calcInput[key] = weatherData[probeConfig.currentMap[key]].Value;
                }
            }
            if (allDataAvailable) {
                const fnCalcStr = probeConfig.fnCalc
                    .replace("%longitude%", stationConfig.longitude.lastReadValue)
                    .replace("%latitude%", stationConfig.latitude.lastReadValue)
                    .replace("%altitude%", stationConfig.altitude.lastReadValue);

                const calculate = vm.runInNewContext(`(${fnCalcStr})`, scriptContext);
                const calculatedValue = calculate(calcInput);
                const type = sensorTypeMap[probeKey];
                const measurement = units[type];
                // console.log('Value', calculatedValue, 'Unit', measurement.metric , 'userUnit', measurement.user , 'toUserUnit', measurement.available_units[measurement.user].fnFromMetric );
                weatherData[probeKey] = {
                    label: probeConfig.label,
                    comment: probeConfig.comment,
                    Value: calculatedValue,
                    measurement: sensorTypeMap[probeKey] || null,
                    Unit: measurement?.metric || null,
                    userUnit: measurement?.user || null,
                    toUserUnit: measurement?.available_units?.[measurement.user]?.fnFromMetric || null,
                    period: probeConfig.period,
                    sensorDb: probeConfig.sensorDb
                };
            }
        }
    } catch (calcError) {
        console.error(`${V.error} Error calculating composite probes for current conditions:`, calcError.message);
    }
    return weatherData;
}

exports.getCurrentWeather = async (req, res) => {
    const stationConfig = req.stationConfig;
    const cacheFilePath = path.join(__dirname, '..', 'config', 'stations', `${stationConfig.id}.currents.last`);

    try {
        const weatherData = await stationService.getCurrentWeatherData(req, stationConfig);
        // Calculate and append composite probes
        const enrichedWeatherData = await calculateAndAppendcompositeProbes(weatherData, stationConfig);
        
        const responsePayload = {
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: enrichedWeatherData
        };
        // Enregistrer la réponse réussie dans le fichier cache
        fs.writeFileSync(cacheFilePath, JSON.stringify(responsePayload, null, 2), 'utf8');

        res.json(responsePayload);
    } catch (error) {
        // En cas d'erreur, essayer de renvoyer les données du fichier cache
        try {
            if (fs.existsSync(cacheFilePath)) {
                console.log(V.Warn, `Récupération des données depuis le cache: ${cacheFilePath}`);
                const cachedData = fs.readFileSync(cacheFilePath, 'utf8');
                let responsePayload = JSON.parse(cachedData);
                
                // Extract weather data from the cached payload
                let weatherDataFromCache = responsePayload.data;

                // Recalculate composite probes on the cached data
                weatherDataFromCache = await calculateAndAppendcompositeProbes(weatherDataFromCache, stationConfig);
                // console.log(weatherDataFromCache.AirWater_calc);
                // Ajouter un message pour indiquer que les données proviennent du cache
                responsePayload.data = weatherDataFromCache;
                responsePayload.message = "Données en cache (erreur de connexion à la station)";
                responsePayload.fromCache = true;
                responsePayload.success = false;
                
                res.json(responsePayload);
            } else {
                // Si aucun fichier cache n'existe, renvoyer l'erreur originale
                throw new Error(`Aucun fichier cache disponible et erreur de connexion: ${error.message}`); // Re-throw to be caught by the outer catch
            }
        } catch (cacheError) {
            console.error(`${V.error} Erreur lors de la lecture du fichier cache pour ${req.stationConfig?.id}:`, cacheError);
            res.status(500).json({
                success: false,
                stationId: req.stationConfig?.id || 'unknown',
                error: error.message // Renvoie l'erreur de connexion originale
            });
        }
    }
};

exports.getArchiveData = async (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.Parabol} Demande de données d'archive pour la station ${stationConfig.id}`);
            
        const endDate = (await queryDateRange(stationConfig.id, 'barometer', '-120d', null)).lastUtc;
        console.log();
        // <!> downloadArchiveData laisse un relica de socket
        const archiveData = await stationService.downloadArchiveData(req, stationConfig, endDate);
        // si il est 0h 00 le dimanche, on met a jour la date de la station
        if (new Date().getDay() === 0 && new Date().getHours() === 0 && new Date().getMinutes() === 0) {
            await stationService.getVp2DateTime(req, stationConfig);
        }
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: archiveData
        });
        configManager.autoSaveConfig(stationConfig);
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

        const result = await stationService.syncStationSettings(req, stationConfig);

        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: result,
            settings: stationConfig
        });
        // autosave config
        configManager.autoSaveConfig(stationConfig);
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
        
        const result = await stationService.updateStationTime(req, stationConfig);
        
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
        
        const stationDateTime = await stationService.getVp2DateTime(req, stationConfig);
        
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

exports.deleteStation = (req, res) => {
    try {
        const stationId = req.params.stationId;
        
        console.log(`${V.trash} Suppression de la configuration pour la station ${stationId}`);
        
        // Vérifier si la station existe
        const existingConfig = configManager.loadConfig(stationId);
        if (!existingConfig) {
            return res.status(404).json({
                success: false,
                error: `Configuration non trouvée pour la station ${stationId}`
            });
        }
        
        // Supprimer la configuration
        const success = configManager.deleteConfig(stationId);
        
        if (success) {
            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                message: `Configuration supprimée avec succès pour la station ${stationId}`,
                stationId: stationId
            });
        } else {
            throw new Error('Échec de la suppression de la configuration');
        }
    } catch (error) {
        console.error(`${V.error} Erreur lors de la suppression de la configuration:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
// exports.queryInfluxDB = async (req, res) => {
//     try {
//         const { stationId } = req.params;
//         let { sensorRefs, nbrStep, grouping, startDate, endDate } = req.query;
//         // exemple d'URL : http://probe2.lpz.ovh/api/station/VP2_Serramoune/query?sensorRefs=inTemp&nbrStep=12&grouping=avg
//         // &startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:59:59.999Z

//         // Pour les requêtes GET, sensorRefs peut être une chaîne de caractères séparée par des virgules
//         if (typeof sensorRefs === 'string') {
//             sensorRefs = sensorRefs.split(',');
//         }

//         console.log(`${V.database} Demande de données InfluxDB pour la station ${stationId}`);

//         const queryParams = {
//             stationId,
//             sensorRefs,
//             nbrStep,
//             grouping,
//             startDate,
//             endDate
//         };

//         const results = await influxdbService.queryData(queryParams);

//         res.json({
//             success: true,
//             stationId: stationId,
//             timestamp: new Date().toISOString(),
//             data: results
//         });
//     } catch (error) {
//         console.error(`${V.error} Erreur dans queryInfluxDB pour ${req.params.stationId}:`, error);
//         res.status(500).json({
//             success: false,
//             stationId: req.params.stationId || 'unknown',
//             error: error.message
//         });
//     }
// };

// module.exports = {
//     getStationInfo,
//     getCurrentWeather,
//     getArchiveData,
//     syncSettings,
//     updateTime,
//     getDateTime,
//     queryInfluxDB
// };