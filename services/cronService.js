// services/cronService.js
const cron = require('node-cron');
const axios = require('axios');
const configManager = require('./configManager');
const { V } = require('../utils/icons');

const scheduledTasks = new Map();

/**
 * Planifie une tâche de collecte pour une station donnée.
 * @param {object} stationConfig - La configuration de la station.
 */
function scheduleJobForStation(stationId, stationConfig) {
    // console.log(V.Warn, stationConfig);
    // S'assurer qu'il n'y a pas déjà une tâche pour cette station
    if (scheduledTasks.has(stationId)) {
        console.log(`${V.Warn} [CRON] Une tâche existe déjà pour ${stationId}. Suppression avant de replanifier.`);
        removeJobForStation(stationId);
    }

    if (!stationConfig.cron || !stationConfig.cron.enabled) {
        console.log(`${V.info} [CRON] La collecte n'est pas activée pour ${stationId}.`);
        return;
    }

    const cronInterval = stationConfig.cron.value;
    if (!cronInterval || typeof cronInterval !== 'number' || cronInterval <= 0) {
        console.log(`${V.Warn} [CRON] Intervalle invalide pour ${stationId}. Tâche non planifiée.`);
        return;
    }

    const cronPattern = cronInterval < 60
        ? `11 */${cronInterval} * * * *`
        : `12 * */${Math.round(cronInterval / 60)} * * *`;

    const task = cron.schedule(cronPattern, async () => {
        const port = process.env.PORT || 3000;
        const url = `http://localhost:${port}/api/station/${stationId}/collect`;
        console.log(`${V.info} [CRON] Exécution de la collecte pour la station ${stationId}`);
        try {
            const response = await axios.get(url);
            console.log(`${V.Check} [CRON] Collecte pour ${stationId} réussie. Status: ${response.status}`);
        } catch (error) {
            const errorMessage = error.response ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}` : error.message;
            console.error(`${V.error} [CRON] Erreur lors de la collecte pour ${stationId}:`, errorMessage);
        }
    });

    scheduledTasks.set(stationId, task);
    console.log(`${V.Check} [CRON] Tâche planifiée pour ${stationId} avec le pattern: "${cronPattern}".`);
}

/**
 * Supprime la tâche planifiée pour une station.
 * @param {string} stationId - L'ID de la station.
 */
function removeJobForStation(stationId) {
    if (scheduledTasks.has(stationId)) {
        scheduledTasks.get(stationId).stop();
        scheduledTasks.delete(stationId);
        console.log(`${V.trash} [CRON] Tâche supprimée pour la station ${stationId}.`);
    }
}

/**
 * Initialise les tâches pour toutes les stations configurées.
 */
function initializeAllJobs() {
    console.log(`${V.info} [CRON] Initialisation des tâches de collecte planifiées...`);
    const stations = configManager.listStations();
    stations.forEach((stationId) => {
        const stationConfig = configManager.loadConfig(stationId);
        scheduleJobForStation(stationId, stationConfig);
    });
}

module.exports = {
    initializeAllJobs,
    scheduleJobForStation,
    removeJobForStation
};