// routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');


// Route pour les informations générales de l'application
// Route pour le health check
router.get('/health', appController.getHealth); // http://probe2.lpz.ovh/api/health

// Routes pour la configuration des unités
router.get('/settings', appController.getUnitsSettings); // http://probe2.lpz.ovh/api/settings
router.put('/settings', appController.updateUnitsSettings); // http://probe2.lpz.ovh/api/settings

// Routes pour la configuration des sondes additionnelles
router.get('/additional-probes', appController.getAdditionalProbesSettings);
router.put('/additional-probes', appController.updateAdditionalProbesSettings);

// Route pour lister toutes les stations configurées
router.get('/stations', appController.getAllStations); // http://probe2.lpz.ovh/api/stations

// Route pour créer une nouvelle configuration de station
router.post('/new', appController.createStation); // http://probe2.lpz.ovh/api/new

module.exports = router;
