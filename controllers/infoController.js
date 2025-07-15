// controllers/infoController.js
const fs = require('fs');
const path = require('path');
const configManager = require('../services/configManager');
const { V } = require('../utils/icons');

const packageJson = require('../package.json');

exports.getInfo = (req, res) => {
    try {
        // Charger toutes les configurations de stations
        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);
        
        console.log(`${V.info} Demande d'informations sur l'application`);
        
        const info = {
            name: packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            author: packageJson.author,
            license: packageJson.license,
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
            platform: process.platform,
            architecture: process.arch,
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
            stations: {
                count: stationsList.length,
                list: stationsList,
                configurations: Object.keys(allConfigs).map(stationId => ({
                    id: stationId,
                    ip: allConfigs[stationId].ip,
                    port: allConfigs[stationId].port,
                    name: allConfigs[stationId].name || stationId,
                    location: allConfigs[stationId].location || 'Non défini'
                }))
            },
            endpoints: {
                info: '/api/info',
                stations: '/api/station/:stationId/*',
                config: '/api/config'
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
        const allConfigs = configManager.loadAllConfigs();
        const stationsList = Object.keys(allConfigs);
        
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            stations: {
                total: stationsList.length,
                configured: stationsList
            },
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            }
        };

        res.json(health);
    } catch (error) {
        console.error(`${V.error} Erreur lors du check de santé:`, error);
        res.status(500).json({
            status: 'error',
            error: 'Erreur lors du check de santé'
        });
    }
};
