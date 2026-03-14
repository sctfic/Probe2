// routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');
const authController = require('../controllers/authController');
const updateController = require('../controllers/updateController');
const analyticsController = require('../controllers/analyticsController'); // Nouveau contrôleur
const { isAuthenticated } = require('../middleware/authMiddleware');

// Route pour les informations générales de l'application
router.get('/', appController.getApiEndpoints); // http://Probe.lpz.ovh/api/

// Route pour le health check
router.get('/health', appController.getHealth); // http://probe.local/api/health

// connecte l'utilisateur, ouvre une session
router.post('/login', authController.login);
// deconnecte l'utilisateur, ferme la session
router.post('/logout', authController.logout);
// retourne le statut de l'authentification
router.get('/auth/status', authController.getAuthStatus);
// change le mot de passe
router.put('/password', isAuthenticated, authController.changePassword);

// enregistre une visite
router.post('/visit', analyticsController.recordVisit); // http://probe.local/api/visit
// retourne les statistiques de visites
router.get('/stats', analyticsController.getStats); // http://probe.local/api/

// retourne les unités de mesure
router.get('/settings', appController.getUnitsSettings); // http://probe.local/api/settings
// modifie les unités de mesure
router.put('/settings', isAuthenticated, appController.updateUnitsSettings); // http://probe.local/api/settings

// retourne la configuration des sondes composites
router.get('/composite-probes', appController.getcompositeProbesSettings);
// modifie la configuration des sondes composites
router.put('/composite-probes', isAuthenticated, appController.updatecompositeProbesSettings);

// retourne la configuration des Modeles Intégrateur
router.get('/integrator-probes', appController.getIntegratorProbesSettings);
// modifie la configuration des Modeles Intégrateur
router.put('/integrator-probes', isAuthenticated, appController.updateIntegratorProbesSettings);

// retourne la configuration de connexion à InfluxDB
router.get('/influxdb', appController.getInfluxDbSettings);
// modifie la configuration de connexion à InfluxDB
router.put('/influxdb', isAuthenticated, appController.updateInfluxDbSettings); // http://probe.local/api/influxdb

// retourne la liste de toutes les stations configurées
router.get('/stations', appController.getAllStations); // http://Probe.lpz.ovh/api/stations

// crée une nouvelle configuration de station
router.post('/new', isAuthenticated, appController.createStation); // http://Probe.lpz.ovh/api/new

// met à jour l'application, [<!> ne fonctionne pas <!>]
router.post('/update', isAuthenticated, updateController.applyUpdate);

module.exports = router;