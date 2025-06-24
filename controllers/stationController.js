// controllers/stationController.js
const { sendCommand, wakeUpConsole, toggleLamps } = require('../config/vp2NetClient'); // [cite: stationController.js]
const { calculateCRC } = require('../utils/crc'); // Importe calculateCRC du fichier utilitaire
const path = require('path');

// Charge la configuration de la station VP2
const vp2StationConfig = require(path.resolve(__dirname, '../config/VP2.json'))[0]; // [cite: VP2.json]

// Charge la configuration des unités utilisateur
const userUnitsConfig = require(path.resolve(__dirname, '../config/Units.json')); // NEW: Charge le fichier Units.json [cite: config/Units.json]

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
        try {
            await wakeUpConsole();
            await toggleLamps(1);
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
                await toggleLamps(0);
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
    // 1. Dériver le décalage horaire GMT à partir de la longitude de la station
    const longitude = vp2StationConfig.longitude; // [cite: VP2.json]
    // 15 degrés de longitude correspondent à 1 heure de décalage.
    const offsetHoursFloat = longitude / 15;
    // Le GMT_OFFSET dans l'EEPROM est en centièmes d'heures, signé. [cite: VantageSerialProtocolDocs_v261.pdf, Page 40]
    const offsetCentiHours = Math.round(offsetHoursFloat * 100);

    // 2. Obtenir l'heure actuelle de la station VP2 pour comparaison
    console.log("Récupération de l'heure actuelle de la station...");
    // sendCommand gère l'ACK, le CRC et les tentatives. Il retourne directement les 6 octets de données.
    const stationTimeDataBytes = await sendCommand('GETTIME', 2000, "<ACK>6<CRC>");

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
    await sendCommand('SETTIME', 1000, "<ACK>");
    await sendCommand(setTimePayload, 2000, "<ACK>"); // Envoi du payload complet (données + CRC)

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

    await sendCommand(`EEBWR 14 02`, 1000, "<ACK>");
    await sendCommand(gmtPayload, 2000, "<ACK>");
    console.log('Offset GMT défini.');

    await sendCommand(`EEWR 16 01`, 2000, "<LF><CR>OK<LF><CR>");
    console.log('Mode fuseau horaire personnalisé activé.');

    // Appliquer les changements avec NEWSETUP (important après SETTIME/timezone)
    console.log('Application des changements avec NEWSETUP...');
    await sendCommand('NEWSETUP', 2000, "<ACK>");
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
    await sendCommand(`EEBWR 0B 02`, 1000, "<ACK>");
    await sendCommand(latPayload, 2000, "<ACK>");
    console.log('Latitude définie.');

    console.log(`Définition de la longitude (${longitude})...`);
    const lonCrc = calculateCRC(lonBuffer);
    const lonCrcBytes = Buffer.from([(lonCrc >> 8) & 0xFF, lonCrc & 0xFF]);
    const lonPayload = Buffer.concat([lonBuffer, lonCrcBytes]);
    await sendCommand(`EEBWR 0D 02`, 1000, "<ACK>");
    await sendCommand(lonPayload, 2000, "<ACK>");
    console.log('Longitude définie.');

    // L'élévation se fait via la commande BAR=
    console.log(`Définition de l'altitude (${elevation})...`);
    await sendCommand(barCommand, 2000, "<LF><CR>OK<LF><CR>");
    console.log('Altitude définie.');

    // Appliquer les changements avec NEWSETUP
    console.log('Application des changements avec NEWSETUP...');
    await sendCommand('NEWSETUP', 2000, "<ACK>");
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
        await sendCommand(`EEWR 11 ${index.toString(16).padStart(2, '0')}`, 2000, "<LF><CR>OK<LF><CR>");
        await sendCommand(`EEWR 16 00`, 2000, "<LF><CR>OK<LF><CR>");
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
        await sendCommand(`EEBWR 14 02`, 1000, "<ACK>");
        await sendCommand(gmtPayload, 2000, "<ACK>");
        await sendCommand(`EEWR 16 01`, 2000, "<LF><CR>OK<LF><CR>");
        console.log('Fuseau horaire personnalisé défini avec succès.');
    } else {
        throw new Error('Type de fuseau horaire invalide. Utilisez "preset" ou "custom".');
    }

    // Appliquer les changements avec NEWSETUP
    console.log('Application des changements avec NEWSETUP...');
    await sendCommand('NEWSETUP', 2000, "<ACK>");
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
    // sendCommand gère l'ACK, le CRC et les tentatives. Il retourne les 99 octets de données du paquet LOOP2.
    // Récupère les données des paquets LOOP et LOOP2 pour une information plus complète.
    // La commande LPS 1 1 demande un paquet LOOP.
    // La commande LPS 2 1 demande un paquet LOOP2. (Note: The actual response includes LF CR before CRC, and data is 96 bytes)
    console.log('Récupération du paquet LOOP...');
    const loop1Bytes = await sendCommand('LPS 1 1', 2000, "<ACK>97<CRC>");
    const loop1Data = parseLOOP1Data(loop1Bytes);

    console.log('Récupération du paquet LOOP2...');
    const loop2Bytes = await sendCommand('LPS 2 1', 2000, "<ACK>97<CRC>");
    const loop2Data = parseLOOP2Data(loop2Bytes);

    // Agrège les données, en donnant la priorité aux données de LOOP2 qui sont plus précises.
    const aggregatedData = { ...loop1Data, ...loop2Data };

    // Parsing des données brutes
    // Conversion des unités
    const convertedWeatherData = convertUnits(aggregatedData, userUnitsConfig.units, userUnitsConfig.user_preferences);

    return {
        status: 'success',
        message: 'Données actuelles (LOOP & LOOP2) récupérées avec succès.',
        data: convertedWeatherData
    };
};

