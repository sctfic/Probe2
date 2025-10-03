// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const { loadStationConfig, talkStationWithLamp, talkStationQuickly } = require('../middleware/stationMiddleware');
const { isAuthenticated } = require('../middleware/authMiddleware');
const stationController = require('../controllers/stationController');
const compositeController = require('../controllers/compositeController');
const cronService = require('../services/cronService');
const V = require('../utils/icons');

// Middleware pour toutes les routes de stations
router.use('/:stationId', loadStationConfig);

// Route pour supprimer une configuration de station
router.delete('/:stationId', isAuthenticated, stationController.deleteStation);

// Route pour récupérer les données d'archive depuis la station (GET)
router.get('/:stationId/collect', talkStationWithLamp(stationController.getArchiveData)); //http://probe2.lpz.ovh/api/station/VP2_Serramoune/collect

// Routes pour les stations météorologiques
router.get('/:stationId/info', stationController.getStationInfo); //http://probe2.lpz.ovh/api/station/VP2_Serramoune/info


router.get('/:stationId/update-datetime',isAuthenticated, talkStationWithLamp(stationController.updateTime)); //http://probe2.lpz.ovh/api/station/VP2_Serramoune/update-datetime

router.get('/:stationId/sync-settings', talkStationWithLamp(stationController.syncSettings)); //http://probe2.lpz.ovh/api/station/VP2_Serramoune/sync-settings

// Route pour tester la connexion à une station
router.get('/:stationId/test', stationController.testTcpIp); // http://probe2.lpz.ovh/api/station/VP2_Serramoune/test

router.get('/:stationId/current-conditions', talkStationQuickly(stationController.getCurrentWeather)); //http://probe2.lpz.ovh/api/station/VP2_Serramoune/current-conditions

router.get('/:stationId/composite-conditions', compositeController.getcompositeProbes); //http://probe2.lpz.ovh/api/station/VP2_Serramoune/composite-conditions
router.get('/:stationId/composite-conditions/:sensors', compositeController.getcompositeProbes); //http://probe2.lpz.ovh/api/station/VP2_Serramoune/composite-conditions/:sensors

// Route pour obtenir la configuration d'une station
router.get('/:stationId', (req, res) => { //http://probe2.lpz.ovh/api/station/VP2_Serramoune
    try {
        const stationConfig = req.stationConfig;
        console.log(`${V.info} Récupération de la configuration pour la station ${stationConfig.id}`);
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            stationId: stationConfig.id,
            settings: stationConfig
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
router.put('/:stationId', isAuthenticated, (req, res) => {
    try {
        const stationConfig = req.stationConfig;
        const updates = req.body;
        const configManager = require('../services/configManager');
        
        // console.log(`${V.gear} Mise à jour de la configuration pour la station ${stationConfig.id}`, updates);

        // Si les paramètres cron ont changé, on replanifie la tâche
        const cronSettingsChanged = stationConfig.cron.enabled !== updates.cron.enabled || stationConfig.cron.value !== updates.cron.value;
        if (cronSettingsChanged) {
            console.log(`[CRON] Les paramètres de collecte ont changé pour ${stationConfig.id}. Replanification...`);
            cronService.scheduleJobForStation(stationConfig.id, updates); // updates contient la nouvelle config
        }
        // Fusionner les modifications avec la configuration existante
        const updatedConfig = { ...stationConfig, ...updates };
        updatedConfig.id = stationConfig.id; // S'assurer que l'ID reste correct
        
        // Sauvegarder la configuration mise à jour
        const success = configManager.saveConfig(stationConfig.id, updatedConfig);
        
        if (success) {
            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                stationId: stationConfig.id,
                message: 'Configuration mise à jour avec succès',
                settings: updatedConfig
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
