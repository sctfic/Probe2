const axios = require('axios');
const influxdbService = require('./influxdbService');
const { V } = require('../utils/icons');
const configManager = require('./configManager');

/**
 * Logique de collecte pour les périphériques Venti'Connect (API JSON /actuelles)
 */
async function collectVentiConnect(extender, stationId, points) {
    try {
        const url = `http://${extender.host}/actuelles`;
        console.log(`${V.info} [EXTENDERS] Interrogation de Venti'Connect: ${extender.name} (${url})`);

        const response = await axios.get(url, { timeout: 5000 });
        const data = response.data;

        if (data) {
            const timestamp = data.dateTime ? new Date(data.dateTime) : new Date();
            const prefix = `${extender.name}_`;

            // Températures
            if (data.temperature) {
                if (data.temperature.indoor !== undefined) {
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}indoor`)
                        .floatField('value', data.temperature.indoor)
                        .timestamp(timestamp));
                }
                if (data.temperature.fan !== undefined) {
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}fan`)
                        .floatField('value', data.temperature.fan)
                        .timestamp(timestamp));
                }
                if (data.temperature.collector !== undefined) {
                    points.push(new influxdbService.Point('temperature')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}collector`)
                        .floatField('value', data.temperature.collector)
                        .timestamp(timestamp));
                }
            }

            // Humidité
            if (data.humidity) {
                if (data.humidity.indoor !== undefined) {
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}indoor`)
                        .floatField('value', data.humidity.indoor)
                        .timestamp(timestamp));
                }
                if (data.humidity.fan !== undefined) {
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}fan`)
                        .floatField('value', data.humidity.fan)
                        .timestamp(timestamp));
                }
            }

            // Tensions
            if (data.voltage) {
                // if (data.voltage.supply !== undefined) {
                //     points.push(new influxdbService.Point('voltage')
                //         .tag('station_id', stationId)
                //         .tag('sensor', `${prefix}supply`)
                //         .floatField('value', data.voltage.supply)
                //         .timestamp(timestamp));
                // }
                // if (data.voltage.fan !== undefined) {
                //     points.push(new influxdbService.Point('voltage')
                //         .tag('station_id', stationId)
                //         .tag('sensor', `${prefix}fan_voltage`)
                //         .floatField('value', data.voltage.fan)
                //         .timestamp(timestamp));
                // }
                // if (data.voltage.remote !== undefined) {
                //     points.push(new influxdbService.Point('voltage')
                //         .tag('station_id', stationId)
                //         .tag('sensor', `${prefix}remote`)
                //         .floatField('value', data.voltage.remote)
                //         .timestamp(timestamp));
                // }
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
