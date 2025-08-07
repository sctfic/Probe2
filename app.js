// app.js
const express = require('express');
const path = require('path');
const configManager = require('./services/configManager');
const { V,O } = require('./utils/icons');
console.log(`${O.green} Starting !`);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware pour parser le JSON
app.use(express.json());

// Middleware pour les logs des requêtes
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`Call API [${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Import des routes
const apiRoutes = require('./routes/apiRoutes');
const stationRoutes = require('./routes/stationRoutes');

// Configuration des routes
app.use('/api', apiRoutes);
app.use('/api/station', stationRoutes);

// Route racine
app.get('/api/', (req, res) => {
    const stationsList = configManager.listStations();
    
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
            info: 'GET /api/info - Informations sur l\'application',// ok
            health: 'GET /api/health - État de santé de l\'application',//ok
            stations: 'GET /api/stations - Liste toutes les stations configurées',//ok
            stationInfo: 'GET /api/station/:stationId/info - Informations d\'une station',//ok
            weather: 'GET /api/station/:stationId/weather - Données météo actuelles', // NOK !!!
            test: 'GET /api/station/:stationId/test - Test de connexion',// ok
            config: 'GET /api/station/:stationId/config - Configuration d\'une station', //NOK !!!
            updateConfig: 'PUT /api/station/:stationId/config - Mise à jour de la configuration',
            syncSettings: 'GET /api/station/:stationId/sync-settings - Synchronisation des paramètres'
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
console.log(`${V.loading} Répertoire de configuration: ${configDir}`);

// Chargement de la liste des configurations
const stationsList = configManager.listStations();

// Lance le serveur
app.listen(PORT, () => {
    console.log(`${V.StartFlag} Serveur Probe2 démarré sur le port ${PORT}`);
    console.log(`${V.info} Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`${V.satellite} Stations: http://localhost:${PORT}/api/stations`);
    
    if (process.env.watch) {
        console.log(`${V.Gyro} Watch mode: ${process.env.watch}`);
    }
    if (process.env.ignore_watch) {
        console.log(`${V.Travaux} Ignore watch: ${process.env.ignore_watch}`);
    }
});

module.exports = app;
