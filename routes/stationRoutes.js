// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');
const { loadStationConfig } = require('../middleware/stationMiddleware');

// Nouvelle route de synchronisation
router.get('/:stationId/sync-settings', loadStationConfig, stationController.syncSettings);

// NEW: Route pour récupérer les conditions météorologiques actuelles (GET)
router.get('/:stationId/currents', loadStationConfig, stationController.getCurrentConditions);

// NEW: Route pour récupérer les données d'archive depuis la station
router.get('/:stationId/archives', loadStationConfig, stationController.getArchiveData);
module.exports = router;