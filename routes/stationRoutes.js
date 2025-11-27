// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const { loadStationConfig, talkStationWithLamp, talkStationQuickly } = require('../middleware/stationMiddleware');
const { isAuthenticated } = require('../middleware/authMiddleware');
const stationController = require('../controllers/stationController');
// const compositeController = require('../controllers/compositeController');
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

// Route pour obtenir la configuration d'une station
router.get('/:stationId', (req, res) => { //http://probe2.lpz.ovh/api/station/VP2_Serramoune
    try {
        const stationConfig = req.stationConfig;
        console.log(`ℹ️ Récupération de la configuration pour la station ${stationConfig.id}`);
        
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
        
        // Détection des changements dans la configuration CRON
        const cronChanged = stationConfig.cron.enabled !== updates.cron.enabled || stationConfig.cron.value !== updates.cron.value;
        const openMeteoChanged = stationConfig.cron.openMeteo !== updates.cron.openMeteo;
        const forecastChanged = stationConfig.cron.forecast !== updates.cron.forecast || stationConfig.cron.model !== updates.cron.model;

        // Fusionner les modifications avec la configuration existante de manière récursive
        const mergeDeep = (target, source) => {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
            return target;
        };
        const updatedConfig = mergeDeep({ ...stationConfig }, updates);

        updatedConfig.id = stationConfig.id; // S'assurer que l'ID reste correct
        
        if (cronChanged) {
            console.log(`[CRON] Les paramètres de collecte ont changé pour ${stationConfig.id}. Replanification...`);
            cronService.scheduleJobForStation(stationConfig.id, updatedConfig);
        }
        if (openMeteoChanged) {
            console.log(`[CRON] Le paramètre de collecte Open-Meteo a changé pour ${stationConfig.id}. Replanification...`);
            cronService.scheduleOpenMeteoJob(stationConfig.id, updatedConfig);
        }
        if (forecastChanged) {
            console.log(`[CRON] Le paramètre de prévision Open-Meteo a changé pour ${stationConfig.id}. Replanification...`);
            cronService.scheduleOpenMeteoForecastJob(stationConfig.id, updatedConfig);
        }

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