// controllers/appController.js
const configManager = require('../services/configManager');
const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const probeVersion = require('../package.json').version;
const ping = require('ping');
const unitsProvider = require('../services/unitsProvider');
const probesProvider = require('../services/probesProvider');
const { Point } = require('@influxdata/influxdb-client');
const dataMaintenanceService = require('../services/dataMaintenanceService');


/**
 * Extrait toutes les routes Express avec leurs chemins complets par parsing de fichiers.
 * @returns {Array<{method: string, path: string, description: string}>} Liste des routes.
 */
function getAllRoutes() {
    const routes = [];
    const rootPath = path.resolve(__dirname, '..');
    const appPath = path.join(rootPath, 'app.js');

    if (!fs.existsSync(appPath)) {
        console.error(`${V.error} app.js non trouvé à: ${appPath}`);
        return [];
    }

    const appContent = fs.readFileSync(appPath, 'utf8');

    // Helper récursif pour traiter les fichiers de routes
    const processRouteFile = (filePath, prefix) => {
        if (!fs.existsSync(filePath)) {
            if (!filePath.endsWith('.js')) filePath += '.js';
            if (!fs.existsSync(filePath)) {
                console.warn(`${V.warning} Fichier de route non trouvé: ${filePath}`);
                return;
            }
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const currentDir = path.dirname(filePath);

        // 1. Trouver les routes directes (router.get, router.post, etc.)
        const routeRegex = /router\.(get|post|put|delete|patch|all)\s*\(\s*['"]([^'"]+)['"]/gi;
        let match;
        while ((match = routeRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const subPath = match[2];
            let fullPath = (prefix + subPath).replace(/\/+/g, '/');
            if (fullPath.length > 1 && fullPath.endsWith('/')) fullPath = fullPath.slice(0, -1);
            if (fullPath === '') fullPath = '/';

            // Extraire la description depuis les commentaires au-dessus
            let description = '';
            const matchIndex = match.index;
            const contentBefore = content.substring(0, matchIndex);
            const linesBefore = contentBefore.split('\n');
            const targetLineIndex = linesBefore.length - 1;

            // Chercher en remontant les lignes
            for (let i = targetLineIndex - 1; i >= 0; i--) {
                const line = lines[i]?.trim();
                if (!line) continue;
                if (line.startsWith('//')) {
                    description = line.replace('//', '').trim();
                    break;
                } else if (line.endsWith('*/')) {
                    let j = i;
                    let block = [];
                    while (j >= 0) {
                        const l = lines[j].trim();
                        block.unshift(l.replace(/\/\*|\*\/|\*/g, '').trim());
                        if (l.startsWith('/*')) break;
                        j--;
                    }
                    description = block.filter(b => b).join(' ');
                    break;
                } else if (line.startsWith('router.')) {
                    // Si on tombe sur une autre route sans commentaire au milieu, on arrête
                    break;
                }
            }

            routes.push({ method, path: fullPath, description });
        }

        // 2. Trouver les sous-routeurs montés
        const requireRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]\.\/([^'"]+)['"]\)/g;
        const requires = {};
        while ((match = requireRegex.exec(content)) !== null) {
            requires[match[1]] = match[2];
        }

        const mountRegex = /\.(?:use|all)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/g;
        while ((match = mountRegex.exec(content)) !== null) {
            const subPrefix = match[1];
            const variableName = match[2].split(',')[0].trim();
            const fileName = requires[variableName];
            if (fileName) {
                const subFilePath = path.join(currentDir, fileName + (fileName.endsWith('.js') ? '' : '.js'));
                processRouteFile(subFilePath, prefix + subPrefix);
            }
        }
    };

    // Dans app.js, on cherche les montages (app.use)
    const appRequireRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
    const appRequires = {};
    let appMatch;
    while ((appMatch = appRequireRegex.exec(appContent)) !== null) {
        appRequires[appMatch[1]] = appMatch[2];
    }

    const appMountRegex = /app\.use\(['"]([^'"]+)['"]\s*,\s*([^)]+)\)/g;
    while ((appMatch = appMountRegex.exec(appContent)) !== null) {
        const prefix = appMatch[1];
        const variableName = appMatch[2].split(',')[0].trim();
        const fileName = appRequires[variableName];
        if (fileName) {
            const filePath = path.join(rootPath, 'routes', fileName + (fileName.endsWith('.js') ? '' : '.js'));
            processRouteFile(filePath, prefix);
        }
    }

    // Routeur central
    const centralMatch = appContent.match(/app\.use\(\s*['"]\/['"]\s*,\s*require\(['"]\.\/routes\/index['"]\)\)/);
    if (centralMatch) {
        processRouteFile(path.join(rootPath, 'routes', 'index.js'), '');
    }

    return routes;
}


/**
 * Récupère dynamiquement tous les points de terminaison enregistrés dans l'application.
 */
exports.getApiEndpoints = (req, res) => {
    try {
        console.log(`${V.info} Génération récursive de la liste des endpoints...`);
        const stationsList = configManager.listStations();
        const allRoutes = getAllRoutes();

        // Trier les routes pour une meilleure organisation
        allRoutes.sort((a, b) => a.path.localeCompare(b.path));

        const endpoints = {};

        allRoutes.forEach(r => {
            // Segmenter le chemin statique (ignorer les params :xxx pour la hiérarchie des clés)
            const segments = r.path.split('/').filter(s => s && !s.startsWith(':'));

            let current = endpoints;
            segments.forEach((seg, index) => {
                if (index === segments.length - 1) {
                    // C'est le dernier segment statique.
                    if (!current[seg]) {
                        current[seg] = [];
                    } else if (!Array.isArray(current[seg])) {
                        // Le segment existait comme parent, on utilise index
                        if (!current[seg].index) current[seg].index = [];

                        if (!current[seg].index.find(e => e.url === r.path && e.method === r.method)) {
                            current[seg].index.push({ url: r.path, method: r.method, description: r.description });
                        }
                        return;
                    }

                    // Ajout si non existant (même URL + méthode)
                    if (!current[seg].find(e => e.url === r.path && e.method === r.method)) {
                        current[seg].push({ url: r.path, method: r.method, description: r.description });
                    }
                } else {
                    // Segment intermédiaire
                    if (!current[seg]) {
                        current[seg] = {};
                    } else if (Array.isArray(current[seg])) {
                        // Devient un parent
                        const existing = current[seg];
                        current[seg] = { index: existing };
                    }
                    current = current[seg];
                }
            });
        });

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            message: 'API Probe - Surveillance de stations météorologiques VP2',
            version: probeVersion,
            endpoints: endpoints,
            stations: stationsList,
        });

    } catch (error) {
        console.error(`${V.error} Erreur dans getApiEndpoints:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getAppInfo = (req, res) => { // http://Probe.lpz.ovh/api/info
    try {
        console.log(`${V.info} Récupération des informations de l'application`);

        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);

        const info = {
            name: 'Probe API',
            version: probeVersion,
            description: 'API pour la surveillance de stations météorologiques Davis Vantage Pro 2',
            status: 'running',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            stations: {
                count: stationsList.length,
                configured: stationsList.map(stationId => ({
                    id: stationId,
                    host: allConfigs[stationId].host,
                    port: allConfigs[stationId].port,
                    name: allConfigs[stationId].name || stationId,
                    location: allConfigs[stationId].location || 'Non défini'
                }))
            },
            endpoints: {
                info: '/api/info',
                health: '/api/health',
                stations: '/api/stations',
                station: '/api/station/:stationId/*',
                config: '/api/station/:stationId/config'
            }
        };

        res.json(info);
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération des informations:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des informations de l\'application'
        });
    }
};

exports.getUnitsSettings = (req, res) => {
    try {
        console.log(`${V.gear} Récupération de la configuration des unités (Units.json)`);
        const unitsConfig = unitsProvider.getUnits();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            settings: unitsConfig
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération de la configuration des unités:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la configuration des unités'
        });
    }
};

