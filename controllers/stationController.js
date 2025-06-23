// controllers/stationController.js
const { sendCommand, wakeUpConsole, toggleLamps } = require('../config/vp2NetClient'); // Importe le client TCP
const path = require('path');

// CRC table (from VantageSerialProtocolDocs_v261.pdf, Section XII, Page 38)
const crc_table = [
    0x0, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7,
    0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef,
    0x1231, 0x210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
    0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
    0x2462, 0x3443, 0x420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485,
    0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
    0x3653, 0x2672, 0x1611, 0x630, 0x76d7, 0x66f6, 0x5695, 0x46b4,
    0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc,
    0x48c4, 0x58e5, 0x6886, 0x78a7, 0x840, 0x1861, 0x2802, 0x3823,
    0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b,
    0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0xa50, 0x3a33, 0x2a12,
    0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
    0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0xc60, 0x1c41,
    0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49,
    0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0xe70,
    0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78,
    0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f,
    0x1080, 0xa1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e,
    0x2b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256,
    0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
    0x34e2, 0x24c3, 0x14a0, 0x481, 0x7466, 0x6447, 0x5424, 0x4405,
    0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c,
    0x26d3, 0x36f2, 0x691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
    0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab,
    0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x8e1, 0x3882, 0x28a3,
    0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
    0x4a75, 0x5a54, 0x6a37, 0x7a16, 0xaf1, 0x1ad0, 0x2ab3, 0x3a92,
    0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9,
    0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0xcc1,
    0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8,
    0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0xed1, 0x1ef0
];

/**
 * Calcule le CRC pour un buffer de données.
 * @param {Buffer} dataBuffer Le buffer de données.
 * @returns {number} Le CRC calculé (16 bits).
 */
function calculateCRC(dataBuffer) {
    let crc = 0x0000; // CRC initialisé à 0 
    for (let i = 0; i < dataBuffer.length; i++) {
        const byte = dataBuffer[i];
        crc = (crc << 8) ^ crc_table[((crc >> 8) ^ byte) & 0xFF];
        crc &= 0xFFFF; // S'assurer que le CRC reste sur 16 bits
    }
    return crc;
}

/**
 * Fonction générique pour envelopper les opérations de la station.
 * Allume les lampes, exécute l'opération, puis éteint les lampes.
 * @param {Function} operation La fonction asynchrone à exécuter (ex: setTime).
 * @returns {Promise<any>} Le résultat de l'opération.
 */
async function performStationOperationWithLamps(operation) {
    try {
        await toggleLamps(1); // Allume les lampes
        const result = await operation();
        return result;
    } finally {
        await toggleLamps(0); // Éteint les lampes même en cas d'erreur
    }
}

// Charge la configuration de la station VP2
const vp2StationConfig = require(path.resolve(__dirname, '../config/VP2.json'))[0];


/**
 * @api {get} /api/station/set-time Définir l'heure et le fuseau horaire de la station VP2
 * @apiGroup Station
 * @apiDescription Définit l'heure et le fuseau horaire de la station VP2 en utilisant l'heure UTC du serveur,
 * corrigée par la longitude de la station pour le fuseau horaire local.
 * La mise à jour de l'heure n'est effectuée que si le décalage est supérieur à 5 secondes.
 * Les lampes de la console sont allumées pendant l'opération et éteintes après.
 */
