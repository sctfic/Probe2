// services/stationService.js
const fs = require('fs');
const path = require('path');
const { writeRaw, sendCommand, wakeUpConsole } = require('../config/vp2NetClient');
const { calculateCRC } = require('../utils/crc');
const { parseLOOP1Data, parseLOOP2Data, parseDMPRecord, processWeatherData, convertRawValue2NativeValue, conversionTable, readSignedInt16LE, readUInt16LE, readInt8, readUInt8  } = require('../utils/weatherDataParser');
const { getLocalTimeFromCoordinates, getTimeZoneFromCoordinates } = require('../utils/timeHelper');
const { findDavisTimeZoneIndex } = require('../utils/timeZoneMapping');
const { V,O } = require('../utils/icons');
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

    const targetLocalTime = await getLocalTimeFromCoordinates(stationConfig);
    const targetUTCTime = new Date(targetLocalTime.getTime() - (targetLocalTime.getTimezoneOffset() * 60000));
    stationConfig.deltaTimeSeconds = Math.abs((targetUTCTime.getTime() - currentStationDate.getTime()) / 1000);
    configManager.autoSaveConfig(stationConfig);

    console.log(`${V.network} delta time : `, currentStationDate, stationConfig.deltaTimeSeconds, 'sec');

    return currentStationDate;
}

async function updateStationTime(stationConfig) {
    const ianaTimeZone = await getTimeZoneFromCoordinates(
        stationConfig.latitude.lastReadValue,
        stationConfig.longitude.lastReadValue
    );
    console.log(`${V.network} Fuseau horaire : ${ianaTimeZone} pour les coordonées`, stationConfig.latitude.lastReadValue, stationConfig.longitude.lastReadValue);

    const davisTimeZoneIndex = findDavisTimeZoneIndex(ianaTimeZone);
    const davisTimeZoneIndexHex = davisTimeZoneIndex.toString(16).padStart(2, '0').toUpperCase();
    stationConfig.timezone.method = 'GPS';
    stationConfig.timezone.value = ianaTimeZone;
    stationConfig.timezone.desired = davisTimeZoneIndex;
    // console.log(`${V.network} Fuseau horaire : `, stationConfig.timezone);

    const VP2DateTime = await getVp2DateTime(stationConfig);


    if (stationConfig.deltaTimeSeconds <= 1) {
        console.log(`${V.clock} Décalage de ${stationConfig.deltaTimeSeconds.toFixed(2)} sec. L'heure est déjà synchronisée. ${V.Check}`);
        return {
            status: 'unchanged',
            message: `Décalage de ${stationConfig.deltaTimeSeconds.toFixed(2)} sec. OK`,
            DateTime: VP2DateTime.toISOString(),
            deltaTimeSeconds: stationConfig.deltaTimeSeconds.toFixed(2),
            timeZone: `${ianaTimeZone} (Preset Index ${davisTimeZoneIndex})`
        };
    }

    console.warn(`${V.clock} Décalage de ${stationConfig.deltaTimeSeconds.toFixed(2)} sec. Mise à jour de l'heure et du fuseau horaire...`);
    
    const targetLocalTime = await getLocalTimeFromCoordinates(stationConfig);
    
    const targetUTCTime = new Date(targetLocalTime.getTime() - (targetLocalTime.getTimezoneOffset() * 60000));

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
    // await sendCommand(stationConfig, `EEWR 12 00`, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");
    
    // Sauvegarder la configuration modifiée
    configManager.autoSaveConfig(stationConfig);
    console.log(`${V.eu} Configuration pour ${stationConfig.id} sauvegardée avec succès.`);
    
    return {
        status: 'updated',
        message: `Mise à jour de l'heure et du fuseau horaire pour ${stationConfig.id}`,
        DateTime: VP2DateTime.toISOString(),
        deltaTimeSeconds: 0,
        timeZone: `${ianaTimeZone} (Preset Index ${davisTimeZoneIndex})`
    };
}
// Nouvelle implémentation de syncStationSettings avec lecture globale EEPROM

