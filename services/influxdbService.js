// services/influxdbService.js
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { DeleteAPI, HealthAPI } = require('@influxdata/influxdb-client-apis');
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');
const { get } = require('http');

const configPath = path.join(__dirname, '..', 'config', 'influx.json');
let influxConfigs = {}; // Stocke les configurations pour chaque bucket
let influxInstances = {}; // Stocke les instances (client, writeApi, queryApi, etc.) pour chaque bucket

/**
 * Initialise les clients InfluxDB pour un bucket donné.
 * @param {string} key - La clé du bucket ('eternal', 'longRetention', 'shortRetention').
 * @param {object} config - L'objet de configuration { url, token, org, bucket }.
 */
function initializeBucket(key, config) {
    if (!config || !config.url || !config.token) {
        console.warn(`${V.warning} Configuration InfluxDB manquante ou incomplète pour le bucket '${key}'.`);
        return;
    }

    try {
        const client = new InfluxDB({ url: config.url, token: config.token, timeout: 12000 });
        influxInstances[key] = {
            client,
            writeApi: client.getWriteApi(config.org, config.bucket),
            queryApi: client.getQueryApi(config.org),
            deleteApi: new DeleteAPI(client),
            org: config.org,
            bucket: config.bucket
        };
        console.log(`${V.database} Service InfluxDB initialisé pour le bucket '${key}' (${config.bucket}).`);
    } catch (error) {
        console.error(`${V.error} Erreur lors de l'initialisation du bucket InfluxDB '${key}':`, error);
    }
}

/**
 * Charge la configuration depuis le fichier et initialise tous les buckets.
 */
function loadAndInitialize() {
    try {
        if (fs.existsSync(configPath)) {
            influxConfigs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            console.warn(`${V.warning} Fichier de configuration InfluxDB non trouvé à ${configPath}.`);
            influxConfigs = {};
        }
    } catch (error) {
        console.error(`${V.error} Erreur lors du chargement de la configuration InfluxDB:`, error);
        influxConfigs = {};
    }

    // Initialiser chaque bucket défini dans la config
    const buckets = ['eternal', 'longRetention', 'shortRetention'];
    buckets.forEach(key => {
        initializeBucket(key, influxConfigs[key]);
    });
}

loadAndInitialize(); // Initialisation au démarrage

/**
 * Retourne la configuration complète d'InfluxDB.
 */
function getSettings() {
    return influxConfigs;
}

/**
 * Met à jour la configuration InfluxDB, la sauvegarde et réinitialise les services.
 * @param {object} newConfigs - La nouvelle configuration complète.
 */
function updateSettings(newConfigs) {
    console.log(`${V.write} Mise à jour de la configuration InfluxDB.`);
    influxConfigs = newConfigs;
    try {
        fs.writeFileSync(configPath, JSON.stringify(influxConfigs, null, 4), 'utf8');
        loadAndInitialize();
        return true;
    } catch (error) {
        console.error(`${V.error} Erreur lors de la sauvegarde de la configuration InfluxDB:`, error);
        return false;
    }
}

/**
 * Teste la connexion à une instance InfluxDB avec une configuration donnée.
 * @param {object} config - L'objet de configuration contenant { url, token, org }.
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function testInfluxConnection(config) {
    console.log(`${V.info} Test de la connexion à InfluxDB avec l'URL: ${config.url}`);
    try {
        const testInfluxDB = new InfluxDB({ url: config.url, token: config.token });
        const healthApi = new HealthAPI(testInfluxDB);

        const health = await healthApi.getHealth();

        if (health.status === 'pass') {
            console.log(`${V.Check} Connexion à InfluxDB réussie. Statut: ${health.status}`);
            return { success: true, message: health.message || 'Connexion réussie.' };
        } else {
            throw new Error(`Le statut de santé d'InfluxDB est '${health.status}'. Message: ${health.message}`);
        }
    } catch (error) {
        console.error(`${V.error} Échec du test de connexion à InfluxDB:`, error.message);
        return { success: false, message: `Échec de la connexion: ${error.message}` };
    }
}

/**
 * Réinitialise le service InfluxDB avec une nouvelle configuration.
 * @deprecated Utilisez updateSettings à la place.
 * @param {object} newConfig - La nouvelle configuration à utiliser.
 */
