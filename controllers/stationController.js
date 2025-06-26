// controllers/stationController.js
const { sendCommand, wakeUpConsole, toggleLamps } = require('../config/vp2NetClient'); // [cite: stationController.js]
const { calculateCRC } = require('../utils/crc'); // Importe calculateCRC du fichier utilitaire
const path = require('path');
const fs = require('fs');
// Charge la configuration de la station VP2
const allVp2StationConfigs = require(path.resolve(__dirname, '../config/VP2.json'));
// Charge la configuration des unités utilisateur
const userUnitsConfig = require(path.resolve(__dirname, '../config/Units.json')); // NEW: Charge le fichier Units.json [cite: config/Units.json]

/**
 * Middleware pour charger la configuration de la station basée sur l'ID dans l'URL.
 * Attache la configuration à l'objet `req`.
 * Ce middleware doit être utilisé dans votre routeur avant les contrôleurs de station.
 * Exemple dans `routes/station.js`: router.use('/:stationId', loadStationConfig, stationRoutes);
 */
const loadStationConfig = (req, res, next) => {
    const { stationId } = req.params;
    const validStationIds = Object.keys(allVp2StationConfigs);

    if (!stationId) {
        return res.status(400).json({
            error: 'Station ID is missing in the URL. Please provide a station ID.',
            valid_station_ids: validStationIds
        });
    }

    const stationConfig = allVp2StationConfigs[stationId];

    if (!stationConfig) {
        return res.status(404).json({ error: `Station with ID '${stationId}' not found.`, valid_station_ids: validStationIds });
    }
    
    // Ajoute l'ID pour une identification facile dans les logs et autres fonctions
    stationConfig.id = stationId;

    req.stationConfig = stationConfig;
    next();
};

/**
 * Fonction utilitaire pour mapper les degrés en direction cardinale.
 * Ceci est un exemple simple, peut être affiné avec plus de directions si nécessaire.
 * @param {number} degrees Direction en degrés (0-360). 0=N, 90=E, 180=S, 270=W.
 * @returns {string} Direction cardinale.
 */
function mapDegreesToCardinal(degrees) {
    if (degrees === 0) return "N/A"; // Pas de vent ou données invalides
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(degrees / 22.5);
    return directions[index % 16];
}

/**
 * Higher-order function to wrap station operations.
 * This acts as a middleware factory that handles waking the console,
 * toggling lamps, and centralized error handling.
 * @param {Function} handler The core controller logic function.
 * @returns {Function} An Express-compatible async middleware function.
 */
const withStationLamps = (handler) => {
    return async (req, res) => {
        const stationConfig = req.stationConfig; // Fourni par le middleware loadStationConfig
        if (!stationConfig) {
            // Sécurité au cas où le middleware n'aurait pas été utilisé
            return res.status(500).json({ error: 'Station configuration not found on request. Ensure loadStationConfig middleware is used.' });
        }
        try {
            await wakeUpConsole(stationConfig);
            await toggleLamps(stationConfig, 1);
            const result = await handler(req, res);
            // If the handler has not already sent a response (e.g., for a validation error),
            // send the successful result.
            if (result && !res.headersSent) {
                res.json(result);
            }
        } catch (error) {
            console.error(`Erreur dans le handler pour ${req.path}:`, error.message);
            if (!res.headersSent) {
                res.status(500).json({ error: error.message });
            }
        } finally {
            try {
                // Ensure lamps are turned off, even if the handler or response sending fails.
                await toggleLamps(stationConfig, 0);
            } catch (lampError) {
                console.error('Erreur critique lors de l\'extinction des lampes:', lampError.message);
            }
        }
    }
};

/**
 * @api {get} /api/station/set-time Définir l'heure et le fuseau horaire de la station VP2
 * @apiGroup Station
 * @apiDescription Définit l'heure et le fuseau horaire de la station VP2 en utilisant l'heure UTC du serveur,
 * corrigée par la longitude de la station pour le fuseau horaire local.
 * La mise à jour de l'heure n'est effectuée que si le décalage est supérieur à 5 secondes.
 * Les lampes de la console sont allumées pendant l'opération et éteintes après.
 */
