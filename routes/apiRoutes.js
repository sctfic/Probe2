// routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');
const authController = require('../controllers/authController');
const updateController = require('../controllers/updateController');
const analyticsController = require('../controllers/analyticsController'); // Nouveau contrôleur
const { isAuthenticated } = require('../middleware/authMiddleware');

// Route pour les informations générales de l'application
// Route pour le health check
router.get('/health', appController.getHealth); // http://probe2.lpz.ovh/api/health

// Routes d'authentification
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/auth/status', authController.getAuthStatus);
router.put('/password', isAuthenticated, authController.changePassword);

// Nouvelle route pour le compteur de visites
router.post('/visit', analyticsController.recordVisit);

// Routes pour la configuration des unités
router.get('/settings', appController.getUnitsSettings); // http://probe2.lpz.ovh/api/settings
router.put('/settings', isAuthenticated, appController.updateUnitsSettings); // http://probe2.lpz.ovh/api/settings

// Routes pour la configuration des sondes additionnelles
router.get('/composite-probes', appController.getcompositeProbesSettings);
router.put('/composite-probes', isAuthenticated, appController.updatecompositeProbesSettings);

// Routes pour la configuration des Modeles Intégrateur
router.get('/integrator-probes', appController.getIntegratorProbesSettings);
router.put('/integrator-probes', isAuthenticated, appController.updateIntegratorProbesSettings);

// Routes pour la configuration d'InfluxDB
router.get('/influxdb', appController.getInfluxDbSettings);
router.put('/influxdb', isAuthenticated, appController.updateInfluxDbSettings);

// Route pour lister toutes les stations configurées
router.get('/stations', appController.getAllStations); // http://probe2.lpz.ovh/api/stations

// Route pour créer une nouvelle configuration de station
router.post('/new', isAuthenticated, appController.createStation); // http://probe2.lpz.ovh/api/new

// Route pour la mise à jour de l'application
router.post('/update', isAuthenticated, updateController.applyUpdate);

module.exports = router;