function reinitializeInfluxDB(newConfig) {
    console.warn(`${V.warning} reinitializeInfluxDB est déprécié. Utilisez updateSettings.`);
    updateSettings(newConfig);
}


// /**
//  * Supprime les données de prévisions (tag source="forecast") d'une station antérieures à une date donnée.
//  * @param {string} stationId - L'ID de la station.
//  * @param {string} untilDateISO - Date limite (exclusive) pour la suppression (ISO string).
//  * @returns {Promise<object|null>} Retourne un objet avec le nombre de points supprimés et la plage de dates, ou null si rien n'a été supprimé.
//  */
// async function deleteForecasts(stationId) {
//     const instance = influxInstances['shortRetention'] || influxInstances['eternal'];
//     if (!instance) return { count: 0, error: 'InfluxDB instance not initialized' };

//     const { bucket, deleteApi, org } = instance;
//     const sixMonthsAgo = new Date();
//     sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
//     const start = sixMonthsAgo.toISOString();
//     const stop = new Date().toISOString();

//     const fluxPredicate = `r["station_id"]=="${stationId}" and r["source"]=="forecast"`;
//     const deletePredicate = `station_id="${stationId}" AND source="forecast"`;

//     try {
//         const countQuery = `
//             from(bucket: "${instance.bucket}")
//                 |> range(start: ${start}, stop: ${stop})
//                 |> filter(fn: (r) => ${fluxPredicate})
//                 |> group()
//                 |> count()
//         `;
//         const countResult = await executeQuery(countQuery, 'shortRetention');
//         const count = countResult.length > 0 ? countResult[0]._value : 0;

//         if (count === 0) {
//             console.log(`${V.info} Aucune prévision à supprimer pour ${stationId}.`);
//             return { count: 0, range: { start, stop } };
//         }

//         console.log(`${V.trash}  ${count} points de prévisions à supprimer pour ${stationId} entre ${start} et ${stop}.`);
//         console.log(`Prédicat de suppression: ${deletePredicate}`);
//         const deleteObject = {
//             org,
//             bucket: instance.bucket,
//             body: {
//                 start: new Date(start),
//                 stop: new Date(stop),
//                 predicate: deletePredicate
//             },
//         };
//         console.log(deleteObject);
//         // 2. Supprimer les données avec un format RFC3339 strict
//         await deleteApi.postDelete(deleteObject);

//         console.log(`${V.Check} Suppression des prévisions pour ${stationId} réussie.`);

//         // 3. Retourner le résultat
//         return {
//             count: count,
//             range: { start, stop },
//         };
//     } catch (error) {
//         // Si l'erreur indique "no series found", on l'ignore et on retourne null.
//         if (error.message && error.message.includes('no series found')) {
//             console.log(`${V.info} Aucune série de prévisions trouvée à supprimer pour ${stationId}.`);
//             return {
//                 count: 0,
//                 message: 'restart infludb : sudo /etc/init.d/influxdb restart',
//                 range: { start, stop },
//             };
//         }
//         // Pour les autres erreurs, on les logue mais on ne bloque pas l'exécution.
//         console.error(`${V.error} Erreur inattendue lors de la suppression des prévisions pour ${stationId}:`, error.message);
//         return {
//             count: false,
//             error: error.message,
//             range: { start, stop },
//         };
//     }
// }

/**
 * Écrit un ensemble de points de données dans InfluxDB.
 * @param {Array<Point>} points - Un tableau d'objets Point à écrire.
 * @returns {Promise<boolean>} Retourne `true` si l'écriture a réussi, sinon `false`.
 */
async function writePoints(points, bucketKey = 'eternal') {
    if (!points || points.length === 0) {
        return true;
    }
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) {
        console.error(`${V.error} Instance InfluxDB non trouvée pour le bucket '${bucketKey}'`);
        return false;
    }
    try {
        console.log(`${V.write} Écriture de ${points.length} points de données dans InfluxDB (${bucketKey})...`);
        instance.writeApi.writePoints(points);
        await instance.writeApi.flush();
        console.log(`${V.Check} Écriture de ${points.length} points de données dans InfluxDB (${bucketKey}) réussie.`);
        return points.length;
    } catch (error) {
        console.error(`${V.error} Erreur lors de l'écriture dans InfluxDB (${bucketKey}):`, error);
        return false;
    }
}

/**
 * Exécute une requête Flux sur InfluxDB.
 * @param {string} fluxQuery - La requête Flux à exécuter.
 * @returns {Promise<Array>} Un tableau des résultats de la requête.
 */