// Mapping des adresses EEPROM selon la documentation
const EEPROM_SETTINGS_MAP = {
    // Address: { offset, length, type, description }
    barGain:           { address: 0x01, length: 2, type: 'uint16', description: 'Factory barometer calibration - DO NOT MODIFY' },
    barOffset:         { address: 0x03, length: 2, type: 'uint16', description: 'Factory barometer calibration - DO NOT MODIFY' },
    barCal:            { address: 0x05, length: 2, type: 'uint16', description: 'Barometer Offset calibration' },
    hum33:             { address: 0x07, length: 2, type: 'uint16', description: 'Factory humidity calibration - DO NOT MODIFY' },
    hum80:             { address: 0x09, length: 2, type: 'uint16', description: 'Factory humidity calibration - DO NOT MODIFY' },
    latitude:          { address: 0x0B, length: 2, type: 'int16', description: 'Station Latitude in tenths of degree' },
    longitude:         { address: 0x0D, length: 2, type: 'int16', description: 'Station Longitude in tenths of degree' },
    altitude:          { address: 0x0F, length: 2, type: 'uint16', description: 'Station elevation in feet' },
    timezone:          { address: 0x11, length: 1, type: 'uint8', description: 'Time zone string number' },
    // manualOrAuto:      { address: 0x12, length: 1, type: 'uint8', description: '1=manual daylight savings, 0=automatic' },
    // daylightSavings:   { address: 0x13, length: 1, type: 'uint8', description: 'Daylight savings bit (manual mode only)' },
    gmtOffset:         { address: 0x14, length: 2, type: 'int16', description: 'GMT offset in hundredths of hours' },
    gmtOrZone:         { address: 0x16, length: 1, type: 'uint8', description: '1=use GMT_OFFSET, 0=use TIME_ZONE' },
    // useTx:             { address: 0x17, length: 1, type: 'uint8', description: 'Bitmapped transmitters to listen' },
    // reTransmitTx:      { address: 0x18, length: 1, type: 'uint8', description: 'ID for retransmit' },
    // stationList (16 bytes) from 0x19 to 0x28 - skip
    unitBits:          { address: 0x29, length: 1, type: 'uint8', description: 'Unit configuration bits' },
    unitBitsComp:      { address: 0x2A, length: 1, type: 'uint8', description: '1s complement of UNIT_BITS' },
    setupBits:         { address: 0x2B, length: 1, type: 'uint8', description: 'Setup configuration bits' },
    rainSaisonStart:   { address: 0x2C, length: 1, type: 'uint8', description: 'Month for yearly rain reset' },
    archiveInterval:   { address: 0x2D, length: 1, type: 'uint8', description: 'Archive period in minutes' }
};

