// app.js
const express = require('express');
const path = require('path');

// // Chemin vers ecosystem.config.js
// const ecosystemConfigPath = path.resolve(__dirname, 'ecosystem.config.js');

// // On charge directement le module de configuration
// let ecosystemConfig;
// try {
//   ecosystemConfig = require(ecosystemConfigPath);
// } catch (error) {
//   console.error(`Erreur lors du chargement de ecosystem.config.js: ${error.message}`);
//   // Gérer l'erreur, par exemple, en terminant l'application ou en utilisant des valeurs par défaut
//   process.exit(1);
// }
// Charge la configuration de la station VP2 pour host et port
const vp2ConfigPath = path.resolve(__dirname, 'config/VP2.json');
let vp2StationConfigs;
try {
    vp2StationConfigs = require(vp2ConfigPath); // Charge toutes les configurations de station
} catch (error) {
    console.error(`Erreur lors du chargement de config/VP2.json: ${error.message}`);
    process.exit(1);
}
const app = express();

// Middleware pour parser les corps de requête JSON
app.use(express.json());

// Importe les routes de l'API
const apiRoutes = require('./routes/');

// Utilise les routes de l'API avec un préfixe /api
app.use('/api', apiRoutes);

// Route de base (optionnel, pour vérifier que le serveur est démarré)
app.get('/', (req, res) => {
  res.send('API Probe2 en cours d\'exécution. Accédez à /api/info pour les informations.');
});

const defaultPort = 3000;
const PORT = process.env.PORT || defaultPort;

if (process.env.PORT > 1 && process.env.PORT < 65536) {
    // console.log('< process.env >',process.env);
} else {
    console.warn(`Avertissement: process.env.PORT (${process.env.PORT}) non défini dans les variables d'environnement. Utilisation du port par défaut ${defaultPort}.`);
    console.warn('pm2 reload ecosystem.config.js')
}

// Lance le serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT} (${process.env.watch}, ${process.env.ignore_watch})`); // on affiche les option watch et ignore_watch
  console.log(`Accès aux informations de l'application sur http://localhost:${PORT}/api/info`);
  console.log(`Accès aux contrôles de la station sur http://localhost:${PORT}/api/station/:stationId/*`);
  console.log('Stations VP2 configurées:');
  for (const stationId in vp2StationConfigs) {
      console.log(`- ${stationId} (${vp2StationConfigs[stationId].host}:${vp2StationConfigs[stationId].port})`);
  }
});