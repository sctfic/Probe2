// middleware/stationMiddleware.js
const configManager = require('../services/configManager');
const { wakeUpConsole, getOrCreateSocket } = require('../services/vp2NetClient');
const { O, V } = require('../utils/icons');

const loadStationConfig = (req, res, next) => {
    const stationId = req.params.stationId;
    
    if (!stationId) {
        return res.status(400).json({
            success: false,
            error: 'Station ID manquant dans les paramètres'
        });
    }

    try {
        const stationConfig = configManager.loadConfig(stationId);
        
        if (!stationConfig) {
            return res.status(404).json({
                success: false,
                error: `Configuration non trouvée pour la station: ${stationId}`
            });
        }

        // Mise à jour de la propriété id avec le nom du fichier
        stationConfig.id = stationId;
        
        // Validation de la structure de config
        if (!stationConfig.host || !stationConfig.port) {
            return res.status(500).json({
                success: false,
                error: `Configuration invalide pour la station: ${stationId} - IP ou port manquant`
            });
        }

        req.stationConfig = stationConfig;
        next();
    } catch (error) {
        console.error(`${V.error} Erreur lors du chargement de la config pour ${stationId}:`, error.message);
        return res.status(500).json({
            success: false,
            error: `Erreur lors du chargement de la configuration: ${error.message}`
        });
    }
};

const withStationLamps = (handler) => {
    return async (req, res) => {
        const stationConfig = req.stationConfig;
        try {
            await getOrCreateSocket(req, stationConfig);
            try {
                // Réveiller la console avec les écrans allumés
                await wakeUpConsole(req, stationConfig, true);
                
                // Exécuter le handler en lui passant req en premier paramètre
                const result = await handler(req, res);
                
                if (result && typeof result === 'object') {
                    console.log(`${V.info} ${stationConfig.id} - Réponse:`, result);
                    res.json({
                        success: true,
                        stationId: stationConfig.id,
                        timestamp: new Date().toISOString(),
                        data: result
                    });
                }
            } catch (error) {
                console.error(`${V.error} ${stationConfig.id} - Erreur:`, error.message);
                res.status(500).json({
                    success: false,
                    stationId: stationConfig.id,
                    error: error.message
                });
            } finally {
                try {
                    // Éteindre l'écrans à la fin
                    await wakeUpConsole(req, stationConfig, false);
                } catch (error) {
                    console.error(`${V.error} ${stationConfig.id} - Erreur LAMPS OFF: ${error.message}`);
                }
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                stationId: stationConfig.id,
                error: error.message
            });
        } finally {
            // Nettoyer le socket de la requête s'il existe
            if (req.weatherSocket && !req.weatherSocket.destroyed) {
                req.weatherSocket.destroy();
                console.log(`${V.BlackFlag} Socket manually closed for ${stationConfig.id}`);
            }
        }
    };
};

module.exports = {
    loadStationConfig,
    withStationLamps
};