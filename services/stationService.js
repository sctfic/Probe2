// services/stationService.js
const fs = require('fs');
const path = require('path');
const { writeRaw, sendCommand, wakeUpConsole } = require('../config/vp2NetClient');
const { calculateCRC } = require('../utils/crc');
const { parseLOOP1Data, parseLOOP2Data, parseDMPRecord, processWeatherData, convertRawValue2NativeValue, conversionTable } = require('../utils/weatherDataParser');
const { getLocalTimeFromCoordinates, getTimeZoneFromCoordinates } = require('../utils/timeHelper');
const { findDavisTimeZoneIndex } = require('../utils/timeZoneMapping');
const { V } = require('../utils/icons');
const configManager = require('./configManager');

const userUnitsConfig = require(path.resolve(__dirname, '../config/Units.json'));

async function getVp2DateTime(stationConfig) {
    const stationTimeDataBytes = await sendCommand(stationConfig, 'GETTIME', 2000, "<ACK>6<CRC>");
    const stationYear = stationTimeDataBytes[5] + 1900;
    const stationMonth = stationTimeDataBytes[4] - 1;
    const stationDay = stationTimeDataBytes[3];
    const stationHour = stationTimeDataBytes[2];
    const stationMinute = stationTimeDataBytes[1];
    const stationSecond = stationTimeDataBytes[0];
    const currentStationDate = new Date(Date.UTC(stationYear, stationMonth, stationDay, stationHour, stationMinute, stationSecond));
    return currentStationDate;
}