async function executeQuery(fluxQuery, bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) {
        throw new Error(`Instance InfluxDB non initialisée pour le bucket '${bucketKey}'`);
    }
    console.log(`${V.info} Exécution de la requête Flux (${bucketKey}):\n${fluxQuery}`);
    return new Promise((resolve, reject) => {
        const results = [];
        instance.queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                results.push(tableMeta.toObject(row));
            },
            error(error) {
                console.error(`${V.error} Erreur lors de l'exécution de la requête Flux:`, error);
                if (error.body && error.body.message) {
                    error.body.message = 'Influxdb ' + error.body.message;
                }
                reject(error);
            },
            complete() {
                resolve(results);
            },
        });
    });
}

async function getInfluxMetadata(stationId = null, knownTags = ['sensor', 'station_id', 'source'], daysBack = 100, bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return null;

    try {
        const keepColumns = ['_measurement', '_field', ...knownTags].map(c => `"${c}"`).join(', ');

        const query = `
            from(bucket: "${instance.bucket}")
                |> range(start: -${daysBack}d)
                ${stationId ? `|> filter(fn: (r) => r.station_id == "${stationId}")` : ''}
                |> keep(columns: [${keepColumns}])
                |> distinct()
                |> group()
            `;

        const allRows = await executeQuery(query, bucketKey);

        // Construction de la structure
        const bucketStructure = {};

        allRows.forEach(row => {
            const measurement = row._measurement;
            const field = row._field;

            if (!bucketStructure[measurement]) {
                bucketStructure[measurement] = {
                    tags: {},
                    fields: new Set()
                };
                knownTags.forEach(tag => {
                    bucketStructure[measurement].tags[tag] = new Set();
                });
            }

            bucketStructure[measurement].fields.add(field);

            knownTags.forEach(tag => {
                if (row[tag] !== null && row[tag] !== undefined) {
                    bucketStructure[measurement].tags[tag].add(row[tag]);
                }
            });
        });

        // Convertir Sets en Arrays
        Object.keys(bucketStructure).forEach(measurement => {
            bucketStructure[measurement].fields = Array.from(bucketStructure[measurement].fields).sort();
            Object.keys(bucketStructure[measurement].tags).forEach(tag => {
                const values = Array.from(bucketStructure[measurement].tags[tag]).sort();
                if (values.length > 0) {
                    bucketStructure[measurement].tags[tag] = values;
                } else {
                    delete bucketStructure[measurement].tags[tag];
                }
            });
        });

        return bucketStructure;

    } catch (error) {
        console.error('Erreur:', error);
        return null;
    }
}


function getFilter(sensorRef) {
    let Filter;
    const [measurement, sensor] = sensorRef.split(':');
    if (sensorRef.includes(':*')) {
        Filter = `r._measurement == "${measurement}"`;
    } else if (sensorRef.includes(':')) {
        Filter = `r._measurement == "${measurement}" and r.sensor == "${sensor}"`;
    } else {
        Filter = `r.sensor == "${sensorRef}"`;
    }
    return Filter;
}

/**
 * Helper to create a multi-bucket flux part.
 * @param {string} stationId 
 * @param {string} startDate 
 * @param {string} endDate 
 * @param {string} filter - A flux filter string like 'r._measurement == "..."'
 * @param {boolean} archivesOnly - If true, skip the shortRetention bucket
 */
function getMultiBucketFrom(stationId, startDate, endDate, filter = null, archivesOnly = false) {
    const buckets = ['eternal', 'longRetention', 'shortRetention'].filter(k => {
        if (archivesOnly && k === 'shortRetention') return false;
        return influxInstances[k];
    });

    if (buckets.length === 0) return 'from(bucket: "fake")';

    const start = (startDate !== undefined && startDate !== null) ? startDate : 0;
    const stop = (endDate !== undefined && endDate !== null) ? endDate : 'now()';

    const range = `|> range(start: ${start}, stop: ${stop})`;
    const stationFilter = `|> filter(fn: (r) => r.station_id == "${stationId}")`;
    const customFilter = filter ? `|> filter(fn: (r) => ${filter})` : '';

    if (buckets.length === 1) {
        return `from(bucket: "${influxInstances[buckets[0]].bucket}") ${range} ${stationFilter} ${customFilter}`;
    }

    return `union(tables: [
        ${buckets.map(k => `from(bucket: "${influxInstances[k].bucket}") ${range} ${stationFilter} ${customFilter}`).join(',\n        ')}
    ]) |> group(columns: ["_measurement", "_field", "sensor", "station_id"])`;
}
/**
 * Récupère la plage de dates pour une station et un capteur spécifiques.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} sensorRef - Référence du capteur.
 * @param {string} startDate - Date de début (optionnelle).
 * @param {string} endDate - Date de fin (optionnelle).
 * @returns {Promise<Object>} Un objet contenant la plage de dates.
 */