const _setStationTime = async (req, res) => {
    const vp2StationConfig = req.stationConfig;
    // 1. Dériver le décalage horaire GMT à partir de la longitude de la station
    const longitude = vp2StationConfig.longitude; // [cite: VP2.json]
    // 15 degrés de longitude correspondent à 1 heure de décalage.
    const offsetHoursFloat = longitude / 15;
    // Le GMT_OFFSET dans l'EEPROM est en centièmes d'heures, signé. [cite: VantageSerialProtocolDocs_v261.pdf, Page 40]
    const offsetCentiHours = Math.round(offsetHoursFloat * 100);

    // 2. Obtenir l'heure actuelle de la station VP2 pour comparaison
    console.log("Récupération de l'heure actuelle de la station...");
    // sendCommand gère l'ACK, le CRC et les tentatives. Il retourne directement les 6 octets de données.
    const stationTimeDataBytes = await sendCommand(vp2StationConfig, 'GETTIME', 2000, "<ACK>6<CRC>");

    // 3. Calculer l'heure locale cible pour la station basée sur l'heure UTC du serveur et l'offset dérivé
    const serverUtcDate = new Date(); // Heure UTC actuelle du serveur Node.js
    const targetLocalTime = new Date(serverUtcDate.getTime() + (offsetHoursFloat * 3600 * 1000));
    console.log(`Heure UTC serveur: ${serverUtcDate.toISOString()}`);
    console.log(`Longitude de la station: ${longitude}, Décalage GMT dérivé: ${offsetHoursFloat.toFixed(2)} heures (${offsetCentiHours} centièmes)`);
    console.log(`Heure locale cible pour la station: ${targetLocalTime.toISOString()}`);


    // Le format des données de l'heure est: secondes, minutes, heure (24h), jour, mois, année - 1900 [cite: VantageSerialProtocolDocs_v261.pdf, Page 20]
    const stationYear = stationTimeDataBytes[5] + 1900;
    const stationMonth = stationTimeDataBytes[4] - 1; // Les mois en JS sont 0-indexés (0-11)
    const stationDay = stationTimeDataBytes[3];
    const stationHour = stationTimeDataBytes[2];
    const stationMinute = stationTimeDataBytes[1];
    const stationSecond = stationTimeDataBytes[0];

    const currentStationDate = new Date(stationYear, stationMonth, stationDay, stationHour, stationMinute, stationSecond);
    console.log(`Heure actuelle lue de la station: ${currentStationDate.toISOString()}`);

    // 4. Comparer l'heure cible avec l'heure actuelle de la station pour le delta de 5 secondes
    const timeDiffSeconds = Math.abs((targetLocalTime.getTime() - currentStationDate.getTime()) / 1000);

    if (timeDiffSeconds <= 5) {
        console.log(`Décalage de ${timeDiffSeconds.toFixed(2)} secondes. Moins de 5 secondes, pas de mise à jour de l'heure.`);
        return {
            status: 'unchanged',
            message: `Décalage de ${timeDiffSeconds.toFixed(2)} secondes, mise à jour de l'heure non nécessaire. Fuseau horaire mis à jour si nécessaire.`
        };
    }

    // 5. Procéder à la mise à jour de l'heure et du fuseau horaire si le décalage est trop grand
    console.log(`Décalage de ${timeDiffSeconds.toFixed(2)} secondes. Mise à jour de l'heure et du fuseau horaire...`);

    // SETTIME commande
    const seconds = targetLocalTime.getSeconds();
    const minutes = targetLocalTime.getMinutes();
    const hour = targetLocalTime.getHours();
    const day = targetLocalTime.getDate();
    const month = targetLocalTime.getMonth() + 1;
    const yearMinus1900 = targetLocalTime.getFullYear() - 1900;

    const timeDataForSet = Buffer.from([seconds, minutes, hour, day, month, yearMinus1900]); // 6 octets de données
    const crcForSetTime = calculateCRC(timeDataForSet); // Calcul du CRC pour les données de temps
    const crcBytesForSetTime = Buffer.from([(crcForSetTime >> 8) & 0xFF, crcForSetTime & 0xFF]); // CRC est envoyé MSB first
    const setTimePayload = Buffer.concat([timeDataForSet, crcBytesForSetTime]); // Concaténation des données et du CRC
    
    // La station attend la commande, puis les données. sendCommand gère l'ACK pour chaque étape.
    await sendCommand(vp2StationConfig, 'SETTIME', 1000, "<ACK>");
    await sendCommand(vp2StationConfig, setTimePayload, 2000, "<ACK>"); // Envoi du payload complet (données + CRC)

    console.log('Heure de la station définie avec succès.');

    // Définir le fuseau horaire (GMT_OFFSET)
    // EEPROM address 0x14 (20 dec) pour GMT_OFFSET (2 bytes, centièmes d'heures, signé) [cite: VantageSerialProtocolDocs_v261.pdf, Page 40]
    // EEPROM address 0x16 (22 dec) pour GMT_OR_ZONE, doit être 0x01 (utiliser custom offset) [cite: VantageSerialProtocolDocs_v261.pdf, Page 40]
    console.log(`Définition du fuseau horaire personnalisé (Offset: ${offsetCentiHours})...`);
    const gmtOffsetBuffer = Buffer.alloc(2);
    gmtOffsetBuffer.writeInt16LE(offsetCentiHours, 0); // Signé, Little Endian

    const gmtCrc = calculateCRC(gmtOffsetBuffer); // Calcul du CRC pour l'offset GMT
    const gmtCrcBytes = Buffer.from([(gmtCrc >> 8) & 0xFF, gmtCrc & 0xFF]);
    const gmtPayload = Buffer.concat([gmtOffsetBuffer, gmtCrcBytes]);

    await sendCommand(vp2StationConfig, `EEBWR 14 02`, 1000, "<ACK>");
    await sendCommand(vp2StationConfig, gmtPayload, 2000, "<ACK>");
    console.log('Offset GMT défini.');

    await sendCommand(vp2StationConfig, `EEWR 16 01`, 2000, "<LF><CR>OK<LF><CR>");
    console.log('Mode fuseau horaire personnalisé activé.');

    // Appliquer les changements avec NEWSETUP (important après SETTIME/timezone)
    console.log('Application des changements avec NEWSETUP...');
    await sendCommand(vp2StationConfig, 'NEWSETUP', 2000, "<ACK>");
    console.log('NEWSETUP exécuté avec succès.');

    return {
        status: 'success',
        message: 'Heure et fuseau horaire de la station définis avec succès.',
        details: {
            serverUtc: serverUtcDate.toISOString(),
            derivedLocalTime: targetLocalTime.toISOString(),
            derivedOffsetHours: offsetHoursFloat,
            derivedOffsetCentiHours: offsetCentiHours
        }
    };
};

/**
 * @api {post} /api/station/set-location Définir la longitude, latitude et altitude
 * @apiGroup Station
 * @apiBody {Number} latitude Latitude en degrés (ex: 43.21).
 * @apiBody {Number} longitude Longitude en degrés (ex: -0.12).
 * @apiBody {Number} elevation Altitude en pieds (ex: 200).
 * @apiDescription Définit la latitude, la longitude et l'altitude de la station.
 * Les lampes de la console sont allumées pendant l'opération et éteintes après.
 */
const _setStationLocation = async (req, res) => {
    const vp2StationConfig = req.stationConfig;

    const {
        latitude,
        longitude,
        elevation
    } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof elevation !== 'number') {
        res.status(400).json({
            error: 'Les paramètres latitude, longitude et elevation sont requis et doivent être des nombres.'
        });
        return;
    }

    // Latitude (EEPROM address 0x0B, Size 2, en dixièmes de degré, signé, Little Endian) [cite: VantageSerialProtocolDocs_v261.pdf, Page 39]
    // Négatif = hémisphère sud.
    const latValue = Math.round(latitude * 10);
    const latBuffer = Buffer.alloc(2);
    latBuffer.writeInt16LE(latValue, 0);

    // Longitude (EEPROM address 0x0D, Size 2, en dixièmes de degré, signé, Little Endian) [cite: VantageSerialProtocolDocs_v261.pdf, Page 39]
    // Négatif = hémisphère ouest.
    const lonValue = Math.round(longitude * 10);
    const lonBuffer = Buffer.alloc(2);
    lonBuffer.writeInt16LE(lonValue, 0);

    // Elevation (via la commande BAR=, en pieds, décimal) [cite: VantageSerialProtocolDocs_v261.pdf, Page 16, 39]
    // Format: BAR=<bar value to display (in Hg * 1000)-decimal> <elevation (ft)-decimal>
    const barCommand = `BAR=0 ${Math.round(elevation)}`; // "0" pour ne pas forcer la valeur barométrique

    // Écriture dans l'EEPROM pour Latitude et Longitude via EEBWR
    // EEBWR <EE address-hex> <number of bytes to write-hex> [cite: VantageSerialProtocolDocs_v261.pdf, Page 15]
    // Suivi des données binaires + CRC (CRC est MSB first) [cite: VantageSerialProtocolDocs_v261.pdf, Page 15, 39]

    console.log(`Définition de la latitude (${latitude})...`);
    const latCrc = calculateCRC(latBuffer);
    const latCrcBytes = Buffer.from([(latCrc >> 8) & 0xFF, latCrc & 0xFF]);
    const latPayload = Buffer.concat([latBuffer, latCrcBytes]);
    await sendCommand(vp2StationConfig, `EEBWR 0B 02`, 1000, "<ACK>");
    await sendCommand(vp2StationConfig, latPayload, 2000, "<ACK>");
    console.log('Latitude définie.');

    console.log(`Définition de la longitude (${longitude})...`);
    const lonCrc = calculateCRC(lonBuffer);
    const lonCrcBytes = Buffer.from([(lonCrc >> 8) & 0xFF, lonCrc & 0xFF]);
    const lonPayload = Buffer.concat([lonBuffer, lonCrcBytes]);
    await sendCommand(vp2StationConfig, `EEBWR 0D 02`, 1000, "<ACK>");
    await sendCommand(vp2StationConfig, lonPayload, 2000, "<ACK>");
    console.log('Longitude définie.');

    // L'élévation se fait via la commande BAR=
    console.log(`Définition de l'altitude (${elevation})...`);
    await sendCommand(vp2StationConfig, barCommand, 2000, "<LF><CR>OK<LF><CR>");
    console.log('Altitude définie.');

    // Appliquer les changements avec NEWSETUP
    console.log('Application des changements avec NEWSETUP...');
    await sendCommand(vp2StationConfig, 'NEWSETUP', 2000, "<ACK>");
    console.log('NEWSETUP exécuté avec succès.');

    return {
        status: 'success',
        message: 'Localisation de la station définie avec succès.'
    };
};

