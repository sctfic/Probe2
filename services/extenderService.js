const axios = require('axios');
const crypto = require('crypto');
const os = require('os');
const influxdbService = require('./influxdbService');
const { V } = require('../utils/icons');
const configManager = require('./configManager');
const WhisperEyeService = require('./WhisperEyeService');

/**
 * Helper to list all local non-internal IPv4 subnets
 */
function getLocalSubnets() {
    const interfaces = os.networkInterfaces();
    const subnets = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.internal || net.family !== 'IPv4') continue;
            const parts = net.address.split('.');
            if (parts.length === 4) {
                const prefix = parts.slice(0, 3).join('.');
                subnets.push(prefix);
            }
        }
    }
    return [...new Set(subnets)];
}

/**
 * Returns a unique name (truncated to 16 chars) across all stations.
 * Increments suffix if name already exists.
 */
function getUniqueExtenderName(proposedName, excludeMac = null) {
    let cleanName = proposedName.trim().substring(0, 16);
    if (!cleanName) cleanName = 'WE';

    const allConfigs = configManager.loadAllConfigs();
    const existingNames = new Set();
    for (const stationId of Object.keys(allConfigs)) {
        const cfg = allConfigs[stationId];
        if (cfg.extenders && cfg.extenders.WhisperEye) {
            cfg.extenders.WhisperEye.forEach(ext => {
                if (excludeMac && ext.mac === excludeMac) return;
                existingNames.add(ext.name.toLowerCase());
            });
        }
    }

    if (!existingNames.has(cleanName.toLowerCase())) {
        return cleanName;
    }

    let counter = 1;
    while (true) {
        const suffix = `-${counter}`;
        const allowedLen = 16 - suffix.length;
        const candidate = cleanName.substring(0, allowedLen) + suffix;
        if (!existingNames.has(candidate.toLowerCase())) {
            return candidate;
        }
        counter++;
    }
}

/**
 * Subnet HTTP Ping scanning logic. Ping IP on port 80 at /api/capacity.
 */
async function scanSubnet(prefix, knownIps) {
    const ips = [];
    for (let i = 1; i <= 254; i++) {
        const ip = `${prefix}.${i}`;
        if (!knownIps.has(ip)) {
            ips.push(ip);
        }
    }

    const discovered = [];
    const batchSize = 40;
    for (let i = 0; i < ips.length; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        const promises = batch.map(async (ip) => {
            try {
                const res = await axios.get(`http://${ip}/api/capacity`, { timeout: 300 });
                if (res.data && res.data.mac) {
                    console.log(`[EXTENDERS] WhisperEye détecté à l'adresse IP : ${ip} (MAC: ${res.data.mac})`);
                    return {
                        host: ip,
                        mac: res.data.mac,
                        name: res.data.name || '',
                        description: res.data.description || '',
                        sensors: res.data.sensors || [],
                        actuators: res.data.actuators || []
                    };
                }
            } catch (err) {
                // Offline or not a WhisperEye
            }
            return null;
        });

        const results = await Promise.all(promises);
        discovered.push(...results.filter(r => r !== null));
    }
    return discovered;
}

/**
 * Scan all subnets and register discovered WhisperEyes not already registered.
 */
async function autoDiscoverAndRegisterExtenders(stationConfig) {
    const knownIps = new Set();
    const existingMacs = new Set();

    if (stationConfig.extenders && stationConfig.extenders.WhisperEye) {
        stationConfig.extenders.WhisperEye.forEach(ext => {
            if (ext.host) knownIps.add(ext.host);
            if (ext.mac) existingMacs.add(ext.mac.toLowerCase());
        });
    }

    const subnets = getLocalSubnets();
    const allDiscovered = [];
    for (const prefix of subnets) {
        console.log(`[EXTENDERS] Balayage du sous-réseau ${prefix}.0/24...`);
        const found = await scanSubnet(prefix, knownIps);
        allDiscovered.push(...found);
    }

    let addedCount = 0;
    for (const dev of allDiscovered) {
        const macLower = dev.mac.toLowerCase();
        if (existingMacs.has(macLower)) {
            continue;
        }

        const apiKey = crypto.randomBytes(32).toString('hex');
        const uniqueName = getUniqueExtenderName(dev.name || 'WE', dev.mac);

        try {
            console.log(`[EXTENDERS] Envoi de la clé TOTP à l'extendeur à l'adresse http://${dev.host}`);
            await axios.post(`http://${dev.host}/api/config`, {
                wifi_ssid: null,
                wifi_psk: null,
                update_url: null,
                update_interval: null,
                apply_only: true,
                auto_update: null,
                totp_secret: apiKey,
                ext_name: uniqueName,
                ext_desc: dev.description
            }, { timeout: 3000 });
        } catch (error) {
            console.error(`[EXTENDERS] Échec de la négociation TOTP avec l'extendeur ${dev.host}:`, error.message);
            continue;
        }

        const newExt = {
            mac: dev.mac,
            name: uniqueName,
            host: dev.host,
            description: dev.description || 'WhisperEye Extender',
            apiKey: apiKey,
            available: true,
            sensors: dev.sensors || [],
            actuators: dev.actuators || []
        };

        if (!stationConfig.extenders) {
            stationConfig.extenders = {};
        }
        if (!stationConfig.extenders.WhisperEye) {
            stationConfig.extenders.WhisperEye = [];
        }
        stationConfig.extenders.WhisperEye.push(newExt);
        existingMacs.add(macLower);
        addedCount++;
    }

    if (addedCount > 0) {
        configManager.saveConfig(stationConfig.id, stationConfig);
    }

    return stationConfig;
}

