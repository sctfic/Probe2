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
                console.warn(`${V.Warn} Configuration pour ${stationId} non trouvée.`, configPath);
                return null;
            }
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            let config = JSON.parse(rawConfig);
            config.id = stationId;
            config.path = configPath;
            
            // Validation de la structure de config
            if (!this.validateConfig(config)) {
                console.error(`${V.error} Configuration invalide pour ${stationId}`);
                return null;
            }
            
            console.log(`${V.read} Load config ${stationId} (${config.host}:${config.port}) - ${config.name || 'Sans nom'}`);
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
            // config.id = stationId;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            console.log(`${V.database} Configuration pour ${stationId} sauvegardée avec succès.`);
            return true;
        } catch (error) {
            console.error(`${V.error} Erreur de sauvegarde pour ${stationId}:`, error);
            return false;
        }
    }
    autoSaveConfig(config) {
        try {
            fs.writeFileSync(config.path, JSON.stringify(config, null, 4));
            console.log(`${V.database} Configuration pour ${config.id} sauvegardée avec succès. ${V.Check}`);
            return true;
        } catch (error) {
            console.error(`${V.error} Erreur de sauvegarde pour ${config.id}:`, error);
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
        const requiredFields = ['host', 'port'];
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
        
        // Validation d'un nom d'hôte ou d'une adresse IP par un test regex
        /**
         * Valide si une chaîne de caractères est un nom d'hôte valide ou une adresse IP valide (IPv4 ou IPv6).
         * @param {string} input La chaîne à valider.
         * @returns {boolean} Vrai si la chaîne est un nom d'hôte ou une adresse IP valide, faux sinon.
         */
        function isValidHostnameOrIpAddress(input) {
            // Regex pour les noms d'hôtes (RFC 1123, sans underscore et sans commence/fin par un tiret)
            // Permet les lettres, les chiffres et les tirets. Les tirets ne peuvent pas être au début ou à la fin.
            // Permet les sous-domaines séparés par des points. La longueur totale max est généralement 255.
            const hostnameRegex = new RegExp(
            /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])$/
            );
        
            // Regex pour les adresses IPv4 (format xxx.xxx.xxx.xxx où xxx est de 0 à 255)
            const ipv4Regex = new RegExp(
            /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
            );
        
            // Regex pour les adresses IPv6 (simplifiée, car la validation complète est très complexe)
            // Cette regex couvre la plupart des cas courants, y compris les formes abrégées avec ::
            // Pour une validation IPv6 complète et robuste, il est souvent recommandé d'utiliser une bibliothèque dédiée.
            const ipv6Regex = new RegExp(
            /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3,3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3,3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))$/
            );
        
            return hostnameRegex.test(input) || ipv4Regex.test(input) || ipv6Regex.test(input);
        }
        if (!isValidHostnameOrIpAddress(config.host)) {
            console.error(`${V.error} Adresse IP invalide: ${config.host}`);
            return false;
        }
        
        return true;
    }

    deleteConfig(stationId) {
        const configPath = path.join(CONFIG_DIR, `${stationId}.json`);
        try {
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
                console.log(`${V.Check} Configuration pour ${stationId} supprimée avec succès.`);
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