/**
 * Parse les données binaires brutes d'un paquet LOOP (99 octets) dans un objet JavaScript.
 * Référence: VantageSerialProtocolDocs_v261.pdf Section X.1, "LOOP Packet Format", Page 22-24. (Actual data length is 96 bytes, followed by LF CR and CRC)
 * @param {Buffer} data Le buffer de données du paquet LOOP (99 octets, sans ACK ni CRC).
 * @returns {object} Un objet contenant les données météorologiques extraites.
 */
function parseLOOP1Data(data) {
    const weatherData = {};

    function readSignedInt16LE(buffer, offset) {
        const val = buffer.readUInt16LE(offset);
        return val > 0x7FFF ? val - 0x10000 : val;
    }
    function readInt8(buffer, offset) {
        return buffer.readInt8(offset);
    }
    function readUInt16LE(buffer, offset) {
        return buffer.readUInt16LE(offset);
    }
    function readUInt8(buffer, offset) {
        return buffer.readUInt8(offset);
    }

    weatherData.barometer = { value: readUInt16LE(data, 8 - 1), native_unit: "inHg_1000th" };
    weatherData.inTemp = { value: readSignedInt16LE(data, 10 - 1), native_unit: "F_tenths" };
    weatherData.inHumidity = { value: readUInt8(data, 12 - 1), native_unit: "percent" };
    weatherData.outTemp = { value: readSignedInt16LE(data, 13 - 1), native_unit: "F_tenths" };
    weatherData.windSpeed = { value: readUInt8(data, 15 - 1), native_unit: "mph_whole" };
    weatherData.avgWindSpeed10Min = { value: readUInt8(data, 16 - 1), native_unit: "mph_whole" };
    weatherData.windDir = { value: readUInt16LE(data, 17 - 1), native_unit: "degrees" };
    weatherData.dewPoint = { value: readInt8(data, 31 - 1), native_unit: "F_whole" };
    weatherData.outHumidity = { value: readUInt8(data, 34 - 1), native_unit: "percent" };
    weatherData.heatIndex = { value: readInt8(data, 36 - 1), native_unit: "F_whole" };
    weatherData.windChill = { value: readInt8(data, 38 - 1), native_unit: "F_whole" };
    weatherData.rainRate = { value: readUInt8(data, 42 - 1), native_unit: "clicks_0_01in" };
    weatherData.uvIndex = { value: readUInt8(data, 44 - 1), native_unit: "uv_index" };
    weatherData.solarRadiation = { value: readUInt16LE(data, 45 - 1), native_unit: "watts_per_m2" };
    weatherData.stormRain = { value: readUInt16LE(data, 47 - 1), native_unit: "clicks_0_01in" };
    weatherData.dayRain = { value: readUInt16LE(data, 51 - 1), native_unit: "clicks_0_01in" };
    weatherData.last15MinRain = { value: readUInt16LE(data, 53 - 1), native_unit: "clicks_0_01in" };
    weatherData.lastHourRain = { value: readUInt16LE(data, 55 - 1), native_unit: "clicks_0_01in" };
    weatherData.last24HourRain = { value: readUInt16LE(data, 59 - 1), native_unit: "clicks_0_01in" };

    // Gérer les "dash values" (valeurs invalides) pour le paquet LOOP1
    for (const key in weatherData) {
        const val = weatherData[key].value;
        if (['dewPoint', 'heatIndex', 'windChill'].includes(key) && val === -128) {
            weatherData[key].value = NaN;
        } else if (['inHumidity', 'outHumidity', 'windSpeed', 'avgWindSpeed10Min', 'rainRate', 'uvIndex'].includes(key) && val === 255) {
            weatherData[key].value = NaN;
        } else if ((val === 65535 || val === 32767) && !key.includes('Rain')) { // 0xFFFF or 0x7FFF, ne pas appliquer à la pluie qui peut être 0
            weatherData[key].value = NaN;
        }
    }

    return weatherData;
}

