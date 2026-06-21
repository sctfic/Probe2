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
 */
const Stats = {
    // Caches
    _lastData: null,
    _current: null,
    _past: null,
    _future: null,
    _lastResampledData: null,
    _resampledCache: {},
    _lastDataEpisodes: null,
    _episodesCache: {},

    _getNow(data) {
        const ms5Min = 5 * 60 * 1000;
        const realNow = Math.floor(Date.now() / ms5Min) * ms5Min;
        const pastRows = data.filter(row => {
            const t = row._time ? new Date(row._time).getTime() : row.t;
            return t === realNow;
        });
        return pastRows.length > 0
            ? (pastRows[pastRows.length - 1]._time ? new Date(pastRows[pastRows.length - 1]._time).getTime() : pastRows[pastRows.length - 1].t)
            : realNow;
    },

    _filterByScope(data, scope = 'all') {
        if (!Array.isArray(data) || data.length === 0) return [];
        if (scope === 'all') return data;

        if (this._lastData !== data) {
            this._lastData = data;
            const ms5Min = 5 * 60 * 1000;
            const realNow = Math.floor(Date.now() / ms5Min) * ms5Min;
            const pastRows = data.filter(row => {
                const t = row._time ? new Date(row._time).getTime() : row.t;
                return t === realNow;
            });
            const now = pastRows.length > 0
                ? (pastRows[pastRows.length - 1]._time ? new Date(pastRows[pastRows.length - 1]._time).getTime() : pastRows[pastRows.length - 1].t)
                : realNow;

            this._current = data.filter(row => {
                const t = row._time ? new Date(row._time).getTime() : row.t;
                return t === now;
            })[0];
            this._past = data.filter(row => {
                const t = row._time ? new Date(row._time).getTime() : row.t;
                return t !== undefined && t <= now;
            });
            this._future = data.filter(row => {
                const t = row._time ? new Date(row._time).getTime() : row.t;
                return t !== undefined && t > now;
            });
        }

        if (scope === 'past') return this._past;
        else if (scope === 'current') return this._current;
        else if (scope === 'future') return this._future;
        else return data;
    },

    _isResampled(data, field) {
        if (!Array.isArray(data) || data.length === 0) return false;
        const firstRow = data[0];
        return (firstRow && typeof firstRow === 'object' && 't' in firstRow && 'v' in firstRow && !(field in firstRow));
    },

    _extractRawValues(data, field, scope = 'all') {
        const filtered = this._filterByScope(data, scope);
        return filtered
            .map(row => row[field])
            .filter(v => v !== null && v !== undefined && !isNaN(v))
            .map(Number);
    },

    _extractRawTimedValues(data, field, scope = 'all') {
        const filtered = this._filterByScope(data, scope);
        return filtered
            .filter(row => row[field] !== null && row[field] !== undefined && !isNaN(row[field]) && row._time)
            .map(row => ({
                t: new Date(row._time).getTime(),
                v: Number(row[field])
            }));
    },

    _extractValues(data, field, scope = 'all') {
        if (this._isResampled(data, field)) {
            const filtered = this._filterByScope(data, scope);
            return filtered
                .map(row => row.v)
                .filter(v => v !== null && v !== undefined && !isNaN(v))
                .map(Number);
        }
        const resampled = this._getResampledData(data, field, 'linear');
        const filtered = this._filterByScope(resampled, scope);
        return filtered
            .map(row => row.v)
            .filter(v => v !== null && v !== undefined && !isNaN(v))
            .map(Number);
    },

    _extractTimedValues(data, field, scope = 'all') {
        if (this._isResampled(data, field)) {
            const filtered = this._filterByScope(data, scope);
            return filtered
                .filter(row => row.v !== null && row.v !== undefined && !isNaN(row.v))
                .map(row => ({
                    t: row.t,
                    v: Number(row.v)
                }));
        }
        const resampled = this._getResampledData(data, field, 'linear');
        const filtered = this._filterByScope(resampled, scope);
        return filtered
            .filter(row => row.v !== null && row.v !== undefined && !isNaN(row.v))
            .map(row => ({
                t: row.t,
                v: Number(row.v)
            }));
    },

    split(data) {
        return {
            past: this._filterByScope(data, 'past'),
            current: this._filterByScope(data, 'current'),
            future: this._filterByScope(data, 'future')
        };
    },

    current(data, field) {
        if (this._isResampled(data, field)) {
            const currRow = this._filterByScope(data, 'current');
            return currRow ? currRow.v : null;
        }
        const resampled = this._getResampledData(data, field, 'linear');
        const currRow = this._filterByScope(resampled, 'current');
        return currRow ? currRow.v : null;
    },

    first(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        return vals.length > 0 ? vals[0] : null;
    },

    last(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        return vals.length > 0 ? vals[vals.length - 1] : null;
    },

    mean(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    },

    min(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return Math.min(...vals);
    },

    max(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return Math.max(...vals);
    },

    sum(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0);
    },

    /**
     * Calcule la moyenne mobile simple d'une série de valeurs.
     * 
     * @param {Array} data - Les données brutes ou déjà rééchantillonnées.
     * @param {string} field - Le champ sur lequel calculer la moyenne mobile.
     * @param {number} [window=5] - La taille de la fenêtre de calcul (nombre de points).
     * @param {string} [scope='all'] - Le scope temporel à appliquer ('all', 'past', 'current', 'future').
     * @returns {Array<number>} Un tableau contenant les moyennes mobiles calculées.
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
     * Calcule la pente linéaire (régression linéaire simple) des valeurs par rapport au temps.
     * La pente est exprimée en unités de valeur par seconde.
     * 
     * @param {Array} data - Les données brutes ou déjà rééchantillonnées.
     * @param {string} field - Le champ sur lequel calculer la pente.
     * @param {string} [scope='all'] - Le scope temporel à appliquer ('all', 'past', 'current', 'future').
     * @returns {number|null} La pente (coefficient directeur), ou null s'il y a moins de 2 points.
     */
    linearSlope(data, field, scope = 'all') {
        const pairs = this._extractTimedValues(data, field, scope);
        if (pairs.length < 2) return null;
        const n = pairs.length;
        const t0 = pairs[0].t;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (const p of pairs) {
            const x = (p.t - t0) / 1000;
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
     * Effectue le test statistique non-paramétrique de Mann-Kendall pour détecter
     * la présence d'une tendance monotone significative dans la série temporelle.
     * 
     * @param {Array} data - Les données brutes ou déjà rééchantillonnées.
     * @param {string} field - Le champ sur lequel effectuer le test.
     * @param {string} [scope='all'] - Le scope temporel à appliquer ('all', 'past', 'current', 'future').
     * @returns {Object} Un objet contenant :
     *   - S {number} : La statistique S de Mann-Kendall.
     *   - Z {number} : Le score Z standardisé.
     *   - trend {string} : La tendance détectée ('increasing', 'decreasing', 'no trend' ou 'insufficient data').
     *   - p {number} : La p-value (seuil de signification de 0.05 pour rejeter l'hypothèse nulle).
     */
    mannKendall(data, field, scope = 'all') {
        const vals = this._extractValues(data, field, scope);
        const n = vals.length;
        if (n < 4) return { S: 0, Z: 0, trend: 'insufficient data', p: 1 };
        let S = 0;
        for (let k = 0; k < n - 1; k++) {
            for (let j = k + 1; j < n; j++) {
                const diff = vals[j] - vals[k];
                if (diff > 0) S++;
                else if (diff < 0) S--;
            }
        }
        const variance = (n * (n - 1) * (2 * n + 5)) / 18;
        const stdDev = Math.sqrt(variance);
        let Z;
        if (S > 0) Z = (S - 1) / stdDev;
        else if (S < 0) Z = (S + 1) / stdDev;
        else Z = 0;
        const absZ = Math.abs(Z);
        const p = 2 * (1 - 0.5 * (1 + Math.sign(absZ) * (1 - Math.exp(-absZ * absZ * (4 / Math.PI + 0.147 * absZ * absZ) / (1 + 0.147 * absZ * absZ)))));
        let trend = 'no trend';
        if (p < 0.05) trend = S > 0 ? 'increasing' : 'decreasing';
        return { S, Z: Math.round(Z * 1000) / 1000, trend, p: Math.round(p * 10000) / 10000 };
    },

    // ═════════════════════════════════════════════════════════════════
    //  RÉÉCHANTILLONNAGE : conserve les bruts, interpole les trous
    // ═════════════════════════════════════════════════════════════════

    _resampleTo5Min(pairs, method = 'linear') {
        const step = 5 * 60 * 1000;
        const start = Math.floor(pairs[0].t / step) * step;
        const end = Math.ceil(pairs[pairs.length - 1].t / step) * step;
        const resampled = [];

        // Map des points bruts par timestamp aligné
        const rawMap = new Map();
        for (const p of pairs) {
            const aligned = Math.round(p.t / step) * step;
            rawMap.set(aligned, p.v);
        }

        // Pré-calcul spline cubique si demandé
        let coeffs = null;
        if (method === 'cubic' && pairs.length >= 3) {
            const t0 = pairs[0].t;
            const x = pairs.map(p => (p.t - t0) / 60000); // minutes
            const y = pairs.map(p => p.v);
            coeffs = this._naturalCubicSpline(x, y);
        }

        let rawIdx = 0;

        for (let t = start; t <= end; t += step) {
            // Point brut existe → conservé (TOUJOURS, quel que soit le méthode)
            if (rawMap.has(t)) {
                resampled.push({ t, v: rawMap.get(t), isRaw: true });
                continue;
            }

            // Trou → interpolation selon méthode
            while (rawIdx < pairs.length - 1 && pairs[rawIdx + 1].t < t) rawIdx++;
            const p0 = pairs[rawIdx];
            const p1 = pairs[rawIdx + 1];

            let v;
            if (coeffs) {
                const xi = (t - pairs[0].t) / 60000;
                v = this._evalSpline(coeffs, xi);
            } else {
                if (!p1 || t <= p0.t) {
                    v = p0.v;
                } else {
                    const ratio = (t - p0.t) / (p1.t - p0.t);
                    v = p0.v + ratio * (p1.v - p0.v);
                }
            }

            resampled.push({ t, v, isRaw: false });
        }

        return resampled;
    },
    /**
     * Construit les coefficients d'une spline cubique naturelle 1D.
     * x et y doivent être triés par x croissant.
     */
    _naturalCubicSpline(x, y) {
        const n = x.length;
        if (n < 3) return null;
        const h = [];
        for (let i = 0; i < n - 1; i++) h.push(x[i + 1] - x[i]);
        const alpha = [0];
        for (let i = 1; i < n - 1; i++) {
            alpha.push((3 / h[i]) * (y[i + 1] - y[i]) - (3 / h[i - 1]) * (y[i] - y[i - 1]));
        }
        const l = [1], mu = [0], z = [0];
        for (let i = 1; i < n - 1; i++) {
            l.push(2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1]);
            mu.push(h[i] / l[i]);
            z.push((alpha[i] - h[i - 1] * z[i - 1]) / l[i]);
        }
        l.push(1);
        z.push(0);
        const c = new Array(n).fill(0);
        const b = new Array(n - 1).fill(0);
        const d = new Array(n - 1).fill(0);
        const a = new Array(n - 1).fill(0);
        for (let i = 0; i < n - 1; i++) a[i] = y[i];
        for (let j = n - 2; j >= 0; j--) {
            c[j] = z[j] - mu[j] * c[j + 1];
            b[j] = (y[j + 1] - y[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
            d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
        }
        return { a, b, c, d, x };
    },

    _evalSpline(coeffs, xi) {
        const { a, b, c, d, x } = coeffs;
        let i = 0;
        while (i < x.length - 1 && xi > x[i + 1]) i++;
        if (i >= x.length - 1) {
            const j = x.length - 2;
            const dx = xi - x[j];
            return a[j] + b[j] * dx + c[j] * dx * dx + d[j] * dx * dx * dx;
        }
        const dx = xi - x[i];
        return a[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
    },

    _getResampledData(data, field, method = 'linear') {
        if (this._lastResampledData !== data) {
            this._lastResampledData = data;
            this._resampledCache = {};
        }
        const cacheKey = `${field}|${method}`;
        if (this._resampledCache[cacheKey]) return this._resampledCache[cacheKey];

        const pairs = this._extractRawTimedValues(data, field, 'all')
            .filter(p => p.v !== null && !isNaN(p.v))
            .sort((a, b) => a.t - b.t);

        if (pairs.length < 2) {
            throw new Error(`[ExtremeEpisodeDetector] ${field}: pas assez de données`);
        }

        const resampled = this._resampleTo5Min(pairs, method);
        this._resampledCache[cacheKey] = resampled;
        return resampled;
    },

    // ═════════════════════════════════════════════════════════════════
    //  DÉTECTION D'ÉPISODES
    // ═════════════════════════════════════════════════════════════════

    ExtremeEpisodeDetector(data, field) {
        if (this._lastDataEpisodes !== data) {
            this._lastDataEpisodes = data;
            this._episodesCache = {};
        }
        if (this._episodesCache[field]) return this._episodesCache[field];

        const peaks = this._detectEpisodes(data, field, 'peak');
        const troughs = this._detectEpisodes(data, field, 'trough');

        const combined = [...peaks, ...troughs].sort((a, b) =>
            new Date(a.start.d).getTime() - new Date(b.start.d).getTime()
        );

        this._episodesCache[field] = combined;
        return combined;
    },

    _detectEpisodes(data, field, type) {
        // ─── 1. VALIDATION TEMPORALE ──────────────────────────────────
        const pairs = this._extractTimedValues(data, field, 'all')
            .filter(p => p.v !== null && !isNaN(p.v))
            .sort((a, b) => a.t - b.t);

        if (pairs.length < 2) {
            throw new Error(`[ExtremeEpisodeDetector] ${field}: pas assez de données valides`);
        }

        const dataStart = pairs[0].t;
        const dataEnd = pairs[pairs.length - 1].t;
        const now = this._getNow(data);

        const minStart = now - 12 * 3600 * 1000;
        const minEnd = now + 24 * 3600 * 1000;

        if (dataStart > minStart + 3600 * 1000) {
            throw new Error(
                `[ExtremeEpisodeDetector] ${field}: data commence trop tard ` +
                `(début: ${new Date(dataStart).toISOString()}, requis: <= ${new Date(minStart).toISOString()})`
            );
        }
        if (dataEnd < minEnd - 3600 * 1000) {
            throw new Error(
                `[ExtremeEpisodeDetector] ${field}: data finit trop tôt ` +
                `(fin: ${new Date(dataEnd).toISOString()}, requis: >= ${new Date(minEnd).toISOString()})`
            );
        }

        // ─── 2. RÉÉCHANTILLONNAGE 5 MIN ───────────────────────────────
        const resampled = this._getResampledData(data, field);
        const step = 5 * 60 * 1000;

        // ─── 3. SEUIL PERCENTILE SUR 24H PASSÉES ──────────────────────
        const windowStart = now - 24 * 3600 * 1000;
        const windowEnd = now;
        let windowValues = resampled
            .filter(p => p.t >= windowStart && p.t <= windowEnd)
            .map(p => p.v);

        if (windowValues.length < 10) {
            windowValues = resampled.map(p => p.v);
        }
        windowValues.sort((a, b) => a - b);

        const PERCENTILE = type === 'peak' ? 80 : 20;
        const idxThreshold = Math.floor((PERCENTILE / 100) * (windowValues.length - 1));
        const threshold = windowValues[idxThreshold];

        // ─── 4. PARAMÈTRES ────────────────────────────────────────────
        const MIN_DURATION_MS = 2 * 3600 * 1000;
        const MAX_DURATION_MS = 24 * 3600 * 1000;
        const GAP_TOLERANCE_MS = 2 * 3600 * 1000;

        // ─── 5. SEGMENTATION ──────────────────────────────────────────
        const segments = [];
        let current = null;

        for (const p of resampled) {
            const isFav = type === 'peak' ? p.v >= threshold : p.v <= threshold;

            if (!isFav) {
                if (current) {
                    segments.push(current);
                    current = null;
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

        // ─── 6. FILTRAGE ET FORMATAGE ─────────────────────────────────
        const episodes = [];

        for (const seg of segments) {
            const duration = seg.endT - seg.startT;
            if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) continue;

            const segValues = seg.points.map(p => p.v);
            const avg = segValues.reduce((a, b) => a + b, 0) / segValues.length;

            episodes.push({
                type,
                avg: Math.round(avg * 100) / 100,
                duration: Math.round(duration / 1000),
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

        // ─── 7. FUSION DES CHEVAUCHEMENTS (même type) ─────────────────
        const merged = [];
        episodes.sort((a, b) => new Date(a.start.d).getTime() - new Date(b.start.d).getTime());

        for (const ep of episodes) {
            const last = merged[merged.length - 1];
            if (last && last.type === ep.type) {
                const lastEnd = new Date(last.end.d).getTime();
                const currStart = new Date(ep.start.d).getTime();
                if (currStart <= lastEnd + GAP_TOLERANCE_MS) {
                    const lastDur = lastEnd - new Date(last.start.d).getTime();
                    const currDur = new Date(ep.end.d).getTime() - currStart;
                    const totalDur = lastDur + currDur;
                    last.avg = Math.round((last.avg * lastDur + ep.avg * currDur) / totalDur * 100) / 100;
                    last.end = ep.end;
                    last.duration = Math.round(totalDur / 1000);
                    continue;
                }
            }
            merged.push(ep);
        }

        return merged;
    },

    // ═════════════════════════════════════════════════════════════════
    //  FONCTIONS DIRECTES
    // ═════════════════════════════════════════════════════════════════

    nextPeak(data, field) {
        const now = this._getNow(data);
        const episodes = this.ExtremeEpisodeDetector(data, field);
        return episodes
            .filter(e => e.type === 'peak' && new Date(e.end.d).getTime() >= now)
            .sort((a, b) => new Date(a.start.d).getTime() - new Date(b.start.d).getTime())[0] || null;
    },

    nextTrough(data, field) {
        const now = this._getNow(data);
        const episodes = this.ExtremeEpisodeDetector(data, field);
        return episodes
            .filter(e => e.type === 'trough' && new Date(e.end.d).getTime() >= now)
            .sort((a, b) => new Date(a.start.d).getTime() - new Date(b.start.d).getTime())[0] || null;
    },

    nextEpisode(data, field) {
        const now = this._getNow(data);
        const episodes = this.ExtremeEpisodeDetector(data, field);
        return episodes
            .filter(e => new Date(e.end.d).getTime() >= now)
            .sort((a, b) => new Date(a.start.d).getTime() - new Date(b.start.d).getTime())[0] || null;
    }
};

/**
 * Route GET /:stationId/integrator/build
 * Calcule les nouvelles valeurs des modèles intégrateurs et les écrit dans le bucket Integrators.
 */
exports.runIntegrator = async (req, res) => {
    const { stationId, modelKey } = req.params;
    const stationConfig = req.stationConfig;

    console.log(`${V.info} [INTEGRATOR] Démarrage du calcul des modèles intégrateurs pour ${stationId}`);

    try {
        const integratorProbes = loadIntegratorProbes();
        let probeKeys = Object.keys(integratorProbes);

        if (modelKey) {
            if (!integratorProbes[modelKey]) {
                return res.status(404).json({
                    success: false,
                    stationId,
                    error: `Le modèle intégrateur '${modelKey}' n'existe pas.`
                });
            }
            probeKeys = [modelKey];
        }

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
                const intervalSeconds = 300; // Math.max(300, Math.round(contextPeriod / 1000));

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
                        console.log(`[INTEGRATOR VM LOG - ${probeKey}]`, ...args);
                        probeLogs.push({ level: 'log', timestamp: new Date().toISOString(), args: args.length === 1 ? args[0] : args });
                    },
                    error: (...args) => {
                        console.error(`[INTEGRATOR VM ERROR - ${probeKey}]`, ...args);
                        probeLogs.push({ level: 'error', timestamp: new Date().toISOString(), args: args.length === 1 ? args[0] : args });
                    },
                    debug: (...args) => {
                        console.debug(`[INTEGRATOR VM DEBUG - ${probeKey}]`, ...args);
                        probeLogs.push({ level: 'debug', timestamp: new Date().toISOString(), args: args.length === 1 ? args[0] : args });
                    },
                    warn: (...args) => {
                        console.warn(`[INTEGRATOR VM WARN - ${probeKey}]`, ...args);
                        probeLogs.push({ level: 'warn', timestamp: new Date().toISOString(), args: args.length === 1 ? args[0] : args });
                    },
                    info: (...args) => {
                        console.info(`[INTEGRATOR VM INFO - ${probeKey}]`, ...args);
                        probeLogs.push({ level: 'info', timestamp: new Date().toISOString(), args: args.length === 1 ? args[0] : args });
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
