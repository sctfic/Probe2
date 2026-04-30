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
 * @param {string} key - La clé du bucket (ex: 'Stations', 'Archives', 'Forecasts', 'Extenders', 'Virtuals').
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
            bucket: config.bucket,
            firstDate: null // Sera mis à jour asynchrone
        };
        console.log(`${V.database} Service InfluxDB initialisé pour le bucket '${key}' (${config.bucket}).`);

        // Lancer la récupération de la première date en asynchrone
        fetchFirstDate(key).then(date => {
            if (date && influxInstances[key]) {
                influxInstances[key].firstDate = date;
                // console.log(`${V.info} Première date pour le bucket '${key}' : ${date}`);
            } else {
                console.log(`${V.warning} Aucune donnée trouvée pour le bucket '${key}'.`);
            }
        }).catch(err => console.error(`${V.error} Erreur fetchFirstDate pour ${key}:`, err));

    } catch (error) {
        console.error(`${V.error} Erreur lors de l'initialisation du bucket InfluxDB '${key}':`, error);
    }
}

/**
 * Récupère la toute première date d'un bucket.
 * @param {string} bucketKey 
 */
async function fetchFirstDate(bucketKey) {
    const instance = influxInstances[bucketKey];
    if (!instance) return null;

    const fluxQuery = `
        from(bucket: "${instance.bucket}")
            |> range(start: 0)
            |> group()
            |> sort(columns: ["_time"])
            |> limit(n: 1)
            |> keep(columns: ["_time"])
            |> rename(columns: {"_time": "first_time"})
    `;

    try {
        const results = await executeQuery(fluxQuery, bucketKey);
        if (results && results.length > 0 && results[0].first_time) {
            return results[0].first_time;
        }
    } catch (error) {
        // Ignorer l'erreur si le bucket est vide (no results)
    }
    return null;
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

    const { url, org, token } = influxConfigs;

    // Réinitialiser les instances
    influxInstances = {};

    // Initialiser chaque bucket défini dans la config (les clés commençant par une majuscule sont des buckets)
    Object.keys(influxConfigs).forEach(key => {
        if (key === 'url' || key === 'org' || key === 'token') return;

        const bucketConfig = influxConfigs[key] || {};
        const config = {
            url: bucketConfig.url || url,
            org: bucketConfig.org || org,
            token: bucketConfig.token || token,
            bucket: bucketConfig.bucket,
            comment: bucketConfig.comment
        };
        initializeBucket(key, config);
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
 * Écrit un ensemble de points de données dans InfluxDB.
 * @param {Array<Point>} points - Un tableau d'objets Point à écrire.
 * @returns {Promise<boolean>} Retourne `true` si l'écriture a réussi, sinon `false`.
 */
async function writePoints(points, bucketKey = 'Stations') {
    if (!points || points.length === 0) {
        return 0;
    }
    const instance = influxInstances[bucketKey];
    if (!instance) {
        console.error(`${V.error} Instance InfluxDB non trouvée pour le bucket '${bucketKey}'`);
        return false;
    }
    try {
        instance.writeApi.writePoints(points);
        await instance.writeApi.flush();
        //        console.log(V.database, `Confirmation d'écriture de ${points.length} points dans [${bucketKey}].`, V.Check);
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
async function executeQuery(fluxQuery, bucketKey = 'Stations') {
    const start = Date.now();
    const instance = influxInstances[bucketKey];
    if (!instance) {
        throw new Error(`Instance InfluxDB non initialisée pour le bucket '${bucketKey}'`);
    }

    // Extraction simple et robuste
    const stackLines = new Error().stack.split('\n');
    let stackLine = stackLines[2] || '';

    // Remonter la pile pour ignorer les wrappers internes et les callbacks anonymes
    for (let i = 2; i < stackLines.length; i++) {
        const line = stackLines[i];
        // On cherche une ligne contenant un nom de fonction explicite (ex: "at queryRaw (...") 
        // et qui n'est pas un de nos helpers internes d'exécution.
        if (!line.includes('executeQuery') &&
            !line.includes('fetchDataAcrossBuckets') &&
            !line.includes('Array.map') &&
            !line.includes('Promise.all') &&
            line.match(/at\s+(async\s+)?([a-zA-Z0-9_\.]+)\s+\(/)) {
            stackLine = line;
            break;
        }
    }

    // Enlève "at " et "async " au début et Object.
    let clean = stackLine.replace(/^\s*at\s+/, '').replace(/^async\s+/, '').replace('Object.', '');

    // Extrait le nom de fonction (s'il existe avant une parenthèse)
    let funcName = '';
    if (clean.includes('(')) {
        funcName = clean.split('(')[0].trim();
        clean = clean.slice(clean.indexOf('('));
    }

    // Extrait fichier:ligne depuis le chemin complet
    const pathMatch = clean.match(/([^\/\\]+?):(\d+):(\d+)\)?$/);
    const fileName = pathMatch?.[1] || 'inconnu';
    const lineNum = pathMatch?.[2] || '?';

    const caller = funcName
        ? `${funcName} @ ${fileName}:${lineNum}`
        : `${fileName}:${lineNum}`;

    return new Promise((resolve, reject) => {
        const results = [];
        instance.queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                results.push(tableMeta.toObject(row));
            },
            error(error) {
                console.error(`${V.error} Erreur lors de l'exécution de la requête Flux:`, fluxQuery);
                if (error.body && error.body.message) {
                    error.body.message = 'Influxdb ' + error.body.message;
                }
                reject(error);
            },
            complete() {
                const duration = Date.now() - start;
                console.log(V.Check, `Requête Flux [${(bucketKey + ']').padEnd(12)} ${caller.padEnd(30)} ${duration}ms`);
                resolve(results);
            },
        });
    });
}

async function getInfluxMetadata(stationId = null, daysBack = 100) {
    const activeBuckets = Object.keys(influxInstances).filter(k => !!influxInstances[k]);
    if (activeBuckets.length === 0) return null;

    const mergedStructure = {};

    // Requêtes parallèles pour chaque bucket
    await Promise.all(activeBuckets.map(async (bucketKey) => {
        const instance = influxInstances[bucketKey];
        if (!instance) return;

        try {
            const query = `
                from(bucket: "${instance.bucket}")
                    |> range(start: -${daysBack}d)
                    ${stationId ? `|> filter(fn: (r) => r.station_id == "${stationId}")` : ''}
                    |> keep(columns: ["_measurement", "sensor"])
                    |> distinct(column: "sensor")
            `;

            const allRows = await executeQuery(query, bucketKey);
            const bucketStructure = {};

            allRows.forEach(row => {
                const measurement = row._measurement;
                const sensor = row.sensor;

                if (!bucketStructure[measurement]) {
                    bucketStructure[measurement] = [];
                }
                if (sensor && !bucketStructure[measurement].includes(sensor)) {
                    bucketStructure[measurement].push(sensor);
                }

                if (!mergedStructure[measurement]) {
                    mergedStructure[measurement] = new Set();
                }
                if (sensor) {
                    mergedStructure[measurement].add(sensor);
                }
            });

            // Sauvegarde de la méta locale au bucket
            instance.metadata = bucketStructure;
            // console.log(V.database, `instance.metadata pour ${bucketKey}:`, instance.metadata);
        } catch (error) {
            console.error(`Erreur pour getInfluxMetadata du bucket ${bucketKey}:`, error.message);
        }
    }));

    // Convertir les Sets en Arrays triés
    const finalStructure = {};
    Object.keys(mergedStructure).forEach(measurement => {
        finalStructure[measurement] = Array.from(mergedStructure[measurement]).sort();
    });

    return finalStructure;
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
 * Calcule les fenêtres temporelles optimales et fusionne les données avec une priorité haute précision (Phase 0) sur les historiques/prévisions (Phase 1).
 * @param {string} reqStart - Date de début demandée (ex: timestamp, ISO ou relatif).
 * @param {string} reqEnd - Date de fin demandée.
 * @param {Function} buildFluxFn - Callback (bucketName, start, stop) => fluxQueryString.
 * @param {string|null} sensorRef - Référence du capteur optionnelle.
 * @param {string|null} stationId - ID de la station.
 */
async function fetchDataAcrossBuckets(reqStart, reqEnd, buildFluxFn, sensorRef = null, stationId = null) {
    const toISO = (val, defaultVal) => {
        if (!val) return defaultVal;
        const sVal = val.toString();
        if (sVal.includes('T') || sVal.startsWith('-') || sVal.startsWith('+') || sVal === 'now()') return sVal;
        if (!isNaN(sVal)) return new Date(parseInt(sVal) * 1000).toISOString();
        return sVal;
    };

    const parseToMillis = (val) => {
        if (!val) return 0;
        const sVal = val.toString();
        if (sVal === 'now()') return Date.now();
        const match = sVal.match(/^([-+])(\d+)(d|h|m|s|y)$/);
        if (match) {
            const sign = match[1] === '-' ? -1 : 1;
            const amount = parseInt(match[2], 10);
            const unit = match[3];
            let multiplier = 1000;
            if (unit === 'm') multiplier *= 60;
            if (unit === 'h') multiplier *= 3600;
            if (unit === 'd') multiplier *= 3600 * 24;
            if (unit === 'y') multiplier *= 3600 * 24 * 365;
            return Date.now() + (sign * amount * multiplier);
        }
        if (sVal.includes('T')) return new Date(sVal).getTime();
        if (!isNaN(sVal)) return parseInt(sVal) * 1000;
        return 0;
    };

    const start = toISO(reqStart, 0);
    const stop = toISO(reqEnd, 'now()');
    const startMs = parseToMillis(reqStart) || 0;
    const stopMs = parseToMillis(reqEnd) || Date.now();

    // Vérifie si un bucket contient le capteur demandé selon ses métadonnées
    const hasSensor = (bucketKey) => {
        if (!influxInstances[bucketKey]) return false;
        if (!sensorRef) {
            console.log(V.warning, ` Capteur non défini, on va interroger tous les buckets`);
            return true;
        }

        const [measurement, sensor] = sensorRef.split(':');
        const meta = influxInstances[bucketKey].metadata;
        if (!meta) return true; // Sécurité: on interroge si les métadonnées ne sont pas encore chargées

        if (meta[measurement]) {
            if (!sensor || sensor === '*' || meta[measurement].includes(sensor)) {
                return true;
            }
        }
        return false;
    };

    // -------------------------------------------------------------------------
    // PHASE 0 : Données de haute précision (Stations, Virtuals, Extenders)
    // -------------------------------------------------------------------------
    const phase0Plan = [];
    ['Stations', 'Virtuals', 'Extenders'].forEach(k => {
        if (hasSensor(k)) {
            console.log(V.info, `Données du bucket ${k} ajoutées à la phase 0`);
            phase0Plan.push({ key: k, bucket: influxInstances[k].bucket, start, stop });
        }
    });

    const phase0Results = await Promise.all(phase0Plan.map(async (p) => {
        const fluxQuery = buildFluxFn(p.bucket, p.start, p.stop);
        try {
            console.log(`${V.info} Requête Flux [${(p.key + ' ').padEnd(12)}] - ${fluxQuery}`);
            const rows = await executeQuery(fluxQuery, p.key);
            return rows;
        } catch (e) {
            return []; // Fail silent
        }
    }));

    // -------------------------------------------------------------------------
    // PHASE 1 : Données de base (Archives, Forecasts)
    // -------------------------------------------------------------------------
    const phase1Plan = [];

    // Archives (Toujours interroger sur la période complète car Phase 0 peut ne pas contenir tous les capteurs)
    if (hasSensor('Archives')) {
        phase1Plan.push({ key: 'Archives', bucket: influxInstances['Archives'].bucket, start, stop });
    }

    // Forecasts (Toujours interroger sur la période complète car Phase 0 peut ne pas contenir tous les capteurs)
    if (hasSensor('Forecasts')) {
        phase1Plan.push({ key: 'Forecasts', bucket: influxInstances['Forecasts'].bucket, start, stop });
    }

    const phase1Results = await Promise.all(phase1Plan.map(async (p) => {
        const fluxQuery = buildFluxFn(p.bucket, p.start, p.stop);
        try {
            const rows = await executeQuery(fluxQuery, p.key);
            return rows;
        } catch (e) {
            return []; // Fail silent
        }
    }));

    // -------------------------------------------------------------------------
    // FUSION (Overlay Phase 0 sur Phase 1)
    // -------------------------------------------------------------------------
    const dataMap = new Map();

    // Génère une clé unique pour chaque point de donnée
    const getRowKey = (row) => {
        const parts = [row._time || 'notime'];
        if (row._measurement) parts.push(row._measurement);
        if (row.sensor) parts.push(row.sensor);
        if (row._field) parts.push(row._field);
        if (row.sensor_key) parts.push(row.sensor_key);
        if (row.direction !== undefined) parts.push(row.direction);
        return parts.join('|');
    };

    // 1. Appliquer la Phase 1 en fond
    for (const rows of phase1Results) {
        for (const row of rows) {
            const key = getRowKey(row);
            if (!dataMap.has(key)) {
                dataMap.set(key, { ...row });
            } else {
                Object.assign(dataMap.get(key), row);
            }
        }
    }

    // 2. Appliquer la Phase 0 par-dessus (écrase les valeurs existantes au même temps)
    for (const rows of phase0Results) {
        for (const row of rows) {
            const key = getRowKey(row);
            if (!dataMap.has(key)) {
                dataMap.set(key, { ...row });
            } else {
                Object.assign(dataMap.get(key), row);
            }
        }
    }

    const overlaidData = Array.from(dataMap.values());

    // Renvoie un tableau de tableaux pour la compatibilité avec .flat().sort() des appelants
    return [overlaidData];
}
/**
 * Récupère la plage de dates réelle pour une station et un capteur spécifiques,
 * en réduisant la fenêtre fournie à celle contenant réellement des données.
 * @param {string} stationId - Identifiant de la station.
 * @param {string} sensorRef - Référence du capteur.
 * @param {string} startDate - Date de début (optionnelle).
 * @param {string} endDate - Date de fin (optionnelle).
 * @param {string} bucketKey - Clé optionnelle du bucket à interroger.
 * @returns {Promise<Object>} Un objet contenant la plage de dates { firstUtc, lastUtc }.
 */
async function queryDateRange(stationId, sensorRef, startDate, endDate, bucketKey = null) {
    const timeLabel = `queryDateRange ${stationId} [${sensorRef || 'ALL'}]`;
    const fnStart = new Date().getTime();
    console.log(`${V.info} Démarrage de queryDateRange pour ${stationId} [${sensorRef || 'ALL'}] à ${new Date(fnStart).toISOString()}`);
    let fluxFilter = `r.station_id == "${stationId}"`;
    let actualSensorRef = sensorRef;

    if (sensorRef) {
        if (sensorRef.endsWith('_calc') || sensorRef.endsWith('_trend')) {
            actualSensorRef = 'pressure:barometer';
        }
        fluxFilter += ` and (${getFilter(actualSensorRef)})`;
    }

    const toISO = (val, defaultVal) => {
        if (!val) return defaultVal;
        const sVal = val.toString();
        if (sVal.includes('T') || sVal.startsWith('-') || sVal.startsWith('+') || sVal === 'now()') return sVal;
        if (!isNaN(sVal)) return new Date(parseInt(sVal) * 1000).toISOString();
        return sVal;
    };

    const parseToMillis = (val) => {
        if (!val) return null;
        const sVal = val.toString();
        if (sVal === 'now()') return Date.now();
        const match = sVal.match(/^([-+])(\d+)(d|h|m|s|y)$/);
        if (match) {
            const sign = match[1] === '-' ? -1 : 1;
            const amount = parseInt(match[2], 10);
            const unit = match[3];
            let multiplier = 1000;
            if (unit === 'm') multiplier *= 60;
            if (unit === 'h') multiplier *= 3600;
            if (unit === 'd') multiplier *= 3600 * 24;
            if (unit === 'y') multiplier *= 3600 * 24 * 365;
            return Date.now() + (sign * amount * multiplier);
        }
        if (sVal.includes('T')) return new Date(sVal).getTime();
        if (!isNaN(sVal)) return parseInt(sVal) * 1000;
        return null;
    };

    const now = new Date();
    const endStopDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // + 30 jours (pour englober Forecasts)

    const startRange = toISO(startDate, '1969-12-31T00:00:00.000Z');
    const stopRange = toISO(endDate, endStopDate.toISOString());
    const startMs = parseToMillis(startDate) ?? new Date('1969-12-31T00:00:00.000Z').getTime();
    const stopMs = parseToMillis(endDate) ?? endStopDate.getTime();

    // Déterminer les buckets à interroger en fonction des métadonnées
    let activeKeys = [];
    if (bucketKey && influxInstances[bucketKey]) {
        activeKeys = [bucketKey];
    } else if (actualSensorRef) {
        const [measurement, sensor] = actualSensorRef.split(':');
        for (const k of Object.keys(influxInstances)) {
            const meta = influxInstances[k].metadata;
            if (!meta) {
                activeKeys.push(k); // Sécurité si les métadonnées ne sont pas encore chargées
            } else if (meta[measurement]) {
                if (!sensor || sensor === '*' || meta[measurement].includes(sensor)) {
                    activeKeys.push(k);
                }
            }
        }
    } else {
        activeKeys = Object.keys(influxInstances);
    }

    if (activeKeys.length === 0) {
        console.log(`${V.error} Aucune donnée trouvée pour ${stationId} [${sensorRef || 'ALL'}]`);
        return { firstUtc: null, lastUtc: null };
    }

    const queryBucket = async (k) => {
        const instance = influxInstances[k];
        const query = `
            t1 = from(bucket: "${instance.bucket}")
                |> range(start: ${startRange}, stop: ${stopRange})
                |> filter(fn: (r) => ${fluxFilter})
                |> group()
                |> first()
                |> keep(columns: ["_time"])

            t2 = from(bucket: "${instance.bucket}")
                |> range(start: ${startRange}, stop: ${stopRange})
                |> filter(fn: (r) => ${fluxFilter})
                |> group()
                |> last()
                |> keep(columns: ["_time"])

            union(tables: [t1, t2])
        `;
        try {
            return await executeQuery(query, k);
        } catch (e) {
            return []; // Fail silent pour les buckets vides ou non concernés
        }
    };

    // -------------------------------------------------------------------------
    // PHASE 0 : Buckets ciblés (Stations, Virtuals, Extenders, etc.)
    // -------------------------------------------------------------------------
    const phase0Keys = activeKeys.filter(k => k !== 'Archives' && k !== 'Forecasts');
    const hasArchives = activeKeys.includes('Archives');
    const hasForecasts = activeKeys.includes('Forecasts');

    const phase0Results = await Promise.all(phase0Keys.map(k => queryBucket(k)));

    let minStr = null;
    let maxStr = null;

    for (const rows of phase0Results) {
        for (const row of rows) {
            const t = row._time;
            if (t) {
                if (!minStr || t < minStr) minStr = t;
                if (!maxStr || t > maxStr) maxStr = t;
            }
        }
    }

    const minPhase0 = minStr ? new Date(minStr).getTime() : Infinity;
    const maxPhase0 = maxStr ? new Date(maxStr).getTime() : -Infinity;

    // -------------------------------------------------------------------------
    // PHASE 1 : Archives & Forecasts (interrogés uniquement si nécessaire)
    // -------------------------------------------------------------------------
    const phase1Keys = [];
    const TOLERANCE_MS = 3600000; // 1 heure de tolérance d'agrégation

    if (hasArchives) {
        // Interroger Archives seulement si les données Phase 0 ne couvrent pas le début demandé
        if (minPhase0 === Infinity || startMs < minPhase0 - TOLERANCE_MS) {
            phase1Keys.push('Archives');
        }
    }

    if (hasForecasts) {
        // Interroger Forecasts seulement si les données Phase 0 ne couvrent pas la fin demandée
        if (minPhase0 === Infinity || stopMs > maxPhase0 + TOLERANCE_MS) {
            phase1Keys.push('Forecasts');
        }
    }

    if (phase1Keys.length > 0) {
        const phase1Results = await Promise.all(phase1Keys.map(k => queryBucket(k)));
        for (const rows of phase1Results) {
            for (const row of rows) {
                const t = row._time;
                if (t) {
                    if (!minStr || t < minStr) minStr = t;
                    if (!maxStr || t > maxStr) maxStr = t;
                }
            }
        }
    }

    console.log(`${V.info} Fin de queryDateRange pour ${stationId} [${sensorRef || 'ALL'}]`);
    console.log(`${V.info} Durée : ${(new Date().getTime() - fnStart) / 1000} secondes`);

    return {
        firstUtc: minStr, // Sera null si aucune donnée n'a été trouvée au global
        lastUtc: maxStr
    };
}


async function queryRaw(stationId, sensorRef, startDate, endDate, intervalSeconds = 3600) {
    console.log(`Demande de données brutes pour ${stationId} - ${sensorRef}`, startDate, endDate, intervalSeconds);
    const filterStr = `r.station_id == "${stationId}" and ${getFilter(sensorRef)}`;
    const aggFn = sensorRef.startsWith('rain:') ? 'sum' : 'mean';

    const buildFluxFn = (bucket, start, stop) => `
        from(bucket: "${bucket}")
          |> range(start: ${start}, stop: ${stop}) 
          |> filter(fn: (r) => ${filterStr})
          |> aggregateWindow(every: ${intervalSeconds}s, fn: ${aggFn}, createEmpty: false)
          |> keep(columns: ["_time", "_field", "_value"])
    `;
    const resultsArray = await fetchDataAcrossBuckets(startDate, endDate, buildFluxFn, sensorRef, stationId);

    // Aplatir et trier par temps
    const merged = resultsArray.flat().sort((a, b) => new Date(a._time) - new Date(b._time));
    return merged;
}

async function queryLast(stationId, startDate = '-7d', endDate = 'now()') {
    const buildFluxFn = (bucket, start, stop) => `
        from(bucket: "${bucket}")
            |> range(start: ${start}, stop: ${stop})
            |> filter(fn: (r) => r.station_id == "${stationId}")
            |> drop(columns: ["source"])
            |> last()
    `;

    const resultsArray = await fetchDataAcrossBuckets(startDate, endDate, buildFluxFn, null, stationId);
    const result = resultsArray.flat();

    const datas = {};
    result.forEach(data => {
        const sensor = data._measurement + ':' + data.sensor;
        // Mettre à jour si pas de valeur ou si la nouvelle valeur est plus récente
        if (!datas[sensor] || new Date(data._time) > new Date(datas[sensor].d)) {
            datas[sensor] = {
                d: data._time,
                [data._field]: Math.round(data._value * 1000) / 1000
            };
        } else if (datas[sensor] && new Date(data._time).getTime() === new Date(datas[sensor].d).getTime()) {
            datas[sensor][data._field] = Math.round(data._value * 1000) / 1000;
        }
    });
    return datas;
}

async function queryRaws(stationId, sensorRefs, startDate, endDate, intervalSeconds = 3600) {
    const cumulativeSensors = sensorRefs.filter(ref => ref.startsWith('rain:'));
    const meanSensors = sensorRefs.filter(ref => !ref.startsWith('rain:'));

    const sumFilter = cumulativeSensors.length > 0 ? cumulativeSensors.map(ref => getFilter(ref)).join(' or ') : null;
    const meanFilter = meanSensors.length > 0 ? meanSensors.map(ref => getFilter(ref)).join(' or ') : null;

    const buildFluxFn = (bucket, start, stop) => {
        let fluxQuery = '';

        if (sumFilter) {
            fluxQuery += `
sumData = from(bucket: "${bucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r.station_id == "${stationId}" and (${sumFilter}))
    |> map(fn: (r) => ({ r with sensor_key: r._measurement + ":" + r.sensor }))
    |> group(columns: ["sensor_key"])
    |> aggregateWindow(every: ${intervalSeconds}s, fn: sum, createEmpty: false)
    |> drop(columns: ["unit", "_start", "_stop", "station_id", "_measurement", "sensor"])
`;
        }

        if (meanFilter) {
            if (sumFilter) fluxQuery += '\n';
            fluxQuery += `
meanData = from(bucket: "${bucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r.station_id == "${stationId}" and (${meanFilter}))
    |> map(fn: (r) => ({ r with sensor_key: r._measurement + ":" + r.sensor }))
    |> group(columns: ["sensor_key"])
    |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, createEmpty: false)
    |> drop(columns: ["unit", "_start", "_stop", "station_id", "_measurement", "sensor"])
`;
        }

        if (sumFilter && meanFilter) {
            fluxQuery += `
union(tables: [sumData, meanData])
    |> group()
    |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")
`;
        } else if (sumFilter) {
            fluxQuery += `\nsumData |> group() |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")`;
        } else if (meanFilter) {
            fluxQuery += `\nmeanData |> group() |> pivot(rowKey: ["_time"], columnKey: ["sensor_key"], valueColumn: "_value")`;
        }

        return fluxQuery;
    };

    const resultsArray = await fetchDataAcrossBuckets(startDate, endDate, buildFluxFn, null, stationId);
    const merged = resultsArray.flat().sort((a, b) => new Date(a._time) - new Date(b._time));
    return merged;
}

async function queryWindRose(stationId, startDate, endDate, intervalSeconds = 3600, prefix = '') {
    const buildFluxFn = (bucket, start, stop) => `
    // 1. Récupérer les données de direction
    directionData = from(bucket: "${bucket}")
        |> range(start: ${start}, stop: ${stop})
        |> filter(fn: (r) => r.station_id == "${stationId}" and r._measurement == "direction" and (r.sensor == "${prefix}Wind" or r.sensor == "${prefix}Gust"))
        |> keep(columns: ["_time", "_value", "sensor"])
        |> rename(columns: { _value: "direction" })

    // 2. Récupérer les données de vitesse
    speedData = from(bucket: "${bucket}")
        |> range(start: ${start}, stop: ${stop})
        |> filter(fn: (r) => r.station_id == "${stationId}" and r._measurement == "speed" and (r.sensor == "${prefix}Wind" or r.sensor == "${prefix}Gust"))
        |> keep(columns: ["_time", "_value", "sensor"])
        |> rename(columns: { _value: "speed" })

    // 3. Joindre les données de direction et de vitesse par _time
    directionalJoin = join(
        tables: { direction: directionData, speed: speedData },
        on: ["_time", "sensor"]
    )
        |> filter(fn: (r) => r.speed > 0)

    // 4. Créer les données pour calm
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

    gCount = count
        |> filter(fn: (r) => r.sensor == "${prefix}Gust")

    avg = grpPetal
        |> filter(fn: (r) => r.sensor == "${prefix}Wind")
        |> aggregateWindow(every: ${intervalSeconds}s, fn: mean, column: "speed", createEmpty: false)

    aCount = count
        |> filter(fn: (r) => r.sensor == "${prefix}Wind")

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

    const resultsArray = await fetchDataAcrossBuckets(startDate, endDate, buildFluxFn, null, stationId);
    const merged = resultsArray.flat().sort((a, b) => new Date(a._time) - new Date(b._time));
    return parserWindRose(merged);
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

async function queryWindVectors(stationId, sensor, startDate, endDate, intervalSeconds = 3600) {
    const buildFluxFn = (bucket, start, stop) => `
    import "math"
    from(bucket: "${bucket}")
        |> range(start: ${start}, stop: ${stop})
        |> filter(fn: (r) => r.station_id == "${stationId}" and r._measurement == "vector" and r.sensor == "${sensor}")
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
        const resultsArray = await fetchDataAcrossBuckets(startDate, endDate, buildFluxFn, sensor, stationId);
        const merged = resultsArray.flat().sort((a, b) => new Date(a.d) - new Date(b.d));

        return merged.map(item => {
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
    console.log(`Demande de données candle pour ${stationId} - ${sensorRef} `, startDate, endDate, intervalSeconds);

    const buildFluxFn = (bucket, start, stop) => `
import "math"
from(bucket: "${bucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r.station_id == "${stationId}" and r.sensor == "${sensorRef}")
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
    |> keep(columns: ["datetime", "first", "min", "avg", "max", "last", "count"])
    `;

    const resultsArray = await fetchDataAcrossBuckets(startDate, endDate, buildFluxFn, sensorRef, stationId);
    const merged = resultsArray.flat().sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    return merged;
}


/**
 * Retourne les informations runtime de chaque bucket initialisé.
 * @returns {Array<{key: string, bucket: string, comment: string, firstDate: string|null}>}
 */
function getBucketsInfo() {
    return Object.keys(influxInstances).map(key => {
        const instance = influxInstances[key];
        const configEntry = influxConfigs[key] || {};
        return {
            key,
            bucket: instance.bucket,
            comment: configEntry.comment || '',
            firstDate: instance.firstDate || null
        };
    });
}


module.exports = {
    getSettings,
    updateSettings,
    testInfluxConnection,
    writePoints,
    Point,
    getInfluxMetadata,
    queryDateRange,
    queryRaw,
    queryRaws,
    queryWindRose,
    queryWindVectors,
    queryCandle,
    executeQuery,
    queryLast,
    getBucketsInfo
};