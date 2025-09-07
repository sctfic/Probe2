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
router.post('/new', (req, res) => { // http://probe2.lpz.ovh/api/new
    try {
        console.log(param);
        const stationId = req.params.stationId;
        const newConfig = req.body;
        
        console.log(`${V.write} Création d'une nouvelle configuration pour la station ${stationId}`);
        
        // Vérifier si la station existe déjà
        const existingConfig = configManager.loadConfig(stationId);
        if (existingConfig) {
            return res.status(409).json({
                success: false,
                error: `La configuration pour la station ${stationId} existe déjà`
            });
        }
        
        // Validation des champs requis
        if (!newConfig.host || !newConfig.port) {
            return res.status(400).json({
                success: false,
                error: 'Les champs IP et port sont requis'
            });
        }
        
        // Ajouter l'ID à la configuration
        newConfig.id = stationId;
        
        // Sauvegarder la nouvelle configuration
        const success = configManager.saveConfig(stationId, newConfig);
        
        if (success) {
            res.status(201).json({
                success: true,
                message: `Configuration créée avec succès pour la station ${stationId}`,
                stationId: stationId,
                data: newConfig
            });
        } else {
            throw new Error('Échec de la création de la configuration');
        }
    } catch (error) {
        console.error(`${V.error} Erreur lors de la création de la configuration:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


module.exports = router;