/**
 * @api {post} /api/station/set-timezone Définir le fuseau horaire
 * @apiGroup Station
 * @apiBody {String} type "preset" ou "custom".
 * @apiBody {Number} [index] Si type="preset", l'index du fuseau horaire (voir doc PDF p.44).
 * @apiBody {Number} [offsetGMT] Si type="custom", le décalage GMT en centièmes d'heures (ex: 100 pour +1h, -500 pour -5h).
 * @apiDescription Définit le fuseau horaire de la station.
 * Les lampes de la console sont allumées pendant l'opération et éteintes après.
 */
const _setStationTimezone = async (req, res) => {
    const vp2StationConfig = req.stationConfig;

    const {
        type,
        index,
        offsetGMT
    } = req.body;

    if (!type || (type === 'preset' && typeof index !== 'number') || (type === 'custom' && typeof offsetGMT !== 'number')) {
        res.status(400).json({
            error: 'Les paramètres "type" et "index" ou "offsetGMT" sont requis.'
        });
        return;
    }

    if (type === 'preset') {
        // Utilise un fuseau horaire prédéfini
        // EEPROM address 0x11 (17 dec) pour TIME_ZONE [cite: VantageSerialProtocolDocs_v261.pdf, Page 39]
        // EEPROM address 0x16 (22 dec) pour GMT_OR_ZONE, doit être 0x00 [cite: VantageSerialProtocolDocs_v261.pdf, Page 40]

        console.log(`Définition du fuseau horaire prédéfini (Index: ${index})...`);
        await sendCommand(vp2StationConfig, `EEWR 11 ${index.toString(16).padStart(2, '0')}`, 2000, "<LF><CR>OK<LF><CR>");
        await sendCommand(vp2StationConfig, `EEWR 16 00`, 2000, "<LF><CR>OK<LF><CR>");
        console.log('Fuseau horaire prédéfini défini avec succès.');

    } else if (type === 'custom') {
        // Utilise un décalage GMT personnalisé
        // EEPROM address 0x14 (20 dec) pour GMT_OFFSET (2 bytes, centièmes d'heures, signé, Little Endian) [cite: VantageSerialProtocolDocs_v261.pdf, Page 40]
        // EEPROM address 0x16 (22 dec) pour GMT_OR_ZONE, doit être 0x01 [cite: VantageSerialProtocolDocs_v261.pdf, Page 40]

        const gmtOffsetBuffer = Buffer.alloc(2);
        gmtOffsetBuffer.writeInt16LE(offsetGMT, 0); // Signé, Little Endian

        const gmtCrc = calculateCRC(gmtOffsetBuffer);
        const gmtCrcBytes = Buffer.from([(gmtCrc >> 8) & 0xFF, gmtCrc & 0xFF]);
        const gmtPayload = Buffer.concat([gmtOffsetBuffer, gmtCrcBytes]);

        console.log(`Définition du fuseau horaire personnalisé (Offset: ${offsetGMT})...`);
        await sendCommand(vp2StationConfig, `EEBWR 14 02`, 1000, "<ACK>");
        await sendCommand(vp2StationConfig, gmtPayload, 2000, "<ACK>");
        await sendCommand(vp2StationConfig, `EEWR 16 01`, 2000, "<LF><CR>OK<LF><CR>");
        console.log('Fuseau horaire personnalisé défini avec succès.');
    } else {
        throw new Error('Type de fuseau horaire invalide. Utilisez "preset" ou "custom".');
    }

    // Appliquer les changements avec NEWSETUP
    console.log('Application des changements avec NEWSETUP...');
    await sendCommand(vp2StationConfig, 'NEWSETUP', 2000, "<ACK>");
    console.log('NEWSETUP exécuté avec succès.');

    return {
        status: 'success',
        message: 'Fuseau horaire de la station défini avec succès.'
    };
};

/**
 * @api {get} /api/station/current-conditions Récupérer les conditions météorologiques actuelles
 * @apiGroup Station
 * @apiDescription Récupère les données actuelles de la station météo Vantage Pro2 en utilisant la commande LPS 2 1 (pour un paquet LOOP2).
 * Convertit les unités natives en unités préférées de l'utilisateur.
 * Effectue une validation des données simples (NaN, dash values).
 */
const _getCurrentConditions = async (req, res) => {
    const vp2StationConfig = req.stationConfig;

    // sendCommand gère l'ACK, le CRC et les tentatives. Il retourne les 99 octets de données du paquet LOOP2.
    // Récupère les données des paquets LOOP et LOOP2 pour une information plus complète.
    // La commande LPS 1 1 demande un paquet LOOP.
    // La commande LPS 2 1 demande un paquet LOOP2. (Note: The actual response includes LF CR before CRC, and data is 96 bytes)
    console.log('Récupération du paquet LOOP...');
    const loop1Bytes = await sendCommand(vp2StationConfig, 'LPS 1 1', 2000, "<ACK>97<CRC>");
    const loop1Data = parseLOOP1Data(loop1Bytes);

    console.log('Récupération du paquet LOOP2...');
    const loop2Bytes = await sendCommand(vp2StationConfig, 'LPS 2 1', 2000, "<ACK>97<CRC>");
    const loop2Data = parseLOOP2Data(loop2Bytes);

    // Agrège les données, en donnant la priorité aux données de LOOP2 qui sont plus précises.
    const aggregatedData = { ...loop1Data, ...loop2Data };

    // Parsing des données brutes
    // Conversion des unités
    const processedData = processWeatherData(aggregatedData, vp2StationConfig);
 
    return {
        status: 'success',
        message: 'Données actuelles (LOOP & LOOP2) récupérées avec succès.',
        data: processedData
    };
};

// Fonction helper pour lire un entier signé sur 2 octets (Little Endian)
// Davis utilise le Two's complement pour les nombres négatifs.
function readSignedInt16LE(buffer, offset) {
    let val = buffer.readUInt16LE(offset);
    val = (val > 0x7FFF ? val - 0x10000 : val)
    return val == -32768 ? NaN : val;
}
// Fonction helper pour lire un entier signé sur 1 octet (Little Endian)
function readInt8(buffer, offset) {
    const val = buffer.readInt8(offset);
    return val == -128 ? NaN : val;
}
// Fonction helper pour lire un entier non signé sur 2 octets (Little Endian)
function readUInt16LE(buffer, offset) {
    const val = buffer.readUInt16LE(offset);
    return val == 65535 ? NaN : val;
}
// Fonction helper pour lire un octet non signé
function readUInt8(buffer, offset) {
    const val = buffer.readUInt8(offset);
    return val == 255 ? NaN : val;
}

/**
 * Gère les "dash values" (valeurs invalides) dans les données météorologiques.
 * Remplace les valeurs invalides par NaN selon les critères spécifiés.
 * @param {object} weatherData L'objet contenant les données météorologiques.
 * @returns {object} L'objet weatherData avec les valeurs invalides remplacées par NaN.
 */
