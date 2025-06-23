module.exports = { // Configuration de PM2
    apps: [
      {
        name: 'Probe2', //  Therapie Facturation
        version: '0.0.1',
        script: 'node app.js',          // Le fichier principal de ton application
        watch: true,                      // Active la surveillance des fichiers
        ignore_watch: ['node_modules', 'docs','.git'],  // Liste des fichiers/répertoires à ignorer
        env: {
          NODE_ENV: 'development',        // Définir l'environnement pour le développement
          PORT: 2222,
        },
        env_production: {
          NODE_ENV: 'production',         // Environnement de production
          PORT: 2222,
        },
      },
    ],
  };
