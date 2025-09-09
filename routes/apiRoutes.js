// routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');
const configManager = require('../services/configManager');
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');

// Route pour les informations générales de l'application
router.get('/info', appController.getAppInfo); // http://probe2.lpz.ovh/api/info

// Route pour le health check
router.get('/health', appController.getHealth); // http://probe2.lpz.ovh/api/health

// Route pour la configuration des unités
router.get('/settings', (req, res) => { // http://probe2.lpz.ovh/api/settings
    try {
        console.log(`${V.gear} Récupération de la configuration des unités (Units.json)`);
        const unitsPath = path.join(__dirname, '..', 'config', 'Units.json');
        const unitsConfig = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            settings: unitsConfig
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération de la configuration des unités:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la configuration des unités'
        });
    }
});

// Route pour mettre à jour la configuration des unités
router.put('/settings', (req, res) => { // http://probe2.lpz.ovh/api/settings
    try {
        const newSettings = req.body.settings;
console.log(newSettings.uv);
        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Données de configuration invalides ou manquantes.'
            });
        }

        console.log(`${V.write} Mise à jour de la configuration des unités (Units.json)`);
        const unitsPath = path.join(__dirname, '..', 'config', 'Units.json');
        
        // Écrire le nouveau contenu dans le fichier, joliment formaté
        fs.writeFileSync(unitsPath, JSON.stringify(newSettings, null, 4), 'utf8');

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            message: 'Configuration des unités mise à jour avec succès.'
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la configuration des unités:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la mise à jour de la configuration des unités.'
        });
    }
});

// Route pour lister toutes les stations configurées
router.get('/stations', (req, res) => { // http://probe2.lpz.ovh/api/stations
    try {
        console.log(`${V.book} Récupération de la liste des stations`);
        const allConfigs = configManager.loadAllConfigs();
        
        const stationsList = Object.keys(allConfigs).map(stationId => ({
            id: stationId,
            name: allConfigs[stationId].name || stationId,
            location: allConfigs[stationId].location || 'Non défini',
            host: allConfigs[stationId].host,
            port: allConfigs[stationId].port
        }));
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            stations: stationsList
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération des stations:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la liste des stations'
        });
    }
});

// Route pour créer une nouvelle configuration de station
router.post('/new', appController.createStation); // http://probe2.lpz.ovh/api/new


module.exports = router;
