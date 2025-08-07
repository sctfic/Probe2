// controllers/appController.js
const configManager = require('../services/configManager');
const { V } = require('../utils/icons');

exports.getAppInfo = (req, res) => { // http://probe2.lpz.ovh/api/info
    try {
        console.log(`${V.info} Récupération des informations de l'application`);
        
        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);

        const info = {
            name: 'Probe2 API',
            version: require('../package.json').version,
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

exports.getHealth = (req, res) => {
    try {
        console.log(`${V.heart} Check de santé de l'application`);
        
        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: require('../package.json').version,
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