// function handleDashValues(weatherData) {
//     for (const key in weatherData) {
//         console.log(`[handleDashValues] Key: ${key}, Value: ${weatherData[key].value}`);
//         const val = weatherData[key].value;
//         switch (key) {
//             case 'dewPoint':
//             case 'heatIndex':
//             case 'windChill':
//                 if (val === -128) weatherData[key].value = NaN;
//                 break;
//             case 'inHumidity':
//             case 'outHumidity':
//             case 'windSpeed':
//             case 'avgWindSpeed10Min':
//             case 'rainRate':
//             case 'uvIndex':
//             case 'solarRadiation':
//             case 'stormRain':
//             case 'dayRain':
//             case 'monthRain':
//             case 'yearRain':
//             case 'dayET':
//             case 'monthET':
//             case 'yearET':
//             case 'soilmoisture1':
//             case 'soilmoisture2':
//             case 'soilmoisture3':
//             case 'soilmoisture4':
//             case 'LeafWetnesses1':
//             case 'LeafWetnesses2':
//             case 'LeafWetnesses3':
//             case 'LeafWetnesses4':
//                 if (val === 255) weatherData[key].value = NaN;
//                 break;
//             case 'windDir':
//                 if (val === 0) weatherData[key].value = NaN;
//                 break;
//             default:
//                 if ((val === 65535 || val === 32767) && !key.includes('Rain')) weatherData[key].value = NaN;
//         }
//     }
//     console.log(`[handleDashValues] Weather Data:`, weatherData);
//     return weatherData;
// }

/**
 * Parse les données binaires brutes d'un paquet LOOP (99 octets) dans un objet JavaScript.
 * Référence: VantageSerialProtocolDocs_v261.pdf Section X.1, "LOOP Packet Format", Page 22-24. (Actual data length is 96 bytes, followed by LF CR and CRC)
 * @param {Buffer} data Le buffer de données du paquet LOOP (99 octets, sans ACK ni CRC).
 * @returns {object} Un objet contenant les données météorologiques extraites.
 */
function parseLOOP1Data(data) {
    const weatherData = {};

    weatherData.barometer = { value: readUInt16LE(data, 7), native_unit: "inHg_1000th" };
    weatherData.inTemp = { value: readSignedInt16LE(data, 9), native_unit: "F_tenths" };
    weatherData.inHumidity = { value: readUInt8(data, 11), native_unit: "percent" };
    weatherData.outTemp = { value: readSignedInt16LE(data, 12), native_unit: "F_tenths" };
    weatherData.windSpeed = { value: readUInt8(data, 14), native_unit: "mph_whole" };
    weatherData.avgWindSpeed10Min = { value: readUInt8(data, 15), native_unit: "mph_whole" };
    weatherData.windDir = { value: readUInt16LE(data, 16), native_unit: "degrees" };
    weatherData.extraTemp1 = { value: readUInt8(data, 18), native_unit: "F_-90" };
    weatherData.extraTemp2 = { value: readUInt8(data, 19), native_unit: "F_-90" };
    weatherData.extraTemp3 = { value: readUInt8(data, 20), native_unit: "F_-90" };
    weatherData.extraTemp4 = { value: readUInt8(data, 21), native_unit: "F_-90" };
    weatherData.extraTemp5 = { value: readUInt8(data, 22), native_unit: "F_-90" };
    weatherData.extraTemp6 = { value: readUInt8(data, 23), native_unit: "F_-90" };
    weatherData.extraTemp7 = { value: readUInt8(data, 24), native_unit: "F_-90" };
    weatherData.SoilTemp1 = { value: readUInt8(data, 25), native_unit: "F_-90" };
    weatherData.SoilTemp2 = { value: readUInt8(data, 26), native_unit: "F_-90" };
    weatherData.SoilTemp3 = { value: readUInt8(data, 27), native_unit: "F_-90" };
    weatherData.SoilTemp4 = { value: readUInt8(data, 28), native_unit: "F_-90" };
    weatherData.LeafTemp1 = { value: readUInt8(data, 29), native_unit: "F_-90" };
    weatherData.LeafTemp2 = { value: readUInt8(data, 30), native_unit: "F_-90" };
    weatherData.LeafTemp3 = { value: readUInt8(data, 31), native_unit: "F_-90" };
    weatherData.LeafTemp4 = { value: readUInt8(data, 32), native_unit: "F_-90" };
    weatherData.outHumidity = { value: readUInt8(data, 33), native_unit: "percent" };
    weatherData.extraHumidity1 = { value: readUInt8(data, 34), native_unit: "percent" };
    weatherData.extraHumidity2 = { value: readUInt8(data, 35), native_unit: "percent" };
    weatherData.extraHumidity3 = { value: readUInt8(data, 36), native_unit: "percent" };
    weatherData.extraHumidity4 = { value: readUInt8(data, 37), native_unit: "percent" };
    weatherData.extraHumidity5 = { value: readUInt8(data, 38), native_unit: "percent" };
    weatherData.extraHumidity6 = { value: readUInt8(data, 39), native_unit: "percent" };
    weatherData.extraHumidity7 = { value: readUInt8(data, 40), native_unit: "percent" };
    weatherData.rainRate = { value: readUInt16LE(data, 41), native_unit: "clicks*cup_size" };
    weatherData.uvIndex = { value: readUInt8(data, 43), native_unit: "uv_index" };
    weatherData.solarRadiation = { value: readUInt16LE(data, 44), native_unit: "watts_per_m2" };
    weatherData.stormRain = { value: readUInt16LE(data, 46), native_unit: "in_100th" };
    weatherData.dateStormRain = { value: readUInt16LE(data, 48), native_unit: "clicks*cup_size" };
    weatherData.dayRain = { value: readUInt16LE(data, 50), native_unit: "clicks*cup_size" };
    weatherData.monthRain = { value: readUInt16LE(data, 52), native_unit: "clicks*cup_size" };
    weatherData.yearRain = { value: readUInt16LE(data, 54), native_unit: "clicks_0_01in" };
    weatherData.dayET = { value: readUInt16LE(data, 56), native_unit: "in_1000th" };
    weatherData.monthET = { value: readUInt16LE(data, 58), native_unit: "in_100th" };
    weatherData.yearET = { value: readUInt16LE(data, 60), native_unit: "in_100th" };
    weatherData.soilmoisture1 = { value: readUInt8(data, 62), native_unit: "centiBar" };
    weatherData.soilmoisture2 = { value: readUInt8(data, 63), native_unit: "centiBar" };
    weatherData.soilmoisture3 = { value: readUInt8(data, 64), native_unit: "centiBar" };
    weatherData.soilmoisture4 = { value: readUInt8(data, 65), native_unit: "centiBar" };
    weatherData.LeafWetnesses1 = { value: readUInt8(data, 66), native_unit: "0-15" };
    weatherData.LeafWetnesses2 = { value: readUInt8(data, 67), native_unit: "0-15" };
    weatherData.LeafWetnesses3 = { value: readUInt8(data, 68), native_unit: "0-15" };
    weatherData.LeafWetnesses4 = { value: readUInt8(data, 69), native_unit: "0-15" };
    weatherData.batteryStatus = { value: readUInt8(data, 86), native_unit: "0-1" };
    weatherData.batteryVoltage = { value: readUInt16LE(data, 87), native_unit: "((DataRaw * 3)/512) V" };
    weatherData.ForecastIcons = { value: readUInt8(data, 89), native_unit: "0-4" };
    weatherData.ForecastRuleNumber = { value: readUInt8(data, 90), native_unit: "0-1" };
    weatherData.Sunrise = { value: readUInt16LE(data, 91), native_unit: "HHMM" };
    weatherData.Sunset = { value: readUInt16LE(data, 93), native_unit: "HHMM" };
    // console.log(`[Parsing LOOP1] Extracted Weather Data:`, weatherData);

    // weatherData = handleDashValues(weatherData);


    return weatherData;
}

