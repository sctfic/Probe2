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
    //         bucket: "Probe",
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
          |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'})
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
        count: data.count-1,
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
          |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'}) 
          |> filter(fn: (r) => r.station_id == "${stationId}" and r._field == "${sensorRef}")
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
 * @param {Array<string>} sensorRefs - Références des capteurs.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @param {number} intervalSeconds - Intervalle en secondes.
 * @returns {Promise<Array>} Un tableau des données brutes.
 */
async function queryRaws(stationId, sensorRefs, startDate, endDate, intervalSeconds = 3600) {
    // Définir les champs qui doivent être sommés (mesures de pluie/évapotranspiration)
    const rainFields = ['rainFall', 'ET'];
    
    // Séparer les champs en deux groupes
    const cumulativeSensors = sensorRefs.filter(ref => rainFields.includes(ref));
    const meanSensors = sensorRefs.filter(ref => !rainFields.includes(ref));
    
    // Construire les filtres
    const sumFilter = cumulativeSensors.length > 0 
        ? cumulativeSensors.map(ref => `r._field == "${ref}"`).join(' or ')
        : null;
    const meanFilter = meanSensors.length > 0
        ? meanSensors.map(ref => `r._field == "${ref}"`).join(' or ')
        : null;
    
    // Construire la requête Flux
    let fluxQuery = '';
    
    // Requête pour les champs à sommer (rain)
    if (sumFilter) {
        fluxQuery += `
        rainData = from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : 0}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}" and (${sumFilter}))
            |> group(columns: ["_field"])
            |> aggregateWindow(every: ${intervalSeconds}s, fn: sum, createEmpty: false)
            |> drop(columns: ["unit", "_start", "_stop", "station_id", "_measurement"])
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
            |> group(columns: ["_field"])
            |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, createEmpty: false)
            |> drop(columns: ["unit", "_start", "_stop", "station_id", "_measurement"])
        `;
    }
    
    // Combiner les résultats si nécessaire
    if (sumFilter && meanFilter) {
        fluxQuery += `
        
        union(tables: [rainData, meanData])
            |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> sort(columns: ["_time"])
            |> yield()
        `;
    } else if (rainFilter) {
        fluxQuery += `
        
        rainData
            |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> sort(columns: ["_time"])
            |> yield()
        `;
    } else if (meanFilter) {
        fluxQuery += `
        
        meanData
            |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> sort(columns: ["_time"])
            |> yield()
        `;
    }
    
    return await executeQuery(fluxQuery);
}

/**
 * Récupère les données pour le graphique du vent pour une station spécifique.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Array>} Un tableau des données pour le graphique du vent.
 */
async function queryWindRose(stationId, startDate, endDate, intervalSeconds = 3600) {
    const fluxQuery = `
        speedAvg = from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : '0'}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}" and r._measurement == "wind" and r._field == "speed")
            |> filter(fn: (r) => r.direction != "N/A")
            |> group(columns: ["direction", "unit"])
            |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, createEmpty: false)
            |> set(key: "_field", value: "avg")

        gustMax = from(bucket: "${bucket}")
            |> range(start: ${startDate ? startDate : '0'}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}" and r._measurement == "wind" and r._field == "gust")
            |> filter(fn: (r) => r.direction != "N/A")
            |> group(columns: ["direction", "unit"])
            |> aggregateWindow(every: ${intervalSeconds}s, fn: max, createEmpty: false)
            |> set(key: "_field", value: "gust")

        union(tables: [speedAvg, gustMax])
            |> pivot(rowKey: ["_time", "direction", "unit"], columnKey: ["_field"], valueColumn: "_value")
            |> group()
            |> sort(columns: ["_time", "direction"])
            |> yield()
    `;
    
    const results = await executeQuery(fluxQuery);
    return formatWindData(results, intervalSeconds);
}

