// middleware/stationMiddleware.js
const configManager = require('../services/configManager');
const { wakeUpConsole, sendCommand } = require('../services/vp2NetClient');
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

const talkStationWithLamp = (handler) => {
    return async (req, res) => {
        const stationConfig = req.stationConfig;
        let socketAcquired = false;
        try {
            // await getOrCreateSocket(req, stationConfig);
            const wakeUp = await wakeUpConsole(req, stationConfig, true);
            if (wakeUp === true) {
                await sendCommand(req, stationConfig, `LAMPS 1`, 1200, "<LF><CR>OK<LF><CR>");
                console.log(`${O.yellow} ${stationConfig.id} - Screen ON`);
            }
            socketAcquired = true;
            await handler(req, res); // The handler is now responsible for sending the response
        } catch (error) {
            // If the handler has not already sent a response, do it here.
            if (!res.headersSent) {
                console.error(`${V.error} ${stationConfig.id} - Error in talkStationWithLamp:`, error.message);
                res.status(500).json({
                    success: false,
                    stationId: stationConfig.id,
                    error: error.message
                });
            }
        } finally {
            if (socketAcquired) {
                // Turn off the screen at the end
                await sendCommand(req, stationConfig, `LAMPS 0`, 1200, "<LF><CR>OK<LF><CR>");
                console.log(`${O.black} ${stationConfig.id} - Screen OFF`);
            }
            // Clean up the socket if it exists
            if (req.weatherSocket && !req.weatherSocket.destroyed) {
                req.weatherSocket.destroy();
                console.log(`${V.BlackFlag} Socket manually closed for ${stationConfig.id}`);
            }
        }
    };
};

const talkStationQuickly = (handler) => {
    return async (req, res) => {
        const stationConfig = req.stationConfig;
        try {
            // await wakeUpConsole(req, stationConfig); // empeche le Mock de fonctionner

            // The handler is now responsible for the connection and error handling.
            // This allows the `getCurrentWeather` controller to use its cache on failure.
            await handler(req, res);
        } catch (error) {
            // This block is a safety net if the handler itself has an unhandled error.
            console.error(`${V.error} Unhandled error in talkStationQuickly for ${stationConfig.id}:`, error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    stationId: stationConfig.id,
                    error: error.message
                });
            }
        } finally {
            // The main role of this middleware is now to ensure cleanup.
            if (req.weatherSocket && !req.weatherSocket.destroyed) {
                req.weatherSocket.destroy();
                console.log(`${V.BlackFlag} Socket manually closed for ${stationConfig.id}`);
            }
        }
    };
}

module.exports = {
    loadStationConfig,
    talkStationWithLamp,
    talkStationQuickly
};