exports.updateUnitsSettings = (req, res) => {
    try {
        const newSettings = req.body.settings;
        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Données de configuration invalides ou manquantes.'
            });
        }

        console.log(`${V.write} Mise à jour de la configuration des unités (Units.json)`);
        const success = unitsProvider.setUnits(newSettings);

        if (!success) {
            throw new Error('Erreur lors de la sauvegarde de la configuration des unités.');
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            message: 'Configuration des unités mise à jour avec succès.'
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la configuration des unités:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la mise à jour de la configuration des unités.'
        });
    }
};

exports.getInfluxDbSettings = (req, res) => {
    try {
        console.log(`${V.gear} Récupération de la configuration InfluxDB (via influxdbService)`);
        const influxConfigs = influxdbService.getSettings();

        // Masquer les tokens avant de renvoyer au client
        const configsToSend = JSON.parse(JSON.stringify(influxConfigs));

        // Masquer le token à la racine
        if (configsToSend.token) {
            configsToSend.token = configsToSend.token.substring(0, 6) + '*********************************************************************';
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            settings: configsToSend
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération de la configuration InfluxDB:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la configuration InfluxDB'
        });
    }
};

exports.updateInfluxDbSettings = async (req, res) => {
    try {
        const newSettings = req.body.settings;
        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({ success: false, error: 'Données de configuration invalides.' });
        }

        console.log(`${V.write} Mise à jour de la configuration InfluxDB (via influxdbService)`);

        const currentConfigs = influxdbService.getSettings();
        const updatedConfigs = { ...currentConfigs };

        // 1. Mettre à jour les paramètres globaux (url, org, token)
        if (newSettings.url) updatedConfigs.url = newSettings.url;
        if (newSettings.org) updatedConfigs.org = newSettings.org;

        // Ne mettre à jour le token que s'il n'est pas masqué
        // On vérifie s'il contient des étoiles (signe qu'il n'a pas été modifié côté client)
        if (newSettings.token && !newSettings.token.includes('*')) {
            updatedConfigs.token = newSettings.token;
        }

        // 2. Mettre à jour les buckets
        Object.keys(newSettings).forEach(key => {
            if (key === 'url' || key === 'org' || key === 'token') return;

            if (newSettings[key]) {
                if (!updatedConfigs[key]) updatedConfigs[key] = {};
                if (newSettings[key].bucket) updatedConfigs[key].bucket = newSettings[key].bucket;
                if (newSettings[key].comment) updatedConfigs[key].comment = newSettings[key].comment;
            }
        });


        // Tester la connexion (utiliser les paramètres globaux + le premier bucket configuré)
        const firstBucketKey = Object.keys(updatedConfigs).find(k => k !== 'url' && k !== 'org' && k !== 'token' && updatedConfigs[k] && updatedConfigs[k].bucket);
        if (updatedConfigs.url && updatedConfigs.token && firstBucketKey) {
            const testConfig = {
                url: updatedConfigs.url,
                org: updatedConfigs.org,
                token: updatedConfigs.token,
                bucket: updatedConfigs[firstBucketKey].bucket
            };
            const connectionTest = await influxdbService.testInfluxConnection(testConfig);
            if (!connectionTest.success) {
                return res.status(400).json({
                    success: false,
                    error: `La connexion à InfluxDB a échoué. Détails: ${connectionTest.message}`
                });
            }
        }

        // Sauvegarder et appliquer
        const success = influxdbService.updateSettings(updatedConfigs);

        if (success) {
            res.json({ success: true, message: 'Configuration InfluxDB mise à jour et appliquée avec succès.' });
        } else {
            throw new Error('Erreur lors de la sauvegarde de la configuration InfluxDB.');
        }
    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la configuration InfluxDB:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getcompositeProbesSettings = (req, res) => {
    try {
        console.log(`${V.gear} Récupération de la configuration des sondes additionnelles (compositeProbes.json)`);
        const probesConfig = probesProvider.getProbes();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            settings: probesConfig
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération de la configuration des sondes additionnelles:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la configuration des sondes additionnelles'
        });
    }
};

