// services/cronService.js
const cron = require('node-cron');
const axios = require('axios');
const configManager = require('./configManager');
const { V } = require('../utils/icons');

const scheduledTasks = new Map();
const scheduledOpenMeteoTasks = new Map();
const scheduledOpenMeteoForecastTasks = new Map(); // Nouvelle Map pour les prévisions

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
        ? `16 */${cronInterval} * * * *`
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
 * Planifie une tâche de collecte Open-Meteo pour une station.
 * @param {string} stationId - L'ID de la station.
 * @param {object} stationConfig - La configuration de la station.
 */
function scheduleOpenMeteoJob(stationId, stationConfig) {
    // S'assurer qu'il n'y a pas déjà une tâche pour cette station
    if (scheduledOpenMeteoTasks.has(stationId)) {
        console.log(`${V.Warn} [CRON] Une tâche Open-Meteo existe déjà pour ${stationId}. Suppression avant de replanifier.`);
        removeOpenMeteoJob(stationId);
    }

    if (!stationConfig.cron || !stationConfig.cron.openMeteo) {
        console.log(`${V.info} [CRON] La collecte Open-Meteo n'est pas activée pour ${stationId}.`);
        return;
    }

    // Tous les jours à 23h30
    const cronPattern = '0 30 23 * * *';

    const task = cron.schedule(cronPattern, async () => {
        const port = process.env.PORT || 3000;
        const url = `http://localhost:${port}/query/${stationId}/dbexpand`;
        console.log(`${V.info} [CRON] Exécution de la collecte Open-Meteo pour la station ${stationId}`);
        try {
            const response = await axios.get(url);
            console.log(`${V.Check} [CRON] Collecte Open-Meteo pour ${stationId} réussie. Status: ${response.status}`);
        } catch (error) {
            const errorMessage = error.response ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}` : error.message;
            console.error(`${V.error} [CRON] Erreur lors de la collecte Open-Meteo pour ${stationId}:`, errorMessage);
        }
    }, {
        timezone: "Europe/Paris" // ou le fuseau horaire de votre serveur
    });

    scheduledOpenMeteoTasks.set(stationId, task);
    console.log(`${V.Check} [CRON] Tâche Open-Meteo planifiée pour ${stationId} avec le pattern: "${cronPattern}".`);
}

/**
 * Planifie la tâche de récupération des prévisions Open-Meteo pour une station.
 * @param {string} stationId - L'ID de la station.
 * @param {object} stationConfig - La configuration de la station.
 */
function scheduleOpenMeteoForecastJob(stationId, stationConfig) {
    // S'assurer qu'il n'y a pas déjà une tâche pour cette station
    if (scheduledOpenMeteoForecastTasks.has(stationId)) {
        console.log(`${V.Warn} [CRON] Une tâche de prévision Open-Meteo existe déjà pour ${stationId}. Suppression avant de replanifier.`);
        removeOpenMeteoForecastJob(stationId);
    }

    // Vérifie si la fonctionnalité forecast est activée spécifiquement
    if (!stationConfig.cron || !stationConfig.cron.forecast) {
         console.log(`${V.info} [CRON] La tâche de prévision n'est pas activée pour ${stationId}.`);
         return;
    }

    // Toutes les heures à la minute 3
    const cronPattern = '0 3 * * * *';

    const task = cron.schedule(cronPattern, async () => {
        const port = process.env.PORT || 3000;
        const url = `http://localhost:${port}/query/${stationId}/forecast`; // Nouvelle route API
        console.log(`${V.info} [CRON] Exécution de la récupération des prévisions Open-Meteo pour la station ${stationId}`);
        try {
            const response = await axios.get(url);
            console.log(`${V.Check} [CRON] Prévisions Open-Meteo pour ${stationId} réussies. Status: ${response.status}`);
        } catch (error) {
            const errorMessage = error.response ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}` : error.message;
            console.error(`${V.error} [CRON] Erreur lors de la récupération des prévisions Open-Meteo pour ${stationId}:`, errorMessage);
        }
    }, {
        timezone: "Europe/Paris"
    });

    scheduledOpenMeteoForecastTasks.set(stationId, task);
    console.log(`${V.Check} [CRON] Tâche de prévision Open-Meteo planifiée pour ${stationId} avec le pattern: "${cronPattern}".`);
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
 * Supprime la tâche Open-Meteo planifiée pour une station.
 * @param {string} stationId - L'ID de la station.
 */
function removeOpenMeteoJob(stationId) {
    if (scheduledOpenMeteoTasks.has(stationId)) {
        scheduledOpenMeteoTasks.get(stationId).stop();
        scheduledOpenMeteoTasks.delete(stationId);
        console.log(`${V.trash} [CRON] Tâche Open-Meteo supprimée pour la station ${stationId}.`);
    }
}

/**
 * Supprime la tâche de prévision Open-Meteo planifiée pour une station.
 * @param {string} stationId - L'ID de la station.
 */
function removeOpenMeteoForecastJob(stationId) {
    if (scheduledOpenMeteoForecastTasks.has(stationId)) {
        scheduledOpenMeteoForecastTasks.get(stationId).stop();
        scheduledOpenMeteoForecastTasks.delete(stationId);
        console.log(`${V.trash} [CRON] Tâche de prévision Open-Meteo supprimée pour la station ${stationId}.`);
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
        scheduleOpenMeteoJob(stationId, stationConfig);
        scheduleOpenMeteoForecastJob(stationId, stationConfig); // Ajout de l'initialisation de la tâche de prévision
    });
}

module.exports = {
    initializeAllJobs,
    scheduleJobForStation,
    removeJobForStation,
    scheduleOpenMeteoJob,
    removeOpenMeteoJob,
    scheduleOpenMeteoForecastJob, // Export de la nouvelle fonction
    removeOpenMeteoForecastJob
};