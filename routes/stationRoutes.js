// routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');

// Route pour définir l'heure de la station
router.get('/set-time', stationController.setStationTime);

// Route pour définir la localisation de la station
router.post('/set-location', stationController.setStationLocation);

// Route pour définir le fuseau horaire de la station
router.post('/set-timezone', stationController.setStationTimezone);

module.exports = router;