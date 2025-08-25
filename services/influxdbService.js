const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { DeleteAPI } = require('@influxdata/influxdb-client-apis');
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
const deleteApi = new DeleteAPI(influxDB);

console.log(`${V.database} Service InfluxDB initialisé pour l'organisation '${org}' et le bucket '${bucket}'.`);

/**
 * Supprime toutes les données d'un bucket dans une plage de temps donnée.
 * @returns {Promise<boolean>} Retourne `true` si la suppression a réussi, sinon `false`.
 */
async function clearBucket() {
    const stop = new Date();
    const start = new Date(0); // 1970-01-01T00:00:00Z
    console.log(`${V.Warn} Tentative de suppression de toutes les données du bucket '${org}/${bucket}' de ${start.toISOString()} à ${stop.toISOString()}`);

    try {
        await deleteApi.postDelete({
            org,
            bucket,
            body: {
                start: start.toISOString(),
                stop: stop.toISOString()
            }
        });
        console.log(`${V.Check} Toutes les données du bucket '${bucket}' ont été supprimées avec succès.`);
        return true;
    } catch (error) {
        console.error(`${V.error} Erreur lors de la suppression des données du bucket '${bucket}':`, error);
        return false;
    }
}

/**
 * Écrit un ensemble de points de données dans InfluxDB.
 * @param {Array<Point>} points - Un tableau d'objets Point à écrire.
 * @returns {Promise<boolean>} Retourne `true` si l'écriture a réussi, sinon `false`.
 */
