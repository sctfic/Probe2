// middleware/stationMiddleware.js
const { wakeUpConsole, toggleLamps } = require('../config/vp2NetClient');
const path = require('path');
const allVp2StationConfigs = require(path.resolve(__dirname, '../config/VP2.json'));

/**
 * Middleware pour charger la configuration de la station basée sur l'ID dans l'URL.
 * Attache la configuration à l'objet `req`.
 */
const loadStationConfig = (req, res, next) => {
    const { stationId } = req.params;
    const validStationIds = Object.keys(allVp2StationConfigs);

    if (!stationId) {
        return res.status(400).json({
            error: 'Station ID is missing in the URL. Please provide a station ID.',
            valid_station_ids: validStationIds
        });
    }

    const stationConfig = allVp2StationConfigs[stationId];

    if (!stationConfig) {
        return res.status(404).json({ error: `Station with ID '${stationId}' not found.`, valid_station_ids: validStationIds });
    }
    
    stationConfig.id = stationId;
    req.stationConfig = stationConfig;
    next();
};

/**
 * Higher-order function pour envelopper les opérations sur la station.
 * Gère le réveil de la console, l'allumage/extinction des lampes et la gestion centralisée des erreurs.
 */
const withStationLamps = (handler) => {
    return async (req, res) => {
        const { stationConfig } = req;
        try {
            await wakeUpConsole(stationConfig);
            await toggleLamps(stationConfig, 1);
            const result = await handler(req, res);
            if (result && !res.headersSent) {
                res.json(result);
            }
        } catch (error) {
            console.error(`Erreur dans le handler pour ${req.path}:`, error.message);
            if (!res.headersSent) {
                res.status(500).json({ error: error.message });
            }
        } finally {
            try {
                // await wakeUpConsole(stationConfig);
                // await ensureConnection(stationConfig);
                await toggleLamps(stationConfig, 0);
            } catch (lampError) {
                console.error('Erreur critique lors de l\'extinction des lampes:', lampError.message);
            }
        }
    }
};

module.exports = {
    loadStationConfig,
    withStationLamps
};