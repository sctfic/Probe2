// services/probesProvider.js
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');

const probesPath = path.join(__dirname, '..', 'config', 'compositeProbes.json');

class ProbesProvider {
    constructor() {
        this.probes = null;
        this.loadProbes();
    }

    loadProbes() {
        try {
            const data = fs.readFileSync(probesPath, 'utf8');
            this.probes = JSON.parse(data);
            console.log(`${V.info} compositeProbes.json loaded successfully.`);
        } catch (error) {
            console.error(`${V.error} Failed to load compositeProbes.json:`, error);
            this.probes = {};
        }
    }

    getProbes() {
        if (!this.probes) {
            this.loadProbes();
        }
        return this.probes;
    }

    setProbes(newProbes) {
        try {
            fs.writeFileSync(probesPath, JSON.stringify(newProbes, null, 4), 'utf8');
            this.probes = newProbes;
            console.log(`${V.write} compositeProbes.json updated successfully.`);
            return true;
        } catch (error) {
            console.error(`${V.error} Failed to save compositeProbes.json:`, error);
            return false;
        }
    }
}

// Singleton instance
const instance = new ProbesProvider();

module.exports = instance;
