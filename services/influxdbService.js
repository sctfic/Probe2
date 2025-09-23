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
                // console.log(`${V.Check} Requête Flux terminée avec succès.`);
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
async function getInfluxMetadata(stationId) {
    const bucketStructure = {};

    try {
        // Étape 1: Obtenir la liste de tous les _measurements
        const measurementsQuery = `
            import "influxdata/influxdb/schema"
            schema.measurements(bucket: "${bucket}")
        `;
        const measurements = await new Promise((resolve, reject) => {
            const results = [];
            queryApi.queryRows(measurementsQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    results.push(o._value);
                },
                error(error) {
                    reject(error);
                },
                complete() {
                    resolve(results);
                },
            });
        });

        // Étape 2: Pour chaque measurement, obtenir les tagKeys et fieldKeys
        for (const measurement of measurements) {
            
            // Requête pour les tags
            const tagsQuery = `
                import "influxdata/influxdb/schema"
                schema.measurementTagKeys(
                    bucket: "${bucket}",
                    measurement: "${measurement}"
                )
            `;
            const tags = await new Promise((resolve, reject) => {
                const results = [];
                queryApi.queryRows(tagsQuery, {
                    next(row, tableMeta) {
                        const o = tableMeta.toObject(row);
                        results.push(o._value);
                    },
                    error(error) {
                        reject(error);
                    },
                    complete() {
                        resolve(results);
                    },
                });
            });

            // Requête pour les champs (_fields)
            const fieldsQuery = `
                import "influxdata/influxdb/schema"
                schema.measurementFieldKeys(
                    bucket: "${bucket}",
                    measurement: "${measurement}"
                )
            `;
            const fields = await new Promise((resolve, reject) => {
                const results = [];
                queryApi.queryRows(fieldsQuery, {
                    next(row, tableMeta) {
                        const o = tableMeta.toObject(row);
                        results.push(o._value);
                    },
                    error(error) {
                        reject(error);
                    },
                    complete() {
                        resolve(results);
                    },
                });
            });

            const tagsWithValues = {};
            for (const tag of tags.filter(t => t !== '_measurement' && t !== '_start' && t !== '_stop' && t !== '_field')) {
                const valuesQuery = `
                    import "influxdata/influxdb/schema"
                    schema.measurementTagValues(
                        bucket: "${bucket}",
                        measurement: "${measurement}",
                        tag: "${tag}"
                    )
                `;
                const values = await new Promise((resolve, reject) => {
                    const results = [];
                    queryApi.queryRows(valuesQuery, {
                        next(row, tableMeta) {
                            const o = tableMeta.toObject(row);
                            results.push(o._value);
                        },
                        error(error) {
                            reject(error);
                        },
                        complete() {
                            resolve(results);
                        },
                    });
                });
                tagsWithValues[tag] = values;
            }

            // Stocker la structure
            bucketStructure[measurement] = {
                tags: tagsWithValues,
                fields: fields,
            };
        }
        return bucketStructure;

    } catch (error) {
        console.error('Erreur lors de l\'extraction de la structure:', error);
        return null;
    }
}
function getFilter(sensorRef) {
    let Filter;
    if (sensorRef.includes(':')) {
        const [measurement, sensor] = sensorRef.split(':');
        Filter = `r._measurement == "${measurement}" and r.sensor == "${sensor}"`;
    } else {
        Filter = `r.sensor == "${sensorRef}"`;
    }
    return Filter;
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
    let filter = '';
    if (sensorRef) {
        filter = getFilter(sensorRef);
    }
    const query = `
    from(bucket: "Probe")
        |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'}) 
        |> filter(fn: (r) => r.station_id == "${stationId}" ${filter ? 'and ' + filter : ''})
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
    if (!result || result.length === 0 || result[0].count === 0) {
        return { firstUtc: null, lastUtc: null, count: 0, unit: '' };
    }
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
    console.log(`Demande de données brutes pour ${stationId} - ${sensorRef}`, startDate, endDate, intervalSeconds);
    const fluxQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'}) 
          |> filter(fn: (r) => r.station_id == "${stationId}" and ${getFilter(sensorRef)})
          |> group(columns: ["unit"])
          |> aggregateWindow(every: ${intervalSeconds}s, fn: ${sensorRef == 'rainFall' || sensorRef == 'ET' ? 'sum' : 'mean'}, createEmpty: false)
          |> keep(columns: ["_time", "_field", "_value", "unit"])
          |> sort(columns: ["_time"])
    `;
    return await executeQuery(fluxQuery);
}

/**
 * Récupère les données brutes pour une station et plusieurs capteurs spécifiques.
 * @param {string} stationId - Identifiant de la station.
 * @param {Array<string>} sensorRefs - Références des capteurs (format: "_measurement:sensor").
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @param {number} intervalSeconds - Intervalle en secondes.
 */