async function setStationTime(req, res) { // Type de requête GET, ne prend pas de paramètre datetime
    try {
        const result = await performStationOperationWithLamps(async () => {
            // 1. Dériver le décalage horaire GMT à partir de la longitude de la station
            const longitude = vp2StationConfig.longitude;
            // 15 degrés de longitude correspondent à 1 heure de décalage.
            const offsetHoursFloat = longitude / 15;
            // Le GMT_OFFSET dans l'EEPROM est en centièmes d'heures.
            const offsetCentiHours = Math.round(offsetHoursFloat * 100);

            // 2. Calculer l'heure locale cible pour la station basée sur l'heure UTC du serveur et l'offset dérivé
            const serverUtcDate = new Date(); // Heure UTC actuelle du serveur Node.js
            const targetLocalTime = new Date(serverUtcDate.getTime() + (offsetHoursFloat * 3600 * 1000));
            console.log(`Heure UTC serveur: ${serverUtcDate.toISOString()}`);
            console.log(`Longitude de la station: ${longitude}, Décalage GMT dérivé: ${offsetHoursFloat.toFixed(2)} heures (${offsetCentiHours} centièmes)`);
            console.log(`Heure locale cible pour la station: ${targetLocalTime.toISOString()}`);

            // 3. Obtenir l'heure actuelle de la station VP2 pour comparaison
            console.log("Récupération de l'heure actuelle de la station...");
            await wakeUpConsole();
            const getTimeResponse = await sendCommand('GETTIME', 2000); // GETTIME répond avec 6 octets de données + 2 octets de CRC 
            if (getTimeResponse.length < 8 || getTimeResponse[0] !== 0x06) { // Le premier octet de la réponse est l'ACK (0x06) 
                throw new Error(`Réponse inattendue de GETTIME: ${getTimeResponse.toString('hex')}`);
            }

            // Le format des données de l'heure est: secondes, minutes, heure (24h), jour, mois, année - 1900 
            const stationTimeBytes = getTimeResponse.slice(1, 7); // Saute l'ACK
            const stationYear = stationTimeBytes[5] + 1900;
            const stationMonth = stationTimeBytes[4] - 1; // Les mois en JS sont 0-indexés (0-11)
            const stationDay = stationTimeBytes[3];
            const stationHour = stationTimeBytes[2];
            const stationMinute = stationTimeBytes[1];
            const stationSecond = stationTimeBytes[0];

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

            const timeData = Buffer.from([seconds, minutes, hour, day, month, yearMinus1900]);
            const crc = calculateCRC(timeData);
            const crcBytes = Buffer.from([(crc >> 8) & 0xFF, crc & 0xFF]); // CRC est envoyé MSB first 

            const setTimePayload = Buffer.concat([timeData, crcBytes]);

            await wakeUpConsole();
            const ack1 = await sendCommand('SETTIME', 1000); // SETTIME attend un ACK après la commande ASCII 
            if (!ack1.includes(0x06)) {
                throw new Error(`Premier ACK SETTIME non reçu: ${ack1.toString('hex')}`);
            }

            const finalResponseTime = await sendCommand(setTimePayload, 2000); // Puis un second ACK après le payload binaire 
            if (!finalResponseTime.includes(0x06)) {
                throw new Error(`Échec de la définition de l'heure de la station. Réponse finale: ${finalResponseTime.toString('hex')}`);
            }
            console.log('Heure de la station définie avec succès.');

            // Définir le fuseau horaire (GMT_OFFSET)
            // EEPROM address 0x14 (20 dec) pour GMT_OFFSET (2 bytes, centièmes d'heures, signé) 
            // EEPROM address 0x16 (22 dec) pour GMT_OR_ZONE, doit être 0x01 (utiliser custom offset) 
            console.log(`Définition du fuseau horaire personnalisé (Offset: ${offsetCentiHours})...`);
            const gmtOffsetBuffer = Buffer.alloc(2);
            gmtOffsetBuffer.writeInt16LE(offsetCentiHours, 0); // Signé, Little Endian

            await wakeUpConsole();
            const ackGmt1 = await sendCommand(`EEBWR 14 02`, 1000); // Commande EEBWR + ACK attendu 
            if (!ackGmt1.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR GMT_OFFSET (étape 1): ${ackGmt1.toString('hex')}`);

            const gmtCrc = calculateCRC(gmtOffsetBuffer);
            const gmtCrcBytes = Buffer.from([(gmtCrc >> 8) & 0xFF, gmtCrc & 0xFF]); // CRC est envoyé MSB first 
            const gmtPayload = Buffer.concat([gmtOffsetBuffer, gmtCrcBytes]);

            const finalResponseGmt = await sendCommand(gmtPayload, 2000); // Envoi données + CRC, attente ACK final 
            if (!finalResponseGmt.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR GMT_OFFSET (étape 2): ${finalResponseGmt.toString('hex')}`);
            console.log('Offset GMT défini.');

            await wakeUpConsole();
            const okGmt = await sendCommand(`EEWR 16 01`, 2000); // Définir GMT_OR_ZONE à 1 
            if (!okGmt.toString().includes('OK')) throw new Error(`Erreur EEWR GMT_OR_OR_ZONE: ${okGmt.toString()}`);
            console.log('Mode fuseau horaire personnalisé activé.');

            // Appliquer les changements avec NEWSETUP (important après SETTIME/timezone)
            console.log('Application des changements avec NEWSETUP...');
            await wakeUpConsole();
            const ackNewSetup = await sendCommand('NEWSETUP', 2000); // NEWSETUP répond ACK 
            if (!ackNewSetup.includes(0x06)) {
                throw new Error(`ACK non reçu pour NEWSETUP: ${ackNewSetup.toString('hex')}`);
            }
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
        });

        res.json(result);

    } catch (error) {
        console.error('Erreur lors de la définition de l\'heure et du fuseau horaire de la station:', error.message);
        res.status(500).json({
            error: error.message
        });
    }
}

