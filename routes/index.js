const express = require('express');
const router = express.Router();

const apiRoutes = require('./apiRoutes');
const stationRoutes = require('./stationRoutes');
const queryDbRoutes = require('./queryDbRoutes');

// Centralisation des routes avec leurs préfixes
router.use('/query', queryDbRoutes);
router.use('/api', apiRoutes);
router.use('/api/station', stationRoutes);

module.exports = router;