async function updateStationTime(stationConfig) {
    const ianaTimeZone = await getTimeZoneFromCoordinates(
        stationConfig.latitude.read,
        stationConfig.longitude.read
    );

    const davisTimeZoneIndex = findDavisTimeZoneIndex(ianaTimeZone);
    const davisTimeZoneIndexHex = davisTimeZoneIndex.toString(16).padStart(2, '0').toUpperCase();
    stationConfig.timezone.value = ianaTimeZone;
    stationConfig.timezone.desired = davisTimeZoneIndex;

    const targetLocalTime = await getLocalTimeFromCoordinates(stationConfig);
    const VP2DateTime = await getVp2DateTime(stationConfig);
    const targetUTCTime = new Date(targetLocalTime.getTime() - (targetLocalTime.getTimezoneOffset() * 60000));
    
    const timeDiffSeconds = Math.abs((targetUTCTime.getTime() - VP2DateTime.getTime()) / 1000);

    if (timeDiffSeconds <= 0) {
        console.log(`${V.clock} Décalage de ${timeDiffSeconds.toFixed(2)} sec. L'heure est déjà synchronisée. ${V.Check}`);
        return {
            status: 'unchanged',
            message: `Décalage de ${timeDiffSeconds.toFixed(2)} sec. OK`,
            details: {
                DateTime: VP2DateTime.toISOString(),
                deltaTimeSeconds: timeDiffSeconds.toFixed(2),
                timeSetTo: targetLocalTime.toISOString(),
                timezoneSetTo: `${ianaTimeZone} (Preset Index ${davisTimeZoneIndex})`
            }
        };
    }

    console.warn(`${V.clock} Décalage de ${timeDiffSeconds.toFixed(2)} sec. Mise à jour de l'heure et du fuseau horaire...`);

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

    await sendCommand(stationConfig, 'SETTIME', 1000, "<ACK>");
    await sendCommand(stationConfig, setTimePayload, 2000, "<ACK>");

    console.log(`${V.eu} Configuration du fuseau horaire sur index ${davisTimeZoneIndex} (${ianaTimeZone}) en hex: ${davisTimeZoneIndexHex}`);
    await sendCommand(stationConfig, `EEWR 11 ${davisTimeZoneIndexHex}`, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(stationConfig, `EEWR 16 00`, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(stationConfig, `EEWR 12 00`, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");
    
    // Sauvegarder la configuration modifiée
    configManager.saveConfig(stationConfig.id, stationConfig);
    
    return {
        status: 'success',
        message: 'Heure et fuseau horaire synchronisés avec succès.',
        details: {
            DateTime: timeDataForSet.toISOString(),
            deltaTimeSeconds: 0,
            timeSetTo: targetLocalTime.toISOString(),
            timezoneSetTo: `${ianaTimeZone} (Preset Index ${davisTimeZoneIndex})`
        }
    };
}

const EEPROM_MAPPINGS = {
    latitude: { address: 0x0B, length: 2, type: 'int', scale: 10 },
    longitude: { address: 0x0D, length: 2, type: 'int', scale: 10 },
    altitude: { address: 0x0F, length: 2, type: 'uint', scale: 3.281},
    archiveInterval: { address: 0x2D, length: 1, type: 'uint', scale: 1},
    AMPMMode: { address: 0x2B, length: 1, type: 'bit', mask: 0x01, shift: 0 },
    isAMPMMode: { address: 0x2B, length: 1, type: 'bit', mask: 0x02, shift: 1 },
    dateFormat: { address: 0x2B, length: 1, type: 'bit', mask: 0x04, shift: 2 },
    windCupSize: { address: 0x2B, length: 1, type: 'bit', mask: 0x08, shift: 3 },
    rainCollectorSize: { address: 0x2B, length: 1, type: 'bit', mask: 0x30, shift: 4 },
    latitudeNorthSouth: { address: 0x2B, length: 1, type: 'bit', mask: 0x40, shift: 6 },
    longitudeEastWest: { address: 0x2B, length: 1, type: 'bit', mask: 0x80, shift: 7 },
    rainSaisonStart: { address: 0x2C, length: 1, type: 'bit', mask: 0x0F, shift: 0 },
};

async function syncStationSettings(stationConfig) {
    const stationId = stationConfig.id;
    let changesMade = false;

    const readEeprom = async (address, length) => {
        const command = `EEBRD ${address.toString(16).padStart(2, '0').toUpperCase()} ${length.toString(16).padStart(2, '0').toUpperCase()}`;
        return await sendCommand(stationConfig, command, 2000, `<ACK>${length}<CRC>`);
    };

    const writeEeprom = async (address, data) => {
        const hexData = data.toString(16).padStart(2, '0').toUpperCase();
        const command = `EEWR ${address.toString(16).padStart(2, '0').toUpperCase()} ${hexData}`;
        return await sendCommand(stationConfig, command, 2000, "<LF><CR>OK<LF><CR>");
    };

    try {
        console.log(`${V.gear} Synchronisation des paramètres pour la station ${stationId}`);

        // Parcourir tous les mappings EEPROM
        for (const [configKey, mapping] of Object.entries(EEPROM_MAPPINGS)) {
            if (stationConfig.hasOwnProperty(configKey) && stationConfig[configKey].hasOwnProperty('desired')) {
                const desiredValue = stationConfig[configKey].desired;
                
                // Lire la valeur actuelle
                const currentData = await readEeprom(mapping.address, mapping.length);
                let currentValue;

                if (mapping.type === 'bit') {
                    currentValue = (currentData[0] & mapping.mask) >> mapping.shift;
                } else if (mapping.type === 'int') {
                    if (mapping.length === 2) {
                        currentValue = (currentData[1] << 8) | currentData[0];
                        if (currentValue > 32767) currentValue -= 65536; // Conversion en signé
                    } else {
                        currentValue = currentData[0];
                        if (currentValue > 127) currentValue -= 256; // Conversion en signé
                    }
                } else { // uint
                    if (mapping.length === 2) {
                        currentValue = (currentData[1] << 8) | currentData[0];
                    } else {
                        currentValue = currentData[0];
                    }
                }

                // Comparer avec la valeur désirée
                if (currentValue !== desiredValue) {
                    console.log(`Compare ${configKey}: ${currentValue} -> ${desiredValue}`);
                    
                    if (mapping.type === 'bit') {
                        // Pour les bits, lire, modifier, écrire
                        let newValue = currentData[0];
                        newValue = (newValue & ~mapping.mask) | ((desiredValue << mapping.shift) & mapping.mask);
                        await writeEeprom(mapping.address, newValue);
                    } else {
                        // Pour les valeurs entières
                        if (mapping.length === 2) {
                            await writeEeprom(mapping.address, desiredValue & 0xFF);
                            await writeEeprom(mapping.address + 1, (desiredValue >> 8) & 0xFF);
                        } else {
                            await writeEeprom(mapping.address, desiredValue);
                        }
                    }
                    
                    // Mettre à jour la configuration
                    stationConfig[configKey].read = desiredValue;
                    changesMade = true;
                }
            }
        }

        if (changesMade) {
            console.log(`${V.download} Application des changements avec NEWSETUP...`);
            await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");
            
            // Sauvegarder la configuration modifiée
            configManager.saveConfig(stationId, stationConfig);
            
            console.log(`${V.Check} Synchronisation terminée avec succès pour ${stationId}`);
            return {
                status: 'success',
                message: `Paramètres synchronisés avec succès pour la station ${stationId}`,
                changes: changesMade
            };
        } else {
            console.log(`${V.Check} Aucun changement nécessaire pour ${stationId}`);
            return {
                status: 'unchanged',
                message: `Tous les paramètres sont déjà synchronisés pour la station ${stationId}`,
                changes: false
            };
        }
    } catch (error) {
        console.error(`${V.error} Erreur lors de la synchronisation pour ${stationId}:`, error);
        throw error;
    }
}

async function getCurrentWeatherData(stationConfig) {
    try {
        console.log(`${V.thermometer} Récupération des données météo pour ${stationConfig.id}`);
        
        // Réveil de la console
        await wakeUpConsole(stationConfig);
        
        // Commande LOOP 1
        const loop1Data = await sendCommand(stationConfig, 'LOOP 1', 2000, "<ACK>99<CRC>");
        const weatherData = parseLOOP1Data(loop1Data);
        
        // Traitement des données avec les configurations
        const processedData = processWeatherData(weatherData, stationConfig, userUnitsConfig);
        
        return processedData;
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération des données météo pour ${stationConfig.id}:`, error);
        throw error;
    }
}

async function getStationInfo(stationConfig) {
    try {
        console.log(`${V.info} Récupération des informations de la station ${stationConfig.id}`);
        
        await wakeUpConsole(stationConfig);
        
        const info = {
            stationId: stationConfig.id,
            name: stationConfig.name || stationConfig.id,
            location: stationConfig.location || 'Non défini',
            connection: {
                host: stationConfig.host,
                port: stationConfig.port
            },
            coordinates: {
                latitude: stationConfig.latitude || null,
                longitude: stationConfig.longitude || null,
                altitude: stationConfig.altitude || null
            },
            timezone: stationConfig.timezone || null,
            lastUpdate: new Date().toISOString()
        };
        
        return info;
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération des informations pour ${stationConfig.id}:`, error);
        throw error;
    }
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

async function downloadArchiveData(stationConfig, startDate, res) {
    const stationId = stationConfig.id;

    let effectiveStartDate;
    if (startDate) {
        effectiveStartDate = startDate;
    } else if (stationConfig.lastArchiveDate) {
        effectiveStartDate = new Date(stationConfig.lastArchiveDate);
        effectiveStartDate.setMinutes(effectiveStartDate.getMinutes());
    } else {
        effectiveStartDate = (new Date(new Date().getTime() - 4 * 24 * 60 * 60 * 1000));
    }
    await sendCommand(stationConfig, 'DMPAFT', 2000, "<ACK>");

    const year = effectiveStartDate.getUTCFullYear();
    const month = effectiveStartDate.getUTCMonth() + 1;
    const day = effectiveStartDate.getUTCDate();
    const dateStamp = (year - 2000) * 512 + month * 32 + day;
    // console.log(`${V.StartFlag} historique a partie de y=`,year, 'm= ', month, 'd= ', day,'=>', dateStamp);
    const hours = effectiveStartDate.getUTCHours();
    const minutes = effectiveStartDate.getUTCMinutes();
    const timeStamp = hours * 100 + minutes;
    // console.log(`${V.StartFlag} historique a partie de h=`,hours, 'm= ', minutes,'=>', timeStamp);

    // construction du buffer datePayload = dateStamp + timeStamp, attention a l'ordre de Octets !!!!
    const datePayload = Buffer.from([ dateStamp & 0xFF, dateStamp >> 8, timeStamp & 0xFF, timeStamp >> 8]);

        // const nativedate = convertRawValue2NativeValue( dateStamp, 'date', null);
        // const nativetime = convertRawValue2NativeValue( timeStamp, 'time', null);
        // const datetime = conversionTable.date.iso8601(nativedate) + conversionTable.time.iso8601(nativetime);
        // console.log(`${V.info} relecture de la date ${datetime}`, nativedate, nativetime);

    const dateCrc = calculateCRC(datePayload);
    const dateCrcBytes = Buffer.from([dateCrc >> 8, dateCrc & 0xFF]);
    const fullPayload = Buffer.concat([datePayload, dateCrcBytes]);
    // const testBuffer = Buffer.concat([Buffer.from([1,2,4,0,15]),Buffer.from([0,32,64,128])]);
    // console.log(`${V.warning} testBuffer`, testBuffer.toString('hex'), testBuffer.readUInt16LE(3), testBuffer.readUInt16BE(3));
    // console.log(`${V.transmission} fullPayload`, fullPayload.toString('hex'));
    // on ne peu pas utiliser sendCommand pour datePayload, on ecrit directement
    // console.log(`${V.thermometer} Récupération des données météo pour ${stationConfig.id}`);
    // await writeRaw(stationConfig, datePayload);
    // console.log(`${V.send} datePayload`, datePayload.toString('hex'));
    // // sleep 100ms
    // await new Promise(resolve => setTimeout(resolve, 100));
    // console.log(`${V.timeout} wait`, 100);

    const pageInfo = await sendCommand(stationConfig, fullPayload, 5000, "<ACK>4<CRC>"); // pageInfo 01020200
    // console.log(`${V.droplet} pageInfo`, pageInfo.toString('hex'));
    const numberOfPages = pageInfo.readUInt16LE(0);
    let firstReccord = pageInfo.readUInt8(2);
    console.log(`${V.books} ${numberOfPages} pages d'archives`, `${V.book} debute au ${firstReccord}ieme enregistrement de la 1er page`);
    //function interne pour l'avancement
    const sendProgress = (page, total) => {
        if (total > 1) {
            const out = {
                status: 'in progress',
                processedPages: page,
                totalPages: total,
            }
            try {
                // Envoi de l'avancement au client
                res.write(JSON.stringify(out) + '\n');
            } catch (error) {
                console.error(`${V.error} Erreur lors de l'envoi de l'avancement pour ${stationId}:`, out);
            }
        }
    };
    sendProgress(0, numberOfPages);

    const allRecords = {};
    for (let i = 0; i < numberOfPages; i++) {
        const ackByte = Buffer.from([0x06]);
        const pageData = await sendCommand(stationConfig, ackByte, 2000, "265<CRC>");
        const pageNumber = pageData.readUInt8(0);
        const pageDataOnly = pageData.slice(1, pageData.length-4);
        for (let j = firstReccord; j < 5; j++) {
            const recordBuffer = pageDataOnly.slice(j * 52, (j + 1) * 52);
            if (recordBuffer.length === 52) {
                const parsedRecord = parseDMPRecord(recordBuffer);
                const processedData = processWeatherData(parsedRecord, stationConfig, userUnitsConfig); 
                const nativedate = convertRawValue2NativeValue( parsedRecord.date.value, 'date', null);
                const nativetime = convertRawValue2NativeValue( parsedRecord.time.value, 'time', null);
                const datetime = conversionTable.date.iso8601(nativedate) + conversionTable.time.iso8601(nativetime);
                if (stationConfig.lastArchiveDate === null || (new Date(datetime)) > (new Date(stationConfig.lastArchiveDate))) {
                    console.log(`${V.package} ${pageNumber+1}[${j+1}]/${numberOfPages}: ${datetime}`);
                    allRecords[datetime] = processedData;
                    stationConfig.lastArchiveDate = datetime;
                } else {
                    console.warn(`${V.Tache} ${pageNumber+1}[${j+1}]/${numberOfPages}: ${datetime} <= ${stationConfig.lastArchiveDate}`);
                }
            }
        }        
        firstReccord = 0;
        sendProgress(i+1, numberOfPages);
        configManager.autoSaveConfig(stationConfig);
    }
    await wakeUpConsole(stationConfig);
    return { status: 'success', message: `${Object.keys(allRecords).length}/${numberOfPages} enregistrements d'archive téléchargés.`, data: allRecords };
}

async function updateArchiveConfiguration(stationConfig) {
    if (stationConfig.archiveRecordsEnable.desired != stationConfig.archiveRecordsEnable.read){
        console.log(`[Station Service] Activation de la création des enregistrements d'archive pour ${stationConfig.id}...`);
        try {
            await sendCommand(stationConfig, 'START', 2000, "<LF><CR>OK<LF><CR>");
        } catch (error) {
            console.error(`[Station Service] Erreur lors de l'activation des enregistrements d'archive: ${error.message}`);
            throw new Error(`Échec de l'activation des enregistrements d'archive: ${error.message}`);
        }
    }
    const validIntervals = [1, 5, 10, 15, 30, 60, 120];
    if (stationConfig.archiveInterval.desired != stationConfig.archiveInterval.read && validIntervals.includes(stationConfig.archiveInterval.desired)){
        console.log(`[Station Service] Définition de l'intervalle d'archive à ${stationConfig.archiveInterval.desired} minutes pour ${stationConfig.id}...`);
        try {
            await sendCommand(stationConfig, `SETPER ${stationConfig.archiveInterval.desired}`, 2000, "<LF><CR>");
        } catch (error) {
            console.error(`[Station Service] Erreur lors de la définition de l'intervalle d'archive: ${error.message}`);
            throw new Error(`Échec de la définition de l'intervalle d'archive: ${error.message}`);
        }
    }
    configManager.updateStationConfig(stationConfig);
    return { status: 'success', message: `Configuration de l'archive mise à jour avec succès pour ${stationConfig.id}.` };
}

module.exports = {
    getVp2DateTime,
    getCurrentWeatherData,
    getStationInfo,
    updateStationTime,
    updateStationLocation,
    fetchCurrentConditions,
    downloadArchiveData,
    updateArchiveConfiguration,
    syncStationSettings
};