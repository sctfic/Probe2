// services/unitsProvider.js
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');

const unitsPath = path.join(__dirname, '..', 'config', 'Units.json');

class UnitsProvider {
    constructor() {
        this.units = null;
        this.loadUnits();
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
     * Recreates the sensorTypeMap based on current units.
     * Original logic from weatherDataParser.js
     */
    getSensorTypeMap() {
        const units = this.getUnits();
        const map = {};
        for (const type in units) {
            if (units[type].sensors) {
                for (const sensor of units[type].sensors) {
                    map[sensor] = type;
                }
            }
        }
        return map;
    }
}

// Singleton instance
const instance = new UnitsProvider();

module.exports = instance;
