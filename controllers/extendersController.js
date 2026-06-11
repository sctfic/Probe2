const { V } = require('../utils/icons');
const {
    runExtenderCollection,
    pingAllExtenders,
    addExtenderToStation,
    autoDiscoverAndRegisterExtenders,
    updateExtenderInStation,
    updateExtenderPeripheralInStation
} = require('../services/extenderService');
const configManager = require('../services/configManager');
const { writePoints, Point } = require('../services/influxdbService');

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
            updatedConfig = await autoDiscoverAndRegisterExtenders(req.stationConfig, req.headers.host);
        } else {
            // Ajout manuel
            if (!host) {
                return res.status(400).json({ success: false, error: 'L\'adresse IP/host est requise.' });
            }
            updatedConfig = await addExtenderToStation(req.stationConfig, { type, host }, req.headers.host);
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
        const updatedConfig = await updateExtenderInStation(req.stationConfig, { mac, name, description }, req.headers.host);
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

/**
 * Route API PUT /api/whispereye/metrics pour recevoir et stocker la télémétrie de l'extendeur
 */
exports.receiveWhisperEyeMetrics = async (req, res) => {
    try {

        // Pour l'instant on affiche juste le JSON reçu dans les logs.
        console.log(`${V.info} [EXTENDERS] Métriques reçues de l'extendeur :`, req.body);
        res.json({ success: true });

    } catch (error) {
        console.error('[EXTENDERS] Erreur lors de la réception des métriques extendeur :', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Route API DELETE /api/station/:stationId/extenders/:mac/
 * Supprime l'extendeur de la configuration et réinitialise sa clé TOTP / metricsUrl sur le WhisperEye.
 */
exports.deleteExtenderData = async (req, res) => {
    const { stationId, mac } = req.params;
    const stationConfig = req.stationConfig;

    if (!stationId || !mac) {
        return res.status(400).json({ success: false, error: 'L\'identifiant de la station et l\'adresse MAC sont requis.' });
    }

    try {
        const oldExtenders = (stationConfig.extenders && stationConfig.extenders.WhisperEye) || [];
        const extenderIndex = oldExtenders.findIndex(ext => ext.mac.toLowerCase() === mac.toLowerCase());

        if (extenderIndex === -1) {
            return res.status(404).json({ success: false, error: `Extendeur avec la MAC ${mac} introuvable pour cette station.` });
        }

        const ext = oldExtenders[extenderIndex];

        // 1. Envoyer la demande d'effacement TOTP et metricsUrl si possible
        if (ext.apiKey && ext.host) {
            const crypto = require('crypto');
            const axios = require('axios');
            const epoch = Math.floor(Date.now() / 1000);
            const buf = Buffer.alloc(8);
            buf.writeUInt32BE(0, 0);
            buf.writeUInt32BE(epoch, 4);

            const hmac = crypto.createHmac('sha256', ext.apiKey);
            hmac.update(buf);
            const token = hmac.digest('hex');

            console.log(`[EXTENDERS] Extendeur ${ext.name} (MAC: ${ext.mac}) en cours de suppression. Envoi de l'effacement TOTP à http://${ext.host}/api/clear-totp`);

            // On fait l'appel en asynchrone sans bloquer complètement la suppression si l'appareil est hors ligne
            axios.post(`http://${ext.host}/api/clear-totp`, { token }, { timeout: 2000 })
                .then(() => {
                    console.log(`[EXTENDERS] Clé TOTP et URL de métriques effacées sur l'extendeur ${ext.name}`);
                })
                .catch(err => {
                    console.warn(`[EXTENDERS] Impossible d'effacer la clé TOTP/URL sur ${ext.name} (hors ligne) : ${err.message}`);
                });
        }

        // 2. Retirer l'extendeur de la configuration
        oldExtenders.splice(extenderIndex, 1);

        // 3. Sauvegarder la nouvelle configuration
        configManager.saveConfig(stationConfig.id, stationConfig);

        // 4. Mettre à jour la sensor map de façon asynchrone
        const unitsProvider = require('../services/unitsProvider');
        unitsProvider.reloadSensorMap().catch(err => console.error("[SENSOR-MAP] Error during reload:", err));

        res.json({ success: true, settings: stationConfig });
    } catch (error) {
        console.error(`${V.error} [EXTENDERS] Erreur lors de la suppression de l'extendeur :`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