// Fonction pour parser les données EEPROM lues
function parseEEPROMSettingsData(buffer) {
    const settings = {};
    
    // Fonction utilitaire pour lire différents types de données
    const readValue = (address, length, type) => {
        const offset = address - 0x01; // L'offset depuis le début du buffer (qui commence à 0x01)
        
        switch (type) {
            case 'uint8':
                return buffer.readUInt8(offset);
            case 'int8':
                return buffer.readInt8(offset);
            case 'uint16':
                return buffer.readUInt16LE(offset);
            case 'int16':
                return buffer.readInt16LE(offset);
            default:
                return buffer.readUInt8(offset);
        }
    };
    
    // Lecture de tous les paramètres définis dans le mapping
    for (const [key, config] of Object.entries(EEPROM_SETTINGS_MAP)) {
        try {
            const rawValue = readValue(config.address, config.length, config.type);
            
            // Traitement spécial pour certaines valeurs
            switch (key) {
                case 'latitude':
                    settings.latitude = { 
                        raw: rawValue,
                        degrees: rawValue / 10,
                        description: config.description 
                    };
                    break;
                    
                case 'longitude':
                    settings.longitude = { 
                        raw: rawValue,
                        degrees: rawValue / 10,
                        description: config.description 
                    };
                    break;
                    
                case 'altitude':
                    settings.altitude = { 
                        raw: rawValue,
                        feet: rawValue,
                        meters: Math.round(rawValue * 0.3048 * 100) / 100,
                        description: config.description 
                    };
                    break;
                    
                case 'setupBits':
                    // Parse des bits de configuration selon la doc
                    settings.setupBits = {
                        raw: rawValue,
                        AMPMMode: (rawValue & 0x01) === 0 ? 0 : 1,           // Bit 0: 0=AM/PM, 1=24H
                        isAMPMMode: (rawValue & 0x02) === 0 ? 0 : 1,         // Bit 1: 0=PM, 1=AM
                        dateFormat: (rawValue & 0x04) === 0 ? 0 : 1,         // Bit 2: 0=Month/Day, 1=Day/Month
                        windCupSize: (rawValue & 0x08) === 0 ? 0 : 1,        // Bit 3: 0=Small, 1=Large
                        rainCollectorSize: (rawValue & 0x30) >> 4,           // Bits 5:4: 0=0.01", 1=0.2mm, 2=0.1mm
                        latitudeNorthSouth: (rawValue & 0x40) === 0 ? 0 : 1, // Bit 6: 0=South, 1=North
                        longitudeEastWest: (rawValue & 0x80) === 0 ? 0 : 1,  // Bit 7: 0=West, 1=East
                        description: config.description
                    };
                    break;
                    
                case 'unitBits':
                    // Parse des bits d'unité selon la doc
                    settings.unitBits = {
                        raw: rawValue,
                        barometerUnit: rawValue & 0x03,           // Bits 1:0
                        temperatureUnit: (rawValue & 0x0C) >> 2, // Bits 3:2
                        elevationUnit: (rawValue & 0x10) >> 4,   // Bit 4
                        rainUnit: (rawValue & 0x20) >> 5,        // Bit 5
                        windUnit: (rawValue & 0xC0) >> 6,        // Bits 7:6
                        description: config.description
                    };
                    break;
                    
                default:
                    settings[key] = { 
                        raw: rawValue,
                        value: rawValue,
                        description: config.description 
                    };
                    break;
            }
        } catch (error) {
            console.error(`${V.error} Erreur lors de la lecture de ${key} à l'adresse 0x${config.address.toString(16).padStart(2, '0').toUpperCase()}: ${error.message}`);
        }
    }
    
    return settings;
}