exports.updatecompositeProbesSettings = (req, res) => {
    try {
        const newSettings = req.body.settings;
        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Données de configuration invalides ou manquantes.'
            });
        }

        const success = probesProvider.setProbes(newSettings);
        if (!success) {
            throw new Error('Erreur lors de la sauvegarde de la configuration des sondes additionnelles.');
        }
        console.log(`${V.write} Fichier compositeProbes.json mis à jour.`);

        // Mettre à jour Units.json avec les nouvelles sondes
        try {
            const unitsConfig = unitsProvider.getUnits();

            const allCompositeProbeKeys = Object.keys(newSettings);

            // 1. Nettoyer les anciennes références de sondes calculées dans Units.json
            for (const measurementKey in unitsConfig) {
                if (unitsConfig[measurementKey].sensors) {
                    unitsConfig[measurementKey].sensors = unitsConfig[measurementKey].sensors.filter(
                        sensorKey => !sensorKey.endsWith('_calc')
                    );
                }
            }

            // 2. Ajouter les nouvelles références
            for (const probeKey of allCompositeProbeKeys) {
                const probeData = newSettings[probeKey];
                const measurementType = probeData.measurement;

                if (measurementType && unitsConfig[measurementType]) {
                    if (!unitsConfig[measurementType].sensors) {
                        unitsConfig[measurementType].sensors = [];
                    }
                    if (!unitsConfig[measurementType].sensors.includes(probeKey)) {
                        unitsConfig[measurementType].sensors.push(probeKey);
                    }
                }
            }
            unitsProvider.setUnits(unitsConfig);
            console.log(`${V.write} Fichier Units.json mis à jour avec les sondes calculées.`);
        } catch (unitsError) {
            console.error(`${V.error} Erreur lors de la mise à jour de Units.json:`, unitsError);
            // Ne pas bloquer la réponse principale pour une erreur sur Units.json
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            message: 'Configuration des sondes additionnelles mise à jour avec succès.'
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la configuration des sondes additionnelles:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la mise à jour de la configuration des sondes additionnelles.'
        });
    }
};

