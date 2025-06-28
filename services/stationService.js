// services/stationService.js
const fs = require('fs');
const path = require('path');
const { sendCommand, writeRaw } = require('../config/vp2NetClient'); // Import writeRaw
const { calculateCRC } = require('../utils/crc');
const { parseLOOP1Data, parseLOOP2Data, parseDMPRecord, processWeatherData, convertRawValue2NativeValue, conversionTable } = require('../utils/weatherDataParser');
const { getLocalTimeFromCoordinates, getTimeZoneFromCoordinates } = require('../utils/timeHelper'); // Import du nouvel utilitaire
const { findDavisTimeZoneIndex } = require('../utils/timeZoneMapping');

const allVp2StationConfigs = require(path.resolve(__dirname, '../config/VP2.json'));
const userUnitsConfig = require(path.resolve(__dirname, '../config/Units.json'));

async function getVp2DateTime(stationConfig) {
    const stationTimeDataBytes = await sendCommand(stationConfig, 'GETTIME', 2000, "<ACK>6<CRC>");
    const stationYear = stationTimeDataBytes[5] + 1900;
    const stationMonth = stationTimeDataBytes[4] - 1; // Corrigé : Les mois dans l'objet Date sont de 0 à 11
    const stationDay = stationTimeDataBytes[3];
    const stationHour = stationTimeDataBytes[2];
    const stationMinute = stationTimeDataBytes[1];
    const stationSecond = stationTimeDataBytes[0];
    const currentStationDate = new Date(Date.UTC(stationYear, stationMonth, stationDay, stationHour, stationMinute, stationSecond));
    return currentStationDate;
}

async function updateStationTime(stationConfig) {
    // Obtenir le fuseau horaire IANA à partir des coordonnées
    const ianaTimeZone = await getTimeZoneFromCoordinates(
        stationConfig.latitude.value,
        stationConfig.longitude.value
    );

    // Trouver l'index Davis correspondant
    const davisTimeZoneIndex = findDavisTimeZoneIndex(ianaTimeZone);
    const davisTimeZoneIndexHex = davisTimeZoneIndex.toString(16).padStart(2, '0').toUpperCase();
    stationConfig.timezone.value = ianaTimeZone;
    stationConfig.timezone.index = davisTimeZoneIndex;
    stationConfig.timezone.lastUpdate = new Date().toISOString();

    // Utilise la fonction pour obtenir l'heure locale précise
    const targetLocalTime = await getLocalTimeFromCoordinates(stationConfig);
    const VP2DateTime = await getVp2DateTime(stationConfig); // UTC

    // Convertir l'heure locale en UTC pour une comparaison correcte
    const targetUTCTime = new Date(targetLocalTime.getTime() - (targetLocalTime.getTimezoneOffset() * 60000));
    
    // Compare en UTC
    const timeDiffSeconds = Math.abs((targetUTCTime.getTime() - VP2DateTime.getTime()) / 1000);

    if (timeDiffSeconds <= 1) {
        console.log(`Décalage de ${timeDiffSeconds.toFixed(2)} sec. L'heure est déjà synchronisée.`);
        return {
            status: 'unchanged',
            message: `Décalage de ${timeDiffSeconds.toFixed(2)} sec. OK`,
            details: {
                DateTime: targetUTCTime.toISOString(),
                timeSetTo: targetLocalTime.toISOString(),
                timezoneSetTo: `${ianaTimeZone} (Preset Index ${davisTimeZoneIndex})`
            }
        };
    }

    console.warn(`Décalage de ${timeDiffSeconds.toFixed(2)} sec. Mise à jour de l'heure et du fuseau horaire...`);

    // Préparation des données pour la commande SETTIME (en UTC)
    const timeDataForSet = Buffer.from([
        targetUTCTime.getUTCSeconds(),
        targetUTCTime.getUTCMinutes(),
        targetUTCTime.getUTCHours(),
        targetUTCTime.getUTCDate(),
        targetUTCTime.getUTCMonth() + 1,
        targetUTCTime.getUTCFullYear() - 1900
    ]);

    const crcForSetTime = calculateCRC(timeDataForSet);
    const crcBytesForSetTime = Buffer.from([(crcForSetTime >> 8) & 0xFF, crcForSetTime & 0xFF]);
    const setTimePayload = Buffer.concat([timeDataForSet, crcBytesForSetTime]);

    // Envoi des commandes pour régler l'heure
    await sendCommand(stationConfig, 'SETTIME', 1000, "<ACK>");
    await sendCommand(stationConfig, setTimePayload, 2000, "<ACK>");

    // Configuration du fuseau horaire avec l'index dynamique (en hexadécimal)
    console.log(`Configuration du fuseau horaire sur index ${davisTimeZoneIndex} (${ianaTimeZone}) en hex: ${davisTimeZoneIndexHex}`);
    await sendCommand(stationConfig, `EEWR 11 ${davisTimeZoneIndexHex}`, 2000, "<LF><CR>OK<LF><CR>");


    // Utiliser le fuseau horaire prédéfini 
    await sendCommand(stationConfig, `EEWR 16 00`, 2000, "<LF><CR>OK<LF><CR>");
    
    // Activer le mode de changement d'heure d'été automatique
    await sendCommand(stationConfig, `EEWR 12 00`, 2000, "<LF><CR>OK<LF><CR>");

    // Appliquer les nouveaux paramètres à la console 
    await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");
    return {
        status: 'success',
        message: 'Heure et fuseau horaire synchronisés avec succès.',
        details: {
            DateTime: targetUTCTime.toISOString(),
            timeSetTo: targetLocalTime.toISOString(),
            timezoneSetTo: `${ianaTimeZone} (Preset Index ${davisTimeZoneIndex})`
        }
    };
}