// Fonction pour comparer et identifier les changements nécessaires
function identifyRequiredChanges(currentSettings, stationConfig) {
    const changes = [];
    
    // Comparaison de la latitude
    if (stationConfig.latitude?.desired !== undefined) {
        const currentLatDegrees = currentSettings.latitude?.degrees || 0;
        const desiredLatTenths = Math.round(stationConfig.latitude.desired * 10);
        const currentLatTenths = currentSettings.latitude?.raw || 0;
        
        if (currentLatTenths !== desiredLatTenths) {
            changes.push({
                parameter: 'latitude',
                address: 0x0B,
                length: 2,
                currentValue: currentLatTenths,
                desiredValue: desiredLatTenths,
                description: `Latitude: ${currentLatDegrees}° -> ${stationConfig.latitude.desired}°`
            });
        }
    }
    
    // Comparaison de la longitude
    if (stationConfig.longitude?.desired !== undefined) {
        const currentLonDegrees = currentSettings.longitude?.degrees || 0;
        const desiredLonTenths = Math.round(stationConfig.longitude.desired * 10);
        const currentLonTenths = currentSettings.longitude?.raw || 0;
        
        if (currentLonTenths !== desiredLonTenths) {
            changes.push({
                parameter: 'longitude',
                address: 0x0D,
                length: 2,
                currentValue: currentLonTenths,
                desiredValue: desiredLonTenths,
                description: `Longitude: ${currentLonDegrees}° -> ${stationConfig.longitude.desired}°`
            });
        }
    }
    
    // Comparaison de l'altitude
    if (stationConfig.altitude?.desired !== undefined) {
        const currentAltMeters = currentSettings.altitude?.meters || 0;
        const desiredAltFeet = Math.round(stationConfig.altitude.desired * 3.28084); // Conversion m -> ft
        const currentAltFeet = currentSettings.altitude?.raw || 0;
        
        if (currentAltFeet !== desiredAltFeet) {
            changes.push({
                parameter: 'altitude',
                address: 0x0F,
                length: 2,
                currentValue: currentAltFeet,
                desiredValue: desiredAltFeet,
                description: `Altitude: ${currentAltMeters}m (${currentAltFeet}ft) -> ${stationConfig.altitude.desired}m (${desiredAltFeet}ft)`
            });
        }
    }
    
    // Comparaison du fuseau horaire
    if (stationConfig.timezone?.desired !== undefined) {
        const currentTz = currentSettings.timezone?.value || 0;
        const desiredTz = stationConfig.timezone.desired;
        
        if (currentTz !== desiredTz) {
            changes.push({
                parameter: 'timezone',
                address: 0x11,
                length: 1,
                currentValue: currentTz,
                desiredValue: desiredTz,
                description: `Timezone: ${currentTz} -> ${desiredTz}`
            });
        }
    }
    
    // Comparaison de l'intervalle d'archive
    if (stationConfig.archiveInterval?.desired !== undefined) {
        const currentInterval = currentSettings.archiveInterval?.value || 0;
        const desiredInterval = stationConfig.archiveInterval.desired;
        
        if (currentInterval !== desiredInterval) {
            changes.push({
                parameter: 'archiveInterval',
                address: 0x2D,
                length: 1,
                currentValue: currentInterval,
                desiredValue: desiredInterval,
                description: `Archive Interval: ${currentInterval}min -> ${desiredInterval}min`,
                useSetPer: true // Utiliser la commande SETPER au lieu de EEWR
            });
        }
    }
    
    // Comparaison du mois de début de saison de pluie
    if (stationConfig.rainSaisonStart?.desired !== undefined) {
        const currentMonth = currentSettings.rainSaisonStart?.value || 0;
        const desiredMonth = stationConfig.rainSaisonStart.desired;
        
        if (currentMonth !== desiredMonth) {
            changes.push({
                parameter: 'rainSaisonStart',
                address: 0x2C,
                length: 1,
                currentValue: currentMonth,
                desiredValue: desiredMonth,
                description: `Rain Season Start: month ${currentMonth} -> month ${desiredMonth}`
            });
        }
    }
    
    // Comparaison des bits de configuration (setupBits)
    if (currentSettings.setupBits) {
        let newSetupBits = currentSettings.setupBits.raw;
        let setupChanged = false;
        
        // Vérification de chaque bit de configuration
        const setupBitChecks = [
            { configKey: 'AMPMMode', bit: 0, mask: 0x01 },
            { configKey: 'isAMPMMode', bit: 1, mask: 0x02 },
            { configKey: 'dateFormat', bit: 2, mask: 0x04 },
            { configKey: 'windCupSize', bit: 3, mask: 0x08 },
            { configKey: 'rainCollectorSize', bit: 4, mask: 0x30, shift: 4 },
            { configKey: 'latitudeNorthSouth', bit: 6, mask: 0x40 },
            { configKey: 'longitudeEastWest', bit: 7, mask: 0x80 }
        ];
        
        setupBitChecks.forEach(check => {
            if (stationConfig[check.configKey]?.desired !== undefined) {
                const currentBitValue = check.shift ? 
                    (currentSettings.setupBits.raw & check.mask) >> check.shift :
                    (currentSettings.setupBits.raw & check.mask) >> check.bit;
                    
                const desiredBitValue = stationConfig[check.configKey].desired;
                
                if (currentBitValue !== desiredBitValue) {
                    setupChanged = true;
                    if (check.shift) {
                        // Pour les champs multi-bits comme rainCollectorSize
                        newSetupBits = (newSetupBits & ~check.mask) | ((desiredBitValue << check.shift) & check.mask);
                    } else {
                        // Pour les bits simples
                        if (desiredBitValue) {
                            newSetupBits |= check.mask;
                        } else {
                            newSetupBits &= ~check.mask;
                        }
                    }
                }
            }
        });
        
        if (setupChanged) {
            changes.push({
                parameter: 'setupBits',
                address: 0x2B,
                length: 1,
                currentValue: currentSettings.setupBits.raw,
                desiredValue: newSetupBits,
                description: `Setup Bits: 0x${currentSettings.setupBits.raw.toString(16)} -> 0x${newSetupBits.toString(16)}`
            });
        }
    }
    
    return changes;
}

