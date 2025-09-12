// app.js
const express = require('express');
const path = require('path');
const configManager = require('./services/configManager');
const cron = require('node-cron');
const axios = require('axios');
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
            health: {url:'/api/health', method:'GET'}, //http://probe2.lpz.ovh/api/health
            stations: {url:'/api/stations', method:'GET'}, //http://probe2.lpz.ovh/api/stations
            station: {
                info: {url:'/api/station/:stationId/info', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/info
                test: {url:'/api/station/:stationId/test', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/test
                currentConditions: {url:'/api/station/:stationId/current-conditions', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/current-conditions
                additionalConditions: {url:'/api/station/:stationId/additional-conditions/:sensors?', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/additional-conditions
                collect: {url:'/api/station/:stationId/collect', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/collect
                updateDatetime: {url:'/api/station/:stationId/update-datetime', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/update-datetime
                syncSettings: {url:'/api/station/:stationId/sync-settings', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune/sync-settings
                read: {url:'/api/station/:stationId', method:'GET'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune
                modify: {url:'/api/station/:stationId', method:'PUT'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune
                remove: {url:'/api/station/:stationId', method:'DELETE'}, //http://probe2.lpz.ovh/api/station/VP2_Serramoune
            },
            queryDb: {
                // clear: {url:'/query/clear', method:'GET'}, //http://probe2.lpz.ovh/query/clear
                metadata: {url:'/query/:stationId', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune
                range: {url:'/query/:stationId/Range/:sensorRef?', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Range/inTemp
                raw: {url:'/query/:stationId/Raw/:sensorRef', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Raw/inTemp
                raws: {url:'/query/:stationId/Raws/:sensorRefs', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Raws/barometer,inTemp
                windRose: {url:'/query/:stationId/WindRose', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/WindRose
                windVectors: {url:'/query/:stationId/WindVectors', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/WindVectors
                candle: {url:'/query/:stationId/Candle/:sensorRef', method:'GET'}, //http://probe2.lpz.ovh/query/VP2_Serramoune/Candle/barometer
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
    
    // Planification dynamique de la collecte pour chaque station
    console.log(`${V.info} [CRON] Initialisation des tâches de collecte planifiées...`);
    const stations = configManager.listStations();
    console.log(stations);
    stations.forEach((station) => {
        const stationConfig = configManager.loadConfig(station);
        const archiveInterval = stationConfig.archiveInterval?.lastReadValue;

        if (!archiveInterval || typeof archiveInterval !== 'number' || archiveInterval <= 0) {
            console.log(`${V.warning} [CRON] Intervalle d'archivage invalide ou manquant pour la station ${stationConfig.id}. Tâche non planifiée.`);
            return; // Passe à la station suivante
        }

        let cronPattern;

        // const validIntervals = [1, 5, 10, 15, 30, 60, 120];
        switch (archiveInterval) {
            case 10:
                cronPattern = `1-59/10 * * * *`;
                break;
            case 15:
                cronPattern = `1-59/15 * * * *`;
                break;
            case 30:
                cronPattern = `1-59/30 * * * *`;
                break;
            case 60:
                cronPattern = `1 * * * *`; // Toutes les heures décalées de 1 minute
                break;
            case 120:
                cronPattern = `1 */2 * * *`; // Toutes les 2 heures décalées de 1 minute
                break;
            default:
                cronPattern = `1-59/5 * * * *`; // pour 1 et 5 minutes
                break;
        }

        cron.schedule(cronPattern, async () => {
            const url = `http://localhost:${PORT}/api/station/${stationConfig.id}/collect`;
            console.log(`${V.info} [CRON] Exécution de la collecte pour la station ${stationConfig.id}`);
            try {
                const response = await axios.get(url);
                console.log(`${V.Check} [CRON] Collecte pour ${stationConfig.id} réussie. Status: ${response.status}`);
            } catch (error) {
                const errorMessage = error.response ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}` : error.message;
                console.error(`${V.error} [CRON] Erreur lors de la collecte pour ${stationConfig.id}:`, errorMessage);
            }
        });

        console.log(`${V.Check} [CRON] Tâche de collecte planifiée pour la station ${stationConfig.id} avec le pattern: "${cronPattern}".`);
    });
});

module.exports = app;