/**
 * @api {post} /api/station/set-location Définir la longitude, latitude et altitude
 * @apiGroup Station
 * @apiBody {Number} latitude Latitude en degrés (ex: 43.21).
 * @apiBody {Number} longitude Longitude en degrés (ex: -0.12).
 * @apiBody {Number} elevation Altitude en pieds (ex: 200).
 * @apiDescription Définit la latitude, la longitude et l'altitude de la station.
 * Les lampes de la console sont allumées pendant l'opération et éteintes après.
 */
async function setStationLocation(req, res) {
    const {
        latitude,
        longitude,
        elevation
    } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof elevation !== 'number') {
        return res.status(400).json({
            error: 'Les paramètres latitude, longitude et elevation sont requis et doivent être des nombres.'
        });
    }

    try {
        const result = await performStationOperationWithLamps(async () => {
            let response;

            // Latitude (EEPROM address 0x0B, Size 2, en dixièmes de degré, signé, Little Endian) 
            // Négatif = hémisphère sud.
            const latValue = Math.round(latitude * 10);
            const latBuffer = Buffer.alloc(2);
            latBuffer.writeInt16LE(latValue, 0);

            // Longitude (EEPROM address 0x0D, Size 2, en dixièmes de degré, signé, Little Endian) 
            // Négatif = hémisphère ouest.
            const lonValue = Math.round(longitude * 10);
            const lonBuffer = Buffer.alloc(2);
            lonBuffer.writeInt16LE(lonValue, 0);

            // Elevation (via la commande BAR=, en pieds, décimal) 
            // Format: BAR=<bar value to display (in Hg * 1000)-decimal> <elevation (ft)-decimal> 
            const barCommand = `BAR=0 ${Math.round(elevation)}`; // "0" pour ne pas forcer la valeur barométrique

            // Écriture dans l'EEPROM pour Latitude et Longitude via EEBWR 
            // EEBWR <EE address-hex> <number of bytes to write-hex> 
            // Suivi des données binaires + CRC (CRC est MSB first) 

            console.log(`Définition de la latitude (${latitude})...`);
            await wakeUpConsole();
            response = await sendCommand(`EEBWR 0B 02`, 1000); // Commande EEBWR + ACK attendu 
            if (!response.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR Latitude (étape 1): ${response.toString('hex')}`);

            const latCrc = calculateCRC(latBuffer);
            const latCrcBytes = Buffer.from([(latCrc >> 8) & 0xFF, latCrc & 0xFF]);
            const latPayload = Buffer.concat([latBuffer, latCrcBytes]);
            response = await sendCommand(latPayload, 2000); // Envoi données + CRC, attente ACK final 
            if (!response.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR Latitude (étape 2): ${response.toString('hex')}`);
            console.log('Latitude définie.');

            console.log(`Définition de la longitude (${longitude})...`);
            await wakeUpConsole();
            response = await sendCommand(`EEBWR 0D 02`, 1000); // Commande EEBWR + ACK attendu 
            if (!response.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR Longitude (étape 1): ${response.toString('hex')}`);

            const lonCrc = calculateCRC(lonBuffer);
            const lonCrcBytes = Buffer.from([(lonCrc >> 8) & 0xFF, lonCrc & 0xFF]);
            const lonPayload = Buffer.concat([lonBuffer, lonCrcBytes]);
            response = await sendCommand(lonPayload, 2000); // Envoi données + CRC, attente ACK final 
            if (!response.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR Longitude (étape 2): ${response.toString('hex')}`);
            console.log('Longitude définie.');

            // L'élévation se fait via la commande BAR= 
            console.log(`Définition de l'altitude (${elevation})...`);
            await wakeUpConsole();
            response = await sendCommand(barCommand, 2000); // Attendre la réponse "OK" 
            if (!response.toString().includes('OK')) {
                throw new Error(`Réponse inattendue de BAR=: ${response.toString()}`);
            }
            console.log('Altitude définie.');

            // Appliquer les changements avec NEWSETUP 
            console.log('Application des changements avec NEWSETUP...');
            await wakeUpConsole();
            response = await sendCommand('NEWSETUP', 2000); // NEWSETUP répond ACK 
            if (!response.includes(0x06)) {
                throw new Error(`ACK non reçu pour NEWSETUP: ${response.toString('hex')}`);
            }
            console.log('NEWSETUP exécuté avec succès.');

            return {
                status: 'success',
                message: 'Localisation de la station définie avec succès.'
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Erreur lors de la définition de la localisation de la station:', error.message);
        res.status(500).json({
            error: error.message
        });
    }
}

/**
 * @api {post} /api/station/set-timezone Définir le fuseau horaire
 * @apiGroup Station
 * @apiBody {String} type "preset" ou "custom".
 * @apiBody {Number} [index] Si type="preset", l'index du fuseau horaire (voir doc PDF p.44).
 * @apiBody {Number} [offsetGMT] Si type="custom", le décalage GMT en centièmes d'heures (ex: 100 pour +1h, -500 pour -5h).
 * @apiDescription Définit le fuseau horaire de la station.
 * Les lampes de la console sont allumées pendant l'opération et éteintes après.
 */
async function setStationTimezone(req, res) {
    const {
        type,
        index,
        offsetGMT
    } = req.body;

    if (!type || (type === 'preset' && typeof index !== 'number') || (type === 'custom' && typeof offsetGMT !== 'number')) {
        return res.status(400).json({
            error: 'Paramètres "type" et "index" ou "offsetGMT" sont requis.'
        });
    }

    try {
        const result = await performStationOperationWithLamps(async () => {
            let response;
            if (type === 'preset') {
                // Utilise un fuseau horaire prédéfini
                // EEPROM address 0x11 (17 dec) pour TIME_ZONE 
                // EEPROM address 0x16 (22 dec) pour GMT_OR_ZONE, doit être 0x00 

                console.log(`Définition du fuseau horaire prédéfini (Index: ${index})...`);
                await wakeUpConsole();
                // EEWR <EE address-hex> <EE data-hex> 
                response = await sendCommand(`EEWR 11 ${index.toString(16).padStart(2, '0')}`, 2000); // TIME_ZONE
                if (!response.toString().includes('OK')) throw new Error(`Erreur EEWR TIME_ZONE: ${response.toString()}`);

                await wakeUpConsole();
                response = await sendCommand(`EEWR 16 00`, 2000); // GMT_OR_ZONE = 0 (utiliser preset) 
                if (!response.toString().includes('OK')) throw new Error(`Erreur EEWR GMT_OR_OR_ZONE: ${response.toString()}`);

                console.log('Fuseau horaire prédéfini défini avec succès.');

            } else if (type === 'custom') {
                // Utilise un décalage GMT personnalisé
                // EEPROM address 0x14 (20 dec) pour GMT_OFFSET (2 bytes, centièmes d'heures, signé, Little Endian) 
                // EEPROM address 0x16 (22 dec) pour GMT_OR_ZONE, doit être 0x01 

                const gmtOffsetBuffer = Buffer.alloc(2);
                gmtOffsetBuffer.writeInt16LE(offsetGMT, 0); // Signed, Little Endian

                console.log(`Définition du fuseau horaire personnalisé (Offset: ${offsetGMT})...`);
                await wakeUpConsole();
                response = await sendCommand(`EEBWR 14 02`, 1000); // Commande EEBWR + ACK attendu 
                if (!response.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR GMT_OFFSET (étape 1): ${response.toString('hex')}`);

                const gmtCrc = calculateCRC(gmtOffsetBuffer);
                const gmtCrcBytes = Buffer.from([(gmtCrc >> 8) & 0xFF, gmtCrc & 0xFF]); // CRC est envoyé MSB first 
                const gmtPayload = Buffer.concat([gmtOffsetBuffer, gmtCrcBytes]);
                response = await sendCommand(gmtPayload, 2000); // Envoi données + CRC, attente ACK final 
                if (!response.includes(0x06)) throw new Error(`ACK non reçu pour EEBWR GMT_OFFSET (étape 2): ${response.toString('hex')}`);

                await wakeUpConsole();
                response = await sendCommand(`EEWR 16 01`, 2000); // GMT_OR_ZONE = 1 (utiliser custom) 
                if (!response.toString().includes('OK')) throw new Error(`Erreur EEWR GMT_OR_OR_ZONE: ${response.toString()}`);

                console.log('Fuseau horaire personnalisé défini avec succès.');
            } else {
                throw new Error('Type de fuseau horaire invalide. Utilisez "preset" ou "custom".');
            }

            // Appliquer les changements avec NEWSETUP 
            console.log('Application des changements avec NEWSETUP...');
            await wakeUpConsole();
            response = await sendCommand('NEWSETUP', 2000); // NEWSETUP répond ACK 
            if (!response.includes(0x06)) {
                throw new Error(`ACK non reçu pour NEWSETUP: ${response.toString('hex')}`);
            }
            console.log('NEWSETUP exécuté avec succès.');

            return {
                status: 'success',
                message: 'Fuseau horaire de la station défini avec succès.'
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Erreur lors de la définition du fuseau horaire de la station:', error.message);
        res.status(500).json({
            error: error.message
        });
    }
}

module.exports = {
    setStationTime,
    setStationLocation,
    setStationTimezone
};