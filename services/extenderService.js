const axios = require('axios');
const influxdbService = require('./influxdbService');
const { V } = require('../utils/icons');
const configManager = require('./configManager');
const VentiConnectService = require('./VentiConnectService');

/**
 * Logique de collecte pour les périphériques Venti'Connect (API JSON /InfoAPI)
 */
async function collectVentiConnect(extender, stationId, points) {
    try {
        console.log(`${V.info} [EXTENDERS] Interrogation de Venti'Connect: ${extender.name} (http://${extender.host}/InfoAPI)`);

        const data = await VentiConnectService.fetchVentiConnectInfoAPI(extender.host);

        if (data) {
            const prefix = `${extender.id}_`;
            console.log(data);

            // Températures
            if (data.temperature) {
                if (data.temperature.indoor !== undefined) {
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'indoor')
                        // .tag('extender', extender.id || extender.name)
                        .floatField('value', data.temperature.indoor)
                        .timestamp(data.dateTime));
                }
                if (data.temperature.fan !== undefined) {
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'fan')
                        // .tag('extender', extender.id || extender.name)
                        .floatField('value', data.temperature.fan)
                        .timestamp(data.dateTime));
                }
                if (data.temperature.collector !== undefined) {
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'collector')
                        // .tag('extender', extender.id || extender.name)
                        .floatField('value', data.temperature.collector)
                        .timestamp(data.dateTime));
                }
            }

            // Humidité
            if (data.humidity) {
                if (data.humidity.indoor !== undefined) {
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'indoor')
                        // .tag('extender', extender.id || extender.name)
                        .floatField('value', data.humidity.indoor)
                        .timestamp(data.dateTime));
                }
                if (data.humidity.fan !== undefined) {
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', prefix + 'fan')
                        // .tag('extender', extender.id || extender.name)
                        .floatField('value', data.humidity.fan)
                        .timestamp(data.dateTime));
                }
            }

            // // Vitesse Ventilateur
            // if (data.fan) {
            //     if (data.fan.instructions !== undefined) {
            //         points.push(new influxdbService.Point('fan')
            //             .tag('station_id', stationId)
            //             .tag('sensor', prefix + 'instructions')
            //             // .tag('extender', extender.id || extender.name)
            //             .floatField('value', data.fan.instructions)
            //             .timestamp(data.dateTime));
            //     }
            //     if (data.fan.real !== undefined) {
            //         points.push(new influxdbService.Point('fan')
            //             .tag('station_id', stationId)
            //             .tag('sensor', prefix + 'real')
            //             // .tag('extender', extender.id || extender.name)
            //             .floatField('value', data.fan.real)
            //             .timestamp(data.dateTime));
            //     }
            //     if (data.fan.rpm !== undefined) {
            //         points.push(new influxdbService.Point('fan')
            //             .tag('station_id', stationId)
            //             .tag('sensor', prefix + 'rpm')
            //             // .tag('extender', extender.id || extender.name)
            //             .floatField('value', data.fan.rpm)
            //             .timestamp(data.dateTime));
            //     }
            // }

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
        const url = `http://${extender.host}/Currents?key=${extender.apiKey}`;
        console.log(`${V.info} [EXTENDERS] Interrogation de WhisperEye: ${extender.name} (${url})`);

        const response = await axios.get(url, { timeout: 5000 });
        const csvData = response.data;








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
            await influxdbService.writePoints(points);
            console.log(`${V.database} [EXTENDERS] ${points.length} points écrits dans InfluxDB.`);
            configManager.autoSaveConfig(stationConfig);
        } catch (error) {
            console.error(`${V.error} [EXTENDERS] Erreur lors de l'écriture InfluxDB:`, error);
        }
    }
}

module.exports = {
    runExtenderCollection
};