async function queryDateRange(stationId, sensorRef, startDate, endDate, archivesOnly = false, bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return { firstUtc: null, lastUtc: null };

    let filter = '';
    if (sensorRef) {
        if (sensorRef.endsWith('_calc') || sensorRef.endsWith('_trend')) {
            sensorRef = 'pressure:barometer';
        }
        filter = getFilter(sensorRef);
    }

    const now = new Date();
    const endStopDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    const startRange = startDate ? startDate : -946771200;
    const stopRange = endDate ? endDate : endStopDate.toISOString();

    const fromPart = getMultiBucketFrom(stationId, startRange, stopRange, filter, archivesOnly);

    const query = `
      import "array"
        data = ${fromPart}
            |> group()

        first_rec = data |> min(column: "_time") |> findRecord(fn: (key) => true, idx: 0)
        last_rec = data |> max(column: "_time") |> findRecord(fn: (key) => true, idx: 0)

        if exists first_rec._time then
            array.from(rows: [{
                first: first_rec._time,
                last: last_rec._time
            }])
        else
            array.from(rows: [{
                first: time(v: 0),
                last: time(v: 0)
            }])
        `;
    const result = await executeQuery(query, bucketKey);
    if (!result || result.length === 0 || !result[0].first || result[0].first.toString().startsWith('1970')) {
        return { firstUtc: null, lastUtc: null };
    }
    const data = result[0];

    return {
        firstUtc: data.first || (new Date().toISOString()),
        lastUtc: data.last || (new Date(0).toISOString())
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
async function queryRaw(stationId, sensorRef, startDate, endDate, intervalSeconds = 3600, bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return [];

    console.log(`Demande de données brutes pour ${stationId} - ${sensorRef}`, startDate, endDate, intervalSeconds);
    const fluxQuery = `
        ${getMultiBucketFrom(stationId, startDate, endDate, getFilter(sensorRef))}
          |> aggregateWindow(every: ${intervalSeconds}s, fn: ${sensorRef.startsWith('rain:') ? 'sum' : 'mean'}, createEmpty: false)
          |> keep(columns: ["_time", "_field", "_value"])
          |> sort(columns: ["_time"])
    `;
    return await executeQuery(fluxQuery, bucketKey);
}

/**
 * Récupère les dernières données pour une station et tous ses capteurs.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Object>} Un objet contenant les dernières données.
 */
async function queryLast(stationId, startDate = '-7d', endDate = 'now()', bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return {};

    const fluxQuery = `
    ${getMultiBucketFrom(stationId, startDate, endDate, null, true)}
        |> drop(columns: ["_start", "_stop", "source"])
        |> last()
            `;
    const result = await executeQuery(fluxQuery, bucketKey)

    // parser return { "direction:Gust": { v: 247.5, d: '2025-10-08T17:55:00Z' } } // { "_measurement:sensor": { v: _value, d: _time } }
    const datas = {};
    result.forEach(data => {
        const sensor = data._measurement + ':' + data.sensor;
        // const value = data._value;
        // const time = data._time;
        if (!datas[sensor]) {
            datas[sensor] = { d: data._time };
            //     console.log(sensor, 'new', data._time);
            // } else {
            //     console.log('    ', sensor, 'datas[sensor].d', datas[sensor].d, 'new', data._time);
        }

        datas[sensor][data._field] = Math.round(data._value * 1000) / 1000;
    });
    return datas;
}

/**
 * Récupère les données brutes pour une station et plusieurs capteurs spécifiques.
 * @param {string} stationId - Identifiant de la station.
 * @param {Array<string>} sensorRefs - Références des capteurs (format: "_measurement:sensor").
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @param {number} intervalSeconds - Intervalle en secondes.
 */
async function queryRaws(stationId, sensorRefs, startDate, endDate, intervalSeconds = 3600, bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return [];

    // Séparer les capteurs en fonction de leur type (cumulatif ou moyenne) cumulatif si sensorRef.startsWith('rain:'), moyenne sinon
    const cumulativeSensors = sensorRefs.filter(ref => ref.startsWith('rain:'));
    const meanSensors = sensorRefs.filter(ref => !ref.startsWith('rain:'));

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
    sumData = ${getMultiBucketFrom(stationId, startDate, endDate, sumFilter)}
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
    meanData = ${getMultiBucketFrom(stationId, startDate, endDate, meanFilter)}
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
        |> group()
        |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")
        |> sort(columns: ["_time"])
        |> yield()
            `;
    } else if (sumFilter) {
        fluxQuery += `

    sumData
        |> group()
        |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")
        |> sort(columns: ["_time"])
        |> yield()
            `;
    } else if (meanFilter) {
        fluxQuery += `

    meanData
        |> group()
        |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")
        |> sort(columns: ["_time"])
        |> yield()
            `;
    }

    return await executeQuery(fluxQuery, bucketKey);
}

async function queryWindRose(stationId, startDate, endDate, intervalSeconds = 3600, prefix = '', bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return {};

    const fluxQuery = `
    // 1. Récupérer les données de direction
    directionData = ${getMultiBucketFrom(stationId, startDate, endDate, `r._measurement == "direction" and (r.sensor == "${prefix}Wind" or r.sensor == "${prefix}Gust")`)}
        |> keep(columns: ["_time", "_value", "sensor"])
        |> rename(columns: { _value: "direction" })


    // 2. Récupérer les données de vitesse
    speedData = ${getMultiBucketFrom(stationId, startDate, endDate, `r._measurement == "speed" and (r.sensor == "${prefix}Wind" or r.sensor == "${prefix}Gust")`)}
        |> keep(columns: ["_time", "_value", "sensor"])
        |> rename(columns: { _value: "speed" })

    // 3. Joindre les données de direction et de vitesse par _time pour les cas directionnels (vitesse > 0)
    directionalJoin = join(
        tables: { direction: directionData, speed: speedData },
        on: ["_time", "sensor"]
    )
        |> filter(fn: (r) => r.speed > 0)

    // 4. Créer les données pour calm (vitesse == 0, direction = 360 pour mapping à "Calm")
    calmData = speedData
        |> filter(fn: (r) => r.speed == 0)
        |> map(fn: (r) => ({ r with direction: 360.0}))

    // 5. Union des données directionnelles et calm
    grpPetal = union(tables: [directionalJoin, calmData])
        |> group(columns: ["direction", "sensor"])

    // 6. Agréger par intervalle et par petal
    count = grpPetal
        |> aggregateWindow(every: ${intervalSeconds}s, fn: count, column: "speed", createEmpty: false)
        |> rename(columns: { speed: "count" })

    gust = grpPetal
        |> filter(fn: (r) => r.sensor == "${prefix}Gust")
        |> aggregateWindow(every: ${intervalSeconds}s, fn: max, column: "speed", createEmpty: false)
        |> drop(columns: ["_start", "_stop"])
    gCount = count
        |> filter(fn: (r) => r.sensor == "${prefix}Gust")
        |> drop(columns: ["_start", "_stop"])
    avg = grpPetal
        |> filter(fn: (r) => r.sensor == "${prefix}Wind")
        |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, column: "speed", createEmpty: false)
        |> drop(columns: ["_start", "_stop"])
    aCount = count
        |> filter(fn: (r) => r.sensor == "${prefix}Wind")
        |> drop(columns: ["_start", "_stop"])

    gustC = join(
        tables: { gCount: gCount, gust: gust },
        on: ["direction", "_time"]
    )

    avgC = join(
        tables: { aCount: aCount, avg: avg },
        on: ["direction", "_time"]
    )

    join(
        tables: { avg: avgC, gust: gustC },
        on: ["direction", "_time"]
    )
        |> drop(columns: ["_start", "_stop", "sensor_aCount", "sensor_gCount"])
        |> yield()
            `;
    const results = await executeQuery(fluxQuery, bucketKey);
    return parserWindRose(results);
}

/**
 * Convertit les données brutes en données par intervalle.
 * @param {Array} data - Les données brutes.
 * @returns {Object} Les données converties par intervalle.
 */
function parserWindRose(data) {
    const petal = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "Calm"];
    return data.reduce((accumulator, currentItem) => {
        const { _time, direction, count_gust, speed_gust, count_avg, speed_avg } = currentItem;
        const petalIndex = Math.floor(direction / 22.5);
        if (!accumulator[_time]) {
            accumulator[_time] = {};
        }

        accumulator[_time][petal[petalIndex]] = {
            gust: {
                v: Math.round(speed_gust * 100) / 100,
                c: count_gust
            },
            wind: {
                v: Math.round(speed_avg * 100) / 100,
                c: count_avg
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

async function queryWindVectors(stationId, sensor, startDate, endDate, intervalSeconds = 3600, bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return [];

    const fluxQuery = `
    import "math"
    ${getMultiBucketFrom(stationId, startDate, endDate, `r._measurement == "vector" and r.sensor == "${sensor}"`)}
        |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, createEmpty: false)
        |> group()
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
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
        const results = await executeQuery(fluxQuery, bucketKey);
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
async function queryCandle(stationId, sensorRef, startDate, endDate, intervalSeconds = 3600, bucketKey = 'eternal') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return [];

    console.log(`Demande de données candle pour ${stationId} - ${sensorRef} `, startDate, endDate, intervalSeconds);
    const fluxQuery = `
import "math"
${getMultiBucketFrom(stationId, startDate, endDate, `r.sensor == "${sensorRef}"`)}
    // |> group(columns: ["unit"])
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
    |> keep(columns: ["datetime", "first", "min", "avg", "max", "last", "count"])
        `;

    return await executeQuery(fluxQuery, bucketKey);
}

