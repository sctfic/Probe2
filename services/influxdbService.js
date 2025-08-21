const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');

// Charger la configuration InfluxDB
const configPath = path.join(__dirname, '..', 'config', 'influx.json');
let influxConfig;
try {
    influxConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error(`${V.error} Erreur lors du chargement de la configuration InfluxDB:`, error);
    // Utiliser des valeurs par défaut ou arrêter le processus si la configuration est essentielle
    influxConfig = { url: '', token: '', org: '', bucket: '' };
}

const { url, token, org, bucket } = influxConfig;

// Initialiser le client InfluxDB
const influxDB = new InfluxDB({ url, token });
const writeApi = influxDB.getWriteApi(org, bucket);
const queryApi = influxDB.getQueryApi(org);

console.log(`${V.database} Service InfluxDB initialisé pour l'organisation '${org}' et le bucket '${bucket}'.`);

/**
 * Écrit un ensemble de points de données dans InfluxDB.
 * @param {Array<Point>} points - Un tableau d'objets Point à écrire.
 * @returns {Promise<boolean>} Retourne `true` si l'écriture a réussi, sinon `false`.
 */
async function writePoints(points) {
    if (!points || points.length === 0) {
        console.log('Aucun point à écrire dans InfluxDB.');
        return true;
    }
    try {
        writeApi.writePoints(points);
        await writeApi.flush();
        console.log(`${V.Check} ${points.length} points de données écrits avec succès dans InfluxDB.`);
        return true;
    } catch (error) {
        console.error(`${V.error} Erreur lors de l'écriture dans InfluxDB:`, error);
        return false;
    }
}

/**
 * Exécute une requête Flux sur InfluxDB.
 * @param {string} fluxQuery - La requête Flux à exécuter.
 * @returns {Promise<Array>} Un tableau des résultats de la requête.
 */
async function executeQuery(fluxQuery) {
    console.log(`${V.info} Exécution de la requête Flux:\n${fluxQuery}`);
    return new Promise((resolve, reject) => {
        const results = [];
        queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                results.push(tableMeta.toObject(row));
            },
            error(error) {
                console.error(`${V.error} Erreur lors de l'exécution de la requête Flux:`, error);
                reject(error);
            },
            complete() {
                console.log(`${V.Check} Requête Flux terminée avec succès.`);
                resolve(results);
            },
        });
    });
}

/**
 * Récupère les données pour une station et un capteur spécifiques.
 * @param {Object} queryParams - Paramètres de la requête (stationId, sensorRefs, startDate, endDate).
 * @returns {Promise<Array>} Un tableau des données récupérées.
 */
async function queryData(queryParams) {
    // Implémentation de queryData (similaire à stationController)
    // Ceci est un exemple basique, à adapter selon les besoins réels
    const { stationId, sensorRefs, startDate, endDate } = queryParams;
    let fluxQuery = `from(bucket: "${bucket}") |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) |> filter(fn: (r) => r.station_id == "${stationId}")`;

    if (sensorRefs && sensorRefs.length > 0) {
        const sensorFilter = sensorRefs.map(ref => `r.sensor_ref == "${ref}"`).join(' or ');
        fluxQuery += ` |> filter(fn: (r) => ${sensorFilter})`;
    }

    return await executeQuery(fluxQuery);
}

/**
 * Récupère les métadonnées pour une station spécifique.
 * @param {string} stationId - Identifiant de la station.
 * @returns {Promise<Object>} Un objet contenant les métadonnées de la station.
 */
async function getMetadata(stationId) {
    const fluxQuery = `
        import "influxdata/influxdb/schema"

        schema.tagValues(bucket: "${bucket}", tag: "sensor_ref", predicate: (r) => r.station_id == "${stationId}", start: -365d)
    `;
    const sensorRefs = await executeQuery(fluxQuery);

    const measurementsQuery = `
        import "influxdata/influxdb/schema"

        schema.measurements(bucket: "${bucket}")
    `;
    const measurements = await executeQuery(measurementsQuery);

    return {
        station_id: stationId,
        sensor_refs: sensorRefs.map(r => r._value),
        _measurements: measurements.map(m => m._value)
    };
}

/**
 * Récupère la plage de dates pour une station et un capteur spécifiques.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} sensorRef - Référence du capteur.
 * @returns {Promise<Object>} Un objet contenant la plage de dates.
 */