exports.getIntegratorProbesSettings = (req, res) => {
    try {
        console.log(`${V.gear} Récupération de la configuration des Modeles Intégrateur (integratorProbes.json)`);
        const probesPath = path.join(__dirname, '..', 'config', 'integratorProbes.json');
        const probesConfig = JSON.parse(fs.readFileSync(probesPath, 'utf8'));
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            settings: probesConfig
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération de la configuration des Modeles Intégrateur:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la configuration des Modeles Intégrateur'
        });
    }
};

exports.updateIntegratorProbesSettings = (req, res) => {
    try {
        const newSettings = req.body.settings;
        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Données de configuration invalides ou manquantes.'
            });
        }

        const probesPath = path.join(__dirname, '..', 'config', 'integratorProbes.json');

        fs.writeFileSync(probesPath, JSON.stringify(newSettings, null, 4), 'utf8');
        console.log(`${V.write} Fichier integratorProbes.json mis à jour.`);

        try {
            const unitsConfig = unitsProvider.getUnits();
            const allIntegratorProbeKeys = Object.keys(newSettings);

            for (const probeKey of allIntegratorProbeKeys) {
                const probeData = newSettings[probeKey];
                const measurementType = probeData.measurement;

                if (measurementType && unitsConfig[measurementType]) {
                    if (!unitsConfig[measurementType].sensors) {
                        unitsConfig[measurementType].sensors = [];
                    }
                    if (!unitsConfig[measurementType].sensors.includes(probeKey)) {
                        unitsConfig[measurementType].sensors.push(probeKey);
                    }
                }
            }
            unitsProvider.setUnits(unitsConfig);
            console.log(`${V.write} Fichier Units.json mis à jour avec les Modeles Intégrateur.`);
        } catch (unitsError) {
            console.error(`${V.error} Erreur lors de la mise à jour de Units.json:`, unitsError);
        }

        res.json({ success: true, message: 'Configuration des Modeles Intégrateur mise à jour avec succès.' });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la configuration des Modeles Intégrateur:`, error);
        res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour de la configuration des Modeles Intégrateur.' });
    }
};

exports.getAllStations = async (req, res) => {
    try {
        console.log(`${V.book} Récupération de la liste des stations`);
        const allConfigs = configManager.loadAllConfigs();

        const stationPingPromises = Object.keys(allConfigs).map(async (stationId) => {
            const config = allConfigs[stationId];
            let pingTime = 'unreachable!';
            try {
                // Using a short timeout to not block the response for too long
                const pingResult = await ping.promise.probe(config.host, { timeout: 1 });
                if (pingResult.alive) {
                    pingTime = Math.round(pingResult.time);
                }
            } catch (pingError) {
                console.warn(`${V.warning} Ping failed for ${config.host}: ${pingError.message}`);
            }

            return {
                id: stationId,
                name: config.name || stationId,
                location: config.location || 'Non défini',
                host: config.host,
                port: config.port,
                ping: pingTime
            };
        });
        const stationsList = await Promise.all(stationPingPromises);
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            stations: stationsList
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération des stations:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la liste des stations'
        });
    }
};

exports.getStation = (req, res) => {
    try {
        const stationId = req.params.stationId;
        console.log(`${V.gear} Récupération de la configuration de la station ${stationId}`);

        const config = configManager.getConfig(stationId);

        if (!config) {
            return res.status(404).json({
                success: false,
                error: `Station ${stationId} non trouvée`
            });
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            settings: config
        });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération de la station ${req.params.stationId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la configuration de la station'
        });
    }
};

exports.updateStation = (req, res) => {
    try {
        const stationId = req.params.stationId;
        const newSettings = req.body;

        console.log(`${V.write} Mise à jour de la configuration de la station ${stationId}`);

        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Données de configuration invalides.'
            });
        }

        // Charger la config actuelle pour ne pas écraser l'ID par erreur et fusionner proprement
        const currentConfig = configManager.getConfig(stationId);
        if (!currentConfig) {
            return res.status(404).json({
                success: false,
                error: `Station ${stationId} non trouvée`
            });
        }

        // Merge des settings. On s'assure que l'ID ne change pas.
        const updatedConfig = { ...currentConfig, ...newSettings, id: stationId };

        // Sauvegarde via le ConfigManager
        const success = configManager.saveConfig(stationId, updatedConfig);

        if (success) {
            res.json({
                success: true,
                message: `Configuration de la station ${stationId} mise à jour avec succès.`,
                settings: updatedConfig
            });
        } else {
            throw new Error("Erreur lors de l'écriture de la configuration.");
        }

    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la station ${req.params.stationId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la mise à jour de la configuration de la station'
        });
    }
};


exports.getHealth = (req, res) => {
    const { V } = require('../utils/icons');
    const configManager = require('../utils/configManager');
    try {
        console.log(`${V.eye} Check de santé de l'application`);

        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);

        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: probeVersion,
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            stations: {
                total: stationsList.length,
                configured: stationsList
            },
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                external: Math.round(process.memoryUsage().external / 1024 / 1024),
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
            },
            cpu: {
                usage: process.cpuUsage()
            }
        };

        res.json(health);
    } catch (error) {
        console.error(`${V.error} Erreur lors du check de santé:`, error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Erreur lors du check de santé',
            message: error.message
        });
    }
};


