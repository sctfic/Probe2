// routes/index.js
const express = require('express');
const router = express.Router();
const infoController = require('../controllers/infoController');
const stationRoutes = require('./stationRoutes'); // Importe les nouvelles routes

// Route pour obtenir les informations de l'application
router.get('/info', infoController.getAppInfo);

// Utilise les routes spécifiques à la station
router.use('/station', stationRoutes);

module.exports = router;