/**
 * Parse un enregistrement d'archive de 52 octets (DMPAFT Rev B).
 * Référence: VantageSerialProtocolDocs_v261.pdf Section XI, "Rev "B" archive record", Page 35.
 * @param {Buffer} recordBuffer Le buffer de 52 octets pour un enregistrement.
 * @returns {object} Un objet contenant les données météorologiques de cet enregistrement.
 */
function parseDMPRecord(recordBuffer) {
    const record = {};

    // Date et Heure
    const dateStamp = recordBuffer.readUInt16LE(0);
    const timeStamp = recordBuffer.readUInt16LE(2);
    const year = Math.floor(dateStamp / 512) + 2000;
    const month = Math.floor((dateStamp % 512) / 32);
    const day = dateStamp % 32;
    const hour = Math.floor(timeStamp / 100);
    const minute = timeStamp % 100;
    record.timestamp = new Date(year, month - 1, day, hour, minute).toISOString();

    // Données météorologiques
    record.outTemp = { value: readSignedInt16LE(recordBuffer, 3), native_unit: "F_tenths" };
    record.hiOutTemp = { value: readSignedInt16LE(recordBuffer, 5), native_unit: "F_tenths" };
    record.lowOutTemp = { value: readSignedInt16LE(recordBuffer, 7), native_unit: "F_tenths" };
    record.rain = { value: readUInt16LE(recordBuffer, 9), native_unit: "clicks*cup_size" };
    record.hiRainRate = { value: readUInt16LE(recordBuffer, 11), native_unit: "clicks*cup_size" };
    record.barometer = { value: readUInt16LE(recordBuffer, 13), native_unit: "inHg_1000th" };
    record.solarRadiation = { value: readUInt16LE(recordBuffer, 15), native_unit: "watts_per_m2" };
    record.windSamples = { value: readUInt16LE(recordBuffer, 17), native_unit: "count" };
    record.inTemp = { value: readSignedInt16LE(recordBuffer, 19), native_unit: "F_tenths" };
    record.inHumidity = { value: readUInt8(recordBuffer, 21), native_unit: "percent" };
    record.outHumidity = { value: readUInt8(recordBuffer, 22), native_unit: "percent" };
    record.avgUVIndex = { value: readUInt8(recordBuffer, 23), native_unit: "uv_index" };
    record.hiUVIndex = { value: readUInt8(recordBuffer, 24), native_unit: "uv_index" };
    record.hiSolarRad = { value: readUInt16LE(recordBuffer, 25), native_unit: "watts_per_m2" };
    record.windDir = { value: readUInt8(recordBuffer, 27), native_unit: "0-15_scaled" }; // 0-15, 255=n/a
    record.avgWindSpeed = { value: readUInt8(recordBuffer, 28), native_unit: "mph_whole" };
    record.hiWindSpeed = { value: readUInt8(recordBuffer, 29), native_unit: "mph_whole" };
    record.hiWindDir = { value: readUInt8(recordBuffer, 30), native_unit: "0-15_scaled" }; // 0-15, 255=n/a
    // ... et ainsi de suite pour les autres champs si nécessaire.

    return record;
}

/**
 * @api {get} /api/station/:stationId/archives/download Télécharger les archives depuis la station
 * @apiGroup Station
 * @apiParam {String} [startDate] Date de début au format ISO (ex: 2023-10-27T00:00:00.000Z). Par défaut, la date de la dernière archive + 1 minute.
 * @apiDescription Télécharge les enregistrements d'archive depuis la mémoire de la station en utilisant la commande DMPAFT.
 */
const _getArchiveData = async (req, res) => {
    const stationConfig = req.stationConfig;
    let startDate;

    if (req.query.startDate) {
        startDate = new Date(req.query.startDate);
        if (isNaN(startDate.getTime())) {
            return res.status(400).json({ error: "Format de startDate invalide. Utilisez le format ISO 8601." });
        }
    } else if (stationConfig.lastArchiveDate) {
        startDate = new Date(stationConfig.lastArchiveDate);
        startDate.setMinutes(startDate.getMinutes() + 1); // Commence une minute après la dernière archive
    } else {
        startDate = new Date(new Date().getTime() - 24 * 60 * 60 * 1000); // Par défaut, les dernières 24h
    }

    console.log(`[Archive Download] Début du téléchargement des archives pour ${stationConfig.id} à partir de ${startDate.toISOString()}`);

    // 1. Initier la séquence DMPAFT
    await sendCommand(stationConfig, 'DMPAFT', 1000, "<ACK>");

    // 2. Envoyer la date de début et recevoir le nombre de pages
    const year = startDate.getFullYear();
    const month = startDate.getMonth() + 1;
    const day = startDate.getDate();
    const dateStamp = (year - 2000) * 512 + month * 32 + day;
    const timeStamp = startDate.getHours() * 100 + startDate.getMinutes();

    const datePayload = Buffer.alloc(4);
    datePayload.writeUInt16LE(dateStamp, 0);
    datePayload.writeUInt16LE(timeStamp, 2);
    const dateCrc = calculateCRC(datePayload);
    const dateCrcBytes = Buffer.from([(dateCrc >> 8) & 0xFF, dateCrc & 0xFF]);
    const fullDatePayload = Buffer.concat([datePayload, dateCrcBytes]);

    const pageInfo = await sendCommand(stationConfig, fullDatePayload, 1000, "<ACK>4<CRC>");
    const numberOfPages = pageInfo.readUInt16LE(0);
    console.log(`[Archive Download] La station a ${numberOfPages} pages d'archives à télécharger.`);

    if (numberOfPages === 0) {
        return { status: 'success', message: 'Aucune nouvelle donnée d\'archive à télécharger.', data: [] };
    }

    // 3. Télécharger chaque page
    const allRecords = [];
    for (let i = 0; i < numberOfPages; i++) {
        console.log(`[Archive Download] Téléchargement de la page ${i + 1}/${numberOfPages}...`);
        const ackByte = Buffer.from([0x06]);
        const pageData = await sendCommand(stationConfig, ackByte, 2000, "265<CRC>");
        for (let j = 0; j < 5; j++) {
            const recordBuffer = pageData.slice(j * 52, (j + 1) * 52);
            const parsedRecord = parseDMPRecord(recordBuffer);
            allRecords.push(parsedRecord);
        }
    }

    // 4. Mettre à jour la date de la dernière archive et sauvegarder
    if (allRecords.length > 0) {
        const latestRecord = allRecords[allRecords.length - 1];
        stationConfig.lastArchiveDate = latestRecord.timestamp;
        fs.writeFileSync(path.resolve(__dirname, '../config/VP2.json'), JSON.stringify(allVp2StationConfigs, null, 4));
        console.log(`[Archive Download] Date de la dernière archive mise à jour: ${stationConfig.lastArchiveDate}`);
    }

    return { status: 'success', message: `${allRecords.length} enregistrements d'archive téléchargés.`, data: allRecords };
};

/**
 * @api {post} /api/station/:stationId/archives Recevoir les données d'archive DMPAFT Rev B
 * @apiGroup Station
 * @apiBody {Object[]} archiveData Tableau d'objets de données d'archive. Chaque objet doit avoir une propriété 'timestamp'.
 * @apiDescription Reçoit les données d'archive d'un appareil DMPAFT Rev B et met à jour la date de la dernière archive dans la configuration de la station.
 */
