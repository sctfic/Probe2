// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const { loadStationConfig, withStationLamps } = require('../middleware/stationMiddleware');
const stationController = require('../controllers/stationController');
const { V } = require('../utils/icons');

// Middleware pour toutes les routes de stations
router.use('/:stationId', loadStationConfig);

// Route pour récupérer les données d'archive depuis la station (GET)
router.get('/:stationId/archives', withStationLamps(async (req, res) => {
    return await stationController.getArchiveData(req, res);
}));
// Routes pour les stations météorologiques
router.get('/:stationId/info', withStationLamps(async (req, res) => {
    return await stationController.getStationInfo(req, res);
}));

router.get('/:stationId/weather', withStationLamps(async (req, res) => {
    return await stationController.getCurrentWeather(req, res);
}));

router.get('/:stationId/datetime', withStationLamps(async (req, res) => {
    return await stationController.getDateTime(req, res);
}));

router.post('/:stationId/sync-time', withStationLamps(async (req, res) => {
    return await stationController.updateTime(req, res);
}));

router.post('/:stationId/sync-settings', withStationLamps(async (req, res) => {
    return await stationController.syncSettings(req, res);
}));

// Route pour tester la connexion à une station
router.get('/:stationId/test', withStationLamps(async (req, res) => {
    const stationConfig = req.stationConfig;
    const { wakeUpConsole } = require('../config/vp2NetClient');
    
    try {
        console.log(`${V.satellite} Test de connexion à la station ${stationConfig.id}`);
        await wakeUpConsole(stationConfig);
        
        return {
            status: 'success',
            message: `Connexion établie avec succès à la station ${stationConfig.id}`,
            station: {
                id: stationConfig.id,
                ip: stationConfig.ip,
                port: stationConfig.port,
                name: stationConfig.name || stationConfig.id
            },
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error(`${V.error} Erreur de connexion à la station ${stationConfig.id}:`, error);
        throw new Error(`Impossible de se connecter à la station: ${error.message}`);
    }
}));

// Route pour obtenir la configuration d'une station
router.get('/:stationId/config', (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.gear} Récupération de la configuration pour la station ${stationConfig.id}`);
        
        res.json({
            success: true,
            stationId: stationConfig.id,
            data: stationConfig
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération de la configuration:`, error);
        res.status(500).json({
            success: false,
            stationId: req.params.stationId,
            error: error.message
        });
    }
});

// Route pour mettre à jour la configuration d'une station
router.put('/:stationId/config', (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        const updates = req.body;
        const configManager = require('../services/configManager');
        
        console.log(`${V.gear} Mise à jour de la configuration pour la station ${stationConfig.id}`);
        
        // Fusionner les modifications avec la configuration existante
        const updatedConfig = { ...stationConfig, ...updates };
        updatedConfig.id = stationConfig.id; // S'assurer que l'ID reste correct
        
        // Sauvegarder la configuration mise à jour
        const success = configManager.saveConfig(stationConfig.id, updatedConfig);
        
        if (success) {
            res.json({
                success: true,
                stationId: stationConfig.id,
                message: 'Configuration mise à jour avec succès',
                data: updatedConfig
            });
        } else {
            throw new Error('Échec de la sauvegarde de la configuration');
        }
    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la configuration:`, error);
        res.status(500).json({
            success: false,
            stationId: req.params.stationId,
            error: error.message
        });
    }
});

module.exports = router;
