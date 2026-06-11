const { V } = require('../utils/icons');
const { 
    runExtenderCollection, 
    pingAllExtenders, 
    addExtenderToStation, 
    autoDiscoverAndRegisterExtenders, 
    updateExtenderInStation,
    updateExtenderPeripheralInStation
} = require('../services/extenderService');

/**
 * Route API pour ajouter (ou détecter automatiquement) un extendeur à la station.
 */
exports.addExtender = async (req, res) => {
    const { type, host } = req.body;

    if (!type) {
        return res.status(400).json({ success: false, error: 'Le type d\'extendeur est requis.' });
    }

    try {
        let updatedConfig;
        if (type === 'WhisperEye' && !host) {
            // Détection automatique
            updatedConfig = await autoDiscoverAndRegisterExtenders(req.stationConfig);
        } else {
            // Ajout manuel
            if (!host) {
                return res.status(400).json({ success: false, error: 'L\'adresse IP/host est requise.' });
            }
            updatedConfig = await addExtenderToStation(req.stationConfig, { type, host });
        }
        res.json({ success: true, settings: updatedConfig });
    } catch (error) {
        console.error(`${V.error} [EXTENDERS] Erreur lors de l'ajout/détection :`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Route API pour mettre à jour le nom et la description d'un extendeur.
 */
exports.updateExtender = async (req, res) => {
    const { mac, name, description } = req.body;

    if (!mac || !name) {
        return res.status(400).json({ success: false, error: 'L\'identifiant MAC et le nom sont requis.' });
    }

    try {
        const updatedConfig = await updateExtenderInStation(req.stationConfig, { mac, name, description });
        res.json({ success: true, settings: updatedConfig });
    } catch (error) {
        console.error(`${V.error} [EXTENDERS] Erreur lors de la mise à jour de l'extendeur :`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Route API pour mettre à jour la description d'un capteur ou actionneur d'un extendeur.
 */
exports.updateExtenderPeripheral = async (req, res) => {
    const { mac } = req.params;
    const { id, description } = req.body;

    if (!mac || !id) {
        return res.status(400).json({ success: false, error: 'La MAC de l\'extendeur et l\'identifiant du périphérique sont requis.' });
    }

    try {
        const updatedConfig = await updateExtenderPeripheralInStation(req.stationConfig, mac, id, description);
        res.json({ success: true, settings: updatedConfig });
    } catch (error) {
        console.error(`${V.error} [EXTENDERS] Erreur lors de la mise à jour du périphérique :`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

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
