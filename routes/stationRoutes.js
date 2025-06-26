// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');
const { loadStationConfig } = require('../middleware/stationMiddleware');

// Route pour définir l'heure de la station (GET)
// Le middleware loadStationConfig est appelé en premier pour charger la configuration de la station.
router.get('/:stationId/set-time', loadStationConfig, stationController.setStationTime);

// Route pour définir la localisation de la station (POST)
router.post('/:stationId/set-location', loadStationConfig, stationController.setStationLocation);

// Route pour définir le fuseau horaire de la station (POST)
router.post('/:stationId/set-timezone', loadStationConfig, stationController.setStationTimezone);

// NEW: Route pour récupérer les conditions météorologiques actuelles (GET)
router.get('/:stationId/currents', loadStationConfig, stationController.getCurrentConditions);

// NEW: Route pour récupérer les paramètres de la station (GET)
router.get('/:stationId/settings', loadStationConfig, stationController.getStationSettings);

// NEW: Route pour récupérer les données d'archive depuis la station
router.get('/:stationId/archives', loadStationConfig, stationController.getArchiveData);
module.exports = router;