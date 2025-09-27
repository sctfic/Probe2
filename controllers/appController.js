// controllers/appController.js
const configManager = require('../services/configManager');
const influxdbService = require('../services/influxdbService');
const { V } = require('../utils/icons');
const fs = require('fs');
const path = require('path');
const probeVersion = require('../package.json').version;
const ping = require('ping');

exports.getAppInfo = (req, res) => { // http://probe2.lpz.ovh/api/info
    try {
        console.log(`${V.info} Récupération des informations de l'application`);
        
        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);

        const info = {
            name: 'Probe2 API',
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
        const unitsPath = path.join(__dirname, '..', 'config', 'Units.json');
        const unitsConfig = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
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
        console.log(newSettings.uv);
        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Données de configuration invalides ou manquantes.'
            });
        }

        console.log(`${V.write} Mise à jour de la configuration des unités (Units.json)`);
        const unitsPath = path.join(__dirname, '..', 'config', 'Units.json');
        
        // Écrire le nouveau contenu dans le fichier, joliment formaté
        fs.writeFileSync(unitsPath, JSON.stringify(newSettings, null, 4), 'utf8');

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
        console.log(`${V.gear} Récupération de la configuration InfluxDB (influx.json)`);
        const influxPath = path.join(__dirname, '..', 'config', 'influx.json');
        if (!fs.existsSync(influxPath)) {
            return res.json({ success: true, settings: { url: '', token: '', org: '', bucket: '' } });
        }
        const influxConfig = JSON.parse(fs.readFileSync(influxPath, 'utf8'));

        // Ne pas renvoyer le token au client
        const settingsToSend = { ...influxConfig };
        if (settingsToSend.token) {
            settingsToSend.token = '*********************************************************************';
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            version: probeVersion,
            settings: settingsToSend
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

        console.log(`${V.write} Mise à jour de la configuration InfluxDB (influx.json)`);
        const influxPath = path.join(__dirname, '..', 'config', 'influx.json');
        
        let currentConfig = {};
        if (fs.existsSync(influxPath)) {
            currentConfig = JSON.parse(fs.readFileSync(influxPath, 'utf8'));
        }

        // Préparer la configuration à tester (et potentiellement à sauvegarder)
        const configToTest = { ...currentConfig };
        configToTest.url = newSettings.url;
        configToTest.org = newSettings.org;
        configToTest.bucket = newSettings.bucket;
        // Ne met à jour le token que s'il est explicitement fourni et non masqué
        if (newSettings.token && !/^\*+$/.test(newSettings.token)) {
            configToTest.token = newSettings.token;
        }

        // Tester la connexion avant de sauvegarder
        const connectionTest = await influxdbService.testInfluxConnection(configToTest);
        if (!connectionTest.success) {
            return res.status(400).json({
                success: false,
                error: `La connexion à InfluxDB a échoué. Veuillez vérifier vos paramètres. Détails: ${connectionTest.message}`
            });
        }

        // Si le test réussit, sauvegarder la configuration
        fs.writeFileSync(influxPath, JSON.stringify(configToTest, null, 4), 'utf8');

        res.json({ success: true, message: 'Configuration InfluxDB mise à jour avec succès.' });
    } catch (error) {
        console.error(`${V.error} Erreur lors de la mise à jour de la configuration InfluxDB:`, error);
        res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour de la configuration InfluxDB.' });
    }
};

exports.getcompositeProbesSettings = (req, res) => {
    try {
        console.log(`${V.gear} Récupération de la configuration des sondes additionnelles (compositeProbes.json)`);
        const probesPath = path.join(__dirname, '..', 'config', 'compositeProbes.json');
        const probesConfig = JSON.parse(fs.readFileSync(probesPath, 'utf8'));
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

        const probesPath = path.join(__dirname, '..', 'config', 'compositeProbes.json');
        
        // Écrire le nouveau contenu dans le fichier, joliment formaté
        fs.writeFileSync(probesPath, JSON.stringify(newSettings, null, 4), 'utf8');
        console.log(`${V.write} Fichier compositeProbes.json mis à jour.`);

        // Mettre à jour Units.json avec les nouvelles sondes
        try {
            const unitsPath = path.join(__dirname, '..', 'config', 'Units.json');
            const unitsConfig = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));

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
            fs.writeFileSync(unitsPath, JSON.stringify(unitsConfig, null, 4), 'utf8');
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

exports.getHealth = (req, res) => {
    try {
        console.log(`${V.heart} Check de santé de l'application`);
        
        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
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

exports.createStation = (req, res) => {
    try {
        const newConfig = req.body;
        const allConfigs = configManager.loadAllConfigs();
        console.log(newConfig, allConfigs);
        // il faut netoyer le name pour enlever tous les caractere qui ne passent pas dans les url api
        const stationId =  newConfig.name.replace(/[^a-zA-Z0-9_.-]/g, '');

        // creation de la nouvelle configuration avec stationId base sur le name mais doit etre different de tous les stationId existant sinoon on retourne une ereur
        if (allConfigs[stationId]) {
            return res.status(409).json({ success: false, error: `La configuration pour la station ${stationId} existe déjà, choisiser un autre nom !` });
        }
        
        console.log(`${V.write} Création d'une nouvelle configuration pour la station ${stationId}`);
        
        // Validation des champs requis
        if (!newConfig.host || !newConfig.port) {
            return res.status(400).json({
                success: false,
                error: 'Les champs IP et port sont requis'
            });
        }
        
        // on defini l'object complet
        const newConfigObject = {
            "id": stationId,
            "name": newConfig.name,
            "comment": newConfig.comment,
            "host": newConfig.host,
            "port": newConfig.port,
            "location": "Default, 64290 devLab, FR",
            "longitude": {
                "desired": null,
                "lastReadValue": null
            },
            "latitude": {
                "desired": null,
                "lastReadValue": null
            },
            "altitude": {
                "comment": "in meters",
                "desired": null,
                "lastReadValue": null
            },
            "timezone": {
                "comment": "Time zone detected by GPS position",
                "value": null,
                "desired": null,
                "lastReadValue": null,
                "method": "GPS"
            },
            "AMPMMode": {
                "comment": "0=AM/PM, 1=24h",
                "desired": null,
                "lastReadValue": null
            },
            "dateFormat": {
                "comment": "0=Month/Day, 1=Day/Month",
                "desired": null,
                "lastReadValue": null
            },
            "windCupSize": {
                "comment": "0=Small, 1=Large",
                "desired": null,
                "lastReadValue": null
            },
            "rainCollectorSize": {
                "comment": "0=0.01in, 1=0.2mm, 2=0.1mm",
                "desired": null,
                "lastReadValue": null
            },
            "rainSaisonStart": {
                "comment": "Month for yearly rain reset",
                "desired": null,
                "lastReadValue": null
            },
            "latitudeNorthSouth": {
                "comment": "0=South, 1=North",
                "desired": null,
                "lastReadValue": null
            },
            "longitudeEastWest": {
                "comment": "0=East, 1=West",
                "desired": null,
                "lastReadValue": null
            },
            "archiveInterval": {
                "comment": "Archive period in minutes",
                "desired": null,
                "lastReadValue": null
            },
            "lastArchiveDate": new Date().toISOString(),
            "deltaTimeSeconds": null,
            "path": null
        }
        
        // Sauvegarder la nouvelle configuration
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