// /**
//  * Trouve le dernier timestamp pour les données Open-Meteo d'une station.
//  * @param {string} stationId - Identifiant de la station.
//  * @returns {Promise<string|null>} Le dernier timestamp au format ISO ou null si aucune donnée n'est trouvée.
//  */
// async function findLastOpenMeteoTimestamp(stationId) {
//     const fluxQuery = `
//         import "strings"
//         from(bucket: "${bucket}")
//             |> range(start: 0)
//             |> filter(fn: (r) => r.station_id == "${stationId}")
//             |> filter(fn: (r) => strings.containsStr(v: r.sensor, substr: "open-meteo"))
//             |> group()
//             |> last()
//             |> keep(columns: ["_time"])
//     `;
//     try {
//         const result = await executeQuery(fluxQuery);
//         if (result && result.length > 0 && result[0]._time) {
//             return result[0]._time;
//         }
//         return null;
//     } catch (error) {
//         console.error(`${V.error} Erreur lors de la recherche du dernier timestamp Open-Meteo pour ${stationId}:`, error);
//         // En cas d'erreur, on suppose qu'il n'y a pas de données pour forcer un import complet
//         return null;
//     }
// }


/**
 * Supprime les données des extendeurs (tag source="localExtenderCollection") d'une station.
 * @param {string} stationId - L'ID de la station.
 * @param {string} extenderId - (Optionnel) L'ID de l'extender pour supprimer uniquement ses données.
 * @returns {Promise<object>}
 */
