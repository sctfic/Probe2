// controllers/integratorController.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

const integratorProbesPath = path.join(__dirname, '..', 'config', 'integratorProbes.json');

/**
 * Charge la configuration des modèles intégrateurs depuis le fichier JSON.
 */
function loadIntegratorProbes() {
    try {
        const data = fs.readFileSync(integratorProbesPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`${V.error} Failed to load integratorProbes.json:`, error);
        return {};
    }
}

/**
 * Outils statistiques injectés dans le contexte VM des modèles intégrateurs.
 * Toutes les fonctions acceptent un paramètre optionnel `scope` :
 *   - 'past'   : uniquement les données passées (avant maintenant)
 *   - 'future' : uniquement les données futures (après maintenant)
 *   - 'all'    : toutes les données (défaut)
 */
const Stats = {
    /**
     * Filtre les données selon le scope temporel.
     * @param {Array} data - Tableau de lignes de données
     * @param {string} [scope='all'] - 'past', 'future', ou 'all'
     * @returns {Array} Données filtrées
     */
    _filterByScope(data, scope = 'all') {
        if (!Array.isArray(data) || data.length === 0) return [];
        if (scope === 'all') return data;

        // Utiliser le cache si la référence 'data' est la même
        if (this._lastData !== data) {
            this._lastData = data;
            const ms5Min = 5 * 60 * 1000;
            const realNow = Math.floor(Date.now() / ms5Min) * ms5Min; // Arrondi au précédent multiple de 5 min
            const pastRows = data.filter(row => row._time && new Date(row._time).getTime() == realNow);
            const now = pastRows.length > 0
                ? new Date(pastRows[pastRows.length - 1]._time).getTime()
                : realNow;

            this._current = data.filter(row => row._time && new Date(row._time).getTime() === now)[0];
            this._past = data.filter(row => row._time && new Date(row._time).getTime() <= now);
            this._future = data.filter(row => row._time && new Date(row._time).getTime() > now);
        }

        if (scope === 'past') return this._past;
        else if (scope === 'current') return this._current;
        else if (scope === 'future') return this._future;
        else return data;
    },

    /**
     * Extrait les valeurs numériques valides d'un champ dans un tableau de données.
     * @param {Array} data - Tableau de lignes de données
     * @param {string} field - Nom du champ à extraire (ex: 'temperature:outTemp')
     * @param {string} [scope='all'] - 'past', 'future', ou 'all'
     * @returns {Array<number>} Tableau de valeurs numériques
     */
    _extractValues(data, field, scope = 'all') {
        const filtered = this._filterByScope(data, scope);
        console.log(`[INTEGRATOR VM DEBUG - _extractValues] field: ${field}, scope: ${scope}, filtered: ${filtered.length}`);
        return filtered
            .map(row => row[field])
            .filter(v => v !== null && v !== undefined && !isNaN(v))
            .map(Number);
    },

    /**
     * Extrait les paires (timestamp, valeur) pour les calculs temporels.
     * @param {Array} data - Tableau de lignes de données
     * @param {string} field - Nom du champ
     * @param {string} [scope='all'] - 'past', 'future', ou 'all'
     * @returns {Array<{t: number, v: number}>}
     */
    _extractTimedValues(data, field, scope = 'all') {
        const filtered = this._filterByScope(data, scope);
        return filtered
            .filter(row => row[field] !== null && row[field] !== undefined && !isNaN(row[field]) && row._time)
            .map(row => ({
                t: new Date(row._time).getTime(),
                v: Number(row[field])
            }));
    },

    split(data) {
        return {
            past: this._filterByScope(data, 'past'),
            current: this._filterByScope(data, 'current'),
            future: this._filterByScope(data, 'future')
        };
    },

    /** Valeur actuelle (valeur au point "now" calculé par _filterByScope) */
    current(data, field) {
        return this._filterByScope(data, 'current')[field];
    },

    /** Première valeur */
    first(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        return vals.length > 0 ? vals[0] : null;
    },

    /** Dernière valeur */
    last(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        return vals.length > 0 ? vals[vals.length - 1] : null;
    },

    /** Moyenne */
    mean(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    },

    /** Minimum */
    min(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return Math.min(...vals);
    },

    /** Maximum */
    max(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return Math.max(...vals);
    },

    /** Somme */
    sum(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0);
    },

    /**
     * Tendance : différence entre la dernière et la première valeur.
     * Positif = croissant, négatif = décroissant.
     */
    trend(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length < 2) return null;
        return vals[vals.length - 1] - vals[0];
    },

    /**
     * Moyenne mobile sur une fenêtre glissante.
     * @param {Array} data - Données
     * @param {string} field - Champ
     * @param {number} [window=5] - Taille de la fenêtre (nombre de points)
     * @param {string} [scope='all'] - 'past', 'future', ou 'all'
     * @returns {Array<number>} Tableau de moyennes mobiles
     */
    movingAverage(data, field, window = 5, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length < window) return vals;
        const result = [];
        for (let i = 0; i <= vals.length - window; i++) {
            const slice = vals.slice(i, i + window);
            result.push(slice.reduce((a, b) => a + b, 0) / window);
        }
        return result;
    },

    /**
     * Pente de régression linéaire (moindres carrés).
     * Retourne la pente par seconde (variation du champ par seconde).
     * @param {string} [scope='all'] - 'past', 'future', ou 'all'
     * @returns {number|null} Pente (unité/seconde)
     */
    linearSlope(data, field, scope = 'all') {
        const pairs = this._extractTimedValues(data, field, scope);
        if (pairs.length < 2) return null;

        const n = pairs.length;
        // Normaliser les timestamps en secondes depuis le premier point
        const t0 = pairs[0].t;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (const p of pairs) {
            const x = (p.t - t0) / 1000; // secondes
            const y = p.v;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }

        const denom = n * sumX2 - sumX * sumX;
        if (denom === 0) return 0;
        return (n * sumXY - sumX * sumY) / denom;
    },

    /**
     * Test de Mann-Kendall pour détecter une tendance monotone.
     * utilisé pour analyser si une série de données temporelles présente une tendance à la hausse
     * ou à la baisse monotone (constante). Puisqu'il est non paramétrique,
     * il ne nécessite pas que les données suivent une distribution particulière (comme la distribution normale)
     * et il est peu sensible aux valeurs aberrantes (outliers) ainsi qu'aux données manquantes.
     * @param {string} [scope='all'] - 'past', 'future', ou 'all'
     * @returns {{ S: number, Z: number, trend: string, p: number }}
     */
    mannKendall(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        const n = vals.length;

        if (n < 4) return { S: 0, Z: 0, trend: 'insufficient data', p: 1 };

        // Calcul de S
        let S = 0;
        for (let k = 0; k < n - 1; k++) {
            for (let j = k + 1; j < n; j++) {
                const diff = vals[j] - vals[k];
                if (diff > 0) S++;
                else if (diff < 0) S--;
            }
        }

        // Calcul de la variance (sans correction des ex-aequo pour simplifier)
        const variance = (n * (n - 1) * (2 * n + 5)) / 18;
        const stdDev = Math.sqrt(variance);

        // Calcul de Z
        let Z;
        if (S > 0) Z = (S - 1) / stdDev;
        else if (S < 0) Z = (S + 1) / stdDev;
        else Z = 0;

        // P-value approximative via la distribution normale
        const absZ = Math.abs(Z);
        const p = 2 * (1 - 0.5 * (1 + Math.sign(absZ) * (1 - Math.exp(-absZ * absZ * (4 / Math.PI + 0.147 * absZ * absZ) / (1 + 0.147 * absZ * absZ)))));

        let trend = 'no trend';
        if (p < 0.05) {
            trend = S > 0 ? 'increasing' : 'decreasing';
        }

        return { S, Z: Math.round(Z * 1000) / 1000, trend, p: Math.round(p * 10000) / 10000 };
    },

    /**
     * Détecteur d'épisodes météorologiques favorables — version simplifiée.
     * 
     * Paramètres fixes (optimisés pour données météo 5min passé / 60min futur) :
     * - Seuil : percentile 80 (pic) / 20 (creux) sur l'ensemble des données
     * - Durée min : 2h (pas d'épisode trop court)
     * - Durée max : 24h (pas de saison entière)
     * - Tolérance gap : 2h (fusionne les trous raisonnables)
     * - Couverture min : 50% (données futures éparse tolérées)
     * 
     * @param {Array} data - Données brutes [{_time, [field]: value}, ...]
     * @param {string} field - Nom du champ (ex: 'temperature:outTemp')
     * @param {string} type - 'peak' | 'trough'
     * @param {string} [scope='all'] - 'past', 'future', 'all'
     * @returns {Array} Épisodes au format legacy
     * @throws {Error} Si data ne couvre pas J-12h → J+36h
     */
    FavorableEpisodeDetector(data, field, type, scope = 'all') {
        // ─── VALIDATION TEMPORALE STRICTE ─────────────────────────────
        const pairs = this._extractTimedValues(data, field, scope)
            .filter(p => p.v !== null && !isNaN(p.v))
            .sort((a, b) => a.t - b.t);

        if (pairs.length < 2) {
            throw new Error(`[FavorableEpisodeDetector] ${field}: pas assez de données valides`);
        }

        const dataStart = pairs[0].t;
        const dataEnd = pairs[pairs.length - 1].t;
        const dataSpanHours = (dataEnd - dataStart) / 3600000;

        const now = Date.now();
        const minStart = now - 12 * 3600 * 1000;  // J-12h
        const minEnd = now + 36 * 3600 * 1000;     // J+36h

        if (dataStart > minStart + 3600 * 1000) {  // tolérance 1h
            throw new Error(
                `[FavorableEpisodeDetector] ${field}: data commence trop tard ` +
                `(début: ${new Date(dataStart).toISOString()}, ` +
                `requis: <= ${new Date(minStart).toISOString()})`
            );
        }
        if (dataEnd < minEnd - 3600 * 1000) {  // tolérance 1h
            throw new Error(
                `[FavorableEpisodeDetector] ${field}: data finit trop tôt ` +
                `(fin: ${new Date(dataEnd).toISOString()}, ` +
                `requis: >= ${new Date(minEnd).toISOString()})`
            );
        }

        // ─── PARAMÈTRES FIXES ─────────────────────────────────────────
        const MIN_DURATION_MS = 2 * 3600 * 1000;   // 2h
        const MAX_DURATION_MS = 24 * 3600 * 1000;  // 24h
        const GAP_TOLERANCE_MS = 2 * 3600 * 1000;  // 2h
        const MIN_COVERAGE = 0.50;                  // 50%
        const PERCENTILE = type === 'peak' ? 80 : 20;

        // ─── SEUIL DYNAMIQUE ──────────────────────────────────────────
        const values = pairs.map(p => p.v).sort((a, b) => a - b);
        const idxThreshold = Math.floor((PERCENTILE / 100) * (values.length - 1));
        const threshold = values[idxThreshold];

        // ─── SEGMENTATION ─────────────────────────────────────────────
        const segments = [];
        let current = null;

        for (const p of pairs) {
            const isFav = type === 'peak' ? p.v >= threshold : p.v <= threshold;

            if (!isFav) {
                // Vérifier si trou tolérable dans segment actif
                if (current) {
                    const lastPoint = current.points[current.points.length - 1];
                    const gap = p.t - lastPoint.t;
                    if (gap > GAP_TOLERANCE_MS) {
                        segments.push(current);
                        current = null;
                    }
                    // sinon: on ignore ce point, il fait partie du segment
                }
                continue;
            }

            if (!current) {
                current = { points: [p], startT: p.t, endT: p.t };
            } else {
                current.points.push(p);
                current.endT = p.t;
            }
        }
        if (current) segments.push(current);

        // ─── FILTRAGE ET FORMATAGE ────────────────────────────────────
        const episodes = [];

        for (const seg of segments) {
            const duration = seg.endT - seg.startT;

            if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) continue;

            // Estimation intervalle moyen pour couverture
            const avgInterval = (pairs[pairs.length - 1].t - pairs[0].t) / (pairs.length - 1);
            const expectedPoints = Math.floor(duration / avgInterval) + 1;
            const coverage = seg.points.length / expectedPoints;
            if (coverage < MIN_COVERAGE) continue;

            const segValues = seg.points.map(p => p.v);
            const avg = segValues.reduce((a, b) => a + b, 0) / segValues.length;

            episodes.push({
                type,
                avg: Math.round(avg * 100) / 100,
                start: {
                    d: new Date(seg.points[0].t).toISOString(),
                    [field]: Math.round(seg.points[0].v * 100) / 100
                },
                end: {
                    d: new Date(seg.points[seg.points.length - 1].t).toISOString(),
                    [field]: Math.round(seg.points[seg.points.length - 1].v * 100) / 100
                }
            });
        }

        // Fusion des chevauchements
        const merged = [];
        episodes.sort((a, b) => new Date(a.start.d).getTime() - new Date(b.start.d).getTime());

        for (const ep of episodes) {
            const last = merged[merged.length - 1];
            if (last) {
                const lastEnd = new Date(last.end.d).getTime();
                const currStart = new Date(ep.start.d).getTime();
                if (currStart <= lastEnd + GAP_TOLERANCE_MS) {
                    // Fusion: moyenne pondérée par durée
                    const lastDur = lastEnd - new Date(last.start.d).getTime();
                    const currDur = new Date(ep.end.d).getTime() - currStart;
                    const totalDur = lastDur + currDur;
                    last.avg = Math.round(
                        (last.avg * lastDur + ep.avg * currDur) / totalDur * 100
                    ) / 100;
                    last.end = ep.end;
                    continue;
                }
            }
            merged.push(ep);
        }

        return merged;
    },

    /**
     * Prochain pic favorable (épisode de valeurs hautes).
     * @throws {Error} Si data invalide
     */
    nextPeak(data, field) {
        const ms5Min = 5 * 60 * 1000;
        const realNow = Math.floor(Date.now() / ms5Min) * ms5Min;
        const pastRows = data.filter(row => row._time && new Date(row._time).getTime() == realNow);
        const now = pastRows.length > 0
            ? new Date(pastRows[pastRows.length - 1]._time).getTime()
            : realNow;

        const limit = now + 24 * 3600 * 1000;

        const episodes = this.FavorableEpisodeDetector(data, field, 'peak', 'all');

        const futurePeaks = episodes
            .filter(e => {
                const tEnd = new Date(e.end.d).getTime();
                return tEnd >= now && tEnd <= limit;
            })
            .sort((a, b) => new Date(a.end.d).getTime() - new Date(b.end.d).getTime());

        return futurePeaks.length > 0 ? futurePeaks[0] : null;
    },

    /**
     * Prochain creux favorable (épisode de valeurs basses).
     * @throws {Error} Si data invalide
     */
    nextTrough(data, field) {
        const ms5Min = 5 * 60 * 1000;
        const realNow = Math.floor(Date.now() / ms5Min) * ms5Min;
        const pastRows = data.filter(row => row._time && new Date(row._time).getTime() == realNow);
        const now = pastRows.length > 0
            ? new Date(pastRows[pastRows.length - 1]._time).getTime()
            : realNow;

        const limit = now + 24 * 3600 * 1000;

        const episodes = this.FavorableEpisodeDetector(data, field, 'trough', 'all');

        const futureTroughs = episodes
            .filter(e => {
                const tEnd = new Date(e.end.d).getTime();
                return tEnd >= now && tEnd <= limit;
            })
            .sort((a, b) => new Date(a.end.d).getTime() - new Date(b.end.d).getTime());

        return futureTroughs.length > 0 ? futureTroughs[0] : null;
    }
};

