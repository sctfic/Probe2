// app.js
const express = require('express');
const path = require('path');
const configManager = require('./services/configManager');
const { V } = require('./utils/icons');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware pour parser le JSON
app.use(express.json());

// Middleware pour les logs des requêtes
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${V.arrow_right} [${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Import des routes
const apiRoutes = require('./routes/apiRoutes');
const stationRoutes = require('./routes/stationRoutes');

// Configuration des routes
app.use('/api', apiRoutes);
app.use('/api/station', stationRoutes);

// Route racine
app.get('/', (req, res) => {
    const allConfigs = configManager.loadAllConfigs();
    const stationsList = Object.keys(allConfigs);
    
    res.json({
        message: 'API Probe2 - Surveillance de stations météorologiques VP2',
        version: require('./package.json').version,
        endpoints: {
            info: '/api/info',
            health: '/api/health',
            stations: '/api/stations',
            station: '/api/station/:stationId/*'
        },
        stations: {
            count: stationsList.length,
            configured: stationsList
        },
        documentation: {
            info: 'GET /api/info - Informations sur l\'application',
            health: 'GET /api/health - État de santé de l\'application',
            stations: 'GET /api/stations - Liste toutes les stations configurées',
            stationInfo: 'GET /api/station/:stationId/info - Informations d\'une station',
            weather: 'GET /api/station/:stationId/weather - Données météo actuelles',
            test: 'GET /api/station/:stationId/test - Test de connexion',
            config: 'GET /api/station/:stationId/config - Configuration d\'une station',
            updateConfig: 'PUT /api/station/:stationId/config - Mise à jour de la configuration',
            syncTime: 'POST /api/station/:stationId/sync-time - Synchronisation de l\'heure',
            syncSettings: 'POST /api/station/:stationId/sync-settings - Synchronisation des paramètres'
        }
    });
});

// Middleware de gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route non trouvée',
        path: req.path,
        method: req.method,
        message: 'Consultez la documentation des endpoints disponibles sur /'
    });
});

// Middleware de gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error(`${V.error} Erreur non gérée:`, err);
    res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
    });
});

// Vérification de l'existence du répertoire de configuration au démarrage
const configDir = path.resolve(__dirname, 'config/stations');
console.log(`${V.folder} Répertoire de configuration: ${configDir}`);

// Chargement initial des configurations
const allConfigs = configManager.loadAllConfigs();
const stationsList = Object.keys(allConfigs);

console.log(`${V.satellite} ${stationsList.length} station(s) configurée(s):`);
stationsList.forEach(stationId => {
    const config = allConfigs[stationId];
    console.log(`  ${V.arrow_right} ${stationId} (${config.ip}:${config.port}) - ${config.name || 'Sans nom'}`);
});

// Lance le serveur
app.listen(PORT, () => {
    console.log(`${V.rocket} Serveur Probe2 démarré sur le port ${PORT}`);
    console.log(`${V.info} Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`${V.earth} Accès aux informations: http://localhost:${PORT}/`);
    console.log(`${V.gear} API: http://localhost:${PORT}/api/info`);
    console.log(`${V.satellite} Stations: http://localhost:${PORT}/api/stations`);
    
    if (process.env.watch) {
        console.log(`${V.eye} Watch mode: ${process.env.watch}`);
    }
    if (process.env.ignore_watch) {
        console.log(`${V.ignore} Ignore watch: ${process.env.ignore_watch}`);
    }
});

module.exports = app;
