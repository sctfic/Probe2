// routes/index.js
const express = require('express');
const router = express.Router();
const infoController = require('../controllers/infoController');
const stationRoutes = require('./stationRoutes'); // Importe les nouvelles routes

// Route pour obtenir les informations de l'application
router.get('/info', infoController.getAppInfo);

// Délègue toutes les routes commençant par /station au routeur stationRoutes.
// Par exemple, une requête pour /api/station/vp2_Serramoune/settings sera transmise à stationRoutes pour gérer /vp2_Serramoune/settings.
router.use('/station', stationRoutes);

module.exports = router;