function formatWindData(results, intervalSeconds) {
    const Data = {};
    const allDirections = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    // Grouper par timestamp
    results.forEach(row => {
        const timeKey = row._time;
        const direction = row.direction;
        
        if (!Data[timeKey]) {
            Data[timeKey] = {
                d: timeKey,
                period: intervalSeconds,
                unit: row.unit || "",
                petals: {}
            };
            
            // Initialiser toutes les directions avec des valeurs par défaut
            allDirections.forEach(dir => {
                Data[timeKey].petals[dir] = {
                    avg: 0,
                    gust: 0
                };
            });
        }
        
        // Mettre à jour les valeurs pour la direction courante
        if (allDirections.includes(direction)) {
            if (row.avg !== null && row.avg !== undefined) {
                Data[timeKey].petals[direction].avg = Math.round(row.avg * 10) / 10;
            }
            if (row.gust !== null && row.gust !== undefined) {
                Data[timeKey].petals[direction].gust = Math.round(row.gust * 10) / 100;
            }
        }
    });
    
    // Convertir l'objet en array et trier par timestamp
    return Object.values(Data).sort((a, b) => new Date(a.d) - new Date(b.d));
}

/**
 * Récupère les données pour le graphique du vent pour une station spécifique.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} startDate - Date de début.
 * @param {string} endDate - Date de fin.
 * @returns {Promise<Array>} Un tableau des données pour le graphique du vent.
 */
async function queryWindVectors(stationId, startDate, endDate, intervalSeconds = 3600) {
    // Requête simple pour récupérer les données avec les tags de direction
    const fluxQuery = `
    import "math"
    from(bucket: "${bucket}")
    |> range(start: ${startDate ? startDate : '0'}, stop: ${endDate ? endDate : 'now()'})
            |> filter(fn: (r) => r.station_id == "${stationId}")
            |> filter(fn: (r) => r["_measurement"] == "wind")
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value") 
            // => colonnes speed + direction
            |> map(fn: (r) => ({
                            r with
                X: float(v: r.speed) * math.cos(x: math.pi * float(v: r.direction) / 180.0),
                Y: float(v: r.speed) * math.sin(x: math.pi * float(v: r.direction) / 180.0)
            }))
            |> group(columns: ["weather", "sensor"])  // <-- séparation par station ET capteur
            |> aggregateWindow(every: 10m, fn: mean, createEmpty: false) 
            |> map(fn: (r) => ({
                r with
                Vmean: math.sqrt(x: r.X*r.X + r.Y*r.Y),
                Dmean: if math.atan2(y: r.Y, x: r.X) < 0.0 
                        then 180.0/math.pi * math.atan2(y: r.Y, x: r.X) + 360.0 
                        else 180.0/math.pi * math.atan2(y: r.Y, x: r.X)
            }))
            |> keep(columns: ["_time", "weather", "sensor", "Vmean", "Dmean", "X", "Y"])
`
    try {
        const results = await executeQuery(fluxQuery);
        return processWindVectorsWithTags(results, intervalSeconds);
    } catch (error) {
        console.error('Erreur lors de la requête des vecteurs de vent:', error);
        throw error;
    }
}