/**
 * @api {get} /api/station/settings Récupérer les paramètres de la station
 * @apiGroup Station
 * @apiDescription Récupère les paramètres statiques (longitude, latitude, altitude, timezone, etc.)
 * et l'heure actuelle de la station.
 */
const _getStationSettings = async (req, res) => {
    // Paramètres statiques de la configuration
    const staticSettings = {
        name: vp2StationConfig.Name,
        host: vp2StationConfig.host,
        port: vp2StationConfig.port,
        longitude: vp2StationConfig.longitude,
        latitude: vp2StationConfig.latitude,
        altitude: vp2StationConfig.altitude,
        timezone: vp2StationConfig.timezone,
        windCupSize: vp2StationConfig.windCupSize,
        rainCollectorSize: vp2StationConfig.rainCollectorSize,
        rainSaisonStart: vp2StationConfig.rainSaisonStart,
    };

    // Heure actuelle de la station
    const stationTimeDataBytes = await sendCommand('GETTIME', 2000, "<ACK>6<CRC>");
    const stationYear = stationTimeDataBytes[5] + 1900;
    const stationMonth = stationTimeDataBytes[4] - 1; // Les mois en JS sont 0-indexés (0-11)
    const stationDay = stationTimeDataBytes[3];
    const stationHour = stationTimeDataBytes[2];
    const stationMinute = stationTimeDataBytes[1];
    const stationSecond = stationTimeDataBytes[0];
    const currentStationDate = new Date(stationYear, stationMonth, stationDay, stationHour, stationMinute, stationSecond);

    return { status: 'success', message: 'Paramètres de la station récupérés avec succès.', settings: { ...staticSettings, currentTime: currentStationDate.toISOString() } };
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

    // Fonction helper pour lire un entier signé sur 2 octets (Little Endian)
    // Davis utilise le Two's complement pour les nombres négatifs.
    function readSignedInt16LE(buffer, offset) {
        const val = buffer.readUInt16LE(offset);
        return val > 0x7FFF ? val - 0x10000 : val; // Convertir en signé si nécessaire
    }

    // Fonction helper pour lire un entier non signé sur 2 octets (Little Endian)
    function readUInt16LE(buffer, offset) {
        return buffer.readUInt16LE(offset);
    }

    // Fonction helper pour lire un octet non signé
    function readUInt8(buffer, offset) {
        return buffer.readUInt8(offset);
    }

    // --- Parsing des champs clés du paquet LOOP2 (Offset et Taille sont en octets) ---

    // Barometer: Offset 7, Size 2. (in Hg/1000)
    // "Current Barometer. Units are (in Hg/1000)."
    weatherData.barometer = {
        value: readUInt16LE(data, 7 - 1), // Offset 7 dans la doc, donc index 6 ici
        native_unit: "inHg_1000th"
    };

    // Inside Temperature: Offset 9, Size 2. (10ths of a degree F)
    // "The value is sent as 10th of a degree in F."
    weatherData.inTemp = {
        value: readSignedInt16LE(data, 9 - 1),
        native_unit: "F_tenths"
    };

    // Inside Humidity: Offset 11, Size 1. (%)
    weatherData.inHumidity = {
        value: readUInt8(data, 11 - 1),
        native_unit: "percent"
    };

    // Outside Temperature: Offset 12, Size 2. (10ths of a degree F)
    weatherData.outTemp = {
        value: readSignedInt16LE(data, 12 - 1),
        native_unit: "F_tenths"
    };

    // Wind Speed: Offset 14, Size 1. (mph, entier)
    // "It is a byte unsigned value in mph. If the wind speed is dashed... forced to be 0."
    weatherData.windSpeed = {
        value: readUInt8(data, 14 - 1),
        native_unit: "mph_whole"
    };

    // Wind Direction: Offset 16, Size 2. (1-360 degrees)
    // "0° is no wind data, 90° is East, 180° is South, 270° is West and 360° is north"
    weatherData.windDir = {
        value: readUInt16LE(data, 16 - 1),
        native_unit: "degrees"
    };

    // 10-Min Avg Wind Speed: Offset 18, Size 2. (0.1 mph resolution)
    weatherData.avgWindSpeed10Min = {
        value: readUInt16LE(data, 18 - 1),
        native_unit: "mph_tenths"
    };
    
    // 2-Min Avg Wind Speed: Offset 20, Size 2. (0.1 mph resolution)
    weatherData.avgWindSpeed2Min = {
        value: readUInt16LE(data, 20 - 1),
        native_unit: "mph_tenths"
    };

    // 10-Min Wind Gust: Offset 22, Size 2. (0.1 mph resolution)
    weatherData.windGust10Min = {
        value: readUInt16LE(data, 22 - 1),
        native_unit: "mph_tenths"
    };

    // Wind Direction for the 10-Min Wind Gust: Offset 24, Size 2. (1-360 degrees)
    weatherData.windGustDir10Min = {
        value: readUInt16LE(data, 24 - 1),
        native_unit: "degrees"
    };

    // Dew Point: Offset 30, Size 2. (whole degrees F). 255 = dashed data.
    weatherData.dewPoint = {
        value: readSignedInt16LE(data, 30 - 1),
        native_unit: "F_whole"
    };

    // Outside Humidity: Offset 33, Size 1. (%)
    weatherData.outHumidity = {
        value: readUInt8(data, 33 - 1),
        native_unit: "percent"
    };

    // Heat Index: Offset 35, Size 2. (whole degrees F). 255 = dashed data.
    weatherData.heatIndex = {
        value: readSignedInt16LE(data, 35 - 1),
        native_unit: "F_whole"
    };

    // Wind Chill: Offset 37, Size 2. (whole degrees F). 255 = dashed data.
    weatherData.windChill = {
        value: readSignedInt16LE(data, 37 - 1),
        native_unit: "F_whole"
    };

    // Rain Rate: Offset 41, Size 2. (rain clicks per hour).
    // Note: La conversion dépend du type de pluviomètre (0.2mm ou 0.01in).
    // Pour l'instant, on se base sur les 0.01in par click (par défaut de la doc pour rain rate).
    weatherData.rainRate = {
        value: readUInt16LE(data, 41 - 1),
        native_unit: "clicks_0_01in"
    };
    
    // UV: Offset 43, Size 1. (UV index)
    weatherData.uvIndex = {
        value: readUInt8(data, 43 - 1),
        native_unit: "uv_index"
    };

    // Solar Radiation: Offset 44, Size 2. (watt/meter²)
    weatherData.solarRadiation = {
        value: readUInt16LE(data, 44 - 1),
        native_unit: "watts_per_m2"
    };

    // Storm Rain: Offset 46, Size 2. (100th of an inch clicks)
    weatherData.stormRain = {
        value: readUInt16LE(data, 46 - 1),
        native_unit: "clicks_0_01in" // Utilise la même logique de clicks que Rain Rate
    };

    // Daily Rain: Offset 50, Size 2. (rain clicks)
    weatherData.dayRain = {
        value: readUInt16LE(data, 50 - 1),
        native_unit: "clicks_0_01in"
    };

    // Last 15-min Rain: Offset 52, Size 2. (rain clicks)
    weatherData.last15MinRain = {
        value: readUInt16LE(data, 52 - 1),
        native_unit: "clicks_0_01in"
    };

    // Last Hour Rain: Offset 54, Size 2. (rain clicks)
    weatherData.lastHourRain = {
        value: readUInt16LE(data, 54 - 1),
        native_unit: "clicks_0_01in"
    };

    // Last 24-Hour Rain: Offset 58, Size 2. (rain clicks)
    weatherData.last24HourRain = {
        value: readUInt16LE(data, 58 - 1),
        native_unit: "clicks_0_01in"
    };


    // --- Gérer les "dash values" (valeurs invalides) ---
    // La doc indique 255 pour les octets uniques et 32767/0x7FFF ou 0xFFFF pour les 2 octets,
    // ou 2's complement pour les valeurs négatives pour les températures.
    for (const key in weatherData) {
        if (weatherData[key].native_unit.includes("F_whole") || weatherData[key].native_unit.includes("F_tenths")) {
            // Pour les températures (qui peuvent avoir des valeurs dash comme 255 ou 32767 selon le type)
            if (weatherData[key].value === 255 || weatherData[key].value === 32767) {
                weatherData[key].value = NaN; // Marquer comme non valide
            }
        } else if (weatherData[key].native_unit.includes("percent") || weatherData[key].native_unit.includes("uv_index") || weatherData[key].native_unit.includes("mph_whole")) {
             // Humidité, UV, WindSpeed (entier)
            if (weatherData[key].value === 255) {
                weatherData[key].value = NaN; // Marquer comme non valide
            }
        } else if (weatherData[key].native_unit.includes("degrees") && weatherData[key].value === 0) {
            // Direction du vent, 0 degré signifie "pas de vent"
            // On peut choisir de laisser 0 ou le convertir en NaN / 'N/A' plus tard
        }
         // Les "clicks" de pluie peuvent être 0 si pas de pluie, ce qui est valide.
         // Les baromètres et radiations solaires peuvent aussi avoir des dash values spécifiques à vérifier si besoin.
    }

    return weatherData;
}