const EEPROM_MAPPINGS = {
    latitude: { address: 0x0B, length: 2, type: 'int', scale: 10 },
    longitude: { address: 0x0D, length: 2, type: 'int', scale: 10 },
    altitude: { address: 0x0F, length: 2, type: 'uint', scale: 3.281},
    archiveInterval: { address: 0x30, length: 1, type: 'uint', scale: 1},
    // timezone: { address: 0x11, length: 1, type: 'uint' },
    AMPMMode: { address: 0x2B, length: 1, type: 'bit', mask: 0x01, shift: 0 },
    isAMPMMode: { address: 0x2B, length: 1, type: 'bit', mask: 0x02, shift: 1 },
    dateFormat: { address: 0x2B, length: 1, type: 'bit', mask: 0x04, shift: 2 },
    windCupSize: { address: 0x2B, length: 1, type: 'bit', mask: 0x08, shift: 3 },
    rainCollectorSize: { address: 0x2B, length: 1, type: 'bit', mask: 0x30, shift: 4 },
    latitudeNorthSouth: { address: 0x2B, length: 1, type: 'bit', mask: 0x40, shift: 6 },
    longitudeEastWest: { address: 0x2B, length: 1, type: 'bit', mask: 0x80, shift: 7 },
    rainSaisonStart: { address: 0x2C, length: 1, type: 'bit', mask: 0x0F, shift: 0 }
};

const VP2_CONFIG_PATH = path.resolve(__dirname, '../config/VP2.json');

// Fonction pour charger le fichier de configuration
function loadVp2Config() {
    try {
        return JSON.parse(fs.readFileSync(VP2_CONFIG_PATH, 'utf8'));
    } catch (error) {
        console.error('Erreur lors du chargement du fichier VP2.json', error);
        return {};
    }
}

// Fonction pour sauvegarder le fichier de configuration
function saveVp2Config(config) {
    try {
        fs.writeFileSync(VP2_CONFIG_PATH, JSON.stringify(config, null, 4));
        return true;
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de VP2.json', error);
        return false;
    }
}