const _receiveArchiveData = async (req, res) => {
    const stationConfig = req.stationConfig;
    const archiveData = req.body;

    if (!Array.isArray(archiveData) || archiveData.length === 0) {
        return res.status(400).json({ error: 'Les données d\'archive doivent être un tableau non vide.' });
    }

    let latestTimestamp = null;
    try {
        for (const record of archiveData) {
            if (record.timestamp) {
                const currentRecordDate = new Date(record.timestamp);
                if (isNaN(currentRecordDate.getTime())) {
                    throw new Error(`Timestamp invalide trouvé: ${record.timestamp}`);
                }
                if (latestTimestamp === null || currentRecordDate > latestTimestamp) {
                    latestTimestamp = currentRecordDate;
                }
            }
        }
    } catch (error) {
        return res.status(400).json({ error: `Erreur lors du traitement des timestamps d'archive: ${error.message}` });
    }

    if (latestTimestamp === null) {
        return res.status(400).json({ error: 'Aucun timestamp valide trouvé dans les données d\'archive.' });
    }

    // Convertir en chaîne ISO pour le stockage
    const newLastArchiveDate = latestTimestamp.toISOString();

    // Vérifier si la nouvelle date est réellement plus récente que celle stockée
    const currentStoredDate = stationConfig.lastArchiveDate ? new Date(stationConfig.lastArchiveDate) : null;

    if (currentStoredDate && latestTimestamp <= currentStoredDate) {
        console.log(`[Archive] La date d'archive reçue (${newLastArchiveDate}) n'est pas plus récente que la date stockée (${stationConfig.lastArchiveDate}).`);
        return res.status(200).json({
            status: 'success',
            message: 'Données d\'archive reçues, mais la date n\'est pas plus récente que celle déjà enregistrée.',
            lastArchiveDate: stationConfig.lastArchiveDate
        });
    }

    try {
        // Mettre à jour l'objet de configuration en mémoire
        stationConfig.lastArchiveDate = newLastArchiveDate;

        // Sauvegarder l'objet allVp2StationConfigs complet dans le fichier
        fs.writeFileSync(path.resolve(__dirname, '../config/VP2.json'), JSON.stringify(allVp2StationConfigs, null, 4));
        console.log(`[Archive] Date de la dernière archive mise à jour pour ${stationConfig.id}: ${newLastArchiveDate}`);

        return res.status(200).json({ status: 'success', message: 'Données d\'archive reçues et date de la dernière archive mise à jour.', lastArchiveDate: newLastArchiveDate });
    } catch (error) {
        console.error(`[Archive] Erreur lors de la mise à jour de VP2.json pour ${stationConfig.id}: ${error.message}`);
        return res.status(500).json({ error: `Erreur serveur lors de la mise à jour de la date d'archive: ${error.message}` });
    }
};

/**
 * Lit les paramètres de configuration depuis l'EEPROM de la station si elles ne sont pas définies dans le fichier JSON.
 * @param {object} stationConfig La configuration initiale de la station depuis le fichier JSON.
 * @returns {Promise<object>} La configuration fusionnée avec les valeurs lues depuis la station.
 */
async function _fetchAndMergeStationConfig(stationConfig) {
    const mergedConfig = { ...stationConfig }; // Commence avec la configuration du JSON

    // Helper pour lire depuis l'EEPROM
    const readEeprom = async (address, length) => {
        const addressHex = address.toString(16).padStart(2, '0').toUpperCase();
        const lengthHex = length.toString(16).padStart(2, '0').toUpperCase();
        const command = `EERD ${addressHex} ${lengthHex}`;
        const answerFormat = `<ACK>${length}<CRC>`;
        return await sendCommand(stationConfig, command, 2000, answerFormat);
    };

    // --- Latitude ---
    if (mergedConfig.latitude == undefined || mergedConfig.latitude.value == null) {
        try {
            const data = await readEeprom(0x0B, 2);
            mergedConfig.latitude = data.readInt16LE(0) / 10.0;
            console.log(`[getStationSettings] Latitude lue depuis la station: ${mergedConfig.latitude}`);
        } catch (e) { console.error(`[getStationSettings] Échec de la lecture de la latitude: ${e.message}`); }
    }

    // --- Longitude ---
    if (mergedConfig.longitude == undefined || mergedConfig.longitude.value == null) {
        try {
            const data = await readEeprom(0x0D, 2);
            mergedConfig.longitude = data.readInt16LE(0) / 10.0;
            console.log(`[getStationSettings] Longitude lue depuis la station: ${mergedConfig.longitude}`);
        } catch (e) { console.error(`[getStationSettings] Échec de la lecture de la longitude: ${e.message}`); }
    }

    // --- Altitude (en pieds) ---
    if (mergedConfig.altitude == undefined || mergedConfig.altitude.value == null) {
        try {
            const data = await readEeprom(0x0F, 2);
            mergedConfig.altitude = data.readUInt16LE(0);
            console.log(`[getStationSettings] Altitude lue depuis la station: ${mergedConfig.altitude} ft`);
        } catch (e) { console.error(`[getStationSettings] Échec de la lecture de l'altitude: ${e.message}`); }
    }

    // --- Taille du pluviomètre ---
    if (mergedConfig.rainCollectorSize == undefined || mergedConfig.rainCollectorSize.value == null) {
        try {
            const data = await readEeprom(0x0A, 1);
            mergedConfig.rainCollectorSize = data.readUInt8(0) === 1 ? '1-0.2mm' : '0-0.01in';
            console.log(`[getStationSettings] Taille du pluviomètre lue depuis la station: ${mergedConfig.rainCollectorSize}`);
        } catch (e) { console.error(`[getStationSettings] Échec de la lecture de la taille du pluviomètre: ${e.message}`); }
    }

    // --- Taille de l'anémomètre ---
    if (mergedConfig.windCupSize == undefined || mergedConfig.windCupSize.value == null) {
        try {
            const data = await readEeprom(0x10, 1);
            mergedConfig.windCupSize = data.readUInt8(0) === 1 ? '1-Large' : '0-Small';
            console.log(`[getStationSettings] Taille de l'anémomètre lue depuis la station: ${mergedConfig.windCupSize}`);
        } catch (e) { console.error(`[getStationSettings] Échec de la lecture de la taille de l'anémomètre: ${e.message}`); }
    }

    // --- Début de la saison des pluies ---
    if (mergedConfig.rainSaisonStart == undefined || mergedConfig.rainSaisonStart.value == null) {
        try {
            const data = await readEeprom(0x12, 1);
            const monthIndex = data.readUInt8(0);
            const months = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
            if (monthIndex >= 1 && monthIndex <= 12) {
                mergedConfig.rainSaisonStart = `${monthIndex}-${months[monthIndex - 1]}`;
                console.log(`[getStationSettings] Début de la saison des pluies lu depuis la station: ${mergedConfig.rainSaisonStart}`);
            }
        } catch (e) { console.error(`[getStationSettings] Échec de la lecture du début de la saison des pluies: ${e.message}`); }
    }

    console.log(mergedConfig);
    return mergedConfig;
}
/**
 * @api {get} /api/station/settings Récupérer les paramètres de la station
 * @apiGroup Station
 * @apiDescription Récupère les paramètres statiques (longitude, latitude, altitude, timezone, etc.)
 * et l'heure actuelle de la station.
 */
