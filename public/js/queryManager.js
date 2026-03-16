// public/js/queryManager.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

/**
 * @file queryManager.js
 * @description A library to manage API requests with caching, retries, mutations, and DOM subscriptions.
 */

class QueryManager {
    constructor(options = {}) {
        this.cache = new Map();
        this.subscriptions = new Map(); // URL -> Set de callbacks
        this.globalSubscribers = new Set(); // Callbacks pour toutes les mises à jour

        this.defaultCacheDuration = options.cacheDuration || 1 * 60 * 1000;
        this.defaultRetries = options.retries || 2;
        this.defaultRetryDelay = options.retryDelay || 1500;

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
                // Notifier les abonnés de l'expiration
                this._notifySubscribers(url, null, 'expired');
            }
            if (cached.status === 'pending' && now - cached.createdAt > 5 * 60 * 1000) {
                console.warn(`[QueryManager] Removing stale pending entry for: ${url}`);
                this.cache.delete(url);
            }
        }
    }

    /**
     * S'abonne aux mises à jour d'une URL spécifique.
     * @param {string} url - L'URL à surveiller.
     * @param {Function} callback - Fonction appelée avec (data, eventType, url).
     * @returns {Function} Fonction pour se désabonner.
     */
    subscribe(url, callback) {
        if (!this.subscriptions.has(url)) {
            this.subscriptions.set(url, new Set());
        }
        this.subscriptions.get(url).add(callback);

        // Retourner la fonction de désabonnement
        return () => this.unsubscribe(url, callback);
    }

    /**
     * Se désabonne d'une URL.
     * @param {string} url 
     * @param {Function} callback 
     */
    unsubscribe(url, callback) {
        const subs = this.subscriptions.get(url);
        if (subs) {
            subs.delete(callback);
            if (subs.size === 0) {
                this.subscriptions.delete(url);
            }
        }
    }

    /**
     * S'abonne à toutes les mises à jour (global).
     * @param {Function} callback - Fonction appelée avec (url, data, eventType).
     * @returns {Function} Fonction pour se désabonner.
     */
    subscribeAll(callback) {
        this.globalSubscribers.add(callback);
        return () => this.globalSubscribers.delete(callback);
    }

    /**
     * Notifie tous les abonnés d'une URL et les abonnés globaux.
     * @private
     */
    _notifySubscribers(url, data, eventType = 'updated') {
        // Notifier les abonnés spécifiques à cette URL
        const specificSubs = this.subscriptions.get(url);
        if (specificSubs) {
            specificSubs.forEach(callback => {
                try {
                    callback(data, eventType, url);
                } catch (err) {
                    console.error(`[QueryManager] Subscriber error for ${url}:`, err);
                }
            });
        }

        // Notifier les abonnés globaux
        this.globalSubscribers.forEach(callback => {
            try {
                callback(url, data, eventType);
            } catch (err) {
                console.error(`[QueryManager] Global subscriber error:`, err);
            }
        });
    }

    /**
     * Invalide les entrées du cache et notifie les abonnés.
     */
    invalidate(patterns) {
        if (!Array.isArray(patterns)) {
            patterns = [patterns];
        }

        for (const pattern of patterns) {
            for (const url of this.cache.keys()) {
                if (url.includes(pattern)) {
                    const cached = this.cache.get(url);
                    this.cache.delete(url);
                    // Notifier que les données sont invalidées
                    this._notifySubscribers(url, cached?.data || null, 'invalidated');
                }
            }
        }
    }

    /**
     * Force un rafraîchissement des données et notifie les abonnés.
     * @param {string} url - L'URL à rafraîchir.
     * @param {object} [options={}] - Options de requête.
     */
    async refetch(url, options = {}) {
        // Supprimer du cache pour forcer un nouveau fetch
        this.cache.delete(url);
        // Relancer la requête
        return this.query(url, options);
    }

    /**
     * Exécute une requête GET avec gestion du cache et des tentatives multiples.
     */
    async query(url, options = {}) {
        const now = Date.now();
        const cached = this.cache.get(url);

        // 1. Vérifier le cache
        if (cached) {
            if (cached.status === 'pending') {
                return cached.promise;
            }
            if (cached.status === 'resolved' && now < cached.expiresAt) {
                // Notifier même si données en cache (pour les nouveaux abonnés)
                this._notifySubscribers(url, cached.data, 'cached');
                return Promise.resolve(cached.data);
            }
            this.cache.delete(url);
        }

        // 2. Lancer la requête avec tentatives multiples
        const retries = options.retries ?? this.defaultRetries;
        const cacheDuration = options.cacheDuration ?? this.defaultCacheDuration;

        const fetchPromise = this._fetchWithRetries(url, { method: 'GET' }, retries)
            .then(apiResponse => {
                this.cache.set(url, {
                    status: 'resolved',
                    expiresAt: Date.now() + cacheDuration,
                    data: apiResponse,
                });
                // NOTIFIER LES ABONNÉS des nouvelles données
                this._notifySubscribers(url, apiResponse, 'updated');
                return apiResponse;
            })
            .catch(error => {
                this.cache.delete(url);
                // NOTIFIER LES ABONNÉS de l'erreur
                this._notifySubscribers(url, null, 'error');
                console.error(`[QueryManager] Request failed, removed from cache: ${url}`);
                throw error;
            });

        // 3. Stocker la promesse en cours
        this.cache.set(url, {
            status: 'pending',
            promise: fetchPromise,
            createdAt: now,
            expiresAt: 0
        });

        return fetchPromise;
    }

    /**
     * Exécute une requête de mutation et notifie les abonnés des patterns invalidés.
     */
    async mutate(url, options) {
        const { invalidatePatterns, ...fetchOptions } = options;

        try {
            const apiResponse = await this._fetchWithRetries(url, fetchOptions, 0);

            // Invalider le cache et notifier
            if (invalidatePatterns) {
                this.invalidate(invalidatePatterns);
            }

            // Notifier spécifiquement cette mutation
            this._notifySubscribers(url, apiResponse, 'mutated');

            return apiResponse;
        } catch (error) {
            this._notifySubscribers(url, null, 'mutation-error');
            console.error(`[QueryManager] Mutation failed for ${url}:`, error);
            throw error;
        }
    }

    /**
     * Fonction interne pour gérer fetch avec tentatives multiples.
     * @private
     */
    async _fetchWithRetries(url, options, retries) {
        for (let i = 0; i <= retries; i++) {
            try {
                const response = await fetch(url, options);

                if (!response.ok) {
                    const errorText = await response.text();
                    if (response.status >= 400 && response.status < 500) {
                        throw new Error(`Erreur HTTP client: ${response.status} ${response.statusText} - ${errorText}`);
                    }
                    throw new Error(`Erreur HTTP serveur: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const apiResponse = await response.json();

                if (!apiResponse.success) {
                    throw new Error(apiResponse.error || apiResponse.message || 'Erreur inconnue de l\'API');
                }

                return apiResponse;

            } catch (error) {
                console.warn(`[QueryManager] Attempt ${i + 1}/${retries + 1} failed for ${url}: ${error.message}`);
                if (i === retries) {
                    throw error;
                }
                const delay = this.defaultRetryDelay * Math.pow(2, i);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    /**
     * Hook React-style pour les composants (si vous utilisez un framework).
     * @param {string} url 
     * @param {Function} onData 
     * @param {Function} onError 
     */
    useQuery(url, onData, onError = null) {
        const unsubscribe = this.subscribe(url, (data, eventType) => {
            if (eventType === 'error' || eventType === 'mutation-error') {
                if (onError) onError(data);
            } else {
                onData(data, eventType);
            }
        });

        // Lancer la requête initiale
        this.query(url).catch(err => {
            if (onError) onError(err);
        });

        return unsubscribe;
    }
}

// Instance singleton
const queryManager = new QueryManager();

// Export pour module ou global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QueryManager, queryManager };
} else {
    window.QueryManager = QueryManager;
    window.queryManager = queryManager;
}