/**
 * Convertit les unités des données météorologiques en unités préférées de l'utilisateur.
 * @param {object} weatherData Les données météorologiques avec les unités natives (ex: { outTemp: { value: 795, native_unit: "F_tenths" } }).
 * @param {object} unitDefinitions L'objet "units" de la configuration Units.json.
 * @param {object} userPreferences L'objet "user_preferences" de la configuration Units.json.
 * @returns {object} Les données météorologiques avec les unités converties et formatées.
 */
function convertUnits(weatherData, unitDefinitions, userPreferences) {
    const convertedData = {};

    for (const key in weatherData) {
        const data = weatherData[key];
        const nativeValue = data.value;
        const nativeUnitSymbol = data.native_unit;

        // Skip if value is NaN or null
        if (isNaN(nativeValue) || nativeValue === null) {
            convertedData[key] = { value: "N/A", unit: "" }; // Ou ce que vous préférez pour les valeurs manquantes
            continue;
        }

        // Trouver le type de mesure (e.g., 'temperature', 'windSpeed') basé sur la clé
        // C'est une correspondance 1-à-1 avec les clés de user_preferences
        const measureType = key;

        if (userPreferences[measureType] && unitDefinitions[measureType]) {
            const targetUnitSymbol = userPreferences[measureType].target_symbol;

            // Trouver la règle de conversion appropriée
            const conversionRule = unitDefinitions[measureType].find(
                rule => rule.native_symbol === nativeUnitSymbol && rule.target_symbol === targetUnitSymbol
            );

            if (conversionRule) {
                let convertedValue;
                try {
                    // mapDegreesToCardinal est nécessaire ici pour la conversion de direction
                    const mapDegreesToCardinalLocal = mapDegreesToCardinal; // Rendre la fonction disponible pour eval
                    convertedValue = eval(conversionRule.conversion_formula.replace('x', nativeValue));
                } catch (e) {
                    console.error(`Erreur d'évaluation de la formule de conversion pour ${key}: ${conversionRule.conversion_formula}`, e);
                    convertedValue = NaN;
                }
                
                // Appliquer la précision
                if (typeof convertedValue === 'number' && !isNaN(convertedValue) && conversionRule.precision !== undefined) {
                    convertedValue = convertedValue.toFixed(conversionRule.precision);
                }

                convertedData[key] = {
                    value: convertedValue,
                    unit: targetUnitSymbol
                };
            } else {
                console.warn(`Aucune règle de conversion trouvée pour ${key} de ${nativeUnitSymbol} vers ${targetUnitSymbol}.`);
                convertedData[key] = { value: nativeValue, unit: nativeUnitSymbol }; // Fallback à la valeur native
            }
        } else {
            // Si aucune préférence ou définition d'unité n'existe, juste passer la valeur native
            convertedData[key] = { value: nativeValue, unit: nativeUnitSymbol };
        }
    }
    return convertedData;
}


module.exports = {
    setStationTime: withStationLamps(_setStationTime),
    setStationLocation: withStationLamps(_setStationLocation),
    setStationTimezone: withStationLamps(_setStationTimezone),
    getCurrentConditions: withStationLamps(_getCurrentConditions),
    getStationSettings: withStationLamps(_getStationSettings)
};