async function syncStationSettings(stationConfig) {
    // Charger la configuration à jour
    const allVp2StationConfigs = loadVp2Config();
    
    // Récupérer la configuration spécifique à la station
    let updatedConfig = { ...allVp2StationConfigs[stationConfig.id] };
    let changesMade = false;

    // Fonctions pour lire/écrire dans l'EEPROM
    const readEeprom = async (address, length) => {
        const command = `EEBRD ${address.toString(16).padStart(2, '0').toUpperCase()} ${length.toString(16).padStart(2, '0').toUpperCase()}`;
        return await sendCommand(stationConfig, command, 2000, `<ACK>${length}<CRC>`);
    };

    const writeEeprom = async (address, value, length, type) => {
        const buffer = Buffer.alloc(length);
        if (length === 2) {
            if (type === 'uint') buffer.writeUInt16LE(value, 0);
            else buffer.writeInt16LE(value, 0);
        } else buffer.writeUInt8(value, 0);
        
        const crc = calculateCRC(buffer);
        const crcBytes = Buffer.from([(crc >> 8) & 0xFF, crc & 0xFF]);
        const payload = Buffer.concat([buffer, crcBytes]);

        await sendCommand(stationConfig, `EEBWR ${address.toString(16).padStart(2, '0').toUpperCase()} ${length.toString(16).padStart(2, '0').toUpperCase()}`, 1000, "<ACK>");
        await sendCommand(stationConfig, payload, 2000, "<ACK>");
        return true;
    };

    // Parcourir tous les paramètres mappés
    for (const [param, config] of Object.entries(EEPROM_MAPPINGS)) {
        if (!updatedConfig[param]) {
            updatedConfig[param] = {
                value: null,
                lastUpdate: null
            };
            changesMade = true;
        }

        const setting = updatedConfig[param];
        
        // Opération de LECTURE si value est null
        if (setting.value === null) {
            try {
                const data = await readEeprom(config.address, config.length);
                let value;
                
                switch (config.type) {
                    case 'int':
                        value = data.readInt16LE(0);
                        if (config.scale) value /= config.scale;
                        break;
                    case 'uint':
                        value = config.length === 2 ? 
                            data.readUInt16LE(0) : 
                            data.readUInt8(0);
                        break;
                    case 'bit':
                        const byte = data.readUInt8(0);
                        value = (byte & config.mask) >> config.shift;
                        break;
                }
                
                setting.value = value;
                setting.lastUpdate = null; // Marquer comme non synchronisé
                changesMade = true;
                console.log(`[Sync] Lecture ${param}: ${value}`);
                
            } catch (error) {
                console.error(`[Sync] Erreur lecture ${param}: ${error.message}`);
            }
        } 
        // Opération d'ÉCRITURE si lastUpdate est "now!"
        else if (setting.lastUpdate === "now!") {
            try {
                let valueToWrite = setting.value;
                
                // Appliquer les conversions pour l'écriture
                if (config.scale) valueToWrite *= config.scale;

                // Cas spécial pour les bits
                if (config.type === 'bit') {
                    // Lire la valeur actuelle
                    const currentData = await readEeprom(config.address, config.length);
                    let currentValue = config.length === 2 ? 
                        currentData.readUInt16LE(0) : 
                        currentData.readUInt8(0);
                    
                    // Mettre à jour seulement les bits concernés
                    currentValue &= ~config.mask; // Effacer les bits
                    currentValue |= (valueToWrite << config.shift) & config.mask; // Définir les nouveaux bits
                    
                    valueToWrite = currentValue;
                }
                
                // Écrire la valeur
                await writeEeprom(config.address, Math.round(valueToWrite), config.length, config.type);
                
                // Mettre à jour le timestamp
                setting.lastUpdate = new Date().toISOString();
                changesMade = true;
                console.log(`[Sync] Écriture ${param}: ${setting.value}`);
                
            } catch (error) {
                console.error(`[Sync] Erreur écriture ${param}: ${error.message}`);
            }
        }
    }

    const changesTime = (await updateStationTime(updatedConfig)).status;

    // Sauvegarder les modifications si nécessaire
    if (changesMade || changesTime == 'success') {
        allVp2StationConfigs[stationConfig.id] = updatedConfig;
        if (!saveVp2Config(allVp2StationConfigs)) {
            console.error('Échec de la sauvegarde des paramètres');
        }
        // console.warn('Configuration synchronisée avec succès');
    }

    return {
        status: 'success',
        message: changesMade ? 
            'Configuration synchronisée avec succès' : 
            'Aucun changement nécessaire',
        config: updatedConfig
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

async function downloadArchiveData(stationConfig, startDate) {
    let effectiveStartDate;
    if (startDate) {
        effectiveStartDate = startDate;
    } else if (stationConfig.lastArchiveDate) {
        effectiveStartDate = new Date(stationConfig.lastArchiveDate);
        // on ajoute 1 minute pour éviter les doublons
        effectiveStartDate.setMinutes(effectiveStartDate.getMinutes() + 1);
    } else { // on télécharge les données de la journée en cours
        effectiveStartDate = (new Date(new Date().getTime() - 4 * 24 * 60 * 60 * 1000));
    }

    console.warn(`[Archive Download] Début du téléchargement pour ${stationConfig.id} à partir de ${effectiveStartDate.toISOString()}`);

    // 1. Envoyer DMPAFT et attendre ACK
    await sendCommand(stationConfig, 'DMPAFT', 2000, "<ACK>");

    // 2. Préparer le payload complet (date + CRC)
    const year = effectiveStartDate.getUTCFullYear();
    const month = effectiveStartDate.getUTCMonth() + 1;
    const day = effectiveStartDate.getUTCDate();
    const dateStamp = (year - 2000) * 512 + month * 32 + day;
    const timeStamp = effectiveStartDate.getUTCHours() * 100 + effectiveStartDate.getUTCMinutes();

    const datePayload = Buffer.alloc(4);
    datePayload.writeUInt16LE(dateStamp, 0);
    datePayload.writeUInt16LE(timeStamp, 2);

    const nativedate = convertRawValue2NativeValue( dateStamp, 'date', null);
    const nativetime = convertRawValue2NativeValue( timeStamp, 'time', null);
    const datetime = conversionTable.date.iso8601(nativedate) + conversionTable.time.iso8601(nativetime);
    // console.warn(dateStamp, timeStamp, datetime);



    const dateCrc = calculateCRC(datePayload);
    const dateCrcBytes = Buffer.from([(dateCrc >> 8) & 0xFF, dateCrc & 0xFF]);
    
    // Créer un buffer unique avec payload + CRC
    const fullPayload = Buffer.concat([datePayload, dateCrcBytes]);

    // console.log(`[Archive Download] Full payload: ${fullPayload.toString('hex')}`);

    // 3. Envoyer les 6 octets en une seule commande
    const pageInfo = await sendCommand(stationConfig, fullPayload, 5000, "<ACK>4<CRC>");

    const numberOfPages = pageInfo.readUInt16LE(0);
    let firstReccord = pageInfo.readUInt8(2);
    console.log(`[Archive Download] Nombre de pages: ${numberOfPages}`);
    console.log(`[Archive Download] Premier enregistrement: ${firstReccord}`);
    if (numberOfPages === 0) {
        return { status: 'success', message: 'Aucune nouvelle donnée d\'archive à télécharger.', data: [] };
    }

    const allRecords = {}; //
    for (let i = 0; i < numberOfPages; i++) {
        const ackByte = Buffer.from([0x06]);
        const pageData = await sendCommand(stationConfig, ackByte, 2000, "265<CRC>");

            // le premier octet est le numero de la page
            const pageNumber = pageData.readUInt8(0);
            // on retire le 1er octet
            const pageDataOnly = pageData.slice(1, pageData.length-4);
        for (let j = firstReccord; j < 5; j++) {
            // ensuite 5 x 52octets
            const recordBuffer = pageDataOnly.slice(j * 52, (j + 1) * 52);
            if (recordBuffer.length === 52) {
                const parsedRecord = parseDMPRecord(recordBuffer);
                const processedData = processWeatherData(parsedRecord, stationConfig, userUnitsConfig); 
                // console.warn(JSON.stringify(parsedRecord.date, null, 2), JSON.stringify(processedData.date, null, 2));
                const nativedate = convertRawValue2NativeValue( parsedRecord.date.value, 'date', null);
                const nativetime = convertRawValue2NativeValue( parsedRecord.time.value, 'time', null);
                const datetime = conversionTable.date.iso8601(nativedate) + conversionTable.time.iso8601(nativetime);
                // console.warn(datetime);
                // si la date est antérieure à la dernière date enregistrée, on la saute
                if (stationConfig.lastArchiveDate === null || (new Date(datetime)) > (new Date(stationConfig.lastArchiveDate))) {
                    console.log(`[Archive Download] ${pageNumber+1}[${j+1}]/${numberOfPages}: ${datetime}`);
                    allRecords[datetime] = processedData;
                    stationConfig.lastArchiveDate = datetime;
                    fs.writeFileSync(path.resolve(__dirname, '../config/VP2.json'), JSON.stringify(allVp2StationConfigs, null, 4));
                } else {
                    console.warn(`[Archive Ignored] ${pageNumber}[${j+1}]/${numberOfPages}: ${datetime} <= ${stationConfig.lastArchiveDate}`);
                }
            }
        }
        firstReccord = 0;
    }
    await wakeupStation(stationConfig);

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

/**
 * Met à jour la configuration d'archivage de la station (intervalle, démarrage, réinitialisation).
 * @param {object} stationConfig La configuration de la station.
 * @returns {Promise<object>} Un objet indiquant le statut et un message.
 * @throws {Error} Si l'intervalle d'archive est invalide ou si une commande échoue.
 */
async function updateArchiveConfiguration(stationConfig) {
    const archiveInterval = parseInt(stationConfig.archiveInterval, 10);
    const validIntervals = [1, 5, 10, 15, 30, 60, 120];

    if (!validIntervals.includes(archiveInterval)) {
        throw new Error(`Intervalle d'archive invalide: ${archiveInterval}. Les valeurs valides sont ${validIntervals.join(', ')}.`);
    }

    console.log(`[Station Service] Activation de la création des enregistrements d'archive pour ${stationConfig.id}...`);
    try {
        await sendCommand(stationConfig, 'START', 2000, "<LF><CR>OK<LF><CR>");
        console.log(`[Station Service] Création des enregistrements d'archive activée avec succès.`);
    } catch (error) {
        console.error(`[Station Service] Erreur lors de l'activation des enregistrements d'archive: ${error.message}`);
        throw new Error(`Échec de l'activation des enregistrements d'archive: ${error.message}`);
    }

    console.log(`[Station Service] Définition de l'intervalle d'archive à ${archiveInterval} minutes pour ${stationConfig.id}...`);
    try {
        await sendCommand(stationConfig, `SETPER ${archiveInterval}`, 2000, "<LF><CR>");
        console.log(`[Station Service] Intervalle d'archive défini avec succès.`);
    } catch (error) {
        console.error(`[Station Service] Erreur lors de la définition de l'intervalle d'archive: ${error.message}`);
        throw new Error(`Échec de la définition de l'intervalle d'archive: ${error.message}`);
    }

    return { status: 'success', message: `Configuration de l'archive mise à jour avec succès pour ${stationConfig.id}.` };
}

module.exports = {
    updateStationTime,
    updateStationLocation,
    // updateStationTimezone,
    fetchCurrentConditions,
    // getStationSettings,
    // updateStationSettings,
    downloadArchiveData,
    saveReceivedArchiveData,
    updateArchiveConfiguration,
    syncStationSettings
};