/**
 * Route GET /:stationId/integrator/build
 * Calcule les nouvelles valeurs des modèles intégrateurs et les écrit dans le bucket Integrators.
 */
exports.runIntegrator = async (req, res) => {
    const { stationId } = req.params;
    const stationConfig = req.stationConfig;

    console.log(`${V.info} [INTEGRATOR] Démarrage du calcul des modèles intégrateurs pour ${stationId}`);

    try {
        const integratorProbes = loadIntegratorProbes();
        const probeKeys = Object.keys(integratorProbes);

        if (probeKeys.length === 0) {
            return res.json({ success: true, message: 'Aucun modèle intégrateur configuré.', results: [] });
        }

        // Préparer le contexte des scripts JS (une seule fois pour tous les modèles)
        const scriptContext = {};
        const loadedScripts = new Set();

        for (const probeKey of probeKeys) {
            const probeConfig = integratorProbes[probeKey];
            if (probeConfig.scriptJS) {
                for (const scriptPath of probeConfig.scriptJS) {
                    if (!loadedScripts.has(scriptPath)) {
                        const fullPath = path.join(__dirname, '..', 'public', scriptPath);
                        try {
                            const requiredModule = require(fullPath);
                            Object.assign(scriptContext, requiredModule);
                            loadedScripts.add(scriptPath);
                            console.log(`${V.gear} [INTEGRATOR] Script chargé: ${scriptPath}`);
                        } catch (e) {
                            console.error(`${V.error} [INTEGRATOR] Échec du chargement du script ${scriptPath}:`, e.message);
                        }
                    }
                }
            }
        }

        // Ajouter les outils statistiques au contexte
        scriptContext.Stats = Stats;

        const results = [];
        const points = [];

        for (const probeKey of probeKeys) {
            const probeConfig = integratorProbes[probeKey];

            if (!probeConfig.fnModel || probeConfig.fnModel.trim() === '') {
                console.log(`${V.Warn} [INTEGRATOR] Aucune fonction fnModel pour ${probeKey}, ignoré.`);
                continue;
            }

            try {
                // Calcul de la période : start = now - contextPeriod
                const contextPeriod = probeConfig.contextPeriod || 86400; // défaut 1 jour (86400s)
                const now = (new Date().getTime()); // maintnenant
                const startDate = new Date(now - contextPeriod * 1000); // maintenant - contextPeriod pour les données de base
                const endDate = new Date(now + (contextPeriod * 1000)); // maintenant + contextPeriod pour les prévisions

                const start = startDate.toISOString();
                const end = endDate.toISOString();

                // Intervalle de requête : on prend des échantillons raisonnables
                // Pour 1 jour de données, on prend un intervalle de 5 minutes (300s)
                const intervalSeconds = Math.max(300, Math.round(contextPeriod / 1000));

                console.log(V.Ampoule, `[INTEGRATOR] Traitement de ${probeKey}: ${start} → ${end} (interval: ${intervalSeconds}s)`);

                // Récupérer les données brutes
                let { dataNeeded } = probeConfig;

                // Filtrer dataNeeded pour exclure les capteurs du bucket Integrators
                const integratorsMeta = influxdbService.getBucketMetadata('Integrators') || {};
                dataNeeded = dataNeeded.filter(ref => {
                    const [m, s] = ref.split(':');
                    // Si le capteur est présent dans Integrators, on l'exclut
                    if (integratorsMeta[m] && (s === '*' || integratorsMeta[m].includes(s))) {
                        return false;
                    }
                    return true;
                });

                console.log(V.Ampoule, V.Ampoule, V.Ampoule, `[INTEGRATOR] Données nécessaires pour ${probeKey}:`, dataNeeded);

                if (dataNeeded.length === 0) {
                    console.log(`${V.Warn} [INTEGRATOR] Aucun capteur valide (hors Integrators) pour ${probeKey}, ignoré.`);
                    results.push({ probe: probeKey, status: 'no valid dataNeeded' });
                    continue;
                }

                const rawData = await influxdbService.queryRaws(stationId, dataNeeded, start, end, intervalSeconds);

                if (!rawData || rawData.length === 0) {
                    console.log(`${V.Warn} [INTEGRATOR] Aucune donnée pour ${probeKey}, ignoré.`);
                    results.push({ probe: probeKey, status: 'no data' });
                    continue;
                }

                // Épurer rawData pour la lisibilité (retirer result et table)
                const cleanData = rawData.map(row => {
                    const { result, table, ...rest } = row;
                    return rest;
                });

                // Préparer la fonction fnModel
                const fnModelStr = probeConfig.fnModel
                    .replace(/%longitude%/g, stationConfig.longitude.desired || stationConfig.longitude.lastReadValue || 0)
                    .replace(/%latitude%/g, stationConfig.latitude.desired || stationConfig.latitude.lastReadValue || 0)
                    .replace(/%altitude%/g, stationConfig.altitude.desired || stationConfig.altitude.lastReadValue || 0);

                const probeLogs = [];
                const customConsole = {
                    log: (...args) => {
                        console.log(`[INTEGRATOR VM DEBUG - ${probeKey}]`, ...args);
                        probeLogs.push({ level: 'log', timestamp: new Date().toISOString(), args: args.length === 1 ? args[0] : args });
                    },
                    error: (...args) => {
                        console.error(`[INTEGRATOR VM ERROR - ${probeKey}]`, ...args);
                        probeLogs.push({ level: 'error', timestamp: new Date().toISOString(), args: args.length === 1 ? args[0] : args });
                    }
                };

                const fnModel = vm.runInNewContext(`(${fnModelStr})`, { ...scriptContext, console: customConsole });

                // Appel UNIQUE de la fonction avec l'ensemble du dataset épuré
                const calculatedValue = fnModel(cleanData);
                console.log("calculatedValue:", calculatedValue);

                if (calculatedValue === null || calculatedValue === undefined) {
                    console.log(`${V.Warn} [INTEGRATOR] Résultat null pour ${probeKey}, ignoré.`);
                    results.push({ probe: probeKey, status: 'null result', value: calculatedValue, logs: probeLogs });
                    continue;
                }

                const measurementType = probeConfig.measurement || 'None';
                const sensorDb = probeConfig.sensorDb || probeKey;
                const baseSensorName = sensorDb.includes(':') ? sensorDb.split(':')[1] : sensorDb;

                if (measurementType === 'vector' && typeof calculatedValue === 'object') {
                    // Cas vecteur : { Ux, Vy, Value? }
                    const point = new influxdbService.Point('vector')
                        .tag('station_id', stationId)
                        .tag('sensor', baseSensorName)
                        .tag('source', 'integrator')
                        .timestamp(new Date());

                    if (calculatedValue.Ux !== undefined) point.floatField('Ux', Math.round(calculatedValue.Ux * 10) / 10);
                    if (calculatedValue.Vy !== undefined) point.floatField('Vy', Math.round(calculatedValue.Vy * 10) / 10);
                    if (calculatedValue.Value !== undefined) point.floatField('Value', Math.round(calculatedValue.Value * 10) / 10);

                    points.push(point);
                    results.push({ probe: probeKey, status: 'ok', type: 'vector', value: calculatedValue, logs: probeLogs });
                } else if (measurementType === 'None' && typeof calculatedValue === 'object' && !Array.isArray(calculatedValue)) {
                    // Cas multi-mesures : { "Meas:sensor": value, ... }
                    let count = 0;
                    for (const key in calculatedValue) {
                        if (key.includes(':')) {
                            const [m, s] = key.split(':');
                            const val = Number(calculatedValue[key]);
                            if (!isNaN(val)) {
                                const point = new influxdbService.Point(m)
                                    .tag('station_id', stationId)
                                    .tag('sensor', s)
                                    .tag('source', 'integrator')
                                    .floatField('value', Math.round(val * 10) / 10)
                                    .timestamp(new Date());
                                points.push(point);
                                count++;
                            }
                        }
                    }
                    results.push({ probe: probeKey, status: 'ok', type: 'multi', value: calculatedValue, logs: probeLogs });
                } else {
                    // Cas standard (nombre)
                    const val = Number(calculatedValue);
                    if (isNaN(val)) {
                        console.log(`${V.Warn} [INTEGRATOR] Résultat non numérique pour ${probeKey}, ignoré.`);
                        results.push({ probe: probeKey, status: 'NaN result', value: calculatedValue, logs: probeLogs });
                        continue;
                    }
                    const roundedValue = Math.round(val * 10) / 10;
                    const point = new influxdbService.Point(measurementType)
                        .tag('station_id', stationId)
                        .tag('sensor', baseSensorName)
                        .tag('source', 'integrator')
                        .floatField('value', roundedValue)
                        .timestamp(new Date());

                    points.push(point);
                    results.push({ probe: probeKey, status: 'ok', value: roundedValue, logs: probeLogs });
                }

            } catch (probeError) {
                console.error(`${V.error} [INTEGRATOR] Erreur pour ${probeKey}:`, probeError.message);
                // try to extract logs if probeLogs is defined in the current block, wait probeLogs might not be defined if error occurs before it's declared
                results.push({ probe: probeKey, status: 'error', error: probeError.message });
            }
        }

        // Écrire tous les points en une fois
        if (points.length > 0) {
            const written = await influxdbService.writePoints(points, 'Integrators');
            console.log(`${V.database} [INTEGRATOR] ${written} points écrits dans le bucket Integrators.`);
        }

        res.json({
            success: true,
            stationId,
            timestamp: new Date().toISOString(),
            message: `Calcul des modèles intégrateurs terminé.`,
            results
        });

    } catch (error) {
        console.error(`${V.error} [INTEGRATOR] Erreur globale:`, error.message);
        res.status(500).json({
            success: false,
            stationId,
            error: error.message
        });
    }
};
