const axios = require('axios');


/**
 * Récupère et parse les données JSON d'un module WhisperEye.
 * @param {string} host - L'adresse du module.
 * @returns {Promise<Object|null>} Les données parsées ou null en cas d'erreur.
 */
async function fetchWhisperEyeCurrents(host) {
    try {
        const url = `http://${host}/Currents`;
        const response = await axios.get(url, { timeout: 2000 });
        if (response.data) {
            return parseWhisperEyeJSON(response.data);
        }
    } catch (error) {
        console.error(`[WhisperEyeService] Erreur lors de la récupération sur ${host}:`, error.message);
    }
    return null;
}
/**
 * liste des capacity (capteurs et actionneurs)
 * @param {string} host - L'adresse du module.
 * @returns {Promise<Object|null>} Les données ou null en cas d'erreur.
 */
async function fetchWhisperEyeCapacity(host) {
    // JSON capacity
    // {
    //         "sensors" : [
    //             {
    //                 "Name": "Temp1",
    //                 "description": "Temperature sous tuile",
    //                 "Type": "Temperature",
    //             },
    //             {
    //                 "Name": "Hum1",
    //                 "description": "Humidity sdb",
    //                 "Type": "Humidity",
    //             }
    //         ],
    //         "actuators" : [
    //             {
    //                 "Name": "verin1",
    //                 "description": "Verin velux",
    //                 "Type": "double sens",
    //                 "range": "int:-100 100"
    //             },
    //             {
    //                 "Name": "pompe1",
    //                 "description": "circulateur eau chaude",
    //                 "Type": "un sens",
    //                 "range": "int:0 100"
    //             },
    //             {
    //                 "Name": "lumiere1",
    //                 "description": "lumiere salon",
    //                 "Type": "tout ou rien",
    //                 "range": "bool:0 1"
    //             }
    //         ]
    // }
    try {
        const url = `http://${host}/Capacity`;
        const response = await axios.get(url, { timeout: 2000 });
        if (response.data) {
            return response.data;
        }
    } catch (error) {
        console.error(`[WhisperEyeService] Erreur lors de la récupération sur ${host}:`, error.message);
    }
    return null;
}
/**
 * Parse les données JSON brutes reçues du module WhisperEye (format /InfoAPI)
 * @param {Object} rawData - Les données JSON brutes.
 * @returns {Object} Un objet structuré au format standard.
 */
function parseWhisperEyeJSON(rawData) {
    if (!rawData) return null;
    const now = new Date();
    // Arrondir à la minute
    const rounded = new Date(Math.round(now.getTime() / 60000) * 60000);
    // const isoString = rounded.toISOString();
    return { // arrondir le datetime a la minute (les secondes et ms seront a 0)
        dateTime: rounded,

    };
}

module.exports = {
    parseWhisperEyeJSON,
    fetchWhisperEyeCurrents,
    fetchWhisperEyeCapacity
};