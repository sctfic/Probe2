const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');

// Charger la configuration InfluxDB
const configPath = path.join(__dirname, '..', 'config', 'influx.json');
let influxConfig;
try {
    influxConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error(`${V.error} Erreur lors du chargement de la configuration InfluxDB:`, error);
    // Utiliser des valeurs par défaut ou arrêter le processus si la configuration est essentielle
    influxConfig = { url: '', token: '', org: '', bucket: '' };
}

const { url, token, org, bucket } = influxConfig;

// Initialiser le client InfluxDB
const influxDB = new InfluxDB({ url, token });
const writeApi = influxDB.getWriteApi(org, bucket);

console.log(`${V.database} Service InfluxDB initialisé pour l'organisation '${org}' et le bucket '${bucket}'.`);

/**
 * Écrit un ensemble de points de données dans InfluxDB.
 * @param {Array<Point>} points - Un tableau d'objets Point à écrire.
 * @returns {Promise<boolean>} Retourne `true` si l'écriture a réussi, sinon `false`.
 */
async function writePoints(points) {
    if (!points || points.length === 0) {
        console.log('Aucun point à écrire dans InfluxDB.');
        return true;
    }
    try {
        writeApi.writePoints(points);
        await writeApi.flush();
        console.log(`${V.Check} ${points.length} points de données écrits avec succès dans InfluxDB.`);
        return true;
    } catch (error) {
        console.error(`${V.error} Erreur lors de l'écriture dans InfluxDB:`, error);
        return false;
    }
}

module.exports = {
    writePoints,
    Point
};
