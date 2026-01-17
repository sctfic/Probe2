// app.js
const express = require('express');
const path = require('path');
const configManager = require('./services/configManager'); // Gardé pour la route /api/
const cronService = require('./services/cronService');
const { V, O } = require('./utils/icons');
const session = require('express-session');
const crypto = require('crypto');
console.log(`${O.green} Starting !`);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware pour parser le JSON
app.use(express.json());

// Middleware de session (DOIT être avant les routes qui l'utilisent)
app.use(session({
    secret: crypto.randomBytes(64).toString('hex'), // Secret de production, généré aléatoirement
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Mettre à `true` si vous utilisez HTTPS
}));

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
// Géré par apiRoutes.js

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

    // Initialise toutes les tâches cron planifiées au démarrage
    cronService.initializeAllJobs();
});

module.exports = app;
