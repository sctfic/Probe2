// services/lockManager.js
const fs = require('fs');
const path = require('path');
const { V } = require('../utils/icons');
const ping = require('ping');

const LOCK_DIR = path.resolve(__dirname, '../config/stations');
const LOCK_TIMEOUT_MS = 4000; // 5 secondes
const LOCK_CHECK_RETRIES = 3;
const LOCK_CHECK_INTERVAL_MS = 1000; // 2 secondes

/**
 * Vérifie si un verrou est libre (expiré ou inexistant).
 * @param {string} stationId L'ID de la station.
 * @returns {boolean} True si le verrou est libre.
 */
function isFree(stationId) {
    const lockPath = path.join(LOCK_DIR, `${stationId}.lock`);
    try {
        const stats = fs.statSync(lockPath);
        const age = Date.now() - stats.mtime.getTime();
        return age > LOCK_TIMEOUT_MS;
    } catch (error) {
        // Le fichier n'existe pas, donc le verrou est libre.
        return true;
    }
}

/**
 * Crée ou met à jour le fichier de verrou pour une station.
 * @param {string} stationId L'ID de la station.
 */
function touch(stationId) {
    const lockPath = path.join(LOCK_DIR, `${stationId}.lock`);
    const now = new Date();
    try {
        fs.writeFileSync(lockPath, now.toISOString());
    } catch (error) {
        // Si le fichier n'existe pas, le créer.
        fs.writeFileSync(lockPath, now.toString());
    }
}

/**
 * Supprime le fichier de verrou pour une station.
 * @param {string} stationId L'ID de la station.
 */
function release(stationId) {
    const lockPath = path.join(LOCK_DIR, `${stationId}.lock`);
    try {
        if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
        }
    } catch (error) {
        // Ignore les erreurs si le fichier a déjà été supprimé.
    }
}

/**
 * Tente d'acquérir le verrou pour une station, avec plusieurs tentatives.
 * @param {object} stationConfig La configuration de la station.
 * @returns {Promise<void>}
 */
async function acquire(stationConfig) {
    // Ping check is now done upfront, before any lock checks.
    try {
        const res = await ping.promise.probe(stationConfig.host, { timeout: 1 });
        if (!res.alive) {
            // If the host doesn't respond, we abandon the acquisition attempt immediately.
            const error = new Error(`Host ${stationConfig.host} is not responding to ping. Aborting lock acquisition.`);
            error.code = 'HOST_UNREACHABLE';
            console.error(`${V.error} ${error.message}`);
            throw error;
        }
    } catch (pingError) {
        // This can be the error thrown above or an error from the ping command itself.
        if (pingError.code !== 'HOST_UNREACHABLE') {
            console.error(`${V.error} Ping command failed for ${stationConfig.host}: ${pingError.message}`);
        }
        // Re-throw to abort the entire process.
        throw pingError;
    }

    // If the host is reachable, proceed with the lock acquisition logic.
    for (let attempt = 1; attempt <= LOCK_CHECK_RETRIES; attempt++) {
        if (isFree(stationConfig.id)) {
            touch(stationConfig.id);
            console.log(`${V.Check} Lock acquired for ${stationConfig.id} (attempt ${attempt}/${LOCK_CHECK_RETRIES})`);
            return;
        }

        // The lock is busy. Since we know the host is online, we just wait.
        console.warn(`${V.timeout} Lock busy for ${stationConfig.id}, attempt ${attempt}/${LOCK_CHECK_RETRIES}. Host is online, waiting...`);

        if (attempt < LOCK_CHECK_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, LOCK_CHECK_INTERVAL_MS));
        }
    }

    throw new Error(`Cannot acquire lock for ${stationConfig.id} after ${LOCK_CHECK_RETRIES} attempts.`);
}

module.exports = {
    acquire,
    release,
    touch,
    isFree
};