async function queryRaws(stationId, sensorRefs, startDate, endDate, intervalSeconds = 3600) {
    // Définir les champs qui doivent être sommés (mesures de pluie/évapotranspiration)
    const rainFields = ['rainFall', 'ET'];
    
    // Séparer les capteurs en fonction de leur type (cumulatif ou moyenne)
    const cumulativeSensors = sensorRefs.filter(ref => {
        const [, sensor] = ref.includes(':') ? ref.split(':') : [null, ref];
        return rainFields.includes(sensor);
    });
    const meanSensors = sensorRefs.filter(ref => {
        const [, sensor] = ref.includes(':') ? ref.split(':') : [null, ref];
        return !rainFields.includes(sensor);
    });
    
    // Construire les filtres
    const sumFilter = cumulativeSensors.length > 0 
        ? cumulativeSensors.map(ref => getFilter(ref)).join(' or ')
        : null;
    const meanFilter = meanSensors.length > 0
        ? meanSensors.map(ref => getFilter(ref)).join(' or ')
        : null;
    
    // Construire la requête Flux
    let fluxQuery = '';
    
    // Requête pour les champs à sommer (rain)
    if (sumFilter) {
        fluxQuery += `
        sumData = from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}" and (${sumFilter}))
            |> map(fn: (r) => ({ r with sensor_key: r._measurement + ":" + r.sensor }))
            |> group(columns: ["sensor_key"])
            |> aggregateWindow(every: ${intervalSeconds}s, fn: sum, createEmpty: false)
            |> drop(columns: ["unit", "_start", "_stop", "station_id", "_measurement", "sensor"])
        `;
    }
    
    // Requête pour les champs à moyenner
    if (meanFilter) {
        if (sumFilter) {
            fluxQuery += '\n';
        }
        fluxQuery += `
        meanData = from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}" and (${meanFilter}))
            |> map(fn: (r) => ({ r with sensor_key: r._measurement + ":" + r.sensor }))
            |> group(columns: ["sensor_key"])
            |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, createEmpty: false)
            |> drop(columns: ["unit", "_start", "_stop", "station_id", "_measurement", "sensor"])
        `;
    }
    
    // Combiner les résultats si nécessaire
    if (sumFilter && meanFilter) {
        fluxQuery += `
        
        union(tables: [sumData, meanData])
            |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")
            |> sort(columns: ["_time"])
            |> yield()
        `;
    } else if (sumFilter) {
        fluxQuery += `
        
        sumData
            |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")
            |> sort(columns: ["_time"])
            |> yield()
        `;
    } else if (meanFilter) {
        fluxQuery += `
        
        meanData
            |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")
            |> sort(columns: ["_time"])
            |> yield()
        `;
    }
    
    return await executeQuery(fluxQuery);
}

/**
 * Récupère les données de la rose des vents pour une station.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @param {number} intervalSeconds - Intervalle en secondes.
 */
async function queryWindRose(stationId, startDate, endDate, intervalSeconds = 3600) {
    const fluxQuery = `
        // 1. Récupérer les données de direction Gust
        directionData = from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}")
            |> filter(fn: (r) => r._measurement == "direction")
            |> keep(columns: ["_time", "_value", "sensor"])
            |> rename(columns: {_value: "direction"})


        // 2. Récupérer les données de vitesse Gust
        speedData = from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}")
            |> filter(fn: (r) => r._measurement == "speed")
            |> keep(columns: ["_time", "_value", "sensor"])
            |> rename(columns: {_value: "speed"})

            // 3. Joindre les données de direction et de vitesse par _time
            grpPetal = join(
              tables: {direction: directionData, speed: speedData},
              on: ["_time","sensor"]
            )
            
            // 5. Agréger par intervalle et par petal
            |> group(columns: ["direction","sensor"])
           count = grpPetal
             |> aggregateWindow(every: ${intervalSeconds}s, fn: count, column: "speed", createEmpty: false)
             |> rename(columns: { speed: "count"})
           
           gust = grpPetal
             |> filter(fn: (r) => r.sensor == "Gust")
             |> aggregateWindow(every: ${intervalSeconds}s, fn: max, column: "speed", createEmpty: false)
             |> drop(columns: ["_start", "_stop"])
           gCount = count
             |> filter(fn: (r) => r.sensor == "Gust")
             |> drop(columns: ["_start", "_stop"])
           avg = grpPetal
             |> filter(fn: (r) => r.sensor == "Wind")
             |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, column: "speed", createEmpty: false)
             |> drop(columns: ["_start", "_stop"])
           aCount = count
             |> filter(fn: (r) => r.sensor == "Wind")
             |> drop(columns: ["_start", "_stop"])
           
           gustC = join(
               tables: {gCount: gCount, gust: gust},
               on: ["direction","_time"]
             )
           
           avgC = join(
               tables: {aCount: aCount, avg: avg},
               on: ["direction","_time"]
             )
           
           join(
               tables: {avg: avgC, gust: gustC},
               on: ["direction","_time"]
             )
             |> drop(columns: ["_start", "_stop","sensor_gust","sensor_avg", "sensor_aCount","sensor_gCount"])
             |> yield()
           
    `;
    const results = await executeQuery(fluxQuery);
    return parserWindRose(results);
}