async function deleteExtenderData(stationId, extenderId = null, bucketKey = 'longRetention') {
    const instance = influxInstances[bucketKey] || influxInstances['eternal'];
    if (!instance) return { success: false, error: 'InfluxDB instance not found' };

    if (!extenderId) return { success: true, count: 0, details: {} };

    const ids = Array.isArray(extenderId) ? extenderId : [extenderId];
    if (ids.length === 0) return { success: true, count: 0, details: {} };

    const start = new Date(0).toISOString();
    const stop = new Date().toISOString();

    let totalCount = 0;
    const details = {};

    try {
        for (const id of ids) {
            // 1. Compter les points pour cet ID spécifique
            let countForId = 0;
            try {
                const fluxPredicate = `r["station_id"]=="${stationId}" and r["source"]=="${id}"`;
                const countQuery = `
                    from(bucket: "${instance.bucket}")
                        |> range(start: ${start}, stop: ${stop})
                        |> filter(fn: (r) => ${fluxPredicate})
                        |> group()
                        |> count()
                `;
                const countResult = await executeQuery(countQuery, bucketKey);
                countForId = countResult.length > 0 ? countResult[0]._value : 0;
            } catch (e) {
                console.warn(`${V.error} Erreur comptage pour ${id}:`, e.message);
            }

            // 2. Supprimer pour cet ID spécifique
            const deletePredicate = `station_id="${stationId}" AND source="${id}"`;
            const deleteObject = {
                org: instance.org,
                bucket: instance.bucket,
                body: {
                    start: new Date(start),
                    stop: new Date(stop),
                    predicate: deletePredicate
                },
            };
            await instance.deleteApi.postDelete(deleteObject);

            console.log(`${V.trash} [${id}] Suppression de ${countForId} points.`);
            totalCount += countForId;
            details[id] = countForId;
        }

        console.log(`${V.trash} Suppression globale terminée pour ${stationId}: ${totalCount} points.`);
        return { success: true, count: totalCount, details };
    } catch (error) {
        console.error(`${V.error} Erreur suppression données extendeurs:`, error.message);
        return { success: false, error: error.message };
    }
}
/**
 * Supprime les données avec source="localDataCollection" pour une station donnée.
 * @param {string} stationId - L'ID de la station.
 * @param {string} startDate - Date de début (ISO string, ex: '2026-02-01T07:00:00Z').
 * @param {string} endDate - Date de fin (ISO string, optionnel, défaut: now()).
 * @returns {Promise<object>} Résultat de la suppression avec le nombre de points supprimés.
 */
