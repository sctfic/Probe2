// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const { loadStationConfig, talkStationWithLamp, talkStationQuickly } = require('../middleware/stationMiddleware');
const { isAuthenticated } = require('../middleware/authMiddleware');
const stationController = require('../controllers/stationController');
const extendersController = require('../controllers/extendersController');
const integratorController = require('../controllers/integratorController');

// Middleware pour toutes les routes de stations
router.use('/:stationId', loadStationConfig); //http://Probe.lpz.ovh/api/station/VP2_Serramoune

// Supprime une configuration de station
router.delete('/:stationId', isAuthenticated, stationController.deleteStation); //http://Probe.lpz.ovh/api/station/VP2_Serramoune

// Collecte les données d'archive depuis la station depuis les dernieres data deja recuperees
router.get('/:stationId/collect', talkStationWithLamp(stationController.getArchiveData)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/collect

// Collecte les données des extenders depuis la station
router.get('/:stationId/extenders', extendersController.collectExtenders); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/extenders

// Ajoute un nouvel extender à la station
router.post('/:stationId/extenders', isAuthenticated, extendersController.addExtender);

// Met à jour les propriétés (nom, description) d'un extender
router.put('/:stationId/extenders', isAuthenticated, extendersController.updateExtender);

// Met à jour la description d'un périphérique (capteur/actionneur) d'un extender
router.put('/:stationId/extenders/:mac/peripherals', isAuthenticated, extendersController.updateExtenderPeripheral);

// Calcule les modèles intégrateurs pour la station
router.get('/:stationId/integrator/build', integratorController.runIntegrator); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/integrator/build

// Vérifie le statut (avaiblité) des extenders par un appel api
router.get('/:stationId/extenders/status', extendersController.checkExtendersStatus); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/extenders/status

// Collecte l'intégralité du tampon d'archive de la station 512 pages
router.get('/:stationId/collectAll', talkStationWithLamp(stationController.getArchiveDataAll)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/collectAll

// Recap court des configs stations météorologiques
router.get('/:stationId/info', stationController.getStationInfo); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/info

// Met à jour le datetime de la station
router.get('/:stationId/update-datetime', isAuthenticated, talkStationWithLamp(stationController.updateTime)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/update-datetime

// Synchronise les configs de la station
router.get('/:stationId/sync-settings', talkStationWithLamp(stationController.syncSettings)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/sync-settings

// Test la connexion à une station
router.get('/:stationId/test', stationController.testTcpIp); // http://Probe.lpz.ovh/api/station/VP2_Serramoune/test

// Collecte les conditions actuelles de la station
router.get('/:stationId/current-conditions', talkStationQuickly(stationController.getCurrentWeather)); //http://Probe.lpz.ovh/api/station/VP2_Serramoune/current-conditions

// retourne la conf d'une station depuis le json
router.get('/:stationId', stationController.getStationConfig); //http://Probe.lpz.ovh/api/station/VP2_Serramoune

// Met à jour la conf d'une station dans le json et synchronise avec la station
router.put('/:stationId', isAuthenticated, stationController.updateStationConfig);

module.exports = router;