/**
 * Logique de collecte pour les périphériques WhisperEye (API json /Currents)
 */
async function collectWhisperEye(extender, stationId, points) {
    try {
        console.log(`${V.package} [EXTENDERS] Collecte WhisperEye ${extender.name}`);
        const data = await WhisperEyeService.fetchWhisperEyeCurrents(extender.host);
        if (data) {
            extender.available = true;
            console.log(`${V.Check} [EXTENDERS] Données JSON récupérées pour ${extender.name}`);
            return { mac: extender.mac, name: extender.name, type: "WhisperEye", data };
        }
    } catch (error) {
        extender.available = false;
        console.error(`${V.error} [EXTENDERS] Erreur WhisperEye ${extender.name}:`, error.message);
    }
    return null;
}

/**
 * Logique principale de collecte (Orchestrateur)
 */
async function runExtenderCollection(stationConfig) {
    const stationId = stationConfig.id;
    const whisperEyes = (stationConfig.extenders && stationConfig.extenders.WhisperEye) || [];
    const points = [];

    const promises = whisperEyes.map(extender => collectWhisperEye(extender, stationId, points));
    if (promises.length === 0) return [];

    const results = await Promise.all(promises);
    const collectedData = results.filter(r => r !== null);

    return collectedData;
}

/**
 * Ping all WhisperEye extenders to query their capacity and refresh configurations
 */
async function pingAllExtenders(stationConfig) {
    const whisperEyes = (stationConfig.extenders && stationConfig.extenders.WhisperEye) || [];

    const promises = whisperEyes.map(async (extender) => {
        try {
            const data = await WhisperEyeService.fetchWhisperEyeCapacity(extender.host);
            if (data) {
                extender.available = true;
                extender.sensors = data.sensors || [];
                extender.actuators = data.actuators || [];
                if (data.mac) extender.mac = data.mac;
                if (data.name) extender.name = data.name;
                if (data.description) extender.description = data.description;
            } else {
                extender.available = false;
            }
        } catch (error) {
            extender.available = false;
        }
    });

    await Promise.all(promises);

    configManager.saveConfig(stationConfig.id, stationConfig);
    return stationConfig.extenders;
}

/**
 * Manually add an extender by targeting its host IP
 */
async function addExtenderToStation(stationConfig, { type, host }) {
    if (type !== 'WhisperEye') {
        throw new Error(`Le type ${type} n'est pas supporté (Venti'Connect est déprécié).`);
    }

    let capacity;
    try {
        console.log(`[EXTENDERS] Récupération de la capacité de l'extendeur à l'adresse http://${host}`);
        capacity = await WhisperEyeService.fetchWhisperEyeCapacity(host);
    } catch (error) {
        console.error(`[EXTENDERS] Échec de la récupération de la capacité sur ${host}:`, error.message);
        throw new Error(`Impossible de récupérer les propriétés de l'extendeur WhisperEye à l'adresse ${host}.`);
    }

    if (!capacity || !capacity.mac) {
        throw new Error(`L'extendeur à l'adresse ${host} n'a pas renvoyé d'adresse MAC.`);
    }

    const mac = capacity.mac;
    const whisperEyes = (stationConfig.extenders && stationConfig.extenders.WhisperEye) || [];
    const exists = whisperEyes.some(ext => ext.mac.toLowerCase() === mac.toLowerCase());
    if (exists) {
        throw new Error(`Cet extendeur est déjà présent sous le nom "${capacity.name}"`);
    }

    const uniqueName = getUniqueExtenderName(capacity.name || 'WE', mac);
    const apiKey = crypto.randomBytes(32).toString('hex');

    try {
        console.log(`[EXTENDERS] Envoi de la clé TOTP à l'extendeur à l'adresse http://${host}`);
        await axios.post(`http://${host}/api/config`, {
            wifi_ssid: null,
            wifi_psk: null,
            update_url: null,
            update_interval: null,
            apply_only: true,
            auto_update: null,
            totp_secret: apiKey,
            ext_name: uniqueName,
            ext_desc: capacity.description || ''
        }, { timeout: 3000 });
    } catch (error) {
        console.error(`[EXTENDERS] Échec de la négociation TOTP avec l'extendeur à l'adresse ${host}:`, error.message);
        if (error.response && error.response.data) {
            const serverMsg = typeof error.response.data === 'string'
                ? error.response.data
                : error.response.data.toString();
            throw new Error(`Erreur renvoyée par l'extendeur WhisperEye : ${serverMsg}`);
        }
        throw new Error(`Impossible de joindre l'extendeur WhisperEye à l'adresse ${host} pour lui fournir la clé TOTP.`);
    }

    const newExt = {
        mac: mac,
        name: uniqueName,
        host: host,
        description: capacity.description || 'WhisperEye Extender',
        apiKey: apiKey,
        available: true,
        sensors: capacity.sensors || [],
        actuators: capacity.actuators || []
    };

    if (!stationConfig.extenders) {
        stationConfig.extenders = {};
    }
    if (!stationConfig.extenders.WhisperEye) {
        stationConfig.extenders.WhisperEye = [];
    }
    stationConfig.extenders.WhisperEye.push(newExt);

    configManager.saveConfig(stationConfig.id, stationConfig);
    return stationConfig;
}