const _getStationSettings = async (req, res) => {
    const vp2StationConfig = req.stationConfig;
    
    // Lit les paramètres manquants depuis la station et les fusionne avec la config JSON
    const mergedConfig = await _fetchAndMergeStationConfig(vp2StationConfig);

    // Construit la réponse avec les paramètres statiques
    const staticSettings = {
        name: mergedConfig.Name,
        host: mergedConfig.host,
        port: mergedConfig.port,
        longitude: mergedConfig.longitude,
        latitude: mergedConfig.latitude,
        altitude: mergedConfig.altitude,
        timezone: mergedConfig.timezone,
        windCupSize: mergedConfig.windCupSize,
        rainCollectorSize: mergedConfig.rainCollectorSize,
        rainSaisonStart: mergedConfig.rainSaisonStart,
    };

    // Tente de récupérer l'heure actuelle de la station
    let currentTimeISO = null;
    let message = 'Paramètres de la station récupérés avec succès.';
    let status = 'success';

    try {
        const stationTimeDataBytes = await sendCommand(vp2StationConfig, 'GETTIME', 2000, "<ACK>6<CRC>");
        const stationYear = stationTimeDataBytes[5] + 1900;
        const stationMonth = stationTimeDataBytes[4] - 1; // Les mois en JS sont 0-indexés (0-11)
        const stationDay = stationTimeDataBytes[3];
        const stationHour = stationTimeDataBytes[2];
        const stationMinute = stationTimeDataBytes[1];
        const stationSecond = stationTimeDataBytes[0];
        const currentStationDate = new Date(Date.UTC(stationYear, stationMonth, stationDay, stationHour, stationMinute, stationSecond));
        currentTimeISO = currentStationDate.toISOString();
    } catch (error) {
        console.error(`[getStationSettings] Impossible d'obtenir l'heure de la station: ${error.message}`);
        message = 'Paramètres de configuration récupérés, mais impossible d\'obtenir l\'heure de la station.';
        status = 'partial_success';
    }

    return { status, message, settings: { ...staticSettings, currentTime: currentTimeISO } };
};

/**
 * Parse les données binaires brutes d'un paquet LOOP2 (96 octets) dans un objet JavaScript.
 * Référence: VantageSerialProtocolDocs_v261.pdf Section X.2, "LOOP2 Packet Format", Page 25-27.
 * Les valeurs sont dans leurs unités natives Davis. (Actual data length is 96 bytes, followed by LF CR and CRC)
 * @param {Buffer} data Le buffer de données du paquet LOOP2 (99 octets, sans ACK ni CRC).
 * @returns {object} Un objet contenant les données météorologiques extraites.
 */
function parseLOOP2Data(data) {
    const weatherData = {};

    // --- Parsing des champs clés du paquet LOOP2 (Offset et Taille sont en octets) ---
    weatherData.barometer = { value: readUInt16LE(data, 7), native_unit: "inHg_1000th" };
    weatherData.inTemp = { value: readSignedInt16LE(data, 9), native_unit: "F_tenths" };
    weatherData.inHumidity = { value: readUInt8(data, 11), native_unit: "percent" };
    weatherData.outTemp = { value: readSignedInt16LE(data, 12), native_unit: "F_tenths" };
    weatherData.windSpeed = { value: readUInt8(data, 14), native_unit: "mph_whole" };
    weatherData.windDir = { value: readUInt16LE(data, 16), native_unit: "degrees" };
    weatherData.avgWindSpeed10Min = { value: readUInt16LE(data, 18), native_unit: "mph_tenths" };
    weatherData.avgWindSpeed2Min = { value: readUInt16LE(data, 20), native_unit: "mph_tenths" };
    weatherData.windGust10Min = { value: readUInt16LE(data, 22), native_unit: "mph_tenths" };
    weatherData.windGustDir10Min = { value: readUInt16LE(data, 24), native_unit: "degrees" };
    weatherData.dewPoint = { value: readSignedInt16LE(data, 30), native_unit: "F_whole" };
    weatherData.outHumidity = { value: readUInt8(data, 33), native_unit: "percent" };
    weatherData.heatIndex = { value: readSignedInt16LE(data, 35), native_unit: "F_whole" };
    weatherData.windChill = { value: readSignedInt16LE(data, 37), native_unit: "F_whole" };
    weatherData.THSW = { value: readSignedInt16LE(data, 39), native_unit: "F_whole" };
    weatherData.rainRate = { value: readUInt16LE(data, 41), native_unit: "clicks*cup_size" };
    weatherData.uvIndex = { value: readUInt8(data, 43), native_unit: "uv_index" };
    weatherData.solarRadiation = { value: readUInt16LE(data, 44), native_unit: "watts_per_m2" };
    weatherData.stormRain = { value: readUInt16LE(data, 46), native_unit: "clicks*cup_size" };
    weatherData.dateStormRain = { value: readUInt16LE(data, 48), native_unit: "clicks*cup_size" };
    weatherData.dayRain = { value: readUInt16LE(data, 50), native_unit: "clicks*cup_size" };
    weatherData.last15MinRain = { value: readUInt16LE(data, 52), native_unit: "clicks*cup_size" };
    weatherData.lastHourRain = { value: readUInt16LE(data, 54), native_unit: "clicks*cup_size" };
    weatherData.dayET = { value: readUInt16LE(data, 56), native_unit: "in_1000th" };
    weatherData.last24HourRain = { value: readUInt16LE(data, 58), native_unit: "clicks*cup_size" };
    weatherData.inBarometer = { value: readUInt16LE(data, 60), native_unit: "inHg_1000th" }; // Pression intérieure non corrigée

    // console.log(`[Parsing LOOP2] Extracted Weather Data:`, weatherData); // Add this line

    // weatherData = handleDashValues(weatherData);

    return weatherData;
}
/**
 * Convertit une valeur brute en valeur réelle dans l'unité native de la station
 * @param {string} key - Clé de la donnée météo (ex: 'outTemp')
 * @param {number} rawValue - Valeur brute lue depuis la station
 * @param {string} nativeUnit - Unité native spécifiée dans les données
 * @param {object} stationConfig - Configuration de la station
 * @returns {number|string} Valeur convertie dans l'unité native
 */
