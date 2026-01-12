const axios = require('axios');
const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');
const configManager = require('../services/configManager');

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

            // Ventilateur
            if (data.fan) {
                if (data.fan.rpm !== undefined) {
                    points.push(new influxdbService.Point('ticksByMin')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}rpm`)
                        .floatField('value', data.fan.rpm)
                        .timestamp(timestamp));
                }
                if (data.fan.instructions !== undefined) {
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}fan_instruction`)
                        .floatField('value', data.fan.instructions)
                        .timestamp(timestamp));
                }
                if (data.fan.real !== undefined) {
                    points.push(new influxdbService.Point('humidity')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}fan_real`)
                        .floatField('value', data.fan.real)
                        .timestamp(timestamp));
                }
            }

            // Tensions
            if (data.voltage) {
                if (data.voltage.supply !== undefined) {
                    points.push(new influxdbService.Point('voltage')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}supply`)
                        .floatField('value', data.voltage.supply)
                        .timestamp(timestamp));
                }
                if (data.voltage.fan !== undefined) {
                    points.push(new influxdbService.Point('voltage')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}fan_voltage`)
                        .floatField('value', data.voltage.fan)
                        .timestamp(timestamp));
                }
                if (data.voltage.remote !== undefined) {
                    points.push(new influxdbService.Point('voltage')
                        .tag('station_id', stationId)
                        .tag('sensor', `${prefix}remote`)
                        .floatField('value', data.voltage.remote)
                        .timestamp(timestamp));
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
 * Logique de collecte pour les périphériques WhisperEye (API CSV /RecupInfo)
 */
async function collectWhisperEye(extender, stationId, points) {
    try {
        const url = `http://${extender.host}/RecupInfo?key=${extender.apiKey}`;
        console.log(`${V.info} [EXTENDERS] Interrogation de WhisperEye: ${extender.name} (${url})`);

        const response = await axios.get(url, { timeout: 5000 });
        const csvData = response.data;

        if (csvData && typeof csvData === 'string') {
            const values = csvData.split(',');
            const timestamp = new Date();
            const prefix = `${extender.name}_`;

            const parseVal = (str) => {
                if (!str) return undefined;
                const num = parseFloat(str.replace(/[^\d.-]/g, ''));
                return isNaN(num) ? undefined : num;
            };

            // Températures
            const tOut = parseVal(values[0]);
            const tGaine = parseVal(values[1]);
            const tInt = parseVal(values[2]);
            const tColl = parseVal(values[19] || values[20]);

            if (tOut !== undefined) {
                points.push(new influxdbService.Point('temperature').tag('station_id', stationId).tag('sensor', `${prefix}outdoor`).floatField('value', tOut).timestamp(timestamp));
            }
            if (tGaine !== undefined) {
                points.push(new influxdbService.Point('temperature').tag('station_id', stationId).tag('sensor', `${prefix}fan`).floatField('value', tGaine).timestamp(timestamp));
            }
            if (tInt !== undefined) {
                points.push(new influxdbService.Point('temperature').tag('station_id', stationId).tag('sensor', `${prefix}indoor`).floatField('value', tInt).timestamp(timestamp));
            }
            if (tColl !== undefined) {
                points.push(new influxdbService.Point('temperature').tag('station_id', stationId).tag('sensor', `${prefix}collector`).floatField('value', tColl).timestamp(timestamp));
            }

            // RPM
            const rpm = parseVal(values[18]);
            if (rpm !== undefined) {
                points.push(new influxdbService.Point('ticksByMin').tag('station_id', stationId).tag('sensor', `${prefix}rpm`).floatField('value', rpm).timestamp(timestamp));
            }

            // Tensions
            const vAlimRaw = parseVal(values[11]);
            const vMoteurRaw = parseVal(values[12]);
            const v12Raw = parseVal(values[13]);
            const vRemoteRaw = parseVal(values[15]);

            if (vAlimRaw !== undefined) {
                points.push(new influxdbService.Point('voltage').tag('station_id', stationId).tag('sensor', `${prefix}supply`).floatField('value', vAlimRaw / 100).timestamp(timestamp));
            }
            if (vMoteurRaw !== undefined) {
                points.push(new influxdbService.Point('voltage').tag('station_id', stationId).tag('sensor', `${prefix}fan`).floatField('value', vMoteurRaw / 100).timestamp(timestamp));
            }
            if (vRemoteRaw !== undefined) {
                points.push(new influxdbService.Point('voltage').tag('station_id', stationId).tag('sensor', `${prefix}remote`).floatField('value', vRemoteRaw / 1000).timestamp(timestamp));
            }

            extender.available = true;
            console.log(`${V.Check} [EXTENDERS] Données CSV récupérées pour ${extender.name}`);
            return true;
        }
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
