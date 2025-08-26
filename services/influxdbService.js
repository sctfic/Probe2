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

    // const tagsQuery = `
    //     import "influxdata/influxdb/schema"

    //     schema.tagKeys(
    //         bucket: "Probe2",
    //         predicate: (r) => r._measurement == "wind"
    //     )
    // `;
    // const tags = await executeQuery(tagsQuery);

    return {
        station_id: stationId,
        _field: sensorRefs.map(r => r._value),
        _measurements: measurements.map(m => m._value),
        // wind: tags.map(t => t._value)
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
        from(bucket: "${bucket}")
          |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'})
          |> filter(fn: (r) => r.station_id == "${stationId}" and r._field == "${sensorRef}")
          |> group()
          |> reduce(
              identity: {min_time: time(v: 0), max_time: time(v: 0), count: 0, unit: ""},
              fn: (r, accumulator) => ({
                  min_time: if accumulator.count == 0 or r._time < accumulator.min_time then r._time else accumulator.min_time,
                  max_time: if accumulator.count == 0 or r._time > accumulator.max_time then r._time else accumulator.max_time,
                  count: accumulator.count + 1,
                  unit: if exists r.unit then r.unit else accumulator.unit
              })
          )
    `;

    const result = await executeQuery(query);
    const data = result[0];

    return {
        firstUtc: data.min_time,
        lastUtc: data.max_time,
        count: data.count,
        unit: data.unit
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
            |> filter(fn: (r) => r.station_id == "${stationId}")
            |> filter(fn: (r) => r._measurement == "wind")
            |> filter(fn: (r) => r._field == "speed" or r._field == "gust")
            |> filter(fn: (r) => r.direction != "N/A")
            |> group(columns: ["direction", "_field", "unit"])
            |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, createEmpty: false)
            |> pivot(rowKey: ["_time", "direction", "unit"], columnKey: ["_field"], valueColumn: "_value")
            |> group()
            |> sort(columns: ["_time", "direction"])
            |> yield()
    `;
    
    const results = await executeQuery(fluxQuery);
    return formatWindData(results, intervalSeconds);
}

function formatWindData(results, intervalSeconds) {
    const formattedData = {};
    const allDirections = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

    
    // Grouper par timestamp
    results.forEach(row => {
        const timeKey = row._time;
        const direction = row.direction;
        let globalUnit;        
        // Capturer l'unité dès le premier enregistrement
        if (!globalUnit && row.unit) {
            globalUnit = row.unit;
        }
        
        if (!formattedData[timeKey]) {
            formattedData[timeKey] = {
                timestamp: timeKey,
                period: intervalSeconds,
                unit: globalUnit || row.unit || '',
                directions: {}
            };
            
            // Initialiser toutes les directions avec des valeurs par défaut
            allDirections.forEach(dir => {
                formattedData[timeKey].directions[dir] = {
                    avgSpeed: 0,
                    maxGust: 0
                };
            });
            
            // Ajouter N/A avec count
            // formattedData[timeKey].directions["N/A"] = {
            //     count: 0
            // };
        }
        
        // Mettre à jour l'unité si elle n'était pas définie
        if (!formattedData[timeKey].unit && row.unit) {
            formattedData[timeKey].unit = row.unit;
        }
        
        // Mettre à jour les valeurs pour la direction courante
        if (allDirections.includes(direction)) {
            if (row.speed !== null && row.speed !== undefined) {
                formattedData[timeKey].directions[direction].avgSpeed = row.speed;
            }
            if (row.gust !== null && row.gust !== undefined) {
                formattedData[timeKey].directions[direction].maxGust = row.gust;
            }
        // } else if (direction === "N/A") {
        //     formattedData[timeKey].directions["N/A"].count++;
        }
    });
    
    // Convertir l'objet en array et trier par timestamp
    return Object.values(formattedData)
        .map(period => ({
            ...period,
            unit: period.unit || globalUnit || "unknown"
        }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
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
        rainFall = from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}" and r._measurement == "rain" and r._field == "rainFall")
            |> aggregateWindow(every: ${intervalSeconds}s, fn: sum, createEmpty: false)
            |> set(key: "_field", value: "totalRainFall")

        evapotranspiration = from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}" and r._field == "ET")
            |> aggregateWindow(every: ${intervalSeconds}s, fn: sum, createEmpty: false)
            |> set(key: "_field", value: "totalET")

        union(tables: [rainFall, evapotranspiration])
            |> pivot(rowKey: ["_time", "unit"], columnKey: ["_field"], valueColumn: "_value")
            |> group()
            |> sort(columns: ["_time"])
            |> yield()
    `;
    
    const results = await executeQuery(fluxQuery);
    return formatRainData(results, intervalSeconds);
}

function formatRainData(results, intervalSeconds) {
    return results.map(row => ({
        timestamp: row._time,
        rainFall: Math.round((row.totalRainFall || 0) * 100) / 100,
        ET: Math.round((row.totalET || 0) * 100) / 100,
        unit: row.unit || "mm"
    }));
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
    console.log(`Demande de données candle pour ${stationId} - ${sensorRef}`, startDate, endDate, intervalSeconds);
    const fluxQuery = `
        import "math"
        from(bucket: "${bucket}")
            |> range(start: ${startDate ? `time(v: "${startDate}")` : '0'}, stop: ${endDate ? `time(v: "${endDate}")` : 'now()'}) 
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
                avg: math.round(x: r.sum_value / float(v: r.count) * 1000.0) / 1000.0,
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
