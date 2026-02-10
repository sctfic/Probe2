const configManager = require('./configManager');
const unitsProvider = require('./unitsProvider');
const VentiConnectService = require('./VentiConnectService');
const WhisperEyeService = require('./WhisperEyeService');
const { V } = require('../utils/icons');

/**
 * Service pour synchroniser Units.json avec les capteurs des extendeurs configurés.
 */
class UnitsSyncService {
    /**
     * Synchronise Units.json en parcourant toutes les stations et leurs extendeurs.
     */
    async syncAllExtenders() {
        console.log(`${V.gear} [UNITS-SYNC] Synchronisation de Units.json avec les extendeurs...`);

        try {
            const allConfigs = configManager.loadAllConfigs();
            const extenderSensors = {
                temperature: new Set(),
                humidity: new Set(),
                ticksByMin: new Set(),
                voltage: new Set(),
                rain: new Set(),
                pressure: new Set(),
                speed: new Set(),
                direction: new Set(),
                irradiance: new Set(),
                uv: new Set()
            };

            for (const stationId in allConfigs) {
                const config = allConfigs[stationId];
                if (!config.extenders) continue;

                // Venti'Connect
                const ventis = config.extenders["Venti'Connect"] || [];
                for (const ext of ventis) {
                    const prefix = `${ext.id}_`;
                    extenderSensors.temperature.add(`${prefix}indoor`);
                    extenderSensors.temperature.add(`${prefix}fan`);
                    extenderSensors.temperature.add(`${prefix}collector`);
                    extenderSensors.humidity.add(`${prefix}indoor`);
                    extenderSensors.humidity.add(`${prefix}fan`);
                    extenderSensors.ticksByMin.add(`${prefix}rpm`);
                }

                // WhisperEye
                const eyes = config.extenders["WhisperEye"] || [];
                for (const ext of eyes) {
                    const capacity = await WhisperEyeService.fetchWhisperEyeCapacity(ext.host);
                    if (capacity && capacity.sensors) {
                        for (const s of capacity.sensors) {
                            const sensorName = `${ext.id}_${s.Name}`;
                            const typeKey = this.mapWhisperTypeToUnitKey(s.Type);
                            if (typeKey && extenderSensors[typeKey]) {
                                extenderSensors[typeKey].add(sensorName);
                            }
                        }
                    }
                }
            }

            // Mise à jour de Units.json
            const currentUnits = unitsProvider.getUnits();
            let changed = false;

            for (const unitKey in extenderSensors) {
                if (currentUnits[unitKey]) {
                    const oldSensors = currentUnits[unitKey].sensors || [];

                    // Filtrer les anciens capteurs d'extendeurs (VCxxx_, WExxx_ ou ventiConnect_)
                    const standardSensors = oldSensors.filter(s => !s.match(/^((VC|WE)\d{3}|ventiConnect)_/));

                    // Nouveaux capteurs d'extendeurs pour cette unité
                    const newExtenderSensors = Array.from(extenderSensors[unitKey]);

                    // Fusion unique
                    const finalSensors = [...new Set([...standardSensors, ...newExtenderSensors])].sort();

                    // Vérifier si changement
                    if (JSON.stringify([...oldSensors].sort()) !== JSON.stringify(finalSensors)) {
                        currentUnits[unitKey].sensors = finalSensors;
                        changed = true;
                    }
                }
            }

            if (changed) {
                unitsProvider.setUnits(currentUnits);
                console.log(`${V.Check} [UNITS-SYNC] Units.json mis à jour.`);
            } else {
                console.log(`${V.info} [UNITS-SYNC] Aucune modification nécessaire pour Units.json.`);
            }

            return true;
        } catch (error) {
            console.error(`${V.error} [UNITS-SYNC] Erreur lors de la synchronisation des unités:`, error);
            return false;
        }
    }

    /**
     * Mappe le type WhisperEye vers une clé Units.json.
     * @param {string} type 
     */
    mapWhisperTypeToUnitKey(type) {
        if (!type) return null;
        const t = type.toLowerCase();
        if (t === 'temperature') return 'temperature';
        if (t === 'humidity') return 'humidity';
        if (t === 'pressure') return 'pressure';
        if (t === 'voltage') return 'voltage';
        if (t === 'rain' || t === 'rainfall') return 'rain';
        if (t === 'speed' || t === 'windspeed') return 'speed';
        if (t === 'direction' || t === 'winddir') return 'direction';
        if (t === 'solar' || t === 'irradiance') return 'irradiance';
        if (t === 'uv') return 'uv';
        if (t === 'ticksbymin' || t === 'rpm') return 'ticksByMin';
        return null; // Type inconnu
    }
}

module.exports = new UnitsSyncService();
