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
const queryDbRoutes = require('./routes/queryDbRoutes');

// Configuration des routes
app.use('/api', apiRoutes);
app.use('/api/station', stationRoutes);
app.use('/query', queryDbRoutes);

// Route racine
app.get('/api/', (req, res) => { //http://probe2.lpz.ovh/api/
    const stationsList = configManager.listStations();
    
    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        message: 'API Probe2 - Surveillance de stations météorologiques VP2',
        version: require('./package.json').version,
        endpoints: {
            root: {url:'/api', method:'GET'}, //http://probe2.lpz.ovh/api
            info: {url:'/api/info', method:'GET'}, //http://probe2.lpz.ovh/api/info
            health: {url:'/api/health', method:'GET'}, //http://probe2.lpz.ovh/api/health
            stations: {url:'/api/stations', method:'GET'}, //http://probe2.lpz.ovh/api/stations
            station: {
                info: {url:'/api/station/:stationId/info', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/info
                test: {url:'/api/station/:stationId/test', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/test
                currents: {url:'/api/station/:stationId/current-conditions', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/current-conditions
                collect: {url:'/api/station/:stationId/collect', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/collect
                datetime: {url:'/api/station/:stationId/update-datetime', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/update-datetime
                'syncSettings': {url:'/api/station/:stationId/sync-settings', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/sync-settings
                read: {url:'/api/station/:stationId', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune
                modify: {url:'/api/station/:stationId', method:'PUT'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune
                remove: {url:'/api/station/:stationId', method:'DELETE'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune
                query: {url:'/api/station/:stationId/query?sensorRefs=...&nbrStep=...&grouping=...&startDate=...&endDate=...', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/query
            },
            queryDb: {
                metadata: {url:'/query/:stationId', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune
                range: {url:'/query/:stationId/Range/:sensorRef', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Range/inTemp
                raw: {url:'/query/:stationId/Raw/:sensorRef', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Raw/inTemp
                wind: {url:'/query/:stationId/Wind', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Wind
                rain: {url:'/query/:stationId/Rain', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Rain
                candle: {url:'/query/:stationId/Candle', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Candle
            },
        },
        stations:  stationsList,
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
