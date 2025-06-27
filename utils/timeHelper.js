// utils/timeHelper.js (alternative)
const tzLookup = require('tz-lookup');
const moment = require('moment-timezone');

async function getLocalTimeFromCoordinates(stationConfig) {
    const lat = stationConfig.latitude.value;
    const lon = stationConfig.longitude.value;
    
    // Utiliser la nouvelle fonction utilitaire
    const timeZone = getTimeZoneFromCoordinates(lat, lon);

    if (typeof lat !== 'number' || typeof lon !== 'number') {
        throw new Error('Latitude/longitude invalide ou manquante dans la configuration de la station.');
    }

    if (!timeZone) {
        throw new Error(`Impossible de déterminer le fuseau horaire pour les coordonnées : lat=${lat}, lon=${lon}`);
    }
    
    const localTime = moment().tz(timeZone).toDate();
    console.log(`[Time Helper] Heure locale pour ${timeZone} : ${localTime}`);
    
    return localTime;
}

/**
 * Obtient l'identifiant IANA du fuseau horaire à partir des coordonnées GPS
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {string} Identifiant IANA (ex: "Europe/Paris")
 */
function getTimeZoneFromCoordinates(latitude, longitude) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        throw new Error('Latitude/longitude invalide ou manquante dans la configuration de la station.');
    }
    return tzLookup(latitude, longitude);
}

module.exports = {
    getLocalTimeFromCoordinates,
    getTimeZoneFromCoordinates
};