// Fonction principale syncStationSettings remaniée
async function syncStationSettings(stationConfig) {
    const stationId = stationConfig.id;
    let changesMade = false;
    
    try {
        console.log(`${V.gear} Synchronisation des paramètres pour la station ${stationId}`);
        
        // Étape 1: Lecture globale des paramètres EEPROM (46 bytes depuis 0x01)
        console.log(`${V.read} Lecture globale EEPROM depuis 0x01 (46 bytes)`);
        const eepromData = await sendCommand(stationConfig, 'EEBRD 01 2E', 2000, '<ACK>46<CRC>');
        
        // Étape 2: Parse des données lues
        const currentSettings = parseEEPROMSettingsData(eepromData);
        console.log(`${V.eye} Paramètres actuels lus avec succès`);
        
        // Mise à jour de stationConfig avec les valeurs lues
        if (currentSettings.latitude) {
            stationConfig.latitude.lastReadValue = currentSettings.latitude.degrees;
        }
        if (currentSettings.longitude) {
            stationConfig.longitude.lastReadValue = currentSettings.longitude.degrees;
        }
        if (currentSettings.altitude) {
            stationConfig.altitude.lastReadValue = currentSettings.altitude.meters;
        }
        if (currentSettings.timezone) {
            stationConfig.timezone.lastReadValue = currentSettings.timezone.value;
        }
        if (currentSettings.archiveInterval) {
            stationConfig.archiveInterval.lastReadValue = currentSettings.archiveInterval.value;
        }
        if (currentSettings.rainSaisonStart) {
            stationConfig.rainSaisonStart.lastReadValue = currentSettings.rainSaisonStart.value;
        }
        if (currentSettings.setupBits) {
            stationConfig.AMPMMode.lastReadValue = currentSettings.setupBits.AMPMMode;
            stationConfig.isAMPMMode.lastReadValue = currentSettings.setupBits.isAMPMMode;
            stationConfig.dateFormat.lastReadValue = currentSettings.setupBits.dateFormat;
            stationConfig.windCupSize.lastReadValue = currentSettings.setupBits.windCupSize;
            stationConfig.rainCollectorSize.lastReadValue = currentSettings.setupBits.rainCollectorSize;
            stationConfig.latitudeNorthSouth.lastReadValue = currentSettings.setupBits.latitudeNorthSouth;
            stationConfig.longitudeEastWest.lastReadValue = currentSettings.setupBits.longitudeEastWest;
        }
        
        // Étape 3: Identification des changements nécessaires
        const requiredChanges = identifyRequiredChanges(currentSettings, stationConfig);
        
        if (requiredChanges.length === 0) {
            console.log(`${V.Check} Aucun changement nécessaire pour ${stationId}`);
            return {
                status: 'unchanged',
                message: `Tous les paramètres sont déjà synchronisés pour la station ${stationId}`,
                changes: false
            };
        }
        
        // Étape 4: Application des changements
        console.log(`${V.write} ${requiredChanges.length} changement(s) nécessaire(s)`);
        
        for (const change of requiredChanges) {
            console.log(`${V.gear} ${change.description}`);
            
            if (change.useSetPer) {
                const validIntervals = [1, 5, 10, 15, 30, 60, 120];
                if (validIntervals.includes(change.desiredValue)) {
                    // Cas spécial pour l'intervalle d'archive
                    await sendCommand(stationConfig, `SETPER ${change.desiredValue}`, 2000, "<LF><CR>");
                    await sendCommand(stationConfig, 'START', 2000, "<LF><CR>OK<LF><CR>");
                } else {
                    await sendCommand(stationConfig, 'STOP', 2000, "<LF><CR>OK<LF><CR>");
                    console.log(`${V.error} Intervalle d'archive invalide pour ${stationId}: ${change.desiredValue}, ARRET d'Archivage !`);
                }
            } else if (change.length === 1) {
                // Écriture d'un byte
                await sendCommand(stationConfig, `EEWR ${change.address.toString(16).padStart(2, '0').toUpperCase()} ${change.desiredValue.toString(16).padStart(2, '0').toUpperCase()}`, 2000, "<LF><CR>OK<LF><CR>");
            } else if (change.length === 2) {
                // Écriture de 2 bytes (Little Endian)
                const lowByte = change.desiredValue & 0xFF;
                const highByte = (change.desiredValue >> 8) & 0xFF;
                await sendCommand(stationConfig, `EEWR ${change.address.toString(16).padStart(2, '0').toUpperCase()} ${lowByte.toString(16).padStart(2, '0').toUpperCase()}`, 2000, "<LF><CR>OK<LF><CR>");
                await sendCommand(stationConfig, `EEWR ${(change.address + 1).toString(16).padStart(2, '0').toUpperCase()} ${highByte.toString(16).padStart(2, '0').toUpperCase()}`, 2000, "<LF><CR>OK<LF><CR>");
            }
            
            changesMade = true;
        }
        
        // Étape 5: Application des changements avec NEWSETUP
        if (changesMade) {
            console.log(`${V.memory} Application des changements avec NEWSETUP...`);
            await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");
            
            // Sauvegarder la configuration modifiée
            configManager.saveConfig(stationId, stationConfig);
            
            console.log(`${V.Check} Synchronisation terminée avec succès pour ${stationId}`);
            return {
                status: 'success',
                message: `Paramètres synchronisés avec succès pour la station ${stationId}`,
                changes: changesMade,
                changesApplied: requiredChanges.length
            };
        }
        
    } catch (error) {
        console.error(`${V.error} Erreur lors de la synchronisation pour ${stationId}:`, error);
        throw error;
    }
}
async function updateArchiveConfiguration(stationConfig) {
    if (stationConfig.archiveRecordsEnable.desired != stationConfig.archiveRecordsEnable.lastReadValue){
        console.log(`[Station Service] Activation de la création des enregistrements d'archive pour ${stationConfig.id}...`);
        try {
            await sendCommand(stationConfig, 'START', 2000, "<LF><CR>OK<LF><CR>");
        } catch (error) {
            console.error(`[Station Service] Erreur lors de l'activation des enregistrements d'archive: ${error.message}`);
            throw new Error(`Échec de l'activation des enregistrements d'archive: ${error.message}`);
        }
    }
    const validIntervals = [1, 5, 10, 15, 30, 60, 120];
    if (stationConfig.archiveInterval.desired != stationConfig.archiveInterval.lastReadValue && validIntervals.includes(stationConfig.archiveInterval.desired)){
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

async function getCurrentWeatherData(stationConfig) {
    const loop1Bytes = await sendCommand(stationConfig, 'LPS 1 1', 2000, "<ACK>97<CRC>");
    const loop1Data = parseLOOP1Data(loop1Bytes);
    console.log(`${V.thermometer} Données LOOP1 récupérées pour ${stationConfig.id}:`, loop1Data);

    const loop2Bytes = await sendCommand(stationConfig, 'LPS 2 1', 2000, "<ACK>97<CRC>");
    const loop2Data = parseLOOP2Data(loop2Bytes);
    console.log(`${V.thermometer} Données LOOP2 récupérées pour ${stationConfig.id}:`, loop2Data);

    const aggregatedData = { ...loop1Data, ...loop2Data };
    const processedData = processWeatherData(aggregatedData, stationConfig, userUnitsConfig);

    return processedData;
}

async function getStationInfo(stationConfig) {
    try {
        console.log(`${V.info} Récupération des informations de la station ${stationConfig.id}`);
        
        // await wakeUpConsole(stationConfig);
        
        const info = {
            stationId: stationConfig.id,
            name: stationConfig.name || stationConfig.id,
            location: stationConfig.location || 'Non défini',
            connection: {
                host: stationConfig.host,
                port: stationConfig.port
            },
            coordinates: {
                latitude: stationConfig.latitude.lastReadValue || null,
                longitude: stationConfig.longitude.lastReadValue || null,
                altitude: stationConfig.altitude.lastReadValue || null
            },
            timezone: stationConfig.timezone.value || null,
            lastArchiveDate: stationConfig.lastArchiveDate || null
        };
        
        return info;
    } catch (error) {
        console.error(`${V.error} Erreur lors de la récupération des informations pour ${stationConfig.id}:`, error);
        throw error;
    }
}

// async function updateStationLocation(stationConfig, { latitude, longitude, elevation }) {
//     const latValue = Math.round(latitude * 10);
//     const latBuffer = Buffer.alloc(2);
//     latBuffer.writeInt16LE(latValue, 0);

//     const lonValue = Math.round(longitude * 10);
//     const lonBuffer = Buffer.alloc(2);
//     lonBuffer.writeInt16LE(lonValue, 0);

//     const barCommand = `BAR=0 ${Math.round(elevation)}`;

//     const latCrc = calculateCRC(latBuffer);
//     const latCrcBytes = Buffer.from([(latCrc >> 8) & 0xFF, latCrc & 0xFF]);
//     const latPayload = Buffer.concat([latBuffer, latCrcBytes]);
//     await sendCommand(stationConfig, `EEBWR 0B 02`, 1000, "<ACK>");
//     await sendCommand(stationConfig, latPayload, 2000, "<ACK>");

//     const lonCrc = calculateCRC(lonBuffer);
//     const lonCrcBytes = Buffer.from([(lonCrc >> 8) & 0xFF, lonCrc & 0xFF]);
//     const lonPayload = Buffer.concat([lonBuffer, lonCrcBytes]);
//     await sendCommand(stationConfig, `EEBWR 0D 02`, 1000, "<ACK>");
//     await sendCommand(stationConfig, lonPayload, 2000, "<ACK>");

//     await sendCommand(stationConfig, barCommand, 2000, "<LF><CR>OK<LF><CR>");
//     await sendCommand(stationConfig, 'NEWSETUP', 2000, "<ACK>");

//     return {
//         status: 'success',
//         message: 'Localisation de la station définie avec succès.'
//     };
// }

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

module.exports = {
    getVp2DateTime,
    getCurrentWeatherData,
    getStationInfo,
    updateStationTime,
    // updateStationLocation,
    fetchCurrentConditions,
    downloadArchiveData,
    updateArchiveConfiguration,
    syncStationSettings,
    parseEEPROMSettingsData,
    identifyRequiredChanges,
    EEPROM_SETTINGS_MAP
};