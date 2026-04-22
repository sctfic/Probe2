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
        const collectedData = await runExtenderCollection(stationConfig);
        res.json({ success: true, message: `Collecte des extendeurs terminée pour ${stationId}`, extendersData: collectedData });
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
