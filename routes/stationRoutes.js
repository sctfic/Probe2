// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');
const { loadStationConfig } = require('../middleware/stationMiddleware');


// NEW: Route pour récupérer les conditions météorologiques actuelles (GET)
router.get('/:stationId/currents', loadStationConfig, stationController.getCurrentConditions);

// NEW: Route pour récupérer les paramètres de la station (GET)
router.get('/:stationId/settings', loadStationConfig, stationController.getStationSettings);

// NEW: Route pour récupérer les données d'archive depuis la station
router.get('/:stationId/archives', loadStationConfig, stationController.getArchiveData);
module.exports = router;