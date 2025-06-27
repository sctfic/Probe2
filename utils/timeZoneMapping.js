// utils/timeZoneMapping.js
const timeZoneMapping = {
    // Liste complète des index avec leurs décalages GMT et noms IANA associés
    // Format : [index]: { offset: décalage GMT, ianaZones: [tableau de noms de fuseaux IANA] }
    0: { offset: -1200, ianaZones: ['Pacific/Kwajalein', 'Pacific/Majuro'] },
    1: { offset: -1100, ianaZones: ['Pacific/Midway', 'Pacific/Pago_Pago', 'Pacific/Niue'] },
    2: { offset: -1000, ianaZones: ['Pacific/Honolulu', 'Pacific/Rarotonga', 'Pacific/Tahiti'] },
    3: { offset: -900, ianaZones: ['America/Anchorage', 'America/Juneau', 'America/Nome'] },
    4: { offset: -800, ianaZones: ['America/Los_Angeles', 'America/Vancouver', 'America/Tijuana'] },
    5: { offset: -700, ianaZones: ['America/Denver', 'America/Phoenix', 'America/Edmonton'] },
    6: { offset: -600, ianaZones: ['America/Chicago', 'America/Mexico_City', 'America/Regina'] },
    7: { offset: -600, ianaZones: ['America/Mexico_City', 'America/Matamoros'] },
    8: { offset: -600, ianaZones: ['America/Guatemala', 'America/El_Salvador', 'America/Tegucigalpa'] },
    9: { offset: -500, ianaZones: ['America/Bogota', 'America/Lima', 'America/Guayaquil'] },
    10: { offset: -500, ianaZones: ['America/New_York', 'America/Toronto', 'America/Nassau'] },
    11: { offset: -400, ianaZones: ['America/Halifax', 'America/Barbados', 'Atlantic/Bermuda'] },
    12: { offset: -400, ianaZones: ['America/Caracas', 'America/La_Paz', 'America/Santiago'] },
    13: { offset: -330, ianaZones: ['America/St_Johns', 'Canada/Newfoundland'] },
    14: { offset: -300, ianaZones: ['America/Sao_Paulo', 'America/Argentina/Buenos_Aires'] },
    15: { offset: -300, ianaZones: ['America/Argentina/Buenos_Aires', 'America/Cayenne', 'America/Montevideo'] },
    16: { offset: -200, ianaZones: ['Atlantic/South_Georgia', 'America/Noronha'] },
    17: { offset: -100, ianaZones: ['Atlantic/Azores', 'Atlantic/Cape_Verde'] },
    18: { offset: 0, ianaZones: ['Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Africa/Casablanca'] },
    19: { offset: 0, ianaZones: ['Africa/Casablanca', 'Africa/Monrovia'] },
    20: { offset: 100, ianaZones: ['Europe/Berlin', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Stockholm'] },
    21: { offset: 100, ianaZones: ['Europe/Paris', 'Europe/Madrid', 'Europe/Brussels', 'Europe/Copenhagen'] },
    22: { offset: 100, ianaZones: ['Europe/Prague', 'Europe/Budapest', 'Europe/Belgrade', 'Europe/Ljubljana'] },
    23: { offset: 200, ianaZones: ['Europe/Athens', 'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Minsk'] },
    24: { offset: 200, ianaZones: ['Africa/Cairo'] },
    25: { offset: 200, ianaZones: ['Europe/Bucharest', 'Europe/Chisinau', 'Europe/Sofia'] },
    26: { offset: 200, ianaZones: ['Africa/Johannesburg', 'Africa/Harare', 'Africa/Gaborone'] },
    27: { offset: 200, ianaZones: ['Asia/Jerusalem', 'Asia/Gaza', 'Asia/Hebron'] },
    28: { offset: 300, ianaZones: ['Asia/Baghdad', 'Asia/Kuwait', 'Asia/Riyadh', 'Africa/Nairobi'] },
    29: { offset: 300, ianaZones: ['Europe/Moscow', 'Europe/Volgograd', 'Europe/Samara'] },
    30: { offset: 330, ianaZones: ['Asia/Tehran'] },
    31: { offset: 400, ianaZones: ['Asia/Dubai', 'Asia/Muscat', 'Asia/Baku', 'Asia/Tbilisi'] },
    32: { offset: 430, ianaZones: ['Asia/Kabul'] },
    33: { offset: 500, ianaZones: ['Asia/Karachi', 'Asia/Tashkent', 'Asia/Yekaterinburg'] },
    34: { offset: 530, ianaZones: ['Asia/Kolkata', 'Asia/Colombo'] },
    35: { offset: 600, ianaZones: ['Asia/Almaty', 'Asia/Dhaka', 'Asia/Omsk'] },
    36: { offset: 700, ianaZones: ['Asia/Bangkok', 'Asia/Jakarta', 'Asia/Ho_Chi_Minh', 'Asia/Krasnoyarsk'] },
    37: { offset: 800, ianaZones: ['Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Urumqi'] },
    38: { offset: 800, ianaZones: ['Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Manila'] },
    39: { offset: 900, ianaZones: ['Asia/Tokyo', 'Asia/Seoul', 'Asia/Pyongyang'] },
    40: { offset: 930, ianaZones: ['Australia/Adelaide', 'Australia/Broken_Hill'] },
    41: { offset: 1000, ianaZones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Hobart'] },
    42: { offset: 1030, ianaZones: ['Australia/Lord_Howe'] },
    43: { offset: 1100, ianaZones: ['Pacific/Guadalcanal', 'Pacific/Ponape'] },
    44: { offset: 1200, ianaZones: ['Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Funafuti'] },
    45: { offset: 1245, ianaZones: ['Pacific/Chatham'] },
    46: { offset: 1300, ianaZones: ['Pacific/Tongatapu', 'Pacific/Apia'] }
    };

/**
 * Trouve l'index du fuseau horaire Davis correspondant à une zone IANA
 * @param {string} ianaZone - Identifiant de fuseau horaire IANA (ex: "Europe/Paris")
 * @returns {number} Index du fuseau dans la configuration Davis
 */
function findDavisTimeZoneIndex(ianaZone) {
    for (const [index, config] of Object.entries(timeZoneMapping)) {
        if (config.ianaZones.includes(ianaZone)) {
            return parseInt(index);
        }
    }
    // Fallback pour Paris si non trouvé
    return 21;
}

module.exports = {
    timeZoneMapping,
    findDavisTimeZoneIndex
};