// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const { loadStationConfig, talkStationWithLamp, talkStationQuickly } = require('../middleware/stationMiddleware');
const { isAuthenticated } = require('../middleware/authMiddleware');
const stationController = require('../controllers/stationController');
const { collectExtenders, checkExtendersStatus } = require('../controllers/extendersController');

// Middleware pour toutes les routes de stations
router.use('/:stationId', loadStationConfig); //http://Probe.lpz.ovh/api/station/VP2_Serramoune

// Route pour supprimer une configuration de station
router.delete('/:stationId', isAuthenticated, stationController.deleteStation); //http://Probe.lpz.ovh/api/station/VP2_Serramoune

// Route pour récupérer les données d'archive depuis la station (GET) depuis les dernieres deja recuperees
router.get('/:stationId/collect', collectExtenders, talkStationWithLamp(stationController.getArchiveData)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/collect
router.get('/:stationId/extenders', collectExtenders); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/extenders
router.get('/:stationId/extenders/status', checkExtendersStatus); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/extenders/status

// Route pour récupérer l'intégralité du tampon d'archive de la station 512 pages
router.get('/:stationId/collectAll', talkStationWithLamp(stationController.getArchiveDataAll)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/collectAll

// Routes pour le recap de configs stations météorologiques
router.get('/:stationId/info', stationController.getStationInfo); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/info

// Route pour mettre à jour le datetime de la station
router.get('/:stationId/update-datetime', isAuthenticated, talkStationWithLamp(stationController.updateTime)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/update-datetime

// Route pour synchroniser les configs de la station
router.get('/:stationId/sync-settings', talkStationWithLamp(stationController.syncSettings)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/sync-settings

// Route pour tester la connexion à une station
router.get('/:stationId/test', stationController.testTcpIp); // http://Probe.lpz.ovh/api/station/VP2_Serramoune/test

// Route pour obtenir les conditions actuelles de la station
router.get('/:stationId/current-conditions', talkStationQuickly(stationController.getCurrentWeather)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/current-conditions

// Route pour obtenir la configuration d'une station
router.get('/:stationId', stationController.getStationConfig); //http://Probe.lpz.ovh/api/station/VP2_Serramoune

// Route pour mettre à jour la configuration d'une station
router.put('/:stationId', isAuthenticated, stationController.updateStationConfig);

module.exports = router;