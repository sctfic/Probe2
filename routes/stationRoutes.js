// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');

// Route pour définir l'heure de la station (GET)
router.get('/set-time', stationController.setStationTime);

// Route pour définir la localisation de la station (POST)
router.post('/set-location', stationController.setStationLocation);

// Route pour définir le fuseau horaire de la station (POST)
router.post('/set-timezone', stationController.setStationTimezone);

// NEW: Route pour récupérer les conditions météorologiques actuelles (GET)
router.get('/current-conditions', stationController.getCurrentConditions);

// NEW: Route pour récupérer les paramètres de la station (GET)
router.get('/settings', stationController.getStationSettings);

module.exports = router;