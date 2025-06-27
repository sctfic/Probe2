// services/stationService.js
const fs = require('fs');
const path = require('path');
const { sendCommand, writeRaw } = require('../config/vp2NetClient'); // Import writeRaw
const { calculateCRC } = require('../utils/crc');
const { parseLOOP1Data, parseLOOP2Data, parseDMPRecord, processWeatherData } = require('../utils/weatherDataParser');

const allVp2StationConfigs = require(path.resolve(__dirname, '../config/VP2.json'));
const userUnitsConfig = require(path.resolve(__dirname, '../config/Units.json'));

async function updateStationTime(stationConfig) {
    const { longitude } = stationConfig;
    const offsetHoursFloat = longitude / 15;
    const offsetCentiHours = Math.round(offsetHoursFloat * 100);

    const stationTimeDataBytes = await sendCommand(stationConfig, 'GETTIME', 2000, "<ACK>6<CRC>");

    const serverUtcDate = new Date();
    const targetLocalTime = new Date(serverUtcDate.getTime() + (offsetHoursFloat * 3600 * 1000));

    const stationYear = stationTimeDataBytes[5] + 1900;
    const stationMonth = stationTimeDataBytes[4] - 1;
    const stationDay = stationTimeDataBytes[3];
    const stationHour = stationTimeDataBytes[2];
    const stationMinute = stationTimeDataBytes[1];
    const stationSecond = stationTimeDataBytes[0];
    const currentStationDate = new Date(stationYear, stationMonth, stationDay, stationHour, stationMinute, stationSecond);

    const timeDiffSeconds = Math.abs((targetLocalTime.getTime() - currentStationDate.getTime()) / 1000);

    if (timeDiffSeconds <= 5) {
        console.log(`Décalage de ${timeDiffSeconds.toFixed(2)} secondes. Moins de 5 secondes, pas de mise à jour de l'heure.`);
        return {
            status: 'unchanged',
            message: `Décalage de ${timeDiffSeconds.toFixed(2)} secondes, mise à jour de l'heure non nécessaire. Fuseau horaire mis à jour si nécessaire.`
        };
    }

    console.log(`Décalage de ${timeDiffSeconds.toFixed(2)} secondes. Mise à jour de l'heure et du fuseau horaire...`);

    const timeDataForSet = Buffer.from([
        targetLocalTime.getSeconds(),
        targetLocalTime.getMinutes(),
        targetLocalTime.getHours(),
        targetLocalTime.getDate(),
        targetLocalTime.getMonth() + 1,
        targetLocalTime.getFullYear() - 1900
    ]);
    const crcForSetTime = calculateCRC(timeDataForSet);
    const crcBytesForSetTime = Buffer.from([(crcForSetTime >> 8) & 0xFF, crcForSetTime & 0xFF]);
    const setTimePayload = Buffer.concat([timeDataForSet, crcBytesForSetTime]);

    await sendCommand(stationConfig, 'SETTIME', 1000, "<ACK>");
    await sendCommand(stationConfig, setTimePayload, 2000, "<ACK>");

    const gmtOffsetBuffer = Buffer.alloc(2);
    gmtOffsetBuffer.writeInt16LE(offsetCentiHours, 0);
    const gmtCrc = calculateCRC(gmtOffsetBuffer);
    const gmtCrcBytes = Buffer.from([(gmtCrc >> 8) & 0xFF, gmtCrc & 0xFF]);
    const gmtPayload = Buffer.concat([gmtOffsetBuffer, gmtCrcBytes]);

    await sendCommand(stationConfig, `EEBWR 14 02`, 1000, "<ACK>");
    await sendCommand(stationConfig, gmtPayload, 2000, "<ACK>");
    await sendCommand(stationConfig, `EEWR 16 01`, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");

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
}

async function updateStationLocation(stationConfig, { latitude, longitude, elevation }) {
    const latValue = Math.round(latitude * 10);
    const latBuffer = Buffer.alloc(2);
    latBuffer.writeInt16LE(latValue, 0);

    const lonValue = Math.round(longitude * 10);
    const lonBuffer = Buffer.alloc(2);
    lonBuffer.writeInt16LE(lonValue, 0);

    const barCommand = `BAR=0 ${Math.round(elevation)}`;

    const latCrc = calculateCRC(latBuffer);
    const latCrcBytes = Buffer.from([(latCrc >> 8) & 0xFF, latCrc & 0xFF]);
    const latPayload = Buffer.concat([latBuffer, latCrcBytes]);
    await sendCommand(stationConfig, `EEBWR 0B 02`, 1000, "<ACK>");
    await sendCommand(stationConfig, latPayload, 2000, "<ACK>");

    const lonCrc = calculateCRC(lonBuffer);
    const lonCrcBytes = Buffer.from([(lonCrc >> 8) & 0xFF, lonCrc & 0xFF]);
    const lonPayload = Buffer.concat([lonBuffer, lonCrcBytes]);
    await sendCommand(stationConfig, `EEBWR 0D 02`, 1000, "<ACK>");
    await sendCommand(stationConfig, lonPayload, 2000, "<ACK>");

    await sendCommand(stationConfig, barCommand, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");

    return {
        status: 'success',
        message: 'Localisation de la station définie avec succès.'
    };
}

async function updateStationTimezone(stationConfig, { type, index, offsetGMT }) {
    if (type === 'preset') {
        await sendCommand(stationConfig, `EEWR 11 ${index.toString(16).padStart(2, '0')}`, 2000, "<LF><CR>OK<LF><CR>");
        await sendCommand(stationConfig, `EEWR 16 00`, 2000, "<LF><CR>OK<LF><CR>");
    } else if (type === 'custom') {
        const gmtOffsetBuffer = Buffer.alloc(2);
        gmtOffsetBuffer.writeInt16LE(offsetGMT, 0);
        const gmtCrc = calculateCRC(gmtOffsetBuffer);
        const gmtCrcBytes = Buffer.from([(gmtCrc >> 8) & 0xFF, gmtCrc & 0xFF]);
        const gmtPayload = Buffer.concat([gmtOffsetBuffer, gmtCrcBytes]);

        await sendCommand(stationConfig, `EEBWR 14 02`, 1000, "<ACK>");
        await sendCommand(stationConfig, gmtPayload, 2000, "<ACK>");
        await sendCommand(stationConfig, `EEWR 16 01`, 2000, "<LF><CR>OK<LF><CR>");
    }

    await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");

    return {
        status: 'success',
        message: 'Fuseau horaire de la station défini avec succès.'
    };
}

async function fetchCurrentConditions(stationConfig) {
    const loop1Bytes = await sendCommand(stationConfig, 'LPS 1 1', 2000, "<ACK>97<CRC>");
    const loop1Data = parseLOOP1Data(loop1Bytes);

    const loop2Bytes = await sendCommand(stationConfig, 'LPS 2 1', 2000, "<ACK>97<CRC>");
    const loop2Data = parseLOOP2Data(loop2Bytes);

    const aggregatedData = { ...loop1Data, ...loop2Data };
    const processedData = processWeatherData(aggregatedData, stationConfig, userUnitsConfig);
 
    return {
        status: 'success',
        message: 'Données actuelles (LOOP & LOOP2) récupérées avec succès.',
        data: processedData
    };
}

async function _fetchAndMergeStationConfig(stationConfig) {
    const mergedConfig = { ...stationConfig };

    const readEeprom = async (address, length) => {
        const command = `EERD ${address.toString(16).padStart(2, '0').toUpperCase()} ${length.toString(16).padStart(2, '0').toUpperCase()}`;
        return await sendCommand(stationConfig, command, 2000, `<ACK>${length}<CRC>`);
    };

    if (mergedConfig.latitude === undefined) {
        try {
            const data = await readEeprom(0x0B, 2);
            mergedConfig.latitude = data.readInt16LE(0) / 10.0;
        } catch (e) { console.error(`Échec de la lecture de la latitude: ${e.message}`); }
    }
    if (mergedConfig.longitude === undefined) {
        try {
            const data = await readEeprom(0x0D, 2);
            mergedConfig.longitude = data.readInt16LE(0) / 10.0;
        } catch (e) { console.error(`Échec de la lecture de la longitude: ${e.message}`); }
    }
    if (mergedConfig.altitude === undefined) {
        try {
            const data = await readEeprom(0x0F, 2);
            mergedConfig.altitude = data.readUInt16LE(0);
        } catch (e) { console.error(`Échec de la lecture de l'altitude: ${e.message}`); }
    }
    return mergedConfig;
}

async function fetchStationSettings(stationConfig) {
    const mergedConfig = await _fetchAndMergeStationConfig(stationConfig);

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

    let currentTimeISO = null;
    let message = 'Paramètres de la station récupérés avec succès.';
    let status = 'success';

    try {
        const stationTimeDataBytes = await sendCommand(stationConfig, 'GETTIME', 2000, "<ACK>6<CRC>");
        const stationYear = stationTimeDataBytes[5] + 1900;
        const stationMonth = stationTimeDataBytes[4] - 1;
        const stationDay = stationTimeDataBytes[3];
        const stationHour = stationTimeDataBytes[2];
        const stationMinute = stationTimeDataBytes[1];
        const stationSecond = stationTimeDataBytes[0];
        const currentStationDate = new Date(Date.UTC(stationYear, stationMonth, stationDay, stationHour, stationMinute, stationSecond));
        currentTimeISO = currentStationDate.toISOString();
    } catch (error) {
        console.error(`[fetchStationSettings] Impossible d'obtenir l'heure de la station: ${error.message}`);
        message = 'Paramètres de configuration récupérés, mais impossible d\'obtenir l\'heure de la station.';
        status = 'partial_success';
    }

    return { status, message, settings: { ...staticSettings, currentTime: currentTimeISO } };
}

async function downloadArchiveData(stationConfig, startDate) {
    let effectiveStartDate;
    if (startDate) {
        effectiveStartDate = startDate;
    } else if (stationConfig.lastArchiveDate) {
        effectiveStartDate = new Date(stationConfig.lastArchiveDate);
        effectiveStartDate.setMinutes(effectiveStartDate.getMinutes() + 1);
    } else { // on télécharge les données de la journée en cours
        effectiveStartDate = new Date(new Date().getTime() - 4 * 24 * 60 * 60 * 1000);
    }

    console.warn(`[Archive Download] Début du téléchargement pour ${stationConfig.id} à partir de ${effectiveStartDate.toISOString()}`);

    // 1. Envoyer DMPAFT et attendre ACK
    await sendCommand(stationConfig, 'DMPAFT', 2000, "<ACK>");

    // 2. Préparer le payload complet (date + CRC)
    const year = effectiveStartDate.getFullYear();
    const month = effectiveStartDate.getMonth() + 1;
    const day = effectiveStartDate.getDate();
    const dateStamp = (year - 2000) * 512 + month * 32 + day;
    const timeStamp = effectiveStartDate.getHours() * 100 + effectiveStartDate.getMinutes();

    const datePayload = Buffer.alloc(4);
    datePayload.writeUInt16LE(dateStamp, 0);
    datePayload.writeUInt16LE(timeStamp, 2);

    const dateCrc = calculateCRC(datePayload);
    const dateCrcBytes = Buffer.from([(dateCrc >> 8) & 0xFF, dateCrc & 0xFF]);
    
    // Créer un buffer unique avec payload + CRC
    const fullPayload = Buffer.concat([datePayload, dateCrcBytes]);

    // console.log(`[Archive Download] Full payload: ${fullPayload.toString('hex')}`);

    // 3. Envoyer les 6 octets en une seule commande
    const pageInfo = await sendCommand(stationConfig, fullPayload, 5000, "<ACK>4<CRC>");

    const numberOfPages = pageInfo.readUInt16LE(0);
    console.log(`[Archive Download] Nombre de pages: ${numberOfPages}`);
    if (numberOfPages === 0) {
        return { status: 'success', message: 'Aucune nouvelle donnée d\'archive à télécharger.', data: [] };
    }

    const allRecords = [];
    for (let i = 0; i < numberOfPages; i++) {
        const ackByte = Buffer.from([0x06]);
        const pageData = await sendCommand(stationConfig, ackByte, 2000, "265<CRC>");

            // le premier octet est le numero de la page
            const pageNumber = pageData.readUInt8(0);
            // on retire le 1er octet
            const pageDataOnly = pageData.slice(1, pageData.length-4);
        for (let j = 0; j < 5; j++) {
            // ensuite 5 x 52octets
            console.warn(`[Archive Download] Page[Reccord] number: ${pageNumber}[${j+1}]/${numberOfPages}`);
            const recordBuffer = pageDataOnly.slice(j * 52, (j + 1) * 52);
            if (recordBuffer.length === 52) {
                const parsedRecord = parseDMPRecord(recordBuffer);
                const processedData = processWeatherData(parsedRecord, stationConfig, userUnitsConfig);
                const datetime = parsedRecord.date.value + 'T' + parsedRecord.time.value + ':00.000Z';
                const processedRecord = {
                    status: 'success',
                    message: 'Données d\'archive récupérées avec succès.',
                    timestamp: datetime,
                    data: processedData
                };
                // on enregiste les date de derniere archive dans le vp2.json
                stationConfig.lastArchiveDate = datetime;
                fs.writeFileSync(path.resolve(__dirname, '../config/VP2.json'), JSON.stringify(allVp2StationConfigs, null, 4));
                allRecords.push(processedRecord);
                // console.log(`[Archive Download] Enregistrement téléchargé: ${JSON.stringify(processedRecord)}`);

            }
        }
    }

    if (allRecords.length > 0) {
        const latestRecord = allRecords[allRecords.length - 1];
        stationConfig.lastArchiveDate = latestRecord.timestamp;
        fs.writeFileSync(path.resolve(__dirname, '../config/VP2.json'), JSON.stringify(allVp2StationConfigs, null, 4));
    }

    return { status: 'success', message: `${allRecords.length} enregistrements d'archive téléchargés.`, data: allRecords };
}

async function saveReceivedArchiveData(stationConfig, archiveData) {
    let latestTimestamp = null;
    try {
        for (const record of archiveData) {
            if (record.timestamp) {
                const currentRecordDate = new Date(record.timestamp);
                if (isNaN(currentRecordDate.getTime())) throw new Error(`Timestamp invalide: ${record.timestamp}`);
                if (latestTimestamp === null || currentRecordDate > latestTimestamp) {
                    latestTimestamp = currentRecordDate;
                }
            }
        }
    } catch (error) {
        return { status: 'error', message: `Erreur lors du traitement des timestamps: ${error.message}` };
    }

    if (latestTimestamp === null) {
        return { status: 'error', message: 'Aucun timestamp valide trouvé.' };
    }

    const newLastArchiveDate = latestTimestamp.toISOString();
    const currentStoredDate = stationConfig.lastArchiveDate ? new Date(stationConfig.lastArchiveDate) : null;

    if (currentStoredDate && latestTimestamp <= currentStoredDate) {
        return {
            status: 'success',
            message: 'Données reçues, mais la date n\'est pas plus récente que celle enregistrée.',
            lastArchiveDate: stationConfig.lastArchiveDate
        };
    }

    stationConfig.lastArchiveDate = newLastArchiveDate;
    fs.writeFileSync(path.resolve(__dirname, '../config/VP2.json'), JSON.stringify(allVp2StationConfigs, null, 4));

    return { status: 'success', message: 'Données d\'archive reçues et date mise à jour.', lastArchiveDate: newLastArchiveDate };
}

module.exports = {
    updateStationTime,
    updateStationLocation,
    updateStationTimezone,
    fetchCurrentConditions,
    fetchStationSettings,
    downloadArchiveData,
    saveReceivedArchiveData
};