const { V } = require('../utils/icons');
const { runExtenderCollection, pingAllExtenders } = require('../services/extenderService');
const influxdbService = require('../services/influxdbService');

/**
 * Middleware de collecte utilisé par le contrôleur principal.
 * Suit la structure req, res, next.
 */
exports.collectExtenders = async (req, res, next) => {
    const { stationId } = req.params;
    const stationConfig = req.stationConfig;

    if (!stationConfig || !stationConfig.extenders) {
        return next();
    }

    console.log(`${V.info} [EXTENDERS] Controller: Déclenchement de la collecte pour la station ${stationId}`);

    try {
        // Appelle la logique de collecte définie dans le service
        await runExtenderCollection(stationConfig);
        res.json({ success: true, message: `Collecte des extendeurs terminée pour ${stationId}` });
    } catch (error) {
        console.error(`${V.error} [EXTENDERS] Controller Erreur:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Route API pour vérifier l'état des extendeurs à la demande.
 */
exports.checkExtendersStatus = async (req, res) => {
    const stationConfig = req.stationConfig;

    if (!stationConfig || !stationConfig.extenders) {
        return res.json({ success: true, extenders: {} });
    }

    try {
        const statuses = await pingAllExtenders(stationConfig);
        res.json({
            success: true,
            extenders: statuses
        });
    } catch (error) {
        console.error(`${V.error} [EXTENDERS] Status check error:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Supprime TOUTES les données InfluxDB des extendeurs pour une station.
 */
exports.deleteAllExtenderData = async (req, res) => {
    const { stationId } = req.params;
    const stationConfig = req.stationConfig;

    // On récupère tous les IDs d'extendeurs configurés pour cette station
    const extenderIds = [];
    if (stationConfig && stationConfig.extenders) {
        for (const type in stationConfig.extenders) {
            stationConfig.extenders[type].forEach(ext => {
                if (ext.id) extenderIds.push(ext.id);
            });
        }
    }

    try {
        // On passe la liste des IDs (ou null si la liste est vide pour supprimer l'ancien tag par défaut)
        const result = await influxdbService.deleteExtenderData(stationId, extenderIds.length > 0 ? extenderIds : null);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteExtenderData = async (req, res) => {
    const { stationId, extenderId } = req.params;
    try {
        // Supprime les données pour cet extendeur spécifique (tag source == extenderId)
        const result = await influxdbService.deleteExtenderData(stationId, extenderId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};