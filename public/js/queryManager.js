// public/js/queryManager.js
// Probe\public\js\queryManager.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

/**
 * @file queryManager.js
 * @description A library to manage API requests with caching, retries, and mutations.
 */

class QueryManager {
    constructor(options = {}) {
        this.cache = new Map();
        this.defaultCacheDuration = options.cacheDuration || 1 * 60 * 1000; // 1 minute
        this.defaultRetries = options.retries || 2; // 2 tentatives
        this.defaultRetryDelay = options.retryDelay || 1500; // 1.5 secondes

        // Nettoyage périodique du cache
        setInterval(() => this.cleanCache(), 60 * 1000);
    }

    /**
     * Nettoie le cache en supprimant les entrées expirées.
     */
    cleanCache() {
        const now = Date.now();
        for (const [url, cached] of this.cache.entries()) {
            if (cached.status === 'resolved' && now >= cached.expiresAt) {
                this.cache.delete(url);
                // console.log(`[QueryManager] Cache cleaned for: ${url}`);
            }
            // Supprimer les entrées pending trop anciennes (> 5 min) pour éviter les fuites mémoire
            if (cached.status === 'pending' && now - cached.createdAt > 5 * 60 * 1000) {
                console.warn(`[QueryManager] Removing stale pending entry for: ${url}`);
                this.cache.delete(url);
            }
        }
    }

    /**
     * Invalide les entrées du cache qui correspondent à un ou plusieurs motifs.
     * @param {string|string[]} patterns - Un motif ou un tableau de motifs. Les entrées dont l'URL contient le motif seront supprimées.
     */
    invalidate(patterns) {
        if (!Array.isArray(patterns)) {
            patterns = [patterns];
        }

        for (const pattern of patterns) {
            for (const url of this.cache.keys()) {
                if (url.includes(pattern)) {
                    this.cache.delete(url);
                    // console.log(`[QueryManager] Cache invalidated for URL matching "${pattern}": ${url}`);
                }
            }
        }
    }

    /**
     * Exécute une requête GET avec gestion du cache et des tentatives multiples.
     * @param {string} url - L'URL à interroger.
     * @param {object} [options={}] - Options pour la requête.
     * @param {number} [options.retries] - Nombre de tentatives.
     * @param {number} [options.cacheDuration] - Durée de validité du cache en ms.
     * @returns {Promise<object>} Une promesse qui résout avec la réponse de l'API.
     */
    async query(url, options = {}) {
        const now = Date.now();
        const cached = this.cache.get(url);

        // 1. Vérifier le cache
        if (cached) {
            if (cached.status === 'pending') {
                // console.log(`[QueryManager] Cache HIT (pending) for: ${url}`);
                return cached.promise; // Requête déjà en cours
            }
            if (cached.status === 'resolved' && now < cached.expiresAt) {
                // console.log(`[QueryManager] Cache HIT (resolved) for: ${url}, expires in ${Math.round((cached.expiresAt - now) / 1000)}s`);
                return Promise.resolve(cached.data); // Donnée fraîche du cache
            }
            // Entrée expirée ou invalide, la supprimer
            // console.log(`[QueryManager] Cache entry expired for: ${url}`);
            this.cache.delete(url);
        } else {
            // console.log(`[QueryManager] Cache MISS for: ${url}`);
        }

        // 2. Lancer la requête avec tentatives multiples
        const retries = options.retries ?? this.defaultRetries;
        const cacheDuration = options.cacheDuration ?? this.defaultCacheDuration;

        // Créer la promesse de fetch
        const fetchPromise = this._fetchWithRetries(url, { method: 'GET' }, retries)
            .then(apiResponse => {
                // Mettre à jour le cache avec la réponse
                // console.log(`[QueryManager] Storing in cache for ${cacheDuration}ms: ${url}`);
                this.cache.set(url, {
                    status: 'resolved',
                    expiresAt: Date.now() + cacheDuration,
                    data: apiResponse,
                });
                return apiResponse;
            })
            .catch(error => {
                this.cache.delete(url); // Supprimer du cache en cas d'échec final
                console.error(`[QueryManager] Request failed, removed from cache: ${url}`);
                throw error;
            });

        // 3. Stocker la promesse en cours pour éviter les requêtes parallèles
        //    IMPORTANT: Stocker AVANT de retourner pour prévenir les race conditions
        this.cache.set(url, {
            status: 'pending',
            promise: fetchPromise,
            createdAt: now, // Pour nettoyer les stale pending entries
            expiresAt: 0
        });

        return fetchPromise;
    }

    /**
     * Exécute une requête de mutation (POST, PUT, DELETE) et invalide le cache.
     * @param {string} url - L'URL pour la mutation.
     * @param {object} options - Options de fetch (method, body, headers).
     * @param {string|string[]} [options.invalidatePatterns] - Motifs d'URL à invalider dans le cache après succès.
     * @returns {Promise<object>} Une promesse qui résout avec la réponse de l'API.
     */
    async mutate(url, options) {
        const { invalidatePatterns, ...fetchOptions } = options;

        try {
            const apiResponse = await this._fetchWithRetries(url, fetchOptions, 0); // Pas de retry par défaut pour les mutations

            // Invalider le cache si la mutation réussit
            if (invalidatePatterns) {
                this.invalidate(invalidatePatterns);
            }

            return apiResponse;
        } catch (error) {
            console.error(`[QueryManager] Mutation failed for ${url}:`, error);
            throw error;
        }
    }

    /**
     * Fonction interne pour gérer fetch avec tentatives multiples et backoff exponentiel.
     * @private
     */
    async _fetchWithRetries(url, options, retries) {
        for (let i = 0; i <= retries; i++) {
            try {
                const response = await fetch(url, options);

                if (!response.ok) {
                    const errorText = await response.text();
                    // Ne pas réessayer pour certaines erreurs client (ex: 404 Not Found, 400 Bad Request)
                    if (response.status >= 400 && response.status < 500) {
                        throw new Error(`Erreur HTTP client: ${response.status} ${response.statusText} - ${errorText}`);
                    }
                    // Pour les erreurs serveur, on peut réessayer
                    throw new Error(`Erreur HTTP serveur: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const apiResponse = await response.json();

                if (!apiResponse.success) {
                    throw new Error(apiResponse.error || apiResponse.message || 'Erreur inconnue de l\'API');
                }

                return apiResponse; // Succès, on retourne la réponse

            } catch (error) {
                console.warn(`[QueryManager] Attempt ${i + 1}/${retries + 1} failed for ${url}: ${error.message}`);
                if (i === retries) {
                    throw error; // C'est la dernière tentative, on propage l'erreur
                }
                // Attendre avant la prochaine tentative (backoff)
                const delay = this.defaultRetryDelay * Math.pow(2, i);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }
}

// Exporter une instance unique pour être utilisée comme un singleton dans toute l'application.
const queryManager = new QueryManager();

// Pour la compatibilité avec l'ancien code, on expose la fonction `query` sous l'ancien nom.
const fetchWithCache = (url) => queryManager.query(url);