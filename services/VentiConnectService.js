const axios = require('axios');


/**
 * Récupère et parse les données JSON d'un module Venti'Connect.
 * @param {string} host - L'adresse du module.
 * @returns {Promise<Object|null>} Les données parsées ou null en cas d'erreur.
 */
async function fetchVentiConnectInfoAPI(host) {
    try {
        // const data = {
        //     TI: 18.3234, TP: 18.8234, TV: 20.0234,
        //     HI: 46.234, HE: 44.234,
        //     CM: 400, AM: 300, RM: 1290
        // }
        // return parseVentiConnectJSON(data);
        const url = `http://${host}/InfoAPI`;
        const response = await axios.get(url, { timeout: 5000 });
        if (response.data) {
            return parseVentiConnectJSON(response.data);
        }
    } catch (error) {
        console.error(`[VentiConnectService] Erreur lors de la récupération sur ${host}:`, error.message);
    }
    return null;
}
/**
 * Parse les données JSON brutes reçues du module Venti'Connect (format /InfoAPI)
 * @param {Object} rawData - Les données JSON brutes.
 * @returns {Object} Un objet structuré au format standard.
 */
function parseVentiConnectJSON(rawData) {
    if (!rawData) return null;
    const now = new Date();
    // Arrondir à la minute
    const rounded = new Date(Math.round(now.getTime() / 60000) * 60000);
    // const isoString = rounded.toISOString();
    return { // arrondir le datetime a la minute (les secondes et ms seront a 0)
        dateTime: rounded,
        temperature: {
            // Temperature corrigee en degrés Celsius arrondi a 1 decimal
            indoor: rawData.TI.toFixed(1) * 1,
            fan: rawData.TP.toFixed(1) * 1,
            collector: rawData.TV.toFixed(1) * 1
        },
        humidity: {
            // Humidite relative corrigee en % arrondi la valeur entiere
            indoor: rawData.HI.toFixed() * 1,
            fan: rawData.HE.toFixed() * 1
        },
        fan: {
            // Vitesse du ventilateur
            instructions: rawData.CM, // objectif en %
            real: rawData.AM,         // vitesse actuelle en %
            rpm: rawData.RM           // vitesse reelle en tours par minute
        }
    };
}

/*
@param {string} rawString - La chaine CSV brute reçue du module.
@returns {Object} Un objet structuré avec les données nettoyées.
*/

// function parseVentiConnectData(rawString) {
//     if (!rawString || typeof rawString !== 'string') { console.error("Format d'entrée invalide"); return null; }

//     const parts = rawString.split(',');

//     // Helper pour nettoyer les préfixes et convertir en nombre (float ou int)
//     // Exemple: "RPM2880" -> 2880, "deltaTemp-4.45" -> -4.45
//     const extractValue = (val, prefix) => {
//         if (!val) return null;
//         // Si le préfixe est présent, on l'enlève
//         if (prefix && val.startsWith(prefix)) { val = val.replace(prefix, ''); }
//         // Tentative de conversion en nombre
//         const num = parseFloat(val); return isNaN(num) ? val : num;
//     };

//     const [time, lan] = parts[4].split('  - ')
//     return {
//         // 1: Temp SHT31 Interieur
//         tempInterieur: extractValue(parts[0]),
//         // 2: Temp thermistance Gaine/Collecteur
//         tempGaine: extractValue(parts[1]),
//         // 3: Consigne Solaire
//         consigneSolaire: extractValue(parts[2]),
//         // 4: Mode (Texte: "Rapide", "Silence", etc.)
//         mode: parts[3],
//         // 5: Horloge et Info IP
//         time: time,
//         infoReseau: lan,
//         // 6: Consigne Quietude
//         consigneQuietude: extractValue(parts[5]),
//         // 7: Résistance Quiétude présente (0 ou 1)
//         resistanceQuietude: extractValue(parts[6]) === 1,
//         // 8: Réservé / Inconnu
//         unknown8: parts[7],
//         // 9: Consigne Moteur (ex: CM2047 -> 2047)
//         consigneMoteur: extractValue(parts[8], 'CM'),
//         // 10: Rotation Level (ex: RM600 -> 600)
//         rotationLevel: extractValue(parts[9], 'RM'),
//         // 11: Inconnu (Vide dans l'exemple)
//         unknown11: parts[10],
//         // 12: Tension Alim * 100 (ex: V2416 -> 24.16V)
//         tensionAlim: extractValue(parts[11], 'V') !== null ? extractValue(parts[11], 'V') / 100 : null,
//         // 13: Tension Moteur * 100 (ex: VM4096)
//         tensionMoteur: extractValue(parts[12], 'VM') !== null ? extractValue(parts[12], 'VM') / 100 : null,
//         // 14: Tension 12V (ex: 12V1147)
//         tension12V: extractValue(parts[13], '12V'),
//         // 15: LastTempCount
//         lastTempCount: extractValue(parts[14], 'LastTemp'),
//         // 16: Tension Remote Battery * 1000 (ex: ExtBatt4096)
//         tensionBatterieExterne: extractValue(parts[15], 'ExtBatt') !== null ? extractValue(parts[15], 'ExtBatt') / 1000 : null,
//         // 17: TMax
//         tMax: extractValue(parts[16], 'TMax'),
//         // 18: TMin
//         tMin: extractValue(parts[17], 'TMin'),
//         // 19: Vitesse Rotation Moteur (ex: RPM2880)
//         rpm: extractValue(parts[18], 'RPM'),
//         // 20: Temp Gaine/Collecteur (Redondant avec index 1 mais préfixé TempThermi)
//         tempGaine: extractValue(parts[19], 'TempThermi'),
//         // 21: Temp SHT31 Ext Moteur
//         tempSHT31Ext: extractValue(parts[20], 'TempSHT'),
//         // 22: Delta Temp Gaine-In (ex: deltaTemp-4.45)
//         deltaTempGaineIn: extractValue(parts[21], 'deltaTemp'),
//         // 23: Delta Ext-Gaine
//         deltaTempExtGaine: extractValue(parts[22], 'DeltaSHTThermi'),
//         // 24: SHT11 Status
//         SHT: extractValue(parts[23], 'SHT'),
//         // 25: Firmware Version
//         firm: extractValue(parts[24], 'Firm'),
//         // 26: Test en cours
//         testInProgress: extractValue(parts[25], 'testinprogress') === 1,
//         // 27: QE Status
//         QE: extractValue(parts[26], 'QE')
//     };
// }

module.exports = {
    parseVentiConnectJSON,
    fetchVentiConnectInfoAPI,
    // parseVentiConnectData
};