/**
 * Update extender name and description on both local config and ESP32 NVS
 */
async function updateExtenderInStation(stationConfig, { mac, name, description }) {
    if (!stationConfig.extenders || !stationConfig.extenders.WhisperEye) {
        throw new Error(`Aucun extendeur configuré pour cette station.`);
    }

    const extender = stationConfig.extenders.WhisperEye.find(ext => ext.mac === mac);
    if (!extender) {
        throw new Error(`Extendeur avec l'identifiant MAC ${mac} non trouvé.`);
    }

    const cleanName = name.trim().substring(0, 16);
    const uniqueName = getUniqueExtenderName(cleanName, mac);
    if (uniqueName.toLowerCase() !== cleanName.toLowerCase()) {
        throw new Error(`Le nom "${name}" n'est pas unique ou valide.`);
    }

    try {
        console.log(`[EXTENDERS] Mise à jour de la configuration NVS sur le WhisperEye à l'adresse http://${extender.host}`);
        await axios.post(`http://${extender.host}/api/config`, {
            wifi_ssid: null,
            wifi_psk: null,
            update_url: null,
            update_interval: null,
            apply_only: true,
            auto_update: null,
            totp_secret: extender.apiKey,
            current_totp_secret: extender.apiKey,
            ext_name: uniqueName,
            ext_desc: description || ''
        }, { timeout: 3000 });
    } catch (error) {
        console.error(`[EXTENDERS] Échec de la mise à jour de la config NVS sur le WhisperEye à l'adresse ${extender.host}:`, error.message);
        throw new Error(`Impossible de joindre l'extendeur WhisperEye à l'adresse ${extender.host} pour enregistrer les modifications.`);
    }

    extender.name = uniqueName;
    extender.description = description || '';

    configManager.saveConfig(stationConfig.id, stationConfig);
    return stationConfig;
}

/**
 * Update individual sensor or actuator description in local config and ESP32 NVS
 */
async function updateExtenderPeripheralInStation(stationConfig, mac, peripheralId, description) {
    if (!stationConfig.extenders || !stationConfig.extenders.WhisperEye) {
        throw new Error(`Aucun extendeur configuré pour cette station.`);
    }

    const extender = stationConfig.extenders.WhisperEye.find(ext => ext.mac === mac);
    if (!extender) {
        throw new Error(`Extendeur avec la MAC ${mac} non trouvé.`);
    }

    let foundDev = null;
    if (extender.sensors) {
        foundDev = extender.sensors.find(s => s.Name === peripheralId);
    }
    if (!foundDev && extender.actuators) {
        foundDev = extender.actuators.find(a => a.Name === peripheralId);
    }

    if (!foundDev) {
        throw new Error(`Périphérique ${peripheralId} non trouvé.`);
    }

    const cleanDesc = description.trim();
    if (cleanDesc.length > 24) {
        throw new Error("La description du périphérique ne doit pas dépasser 24 caractères.");
    }

    try {
        console.log(`[EXTENDERS] Envoi du renommage NVS pour ${peripheralId} à http://${extender.host}/api/peripherals`);
        await axios.post(`http://${extender.host}/api/peripherals`, {
            id: peripheralId,
            name: cleanDesc
        }, { timeout: 3000 });
    } catch (error) {
        console.error(`[EXTENDERS] Échec du renommage du périphérique ${peripheralId} sur ${extender.host}:`, error.message);
        throw new Error(`Impossible de joindre l'extendeur WhisperEye à l'adresse ${extender.host} pour enregistrer la description.`);
    }

    foundDev.description = cleanDesc;

    configManager.saveConfig(stationConfig.id, stationConfig);
    return stationConfig;
}

module.exports = {
    runExtenderCollection,
    pingAllExtenders,
    addExtenderToStation,
    autoDiscoverAndRegisterExtenders,
    updateExtenderInStation,
    updateExtenderPeripheralInStation
};