async function writePoints(points) {
    if (!points || points.length === 0) {
        return true;
    }
    try {
        writeApi.writePoints(points);
        await writeApi.flush();
        return points.length;
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
 * Récupère les métadonnées pour une station spécifique.
 * @param {string} stationId - Identifiant de la station.
 * @returns {Promise<Object>} Un objet contenant les métadonnées de la station.
 */
async function getMetadata(stationId) {
    const fluxQuery = `
        import "influxdata/influxdb/schema"

        schema.tagValues(bucket: "${bucket}", tag: "_field", predicate: (r) => r.station_id == "${stationId}", start: -365d)
    `;
    const sensorRefs = await executeQuery(fluxQuery);

    const measurementsQuery = `
        import "influxdata/influxdb/schema"

        schema.measurements(bucket: "${bucket}")
    `;
    const measurements = await executeQuery(measurementsQuery);

    return {
        station_id: stationId,
        _field: sensorRefs.map(r => r._value),
        _measurements: measurements.map(m => m._value)
    };
}

/**
 * Récupère la plage de dates pour une station et un capteur spécifiques.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} sensorRef - Référence du capteur.
 * @param {string} startDate - Date de début (optionnelle).
 * @param {string} endDate - Date de fin (optionnelle).
 * @returns {Promise<Object>} Un objet contenant la plage de dates.
 */
async function queryDateRange(stationId, sensorRef, startDate, endDate) {
    const query = `
        import "experimental"
        
        data = from(bucket: "${bucket}")
          |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'})
          |> filter(fn: (r) => r.station_id == "${stationId}" and r._field == "${sensorRef}")
        
        first = data 
          |> first() 
          |> map(fn: (r) => ({_time: r._time, _value: "first", _field: "operation"}))
        
        last = data 
          |> last() 
          |> map(fn: (r) => ({_time: r._time, _value: "last", _field: "operation"}))
        
        count = data 
          |> count() 
          |> map(fn: (r) => ({_time: now(), _value: string(v: r._value), _field: "count"}))
        
        union(tables: [first, last, count])
    `;

    const result = await executeQuery(query);
    
    // Traitement des résultats
    let firstUtc = null;
    let lastUtc = null;
    let count = 0;
    
    result.forEach(row => {
        switch (row._field) {
            case 'operation':
                if (row._value === 'first') {
                    firstUtc = row._time;
                } else if (row._value === 'last') {
                    lastUtc = row._time;
                }
                break;
            case 'count':
                count = parseInt(row._value) || 0;
                break;
        }
    });

    return {
        firstUtc,
        lastUtc,
        count
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
async function queryRaw(stationId, sensorRef, startDate, endDate, intervalSeconds = 3600) {
    const fluxQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
          |> filter(fn: (r) => r.station_id == "${stationId}" and r._field == "${sensorRef}")
          |> window(every: ${intervalSeconds}s)
          |> keep(columns: ["_time", "_value", "unit"])
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
async function queryWind(stationId, startDate, endDate, intervalSeconds = 3600) {
    const fluxQuery = `
        from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
            |> filter(fn: (r) => r.station_id == "${stationId}" and (r._field == "windSpeed" or r._field == "windDir"))
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> window(every: ${intervalSeconds}s)
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
 * @param {number} intervalSeconds - Intervalle en secondes (optionnel)
 * @returns {Promise<Array>} Un tableau des données pour le graphique de la pluie.
 */
async function queryRain(stationId, startDate, endDate, intervalSeconds = 3600) {
    const fluxQuery = `
        from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
            |> filter(fn: (r) => r.station_id == "${stationId}" and (r._field == "rainFall" or r._field == "rainRate"))
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> window(every: ${intervalSeconds}s)
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
 * Récupère les données candle pour une station et un capteur spécifiques
 * @param {string} stationId - Identifiant de la station
 * @param {string} sensorRef - Référence du capteur
 * @param {string} startDate - Date de début (optionnelle)
 * @param {string} endDate - Date de fin (optionnelle)
 * @param {number} intervalSeconds - Intervalle en secondes (optionnel)
 * @returns {Promise<string>} Données au format TSV
 */
async function queryCandle(stationId, sensorRef, startDate, endDate, intervalSeconds = 3600) {
    
    console.log(`Intervalle calculé: ${intervalSeconds}s pour ${stepCount} étapes entre ${effectiveStart} et ${effectiveEnd}`);
    
    // 4. Requête InfluxDB optimisée
    const fluxQuery = `
        import "math"
        from(bucket: "${bucket}")
            |> range(start: time(v: "${effectiveStart}"), stop: time(v: "${effectiveEnd}"))
            |> filter(fn: (r) => r.station_id == "${stationId}" and r._field == "${sensorRef}")
            |> window(every: ${intervalSeconds}s)
            |> reduce(
                identity: {
                    first_value: 0.0,
                    last_value: 0.0, 
                    min_value: 999999.0, 
                    max_value: -999999.0, 
                    sum_value: 0.0,
                    count: 0,
                    first_time: time(v: "1970-01-01T00:00:00Z")
                },
                fn: (r, accumulator) => ({
                    first_value: if accumulator.count == 0 then r._value else accumulator.first_value,
                    last_value: r._value,
                    min_value: if r._value < accumulator.min_value then r._value else accumulator.min_value,
                    max_value: if r._value > accumulator.max_value then r._value else accumulator.max_value,
                    sum_value: accumulator.sum_value + r._value,
                    count: accumulator.count + 1,
                    first_time: if accumulator.count == 0 then r._time else accumulator.first_time
                })
            )
            |> map(fn: (r) => ({ 
                datetime: r.first_time,
                first: r.first_value,
                min: r.min_value,
                avg: math.round(x: r.sum_value / float(v: r.count) * 100.0) / 1000.0,
                max: r.max_value,
                last: r.last_value,
                count: r.count
            }))
            |> sort(columns: ["datetime"])
            |> keep(columns: ["datetime", "first", "min", "avg", "max", "last", "count"])
    `;
    
    return await executeQuery(fluxQuery);
}

module.exports = {
    writePoints,
    Point,
    // queryData,
    getMetadata,
    queryDateRange,
    queryRaw,
    queryWind,
    queryRain,
    queryCandle,
    clearBucket
};