// async function deleteLocalDataCollection() {
//     const stationId = 'VP2_Serramoune';
//     const start = '2026-02-01T00:00:00Z';
//     const stop = '2026-02-10T06:20:00Z' || new Date().toISOString();
//     // Le prédicat Flux pour le comptage (avec syntaxe Flux)
//     const fluxPredicate = `r["station_id"]=="${stationId}" and r["source"]=="localDataCollection"`;
//     // Le prédicat pour l'API de suppression (syntaxe InfluxDB line protocol)
//     const deletePredicate = `station_id="${stationId}" AND source="localDataCollection"`;

//     try {
//         // 1. Compter les points à supprimer
//         const countQuery = `
//             from(bucket: "${bucket}")
//                 |> range(start: ${start}, stop: ${stop})
//                 |> filter(fn: (r) => ${fluxPredicate})
//                 |> group()
//                 |> count()
//         `;
//         console.log(countQuery);
//         console.log('================================================================================');

//         const countResult = await executeQuery(countQuery);
//         const count = countResult.length > 0 ? countResult[0]._value : 0;

//         if (count === 0) {
//             console.log(`${V.info} Aucune donnée localDataCollection à supprimer pour ${stationId}.`);
//             return { success: true, count: 0, range: { start, stop } };
//         }

//         console.log(`${V.trash} ${count} points localDataCollection à supprimer pour ${stationId} entre ${start} et ${stop}.`);
//         console.log(`Prédicat de suppression: ${deletePredicate}`);

//         // 2. Supprimer les données
//         const deleteObject = {
//             org,
//             bucket,
//             body: {
//                 start: new Date(start),
//                 stop: new Date(stop),
//                 predicate: deletePredicate
//             },
//         };

//         await deleteApi.postDelete(deleteObject);

//         console.log(`${V.Check} Suppression des données localDataCollection pour ${stationId} réussie.`);

//         // 3. Retourner le résultat
//         return {
//             success: true,
//             count: count,
//             range: { start, stop },
//         };

//     } catch (error) {
//         // Si l'erreur indique "no series found", on l'ignore
//         if (error.message && error.message.includes('no series found')) {
//             console.log(`${V.info} Aucune série localDataCollection trouvée à supprimer pour ${stationId}.`);
//             return {
//                 success: true,
//                 count: 0,
//                 range: { start, stop },
//             };
//         }

//         console.error(`${V.error} Erreur lors de la suppression des données localDataCollection pour ${stationId}:`, error.message);
//         return {
//             success: false,
//             count: 0,
//             error: error.message,
//             range: { start, stop },
//         };
//     }
// }

module.exports = {
    // deleteLocalDataCollection,
    getSettings,
    updateSettings,
    testInfluxConnection,
    reinitializeInfluxDB,
    writePoints,
    Point,
    getInfluxMetadata,
    queryDateRange,
    queryRaw,
    queryRaws,
    queryWindRose,
    queryWindVectors,
    queryCandle,
    queryLast,
    // deleteForecasts,
    deleteExtenderData
};