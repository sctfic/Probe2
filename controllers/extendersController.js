const { V } = require('../utils/icons');
const { runExtenderCollection } = require('../middleware/extendersMiddleware');

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
        // Appelle la logique de collecte définie dans le middleware (low-level/orchestration)
        await runExtenderCollection(stationConfig);
    } catch (error) {
        console.error(`${V.error} [EXTENDERS] Controller Erreur:`, error.message);
    }

    next();
};