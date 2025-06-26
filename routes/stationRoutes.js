// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');

// Route pour définir l'heure de la station (GET)
// Le middleware loadStationConfig est appelé en premier pour charger la configuration de la station.
router.get('/:stationId/set-time', stationController.loadStationConfig, stationController.setStationTime);

// Route pour définir la localisation de la station (POST)
router.post('/:stationId/set-location', stationController.loadStationConfig, stationController.setStationLocation);

// Route pour définir le fuseau horaire de la station (POST)
router.post('/:stationId/set-timezone', stationController.loadStationConfig, stationController.setStationTimezone);

// NEW: Route pour récupérer les conditions météorologiques actuelles (GET)
router.get('/:stationId/currents', stationController.loadStationConfig, stationController.getCurrentConditions);

// NEW: Route pour récupérer les paramètres de la station (GET)
router.get('/:stationId/settings', stationController.loadStationConfig, stationController.getStationSettings);

// NEW: Route pour récupérer les données d'archive depuis la station
router.get('/:stationId/archives', stationController.loadStationConfig, stationController.getArchiveData);
module.exports = router;