/**
 * Convertit les données brutes en données par intervalle.
 * @param {Array} data - Les données brutes.
 * @returns {Object} Les données converties par intervalle.
 */
function parserWindRose(data) {
    const petal = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return data.reduce((accumulator, currentItem) => {
        const { _time, direction, count_gust, speed_gust, count_avg, speed_avg } = currentItem;
        const petalIndex = Math.floor(direction / 22.5);
        if (!accumulator[_time]) {
            accumulator[_time] = {};
        }

        accumulator[_time][petal[petalIndex]] = {
                gust:{
                    v:Math.round(speed_gust*100)/100,
                    c:count_gust
                },
                wind:{
                    v:Math.round(speed_avg*100)/100,
                    c:count_avg
                }
            };
        
        return accumulator;
    }, {});
}
/**
 * Récupère les données pour le graphique du vent pour une station spécifique.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Array>} Un tableau des données pour le graphique du vent.
 */
// STRUCTURE DES DONNÉES DANS INFLUXDB POUR LE VENT:
// "measurements": {
//     "direction": {
//         "tags": {
//             "sensor": [
//                 "Gust",
//                 "Wind"
//             ],
//             "station_id": [
//                 "VP2_Serramoune"
//             ],
//             "unit": [
//                 "°"
//             ]
//         },
//         "fields": [
//             "value"
//         ]
//     },
//     "speed": {
//         "tags": {
//             "sensor": [
//                 "Gust",
//                 "Wind"
//             ],
//             "station_id": [
//                 "VP2_Serramoune"
//             ],
//             "unit": [
//                 "m/s"
//             ]
//         },
//         "fields": [
//             "value"
//         ]
//     },
//     "vector": {
//         "tags": {
//             "sensor": [
//                 "Gust",
//                 "Wind"
//             ],
//             "station_id": [
//                 "VP2_Serramoune"
//             ],
//             "unit": [
//                 "->"
//             ]
//         },
//         "fields": [
//             "Ux",
//             "Vy"
//         ]
//     }
// }

async function queryWindVectors(stationId, sensorRef, startDate, endDate, intervalSeconds = 3600) {
    const fluxQuery = `
        import "math"
        from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : '0'}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}")
            |> filter(fn: (r) => r._measurement == "vector" and r.sensor == "${sensorRef}")
            |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, createEmpty: false)
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> map(fn: (r) => {
                    dir = math.atan2(y: r.Ux, x: r.Vy) * 180.0 / math.pi
                return {
                    d: r._time,
                    Ux: r.Ux,
                    Vy: r.Vy,
                    spd: math.sqrt(x: r.Ux * r.Ux + r.Vy * r.Vy),
                    dir: if dir < 0.0 then dir + 360.0 else dir
                }
            })
    `;
    
    try {
        const results = await executeQuery(fluxQuery);
        return results.map(item => {
            return {
                d: item.d,
                Ux: Math.round(item.Ux * 1000) / 1000,
                Vy: Math.round(item.Vy * 1000) / 1000,
                spd: Math.round(item.spd * 10) / 10,
                dir: Math.round(item.dir)
            };
        });
    } catch (error) {
        console.error('Erreur lors de la requête des vecteurs de vent:', error);
        throw error;
    }
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
            |> range(start: ${startDate ? startDate : '0'}, stop: ${endDate ? endDate : 'now()'}) 
            |> filter(fn: (r) => r.station_id == "${stationId}" and r.sensor == "${sensorRef}")
            |> group(columns: ["unit"])
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
                count: r.count,
                unit: r.unit
            }))
            |> sort(columns: ["datetime"])
            |> keep(columns: ["datetime", "first", "min", "avg", "max", "last", "count", "unit"])
    `;
    
    return await executeQuery(fluxQuery);
}


module.exports = {
    writePoints,
    Point,
    // queryData,
    getInfluxMetadata  ,
    queryDateRange,
    queryRaw,
    queryRaws,
    queryWindRose,
    queryWindVectors,
    queryCandle,
    clearBucket
};
