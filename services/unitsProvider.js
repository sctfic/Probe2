// services/unitsProvider.js
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');

const unitsPath = path.join(__dirname, '..', 'config', 'Units.json');
const compositeProbesPath = path.join(__dirname, '..', 'config', 'compositeProbes.json');
const integratorProbesPath = path.join(__dirname, '..', 'config', 'integratorProbes.json');

class UnitsProvider {
    constructor() {
        this.units = null;
        this.sensorTypeMap = null; // cache du map sensor -> measurement type
        this._sensorMapReady = false;
        this.loadUnits();
        // Chargement asynchrone du sensorTypeMap depuis InfluxDB au démarrage
        this.loadSensorMap().catch(err => {
            console.error(`${V.error} Failed to load sensor map at startup:`, err.message);
        });
    }

    loadUnits() {
        try {
            const data = fs.readFileSync(unitsPath, 'utf8');
            this.units = JSON.parse(data);
            console.log(`${V.info} Units.json loaded successfully.`);
        } catch (error) {
            console.error(`${V.error} Failed to load Units.json:`, error);
            // Initialize with empty object if file is missing/broken to prevent crash
            this.units = {};
        }
    }

    getUnits() {
        if (!this.units) {
            this.loadUnits();
        }
        return this.units;
    }

    setUnits(newUnits) {
        try {
            fs.writeFileSync(unitsPath, JSON.stringify(newUnits, null, 4), 'utf8');
            this.units = newUnits;
            console.log(`${V.write} Units.json updated successfully.`);
            return true;
        } catch (error) {
            console.error(`${V.error} Failed to save Units.json:`, error);
            return false;
        }
    }

    /**
     * Charge le sensorTypeMap dynamiquement depuis InfluxDB + compositeProbes + integratorProbes.
     * Appelé au démarrage et peut être rappelé pour rafraîchir le cache.
     */
    async loadSensorMap() {
        const map = {};

        // 0. Charger le mapping statique depuis Units.json
        try {
            const units = this.getUnits();
            for (const type in units) {
                if (units[type].sensors && Array.isArray(units[type].sensors)) {
                    for (const sensor of units[type].sensors) {
                        if (sensor) map[sensor] = type;
                    }
                }
            }
        } catch (err) {
            console.error(`${V.error} Failed to initialize sensor map from Units.json:`, err.message);
        }

        try {
            // 1. Charger depuis InfluxDB (toutes les stations)
            // Import dynamique pour éviter la dépendance circulaire au démarrage
            const influxdbService = require('./influxdbService');
            const metadata = await influxdbService.getInfluxMetadata();

            if (metadata) {
                for (const measurementType in metadata) {
                    const sensors = metadata[measurementType]?.tags?.sensor || [];
                    for (const sensor of sensors) {
                        map[sensor] = measurementType;
                    }
                }
                console.log(`${V.info} Sensor map loaded from InfluxDB: ${Object.keys(map).length} sensors.`);
            } else {
                console.warn(`${V.Warn} InfluxDB metadata returned null. Sensor map may be incomplete.`);
            }
        } catch (err) {
            console.error(`${V.error} Failed to load sensor map from InfluxDB:`, err.message);
        }

        // 2. Ajouter les sensors composites depuis compositeProbes.json
        try {
            const compositeData = fs.readFileSync(compositeProbesPath, 'utf8');
            const compositeProbes = JSON.parse(compositeData);
            for (const probeKey in compositeProbes) {
                if (compositeProbes[probeKey].measurement) {
                    map[probeKey] = compositeProbes[probeKey].measurement;
                }
            }
        } catch (err) {
            console.error(`${V.error} Failed to load compositeProbes.json for sensor map:`, err.message);
        }

        // 3. Ajouter les sensors intégrateurs depuis integratorProbes.json
        try {
            const integratorData = fs.readFileSync(integratorProbesPath, 'utf8');
            const integratorProbes = JSON.parse(integratorData);
            for (const probeKey in integratorProbes) {
                if (integratorProbes[probeKey].measurement) {
                    map[probeKey] = integratorProbes[probeKey].measurement;
                }
            }
        } catch (err) {
            console.error(`${V.error} Failed to load integratorProbes.json for sensor map:`, err.message);
        }
        // console.log(`${V.info} Sensor map loaded:`, map);
        this.sensorTypeMap = map;
        this._sensorMapReady = true;
        return map;
    }

    /**
     * Retourne le mapping sensor -> type de mesure.
     * Construit dynamiquement depuis InfluxDB + probes configs.
     * Fallback sur Units.json sensors si le cache n'est pas encore prêt.
     */
    getSensorTypeMap() {
        if (this._sensorMapReady && this.sensorTypeMap) {
            return this.sensorTypeMap;
        }

        // Fallback : construire depuis Units.json (sensors arrays) si encore présents
        const units = this.getUnits();
        const fallbackMap = {};
        for (const type in units) {
            if (units[type].sensors) {
                for (const sensor of units[type].sensors) {
                    fallbackMap[sensor] = type;
                }
            }
        }
        return fallbackMap;
    }

    /**
     * Recharge le sensorTypeMap depuis InfluxDB.
     * À appeler après ajout/suppression de capteurs.
     */
    async reloadSensorMap() {
        return this.loadSensorMap();
    }
}

// Singleton instance
const instance = new UnitsProvider();

module.exports = instance;