exports.exportBucketData = async (req, res) => {
    const { V } = require('../utils/icons');
    const dataMaintenanceService = require('../services/dataMaintenanceService');
    const zlib = require('zlib');
    const { promisify } = require('util');
    const gzip = promisify(zlib.gzip);

    try {
        const { bucketKey } = req.params;
        console.log(`${V.info} Exporting data from bucket: ${bucketKey} (compressed)`);

        const data = await dataMaintenanceService.exportDataToJson(bucketKey);
        const jsonString = JSON.stringify(data, null, 2);
        const buffer = await gzip(jsonString);

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${bucketKey}_export.json.gz"`);
        res.send(buffer);

    } catch (error) {
        console.error(`${V.error} Error exporting bucket data:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
};



exports.importBucketData = async (req, res) => {
    const { V } = require('../utils/icons');
    const dataMaintenanceService = require('../services/dataMaintenanceService');
    const zlib = require('zlib');
    const { promisify } = require('util');
    const gunzip = promisify(zlib.gunzip);

    try {
        const { bucketKey } = req.params;
        let nestedData = req.body;

        if (Buffer.isBuffer(req.body)) {
            console.log(`${V.info} Decompressing Gzip Import payload on Backend...`);
            try {
                const decompressed = await gunzip(req.body);
                nestedData = JSON.parse(decompressed.toString('utf8'));
            } catch (err) {
                throw new Error('Échec de la décompression Gzip : le fichier est corrompu ou invalide.');
            }
        }

        console.log(`${V.info} Importing data to bucket: ${bucketKey}`);

        if (!nestedData) {
            return res.status(400).json({ success: false, error: 'Données invalides ou manquantes.' });
        }

        const count = await dataMaintenanceService.importDataFromJson(bucketKey, nestedData);

        res.json({
            success: true,
            message: `${count} points importés avec succès dans le bucket ${bucketKey}.`,
            count: count
        });

    } catch (error) {
        console.error(`${V.error} Error importing bucket data:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
};


exports.createStation = (req, res) => {
    const { V } = require('../utils/icons');
    const configManager = require('../utils/configManager');

    try {
        const newConfig = req.body;
        const allConfigs = configManager.loadAllConfigs();

        const stationId = newConfig.name.replace(/[^a-zA-Z0-9_.-]/g, '');

        if (allConfigs[stationId]) {
            return res.status(409).json({ success: false, error: `La configuration pour la station ${stationId} existe déjà, choisiser un autre nom !` });
        }

        console.log(`${V.write} Création d'une nouvelle configuration pour la station ${stationId}`);

        if (!newConfig.host || !newConfig.port) {
            return res.status(400).json({
                success: false,
                error: 'Les champs IP et port sont requis'
            });
        }

        const newConfigObject = {
            "id": stationId,
            "name": newConfig.name,
            "comment": newConfig.comment,
            "host": newConfig.host,
            "port": newConfig.port,
            "location": "Default, 64290 devLab, FR",
            "longitude": { "desired": null, "lastReadValue": null },
            "latitude": { "desired": null, "lastReadValue": null },
            "altitude": { "comment": "in meters", "desired": null, "lastReadValue": null },
            "timezone": { "comment": "Time zone detected by GPS position", "value": null, "desired": null, "lastReadValue": null, "method": "GPS" },
            "AMPMMode": { "comment": "0=AM/PM, 1=24h", "desired": null, "lastReadValue": null },
            "dateFormat": { "comment": "0=Month/Day, 1=Day/Month", "desired": null, "lastReadValue": null },
            "windCupSize": { "comment": "0=Small, 1=Large", "desired": null, "lastReadValue": null },
            "rainCollectorSize": { "comment": "0=0.01in, 1=0.2mm, 2=0.1mm", "desired": null, "lastReadValue": null },
            "rainSaisonStart": { "comment": "Month for yearly rain reset", "desired": null, "lastReadValue": null },
            "latitudeNorthSouth": { "comment": "0=South, 1=North", "desired": null, "lastReadValue": null },
            "longitudeEastWest": { "comment": "0=East, 1=West", "desired": null, "lastReadValue": null },
            "archiveInterval": { "comment": "Archive period in minutes", "desired": null, "lastReadValue": null },
            "lastArchiveDate": new Date().toISOString(),
            "collect": { "comment": "collecte des donnees des capteurs locaux (VP2 et autres capteurs)", "value": 5, "enabled": false, "lastRun": "", "msg": "" },
            "forecast": { "comment": "recupere les previsions pour les capteurs standard (toute les heures)", "model": "meteofrance_arome_france", "enabled": false, "lastRun": "", "msg": "" },
            "historical": { "comment": "recupere les previsions pour les capteurs standard (toute les jours a 23h30)", "since": "1900", "enabled": false, "lastRun": "", "msg": "" },
            "deltaTimeSeconds": null,
            "extenders": { "WhisperEye": [], "Venti'Connect": [] }
        };

        const success = configManager.saveConfig(stationId, newConfigObject);

        if (success) {
            res.status(201).json({
                success: true,
                message: `Configuration créée avec succès pour la station ${stationId}`,
                version: probeVersion,
                timestamp: new Date().toISOString(),
                stationId: stationId,
                data: newConfigObject
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
};
