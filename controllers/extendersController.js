const axios = require('axios');
const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');
const configManager = require('../services/configManager');

/**
 * Middleware pour collecter les données des extendeurs avant la collecte de la station principale.
 */
exports.collectExtenders = async (req, res, next) => {
    const { stationId } = req.params;
    const stationConfig = req.stationConfig;

    if (!stationConfig || !stationConfig.extenders) {
        return next();
    }

    console.log(`${V.info} [EXTENDERS] Collecte des données pour la station ${stationId}`);

    const points = [];
    const ventiConnects = stationConfig.extenders["Venti'Connect"] || [];

    await Promise.all(ventiConnects.map(async (extender) => {
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
                        // Utilisation de 'humidity' car c'est une unité en % existante dans Units.json
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
                console.log(`${V.Check} [EXTENDERS] Données récupérées pour ${extender.name}`);
            }
        } catch (error) {
            extender.available = false;
            console.error(`${V.error} [EXTENDERS] Erreur lors de la récupération pour ${extender.name}:`, error.message);
        }
    }));

    if (points.length > 0) {
        try {
            await influxdbService.writePoints(points);
            console.log(`${V.database} [EXTENDERS] ${points.length} points écrits dans InfluxDB.`);
            // Sauvegarder l'état 'available' mis à jour
            configManager.autoSaveConfig(stationConfig);
        } catch (error) {
            console.error(`${V.error} [EXTENDERS] Erreur lors de l'écriture dans InfluxDB:`, error);
        }
    }

    next();
};