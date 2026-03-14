const axios = require('axios');
const influxdbService = require('./influxdbService');
const { V } = require('../utils/icons');
const configManager = require('./configManager');
const VentiConnectService = require('./VentiConnectService');
const WhisperEyeService = require('./WhisperEyeService');

/**
 * Logique de collecte pour les périphériques Venti'Connect (API JSON /InfoAPI)
 */
async function collectVentiConnect(extender, stationId, points) {
    try {
        console.log(`${V.info} [EXTENDERS] Interrogation de Venti'Connect: ${extender.name} (http://${extender.host}/InfoAPI)`);

        const data = await VentiConnectService.fetchVentiConnectInfoAPI(extender.host);

        if (data) {
            const prefix = `${extender.id}_`;
            console.log(V.package, prefix, data);

            // Températures
            if (data.temperature) {
                if (data.temperature.indoor !== undefined) {
                    // temperature:${prefix}indoor
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'indoor')
                        .tag('source', extender.id)
                        .floatField('value', data.temperature.indoor)
                        .timestamp(data.dateTime));
                }
                if (data.temperature.fan !== undefined) {
                    // temperature:${prefix}fan
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'fan')
                        .tag('source', extender.id)
                        .floatField('value', data.temperature.fan)
                        .timestamp(data.dateTime));
                }
                if (data.temperature.collector !== undefined) {
                    // temperature:${prefix}collector
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'collector')
                        .tag('source', extender.id)
                        .floatField('value', data.temperature.collector)
                        .timestamp(data.dateTime));
                }
            }

            // Humidité
            if (data.humidity) {
                if (data.humidity.indoor !== undefined) {
                    // humidity:${prefix}indoor
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'indoor')
                        .tag('source', extender.id)
                        .floatField('value', data.humidity.indoor)
                        .timestamp(data.dateTime));
                }
                if (data.humidity.fan !== undefined) {
                    // humidity:${prefix}fan
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'fan')
                        .tag('source', extender.id)
                        .floatField('value', data.humidity.fan)
                        .timestamp(data.dateTime));
                }
            }

            // Vitesse Ventilateur
            if (data.fan) {
                // if (data.fan.instructions !== undefined) {
                //     // ticksByMin:${prefix}instructions
                //     points.push(new influxdbService.Point('fan')
                //         .tag('station_id', stationId)
                //         .tag('sensor', prefix + 'instructions')
                //         .floatField('value', data.fan.instructions)
                //         .timestamp(data.dateTime));
                // }
                // if (data.fan.real !== undefined) {
                //     // ticksByMin:${prefix}real
                //     points.push(new influxdbService.Point('fan')
                //         .tag('station_id', stationId)
                //         .tag('sensor', prefix + 'real')
                //         .floatField('value', data.fan.real)
                //         .timestamp(data.dateTime));
                // }
                if (data.fan.rpm !== undefined) {
                    // ticksByMin:${prefix}rpm
                    points.push(new influxdbService.Point('rotation')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'rpm')
                        .tag('source', extender.id)
                        .floatField('value', data.fan.rpm)
                        .timestamp(data.dateTime));
                }
            }

            extender.available = true;
            console.log(`${V.Check} [EXTENDERS] Données JSON récupérées pour ${extender.name}`);
            return true;
        }
    } catch (error) {
        extender.available = false;
        console.error(`${V.error} [EXTENDERS] Erreur Venti'Connect ${extender.name}:`, error.message);
    }
    return false;
}

/**
 * Logique de collecte pour les périphériques WhisperEye (API json /Currents)
 */
async function collectWhisperEye(extender, stationId, points) {
    try {


    } catch (error) {
        extender.available = false;
        console.error(`${V.error} [EXTENDERS] Erreur WhisperEye ${extender.name}:`, error.message);
    }
    return false;
}

/**
 * Logique principale de collecte (Orchestrateur)
 */
async function runExtenderCollection(stationConfig) {
    const stationId = stationConfig.id;
    const points = [];

    // Récupération des listes d'extendeurs
    const ventiConnects = stationConfig.extenders["Venti'Connect"] || [];
    const whisperEyes = stationConfig.extenders["WhisperEye"] || [];

    // Création des promesses de collecte en parallèle
    const promises = [
        ...ventiConnects.map(extender => collectVentiConnect(extender, stationId, points)),
        ...whisperEyes.map(extender => collectWhisperEye(extender, stationId, points))
    ];

    if (promises.length === 0) return;

    await Promise.all(promises);

    if (points.length > 0) {
        try {
            await influxdbService.writePoints(points, 'Extenders');
            console.log(`${V.database} [EXTENDERS] ${points.length} points écrits dans InfluxDB.`);
            configManager.autoSaveConfig(stationConfig);
        } catch (error) {
            console.error(`${V.error} [EXTENDERS] Erreur lors de l'écriture InfluxDB:`, error);
        }
    }
}

/**
 * Simple ping de tous les extendeurs pour mettre à jour leur état 'available'
 * Ne génère aucun point InfluxDB.
 */
async function pingAllExtenders(stationConfig) {
    const ventiConnects = stationConfig.extenders["Venti'Connect"] || [];
    const whisperEyes = stationConfig.extenders["WhisperEye"] || [];

    const promises = [
        ...ventiConnects.map(async (extender) => {
            const data = await VentiConnectService.fetchVentiConnectInfoAPI(extender.host);
            extender.available = !!data;
        }),
        ...whisperEyes.map(async (extender) => {
            const data = await WhisperEyeService.fetchWhisperEyeCurrents(extender.host);
            extender.available = !!data;
        })
    ];

    await Promise.all(promises);

    return stationConfig.extenders;
}

module.exports = {
    runExtenderCollection,
    pingAllExtenders
};
