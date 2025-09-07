module.exports = {
  apps: [
    {
      name: 'Probe2',
      version: '0.1.31',
      script: 'app.js',
      watch: true,
      ignore_watch: [
        'node_modules',
        './node_modules',
        './config/stations',
        './public',
        './docs',
        './.git',
        './logs/*', // Ajout explicite pour ignorer tout le contenu du répertoire logs
        '*.log',    // Ignorer tous les fichiers .log à la racine
        '**/*.log'  // Ignorer tous les fichiers .log dans tous les sous-répertoires
      ],
      max_memory_restart: '300M',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 2222,
        watch: true,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 2222,
        watch: false // Désactiver watch en production
      },
      log_file: '/var/log/pm2/Probe2/combined.log',
      out_file: '/var/log/pm2/Probe2/out.log',
      error_file: '/var/log/pm2/Probe2/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
  ],
};