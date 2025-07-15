// services/configManager.js
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');

const CONFIG_DIR = path.resolve(__dirname, '../config/stations');

class ConfigManager {
    constructor() {
        // Assure que le répertoire existe
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
    }

    loadConfig(stationId) {
        const configPath = path.join(CONFIG_DIR, `${stationId}.json`);
        try {
            if (!fs.existsSync(configPath)) {
                console.warn(`${V.warning} Configuration pour ${stationId} non trouvée.`);
                return null;
            }
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(rawConfig);
            
            // Validation de la structure de config
            if (!this.validateConfig(config)) {
                console.error(`${V.error} Configuration invalide pour ${stationId}`);
                return null;
            }
            
            return config;
        } catch (error) {
            console.error(`${V.error} Erreur de lecture de la configuration pour ${stationId}:`, error);
            return null;
        }
    }

    loadAllConfigs() {
        const allConfigs = {};
        try {
            const files = fs.readdirSync(CONFIG_DIR);
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    const stationId = path.basename(file, '.json');
                    const config = this.loadConfig(stationId);
                    if (config) {
                        config.id = stationId; // S'assurer que l'ID correspond au nom du fichier
                        allConfigs[stationId] = config;
                    }
                }
            });
            return allConfigs;
        } catch (error) {
            console.error(`${V.error} Erreur de lecture de toutes les configurations:`, error);
            return {};
        }
    }

    saveConfig(stationId, config) {
        const configPath = path.join(CONFIG_DIR, `${stationId}.json`);
        try {
            // S'assurer que l'ID correspond au nom du fichier
            config.id = stationId;
            
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            console.log(`${V.check} Configuration pour ${stationId} sauvegardée avec succès.`);
            return true;
        } catch (error) {
            console.error(`${V.error} Erreur de sauvegarde pour ${stationId}:`, error);
            return false;
        }
    }

    updateStationConfig(stationId, updates) {
        const config = this.loadConfig(stationId);
        if (!config) {
            return false;
        }
        
        // Merger les mises à jour
        Object.assign(config, updates);
        
        return this.saveConfig(stationId, config);
    }

    listStations() {
        try {
            const files = fs.readdirSync(CONFIG_DIR);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => path.basename(file, '.json'));
        } catch (error) {
            console.error(`${V.error} Erreur lors de la liste des stations:`, error);
            return [];
        }
    }

    validateConfig(config) {
        // Validation basique de la structure de configuration
        if (!config || typeof config !== 'object') {
            return false;
        }
        
        // Vérification des champs obligatoires
        const requiredFields = ['ip', 'port'];
        for (const field of requiredFields) {
            if (!config.hasOwnProperty(field) || config[field] === null || config[field] === undefined) {
                console.error(`${V.error} Champ obligatoire manquant: ${field}`);
                return false;
            }
        }
        
        // Validation du port
        if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
            console.error(`${V.error} Port invalide: ${config.port}`);
            return false;
        }
        
        // Validation de l'IP (basique)
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(config.ip)) {
            console.error(`${V.error} Adresse IP invalide: ${config.ip}`);
            return false;
        }
        
        return true;
    }

    deleteConfig(stationId) {
        const configPath = path.join(CONFIG_DIR, `${stationId}.json`);
        try {
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
                console.log(`${V.check} Configuration pour ${stationId} supprimée avec succès.`);
                return true;
            } else {
                console.warn(`${V.warning} Configuration pour ${stationId} n'existe pas.`);
                return false;
            }
        } catch (error) {
            console.error(`${V.error} Erreur lors de la suppression pour ${stationId}:`, error);
            return false;
        }
    }
}

module.exports = new ConfigManager(); // Exporte une instance singleton