async function queryDateRange(stationId, sensorRef, startDate, endDate) {
    const firstQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'})
          |> filter(fn: (r) => r.station_id == "${stationId}" and r.sensor_ref == "${sensorRef}")
          |> first()
    `;
    const lastQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'})
          |> filter(fn: (r) => r.station_id == "${stationId}" and r.sensor_ref == "${sensorRef}")
          |> last()
    `;
    const countQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'})
          |> filter(fn: (r) => r.station_id == "${stationId}" and r.sensor_ref == "${sensorRef}")
          |> count()
    `;

    const [firstResult, lastResult, countResult] = await Promise.all([
        executeQuery(firstQuery),
        executeQuery(lastQuery),
        executeQuery(countQuery)
    ]);

    return {
        firstUtc: firstResult.length > 0 ? firstResult[0]._time : null,
        lastUtc: lastResult.length > 0 ? lastResult[0]._time : null,
        count: countResult.length > 0 ? countResult[0]._value : 0
    };
}

/**
 * Récupère les données brutes pour une station et un capteur spécifiques.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} sensorRef - Référence du capteur.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Array>} Un tableau des données brutes.
 */
async function queryRaw(stationId, sensorRef, startDate, endDate) {
    const fluxQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
          |> filter(fn: (r) => r.station_id == "${stationId}" and r.sensor_ref == "${sensorRef}")
          |> keep(columns: ["_time", "_value"])
    `;
    return await executeQuery(fluxQuery);
}

/**
 * Récupère les données pour le graphique du vent pour une station spécifique.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Array>} Un tableau des données pour le graphique du vent.
 */
async function queryWind(stationId, startDate, endDate) {
    const fluxQuery = `
        from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
            |> filter(fn: (r) => r.station_id == "${stationId}" and (r.sensor_ref == "windSpeed" or r.sensor_ref == "windDir"))
            |> pivot(rowKey:["_time"], columnKey: ["sensor_ref"], valueColumn: "_value")
            |> window(every: 10m)
            |> reduce(
                identity: {avg_speed: 0.0, avg_direction: 0.0, max_speed: 0.0, max_direction: 0.0, count: 0},
                fn: (r, accumulator) => ({
                    avg_speed: r.windSpeed + accumulator.avg_speed,
                    avg_direction: r.windDir + accumulator.avg_direction,
                    max_speed: if r.windSpeed > accumulator.max_speed then r.windSpeed else accumulator.max_speed,
                    max_direction: if r.windDir > accumulator.max_direction then r.windDir else accumulator.max_direction,
                    count: accumulator.count + 1
                })
            )
            |> map(fn: (r) => ({ r with 
                avg_speed: r.avg_speed / float(v: r.count),
                avg_direction: r.avg_direction / float(v: r.count)
            }))
    `;
    return await executeQuery(fluxQuery);
}

/**
 * Récupère les données pour le graphique de la pluie pour une station spécifique.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Array>} Un tableau des données pour le graphique de la pluie.
 */
async function queryRain(stationId, startDate, endDate) {
    const fluxQuery = `
        from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
            |> filter(fn: (r) => r.station_id == "${stationId}" and (r.sensor_ref == "rainFall" or r.sensor_ref == "rainRate"))
            |> pivot(rowKey:["_time"], columnKey: ["sensor_ref"], valueColumn: "_value")
            |> window(every: 1h)
            |> reduce(
                identity: {sum_rainFall: 0.0, avg_rainRate: 0.0, max_rainRate: 0.0, count: 0},
                fn: (r, accumulator) => ({
                    sum_rainFall: r.rainFall + accumulator.sum_rainFall,
                    avg_rainRate: r.rainRate + accumulator.avg_rainRate,
                    max_rainRate: if r.rainRate > accumulator.max_rainRate then r.rainRate else accumulator.max_rainRate,
                    count: accumulator.count + 1
                })
            )
            |> map(fn: (r) => ({ r with 
                avg_rainRate: r.avg_rainRate / float(v: r.count)
            }))
    `;
    return await executeQuery(fluxQuery);
}

/**
 * Récupère les données pour le graphique des chandelles pour une station et un capteur spécifiques.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} sensorRef - Référence du capteur.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Array>} Un tableau des données pour le graphique des chandelles.
 */
async function queryCandle(stationId, sensorRef, startDate, endDate) {
    const fluxQuery = `
        from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
            |> filter(fn: (r) => r.station_id == "${stationId}" and r.sensor_ref == "${sensorRef}")
            |> window(every: 1h)
            |> reduce(
                identity: {avg_value: 0.0, min_value: 1000.0, max_value: -1000.0, count: 0},
                fn: (r, accumulator) => ({
                    avg_value: r._value + accumulator.avg_value,
                    min_value: if r._value < accumulator.min_value then r._value else accumulator.min_value,
                    max_value: if r._value > accumulator.max_value then r._value else accumulator.max_value,
                    count: accumulator.count + 1
                })
            )
            |> map(fn: (r) => ({ r with 
                avg_value: r.avg_value / float(v: r.count)
            }))
    `;
    return await executeQuery(fluxQuery);
}

module.exports = {
    writePoints,
    Point,
    queryData,
    getMetadata,
    queryDateRange,
    queryRaw,
    queryWind,
    queryRain,
    queryCandle
};
