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
const os = require('os');

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

exports.getStatus = async (req, res) => { // http://probe.local/api/status
    try {
        console.log(`${V.eye} Récupération du statut complet de l'application`);

        const allConfigs = configManager.loadAllConfigs();

        // Détail des stations avec ping (comme getAllStations)
        const stationPingPromises = Object.keys(allConfigs).map(async (stationId) => {
            const config = allConfigs[stationId];
            let pingTime = 'unreachable!';
            try {
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

        // === Cache pour les métriques système lourdes ===
        // Stocker en mémoire pour éviter les appels répétés à ps
        if (!global.systemMetricsCache) {
            global.systemMetricsCache = {
                lastUpdate: 0,
                data: null,
                ttl: 5000 // 5 secondes de cache
            };
        }

        const getSystemMetrics = async () => {
            const now = Date.now();

            // Retourner le cache si valide
            if (global.systemMetricsCache.data && (now - global.systemMetricsCache.lastUpdate) < global.systemMetricsCache.ttl) {
                return global.systemMetricsCache.data;
            }

            // Sous Windows : retourner des métriques basiques sans exec
            if (process.platform === 'win32') {
                const winMetrics = {
                    cpu: {
                        total: {
                            percent: Math.min(100, Math.round((os.loadavg()[0] / os.cpus().length) * 100)) || 0,
                            loadAverage: { '1min': 0, '5min': 0, '15min': 0 }, // Non dispo sur Windows
                            cores: os.cpus().length
                        },
                        nodejs: 0,
                        nginx: null, // Non disponible sur Windows
                        influxdb: null // Non disponible sur Windows
                    },
                    memory: {
                        total: getTotalMemory(),
                        nodejs: getNodeMemory(),
                        nginx: null,
                        influxdb: null
                    }
                };
                global.systemMetricsCache = { lastUpdate: now, data: winMetrics, ttl: 5000 };
                return winMetrics;
            }

            // Sous Linux : commande légère sans shell interactif
            const metrics = await getLinuxMetrics();
            global.systemMetricsCache = { lastUpdate: now, data: metrics, ttl: 5000 };
            return metrics;
        };

        // Helper mémoire totale
        function getTotalMemory() {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            return {
                total: Math.round(totalMem / 1024 / 1024),
                used: Math.round(usedMem / 1024 / 1024),
                free: Math.round(freeMem / 1024 / 1024),
                percent: Math.round((usedMem / totalMem) * 100)
            };
        }

        // Helper mémoire Node.js
        function getNodeMemory() {
            const mu = process.memoryUsage();
            return {
                heapUsed: Math.round(mu.heapUsed / 1024 / 1024),
                heapTotal: Math.round(mu.heapTotal / 1024 / 1024),
                rss: Math.round(mu.rss / 1024 / 1024),
                external: Math.round(mu.external / 1024 / 1024)
            };
        }

        // Récupération métriques Linux (optimisé)
        const getLinuxMetrics = () => {
            return new Promise((resolve) => {
                // Utiliser spawn au lieu de exec pour plus de contrôle, ou commande directe
                // Option légère : lire /proc directement si disponible, sinon ps optimisé
                const fs = require('fs');

                // Essayer d'abord /proc (plus rapide, pas de subprocess)
                try {
                    const cpuInfo = getCpuFromProc();
                    const memInfo = getMemoryFromProc();

                    if (cpuInfo && memInfo) {
                        resolve({
                            cpu: cpuInfo,
                            memory: memInfo
                        });
                        return;
                    }
                } catch (e) {
                    // Fallback sur ps si /proc échoue
                }

                // Fallback : ps avec options minimales, sans shell
                const { spawn } = require('child_process');
                const ps = spawn('ps', ['-eo', 'comm,pcpu,pmem,rss', '--no-headers']);

                let stdout = '';
                let timeout = setTimeout(() => {
                    ps.kill();
                    resolve(getEmptyMetrics());
                }, 2000); // Timeout 2s max

                ps.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                ps.on('close', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0) {
                        resolve(getEmptyMetrics());
                        return;
                    }

                    const processes = parsePsOutput(stdout);
                    resolve({
                        cpu: {
                            total: getTotalCpuLoad(),
                            nodejs: processes.nodejs.cpu,
                            nginx: processes.nginx.cpu,
                            influxdb: processes.influxdb.cpu
                        },
                        memory: {
                            total: getTotalMemory(),
                            nodejs: {
                                ...getNodeMemory(),
                                system: processes.nodejs.memoryMB,
                                systemPercent: processes.nodejs.memoryPercent
                            },
                            nginx: processes.nginx.memoryMB > 0 ? {
                                memoryMB: processes.nodejs.memoryMB,
                                memoryPercent: processes.nodejs.memoryPercent
                            } : null,
                            influxdb: processes.influxdb.memoryMB > 0 ? {
                                memoryMB: processes.influxdb.memoryMB,
                                memoryPercent: processes.influxdb.memoryPercent
                            } : null
                        }
                    });
                });

                ps.on('error', () => {
                    clearTimeout(timeout);
                    resolve(getEmptyMetrics());
                });
            });
        };

        // Parser sortie ps
        const parsePsOutput = (stdout) => {
            const processes = {
                nodejs: { cpu: 0, memoryPercent: 0, memoryMB: 0 },
                nginx: { cpu: 0, memoryPercent: 0, memoryMB: 0 },
                influxdb: { cpu: 0, memoryPercent: 0, memoryMB: 0 }
            };

            const lines = stdout.trim().split('\n');
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                    const comm = parts[0];
                    const cpu = parseFloat(parts[1]) || 0;
                    const memPercent = parseFloat(parts[2]) || 0;
                    const rss = parseInt(parts[3]) || 0;

                    if (comm.includes('node')) {
                        processes.nodejs.cpu += cpu;
                        processes.nodejs.memoryPercent += memPercent;
                        processes.nodejs.memoryMB += rss / 1024;
                    } else if (comm.includes('nginx')) {
                        processes.nginx.cpu += cpu;
                        processes.nginx.memoryPercent += memPercent;
                        processes.nginx.memoryMB += rss / 1024;
                    } else if (comm.includes('influxd')) {
                        processes.influxdb.cpu += cpu;
                        processes.influxdb.memoryPercent += memPercent;
                        processes.influxdb.memoryMB += rss / 1024;
                    }
                }
            });

            // Arrondir
            Object.keys(processes).forEach(key => {
                processes[key].cpu = Math.round(processes[key].cpu * 100) / 100;
                processes[key].memoryPercent = Math.round(processes[key].memoryPercent * 100) / 100;
                processes[key].memoryMB = Math.round(processes[key].memoryMB);
            });

            return processes;
        };

        // Métriques vides (fallback)
        const getEmptyMetrics = () => ({
            cpu: {
                total: getTotalCpuLoad(),
                nodejs: 0,
                nginx: null,
                influxdb: null
            },
            memory: {
                total: getTotalMemory(),
                nodejs: getNodeMemory(),
                nginx: null,
                influxdb: null
            }
        });

        // CPU total
        const getTotalCpuLoad = () => {
            const loadAvg = os.loadavg();
            const cpuCount = os.cpus().length;
            return {
                percent: Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100)),
                loadAverage: {
                    '1min': Math.round(loadAvg[0] * 100) / 100,
                    '5min': Math.round(loadAvg[1] * 100) / 100,
                    '15min': Math.round(loadAvg[2] * 100) / 100
                },
                cores: cpuCount
            };
        };

        // Lecture /proc/stat pour CPU (Linux only, très rapide)
        const getCpuFromProc = () => {
            try {
                const stat = fs.readFileSync('/proc/stat', 'utf8');
                const cpuLine = stat.split('\n')[0].split(/\s+/).slice(1).map(Number);
                // Calcul simplifié - pourrait être amélioré avec delta
                const idle = cpuLine[3];
                const total = cpuLine.reduce((a, b) => a + b, 0);
                const used = total - idle;
                const percent = Math.round((used / total) * 100);

                return {
                    total: {
                        percent: isNaN(percent) ? 0 : percent,
                        loadAverage: {
                            '1min': Math.round(os.loadavg()[0] * 100) / 100,
                            '5min': Math.round(os.loadavg()[1] * 100) / 100,
                            '15min': Math.round(os.loadavg()[2] * 100) / 100
                        },
                        cores: os.cpus().length
                    },
                    nodejs: 0, // Sera rempli par ps ou laissé à 0
                    nginx: null,
                    influxdb: null
                };
            } catch (e) {
                return null;
            }
        };

        // Lecture /proc/meminfo (Linux only, très rapide)
        const getMemoryFromProc = () => {
            try {
                const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
                const lines = meminfo.split('\n');
                const data = {};
                lines.forEach(line => {
                    const parts = line.split(':');
                    if (parts.length === 2) {
                        data[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
                    }
                });

                const total = data.MemTotal || 0;
                const available = data.MemAvailable || data.MemFree || 0;
                const used = total - available;

                return {
                    total: {
                        total: Math.round(total / 1024),
                        used: Math.round(used / 1024),
                        free: Math.round(available / 1024),
                        percent: Math.round((used / total) * 100)
                    },
                    nodejs: getNodeMemory(),
                    nginx: null,
                    influxdb: null
                };
            } catch (e) {
                return null;
            }
        };

        const metrics = await getSystemMetrics();

        const status = {
            name: 'Probe API',
            description: 'API pour la surveillance de stations météorologiques Davis Vantage Pro 2',
            version: probeVersion,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                memory: metrics.memory,
                cpu: metrics.cpu
            },
            stations: stationsList,
        };

        res.json(status);
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération du statut:`, error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Erreur lors de la récupération du statut',
            message: error.message
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

        const currentConfig = configManager.getConfig(stationId);
        if (!currentConfig) {
            return res.status(404).json({
                success: false,
                error: `Station ${stationId} non trouvée`
            });
        }

        const updatedConfig = { ...currentConfig, ...newSettings, id: stationId };
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