const dir = {
    "N": { "angle": 0, "sinus": 0, "cosinus": 1 },
    "NNE": { "angle": 22.5, "sinus": 0.3826834323650898, "cosinus": 0.9238795325112867 },
    "NE": { "angle": 45, "sinus": 0.7071067811865475, "cosinus": 0.7071067811865476 },
    "ENE": { "angle": 67.5, "sinus": 0.9238795325112867, "cosinus": 0.38268343236508984 },
    "E": { "angle": 90, "sinus": 1, "cosinus": 0 },
    "ESE": { "angle": 112.5, "sinus": 0.9238795325112867, "cosinus": -0.3826834323650897 },
    "SE": { "angle": 135, "sinus": 0.7071067811865476, "cosinus": -0.7071067811865475 },
    "SSE": { "angle": 157.5, "sinus": 0.3826834323650899, "cosinus": -0.9238795325112867 },
    "S": { "angle": 180, "sinus": 0, "cosinus": -1 },
    "SSW": { "angle": 202.5, "sinus": -0.3826834323650892, "cosinus": -0.923879532511287 },
    "SW": { "angle": 225, "sinus": -0.7071067811865475, "cosinus": -0.7071067811865477 },
    "WSW": { "angle": 247.5, "sinus": -0.9238795325112868, "cosinus": -0.3826834323650895 },
    "W": { "angle": 270, "sinus": -1, "cosinus": 0 },
    "WNW": { "angle": 292.5, "sinus": -0.9238795325112866, "cosinus": 0.38268343236509 },
    "NW": { "angle": 315, "sinus": -0.7071067811865477, "cosinus": 0.7071067811865474 },
    "NNW": { "angle": 337.5, "sinus": -0.38268343236508956, "cosinus": 0.9238795325112868 }
};
function processWindVectorsWithTags(data, intervalSeconds) {
    if (!data || data.length === 0) {
        return [];
    }
    
    // Grouper les données par intervalle de temps
    const intervalMs = intervalSeconds * 1000;
    const intervals = {};
    let unit = 'm/s';
    
    data.forEach(row => {
        // Skip si pas de direction ou si direction invalide
        if (!row.direction || !dir[row.direction]) {
            return;
        }
        
        // Calculer l'intervalle de temps
        const timestamp = new Date(row._time);
        const intervalStart = new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs);
        const key = intervalStart.toISOString();
        
        if (!intervals[key]) {
            intervals[key] = {
                timestamp: intervalStart,
                windVectors: [],
                gustData: []
            };
        }
        
        const directionData = dir[row.direction];
        
        if (row._field === 'speed' && row._value > 0) {
            // Ajouter le vecteur de vitesse
            intervals[key].windVectors.push({
                u: row._value * directionData.cosinus,
                v: row._value * directionData.sinus,
                speed: row._value,
                direction: directionData.angle
            });
        } else if (row._field === 'gust' && row._value > 0) {
            // Ajouter les données de rafale
            intervals[key].gustData.push({
                speed: row._value,
                direction: directionData.angle
            });
        }
    });
    
    // Calculer les moyennes vectorielles et les rafales max pour chaque intervalle
    const results = Object.values(intervals).map(interval => {
        const result = {
            time: interval.timestamp,
        };
        
        // Calcul de la moyenne vectorielle pour le vent
        if (interval.windVectors.length > 0) {
            // Somme des composantes U et V
            const sumU = interval.windVectors.reduce((sum, vec) => sum + vec.u, 0);
            const sumV = interval.windVectors.reduce((sum, vec) => sum + vec.v, 0);
            
            // Moyennes des composantes
            const avgU = sumU / interval.windVectors.length;
            const avgV = sumV / interval.windVectors.length;
            
            // Conversion en vitesse et direction
            const avgSpeed = Math.sqrt(avgU * avgU + avgV * avgV);
            let avgDirection = Math.atan2(avgV, avgU) * 180 / Math.PI;
            
            // Normaliser la direction entre 0 et 360
            if (avgDirection < 0) {
                avgDirection += 360;
            }
            
            result.avgVector = {
                speed: Math.round(avgSpeed * 1000) / 1000,
                direction: Math.round(avgDirection * 1000) / 1000
            };
        }
        
        // Trouver la rafale maximale avec sa direction
        if (interval.gustData.length > 0) {
            const maxGust = interval.gustData.reduce((max, current) => 
                current.speed > max.speed ? current : max
            );
            
            result.gustVector = {
                speed: Math.round(maxGust.speed * 1000) / 1000,
                direction: Math.round(maxGust.direction * 1000) / 1000
            };
        }
        
        return result;
    }).filter(r => r.avgVector || r.gustVector); // Filtrer les intervalles sans données
    
    // Trier par timestamp
    return results.sort((a, b) => a.time - b.time);
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
            |> filter(fn: (r) => r.station_id == "${stationId}" and r._field == "${sensorRef}")
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
    getMetadata,
    queryDateRange,
    queryRaw,
    queryRaws,
    queryWindRose,
    queryWindVectors,
    queryCandle,
    clearBucket
};