function convertRawValue2NativeValue(key, rawValue, nativeUnit, stationConfig) {
    if (isNaN(rawValue)) return NaN;
    
    switch (nativeUnit) {
        // Conversions pour la température
        case 'F_tenths':
            return rawValue / 10;  // Convertit les dixièmes de °F en °F
        case 'F_whole':
            return rawValue;
        case 'F_-90':
            return rawValue - 90;  // Convertit l'offset de 90°F en °F réel
            
        // Conversions pour la pression
        case 'inHg_1000th':
            return rawValue / 1000;  // Convertit les millièmes de inHg en inHg
            
        // Conversions pour la pluie
        case 'in_100th':
            return rawValue / 100;  // Centièmes de pouce -> pouces
        case 'in_1000th':
            return rawValue / 1000;  // Millièmes de pouce -> pouces
        case 'clicks*cup_size':
            // Utilise la taille du collecteur de pluie de la configuration
            const cupSize = stationConfig.rainCollectorSize === 0 ? 0.01 : 0.2;
            return rawValue * cupSize;
        case 'clicks_0_01in':
            return rawValue * 0.01;  // Clicks (0.01") -> pouces
            
        // Conversions pour le vent
        case 'mph_tenths':
            return rawValue / 10;  // Dixièmes de mph -> mph
            
        // Conversions pour la batterie
        case '((DataRaw * 3)/512) V':
            return (rawValue * 3) / 512;  // Formule spécifique pour la tension
            
        // Conversions pour le temps
        case 'HHMM':
            // Formate l'heure au format HH:MM
            const hours = Math.floor(rawValue / 100);
            const minutes = rawValue % 100;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            
        // Valeurs directes (pas de conversion nécessaire)
        case 'percent':
        case 'degrees':
        case 'mph_whole':
        case 'uv_index':
        case 'watts_per_m2':
        case 'centiBar':
        case '0-15':
        case '0-1':
        case '0-4':
            return rawValue;
            
        default:
            console.warn(`Unité native non gérée: ${nativeUnit} pour la clé ${key}`);
            return rawValue;
    }
}
// Définition de sensorTypeMap et conversionTable
const sensorTypeMap = {
    barometer: 'pressure',
    inTemp: 'temperature',
    inHumidity: 'humidity',
    outTemp: 'temperature',
    windSpeed: 'speed',
    avgWindSpeed10Min: 'speed',
    windDir: 'direction',
    extraTemp1: 'temperature',
    extraTemp2: 'temperature',
    extraTemp3: 'temperature',
    extraTemp4: 'temperature',
    extraTemp5: 'temperature',
    extraTemp6: 'temperature',
    extraTemp7: 'temperature',
    SoilTemp1: 'temperature',
    SoilTemp2: 'temperature',
    SoilTemp3: 'temperature',
    SoilTemp4: 'temperature',
    LeafTemp1: 'temperature',
    LeafTemp2: 'temperature',
    LeafTemp3: 'temperature',
    LeafTemp4: 'temperature',
    outHumidity: 'humidity',
    extraHumidity1: 'humidity',
    extraHumidity2: 'humidity',
    extraHumidity3: 'humidity',
    extraHumidity4: 'humidity',
    extraHumidity5: 'humidity',
    extraHumidity6: 'humidity',
    extraHumidity7: 'humidity',
    rainRate: 'rainRate',
    uvIndex: 'uv',
    solarRadiation: 'powerRadiation',
    stormRain: 'rain',
    dayRain: 'rain',
    monthRain: 'rain',
    yearRain: 'rain',
    dayET: 'rain',
    monthET: 'rain',
    yearET: 'rain',
    batteryVoltage: 'battery',
    avgWindSpeed2Min: 'speed',
    windGust10Min: 'speed',
    windGustDir10Min: 'direction',
    dewPoint: 'temperature',
    heatIndex: 'temperature',
    windChill: 'temperature',
    THSW: 'temperature',
    last15MinRain: 'rain',
    lastHourRain: 'rain',
    last24HourRain: 'rain',
    inBarometer: 'pressure'
  };
  
  const conversionTable = {
    temperature: {
      '°C': (f) => (f - 32) * 5/9,
      '°F': (f) => f,
      'K': (f) => (f - 32) * 5/9 + 273.15
    },
    speed: {
      'mph': (mph) => mph,
      'm/s': (mph) => mph * 0.44704,
      'km/h': (mph) => mph * 1.609344,
      'knots': (mph) => mph * 0.868976
    },
    direction: {
      '°': (deg) => deg,
      'cardinal': (deg) => mapDegreesToCardinal(deg)
    },
    pressure: {
      'inhg': (inHg) => inHg,
      'hpa': (inHg) => inHg * 33.8639,
      'mb': (inHg) => inHg * 33.8639
    },
    rain: {
      'mm': (inches) => inches * 25.4,
      'in': (inches) => inches,
      'l/m²': (inches) => inches * 25.4
    },
    rainRate: {
      'mm/h': (inchesPerHour) => inchesPerHour * 25.4,
      'in/h': (inchesPerHour) => inchesPerHour,
      'l/m²/h': (inchesPerHour) => inchesPerHour * 25.4
    },
    uv: {
      'index': (uv) => uv,
      'min': (uv) => uv
    },
    powerRadiation: {
      'w/m²': (w) => w
    },
    humidity: {
      '%': (h) => h
    },
    battery: {
      '%': (v) => v,
      'V': (v) => v
    }
  };
  
  const metricUnits = {
    temperature: '°C',
    speed: 'm/s',
    direction: '°',
    pressure: 'hpa',
    rain: 'mm',
    rainRate: 'mm/h',
    uv: 'index',
    powerRadiation: 'w/m²',
    humidity: '%',
    battery: 'V'
  };
  
  // Fonctions de conversion
  function convertRawValue2MetricValue(nativeValue, key, stationConfig) {
    if (nativeValue === null || nativeValue === undefined) return null;
    
    const type = sensorTypeMap[key];
    if (!type) return nativeValue;
    
    const targetUnit = metricUnits[type];
    if (!targetUnit) return nativeValue;
    
    const convertFn = conversionTable[type]?.[targetUnit];
    // on retourne la valeur arrondi sur 4 chiffre significatif en valeur numerique
    if (!convertFn) return nativeValue;
    
    return convertFn(nativeValue).toFixed(4)*1;
  }
  
  function convertRawValue2UserValue(nativeValue, key, stationConfig, userUnitsConfig) {
    if (nativeValue === null || nativeValue === undefined) return null;
    
    const type = sensorTypeMap[key];
    if (!type) return nativeValue;
    
    const userConfig = userUnitsConfig[type];
    if (!userConfig) return nativeValue;
    
    const userUnit = userConfig.unit;
    const convertFn = conversionTable[type]?.[userUnit];
    // on retourne la valeur arrondi sur 4 chiffre significatif en valeur numerique
    if (!convertFn) return nativeValue;
    
    return convertFn(nativeValue).toFixed(4)*1;
  }
  
  // Mise à jour de processWeatherData
  function processWeatherData(weatherData, stationConfig) {
    const processed = {};
    
    for (const [key, data] of Object.entries(weatherData)) {
        const nativeValue = convertRawValue2NativeValue(key, data.value, data.native_unit, stationConfig);
        // seulement si nativeValue n'est pas NaN
        if (!isNaN(nativeValue)) {
            const nativeUnit = data.native_unit;
            processed[key] = {
                native: {
                    Value: nativeValue,
                    Unit: nativeUnit
                },
                metric: {
                    Value: convertRawValue2MetricValue(nativeValue, key, stationConfig),
                    Unit: metricUnits[sensorTypeMap[key]] || nativeUnit
                },
                User: {
                    Value: convertRawValue2UserValue(nativeValue, key, stationConfig, userUnitsConfig),
                    Unit: userUnitsConfig[sensorTypeMap[key]]?.unit || nativeUnit
                }
            };
        }
    }
    
    return processed;
  }

module.exports = {
    loadStationConfig,
    setStationTime: withStationLamps(_setStationTime),
    setStationLocation: withStationLamps(_setStationLocation),
    setStationTimezone: withStationLamps(_setStationTimezone),
    getCurrentConditions: withStationLamps(_getCurrentConditions),
    getStationSettings: withStationLamps(_getStationSettings),
    receiveArchiveData: _receiveArchiveData, // Pour la réception de données poussées
    getArchiveData: withStationLamps(_getArchiveData) // Pour le téléchargement depuis la station
};
