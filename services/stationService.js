// services/stationService.js

const { sendCommand } = require('./vp2NetClient');
const { calculateCRC } = require('../utils/crc');
const { sensorTypeMap, mapDegreesToCardinal, mapCardinalToDegrees, parseLOOP1Data, parseLOOP2Data, parseDMPRecord, processWeatherData, convertRawValue2NativeValue, conversionTable, readSignedInt16LE, readUInt16LE, readInt8, readUInt8  } = require('../utils/weatherDataParser');
const { getLocalTimeFromCoordinates, getTimeZoneFromCoordinates } = require('../utils/timeHelper');
const { findDavisTimeZoneIndex } = require('../utils/timeZoneMapping');
const wakeUpConsole = require('../services/vp2NetClient');
const { V,O } = require('../utils/icons');
const configManager = require('./configManager');
const { writePoints, Point } = require('./influxdbService'); // Ajout pour InfluxDB
const units = require('../config/Units.json');
const ACK = Buffer.from([0x06]);
const NAK = Buffer.from([0x21]);
const ESC = Buffer.from([0x1B]);
const ESC_LF = Buffer.from([0x1B, 0x0A]);

async function getVp2DateTime(req, stationConfig) {
    const stationTimeDataBytes = await sendCommand(req, stationConfig, 'GETTIME', 2000, "<ACK>6<CRC>");
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

async function updateStationTime(req, stationConfig) {
    const ianaTimeZone = await getTimeZoneFromCoordinates(
        stationConfig.latitude.lastReadValue,
        stationConfig.longitude.lastReadValue
    );
    console.log(`${V.network} Fuseau horaire : ${ianaTimeZone} pour les coordonnées`, stationConfig.latitude.lastReadValue, stationConfig.longitude.lastReadValue);

    const davisTimeZoneIndex = findDavisTimeZoneIndex(ianaTimeZone);
    const davisTimeZoneIndexHex = davisTimeZoneIndex.toString(16).padStart(2, '0').toUpperCase();
    stationConfig.timezone.method = 'GPS';
    stationConfig.timezone.value = ianaTimeZone;
    stationConfig.timezone.desired = davisTimeZoneIndex;

    const VP2DateTime = await getVp2DateTime(req, stationConfig);

    if (stationConfig.deltaTimeSeconds <= 5) {
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

    await sendCommand(req, stationConfig, 'SETTIME', 1000, "<ACK>");
    await sendCommand(req, stationConfig, setTimePayload, 2000, "<ACK>");

    console.log(`${V.eu} Configuration du fuseau horaire sur index ${davisTimeZoneIndex} (${ianaTimeZone}) en hex: ${davisTimeZoneIndexHex}`);
    await sendCommand(req, stationConfig, `EEWR 11 ${davisTimeZoneIndexHex}`, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(req, stationConfig, `EEWR 16 00`, 2000, "<LF><CR>OK<LF><CR>");
    await sendCommand(req, stationConfig, 'NEWSETUP', 2000, "<ACK>");
    
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

// Mapping des adresses EEPROM selon la documentation
const EEPROM_SETTINGS_MAP = {
    barGain:           { address: 0x01, length: 2, type: 'uint16', description: 'Factory barometer calibration - DO NOT MODIFY' },
    barOffset:         { address: 0x03, length: 2, type: 'uint16', description: 'Factory barometer calibration - DO NOT MODIFY' },
    barCal:            { address: 0x05, length: 2, type: 'uint16', description: 'Barometer Offset calibration' },
    hum33:             { address: 0x07, length: 2, type: 'uint16', description: 'Factory humidity calibration - DO NOT MODIFY' },
    hum80:             { address: 0x09, length: 2, type: 'uint16', description: 'Factory humidity calibration - DO NOT MODIFY' },
    latitude:          { address: 0x0B, length: 2, type: 'int16', description: 'Station Latitude in tenths of degree' },
    longitude:         { address: 0x0D, length: 2, type: 'int16', description: 'Station Longitude in tenths of degree' },
    altitude:          { address: 0x0F, length: 2, type: 'uint16', description: 'Station elevation in feet' },
    timezone:          { address: 0x11, length: 1, type: 'uint8', description: 'Time zone string number' },
    gmtOffset:         { address: 0x14, length: 2, type: 'int16', description: 'GMT offset in hundredths of hours' },
    gmtOrZone:         { address: 0x16, length: 1, type: 'uint8', description: '1=use GMT_OFFSET, 0=use TIME_ZONE' },
    unitBits:          { address: 0x29, length: 1, type: 'uint8', description: 'Unit configuration bits' },
    unitBitsComp:      { address: 0x2A, length: 1, type: 'uint8', description: '1s complement of UNIT_BITS' },
    setupBits:         { address: 0x2B, length: 1, type: 'uint8', description: 'Setup configuration bits' },
    rainSaisonStart:   { address: 0x2C, length: 1, type: 'uint8', description: 'Month for yearly rain reset' },
    archiveInterval:   { address: 0x2D, length: 1, type: 'uint8', description: 'Archive period in minutes' }
};

function parseEEPROMSettingsData(buffer) {
    const settings = {};
    
    const readValue = (address, length, type) => {
        const offset = address - 0x01;
        
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
    
    for (const [key, config] of Object.entries(EEPROM_SETTINGS_MAP)) {
        try {
            const rawValue = readValue(config.address, config.length, config.type);
            
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
                    settings.setupBits = {
                        raw: rawValue,
                        AMPMMode: (rawValue & 0x01) === 0 ? 0 : 1,
                        isAMPMMode: (rawValue & 0x02) === 0 ? 0 : 1,
                        dateFormat: (rawValue & 0x04) === 0 ? 0 : 1,
                        windCupSize: (rawValue & 0x08) === 0 ? 0 : 1,
                        rainCollectorSize: (rawValue & 0x30) >> 4,
                        latitudeNorthSouth: (rawValue & 0x40) === 0 ? 0 : 1,
                        longitudeEastWest: (rawValue & 0x80) === 0 ? 0 : 1,
                        description: config.description
                    };
                    break;
                    
                case 'unitBits':
                    settings.unitBits = {
                        raw: rawValue,
                        barometerUnit: rawValue & 0x03,
                        temperatureUnit: (rawValue & 0x0C) >> 2,
                        elevationUnit: (rawValue & 0x10) >> 4,
                        rainUnit: (rawValue & 0x20) >> 5,
                        windUnit: (rawValue & 0xC0) >> 6,
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

function identifyRequiredChanges(currentSettings, stationConfig) {
    const changes = [];
    
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
    
    if (stationConfig.altitude?.desired !== undefined) {
        const currentAltMeters = currentSettings.altitude?.meters || 0;
        const desiredAltFeet = Math.round(stationConfig.altitude.desired * 3.28084);
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
                useSetPer: true
            });
        }
    }
    
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
    
    if (currentSettings.setupBits) {
        let newSetupBits = currentSettings.setupBits.raw;
        let setupChanged = false;
        
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
                        newSetupBits = (newSetupBits & ~check.mask) | ((desiredBitValue << check.shift) & check.mask);
                    } else {
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

async function syncStationSettings(req, stationConfig) {
    const stationId = stationConfig.id;
    let changesMade = false;
    
    try {
        console.log(`${V.gear} Synchronisation des paramètres pour la station ${stationId}`);
        
        console.log(`${V.read} Lecture globale EEPROM depuis 0x01 (46 bytes)`);
        const eepromData = await sendCommand(req, stationConfig, 'EEBRD 01 2E', 2000, '<ACK>46<CRC>');
        
        const currentSettings = parseEEPROMSettingsData(eepromData);
        console.log(`${V.eye} Paramètres actuels lus avec succès`);
        
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
            stationConfig.dateFormat.lastReadValue = currentSettings.setupBits.dateFormat;
            stationConfig.windCupSize.lastReadValue = currentSettings.setupBits.windCupSize;
            stationConfig.rainCollectorSize.lastReadValue = currentSettings.setupBits.rainCollectorSize;
            stationConfig.latitudeNorthSouth.lastReadValue = currentSettings.setupBits.latitudeNorthSouth;
            stationConfig.longitudeEastWest.lastReadValue = currentSettings.setupBits.longitudeEastWest;
        }
        
        const requiredChanges = identifyRequiredChanges(currentSettings, stationConfig);
        // console.log(V.Warn, requiredChanges, requiredChanges.length);
        if (requiredChanges.length === 0) {
            console.log(`${V.Check} Aucun changement nécessaire pour ${stationId}`);
            return {
                status: 'unchanged',
                message: `Tous les paramètres sont déjà synchronisés pour la station ${stationId}`,
                changes: false
            };
        }
        
        console.log(`${V.write} ${requiredChanges.length} changement(s) nécessaire(s)`);
        
        for (const change of requiredChanges) {
            console.log(`${V.gear} ${change.description}`);
            
            if (change.useSetPer) {
                const validIntervals = [1, 5, 10, 15, 30, 60, 120];
                if (validIntervals.includes(change.desiredValue)) {
                    await sendCommand(req, stationConfig, `SETPER ${change.desiredValue}`, 2000, "<LF><CR>");
                    await sendCommand(req, stationConfig, 'START', 2000, "<LF><CR>OK<LF><CR>");
                } else {
                    await sendCommand(req, stationConfig, 'STOP', 2000, "<LF><CR>OK<LF><CR>");
                    console.log(`${V.error} Intervalle d'archive invalide pour ${stationId}: ${change.desiredValue}, ARRET d'Archivage !`);
                }
            } else if (change.length === 1) {
                await sendCommand(req, stationConfig, `EEWR ${change.address.toString(16).padStart(2, '0').toUpperCase()} ${change.desiredValue.toString(16).padStart(2, '0').toUpperCase()}`, 2000, "<LF><CR>OK<LF><CR>");
            } else if (change.length === 2) {
                const lowByte = change.desiredValue & 0xFF;
                const highByte = (change.desiredValue >> 8) & 0xFF;
                await sendCommand(req, stationConfig, `EEWR ${change.address.toString(16).padStart(2, '0').toUpperCase()} ${lowByte.toString(16).padStart(2, '0').toUpperCase()}`, 2000, "<LF><CR>OK<LF><CR>");
                await sendCommand(req, stationConfig, `EEWR ${(change.address + 1).toString(16).padStart(2, '0').toUpperCase()} ${highByte.toString(16).padStart(2, '0').toUpperCase()}`, 2000, "<LF><CR>OK<LF><CR>");
            }
            
            changesMade = true;
        }
        
        if (changesMade) {
            console.log(`${V.memory} Application des changements avec NEWSETUP...`);
            await sendCommand(req, stationConfig, 'NEWSETUP', 2000, "<ACK>");
            // updateStationTime(req, stationConfig);
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

async function updateArchiveConfiguration(req, stationConfig) {
    if (stationConfig.archiveRecordsEnable.desired != stationConfig.archiveRecordsEnable.lastReadValue){
        console.log(`[Station Service] Activation de la création des enregistrements d'archive pour ${stationConfig.id}...`);
        try {
            await sendCommand(req, stationConfig, 'START', 2000, "<LF><CR>OK<LF><CR>");
        } catch (error) {
            console.error(`[Station Service] Erreur lors de l'activation des enregistrements d'archive: ${error.message}`);
            throw new Error(`Échec de l'activation des enregistrements d'archive: ${error.message}`);
        }
    }
    const validIntervals = [1, 5, 10, 15, 30, 60, 120];
    if (stationConfig.archiveInterval.desired != stationConfig.archiveInterval.lastReadValue && validIntervals.includes(stationConfig.archiveInterval.desired)){
        console.log(`[Station Service] Définition de l'intervalle d'archive à ${stationConfig.archiveInterval.desired} minutes pour ${stationConfig.id}...`);
        try {
            await sendCommand(req, stationConfig, `SETPER ${stationConfig.archiveInterval.desired}`, 2000, "<LF><CR>");
        } catch (error) {
            console.error(`[Station Service] Erreur lors de la définition de l'intervalle d'archive: ${error.message}`);
            throw new Error(`Échec de la définition de l'intervalle d'archive: ${error.message}`);
        }
    }
    configManager.updateStationConfig(stationConfig);
    return { status: 'success', message: `Configuration de l'archive mise à jour avec succès pour ${stationConfig.id}.` };
}

async function getCurrentWeatherData(req, stationConfig) {
    const loop1Bytes = await sendCommand(req, stationConfig, 'LPS 1 1', 1200, "<ACK>97<CRC>"); // 800ms

    const loop1Data = parseLOOP1Data(loop1Bytes);


    const loop2Bytes = await sendCommand(req, stationConfig, 'LPS 2 1', 1200, "<ACK>97<CRC>"); // 800ms

    const loop2Data = parseLOOP2Data(loop2Bytes);


    const aggregatedData = { ...loop1Data, ...loop2Data };
    const processedData = processWeatherData(aggregatedData, stationConfig, 'metric');
    return processedData;
}

async function getStationInfo(req, stationConfig) {
    try {
        console.log(`${V.info} Récupération des informations de la station ${stationConfig.id}`);
        
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

async function writeArchiveToInfluxDB(processedData, datetime, stationId) {
    const points = [];
    delete processedData.date;
    delete processedData.time;
    let Ux = 0;
    let Vy = 0;
    if (typeof processedData.windSpeedMax?.Value === 'number' && typeof processedData.windDirMax?.Value === 'number'){
        Ux = Math.round(processedData.windSpeedMax.Value * Math.sin(Math.PI * processedData.windDirMax.Value / 180.0)*1000)/1000
        Vy = Math.round(processedData.windSpeedMax.Value * Math.cos(Math.PI * processedData.windDirMax.Value / 180.0)*1000)/1000
    }
    // console.log(Ux,Vy);
    const vGust = new Point('vector')
            .tag('station_id', stationId)
            .floatField('Ux', Ux)
            .floatField('Vy', Vy)
            .tag('unit', '->')
            .tag('sensor', 'Gust')
            .timestamp(datetime);
        points.push(vGust);
    Ux = 0;
    Vy = 0;
    // console.log(processedData.windSpeed.Value, typeof processedData.windSpeed.Value, processedData.windDir.Value, typeof processedData.windDir.Value );
    if (typeof processedData.windSpeed?.Value === 'number' && typeof processedData.windDir?.Value === 'number'){
        Ux = Math.round(processedData.windSpeed.Value * Math.sin(Math.PI * processedData.windDir.Value / 180.0)*1000)/1000
        Vy = Math.round(processedData.windSpeed.Value * Math.cos(Math.PI * processedData.windDir.Value / 180.0)*1000)/1000
    }
    // console.log(Ux,Vy);

    const vWind = new Point('vector')
            .tag('station_id', stationId)
            .floatField('Ux', Ux)
            .floatField('Vy', Vy)
            .tag('unit', '->')
            .tag('sensor', 'Wind')
            .timestamp(datetime);
        points.push(vWind);
    
    
    for (const [key, data] of Object.entries(processedData)) {
        if (typeof data.Value !== 'number') { continue; }
        let tag;
        if (key === 'windDirMax' || key === 'windSpeedMax') {
            tag = 'Gust';
        } else if (key === 'windDir' || key === 'windSpeed') {
            tag = 'Wind';
        } else {tag = key;}
        const point = new Point(sensorTypeMap[key])
            .tag('station_id', stationId)
            .floatField('value', data.Value)
            .tag('unit', data.Unit)
            .tag('sensor', tag)
            .timestamp(datetime);
        points.push(point);
    };

    if (points.length > 0) {
        // console.log(`${V.thermometer} :`, points);
        return await writePoints(points);
    }

    return true;
}

async function downloadArchiveData(req, stationConfig, startDate, res) {
    let effectiveStartDate;

    if (startDate) { // 02/10/2025 22:05:00
        effectiveStartDate = new Date(startDate);
    } else {
        effectiveStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    console.log(V.StartFlag, 'date UTC de la derniere archive :', effectiveStartDate)
    await sendCommand(req, stationConfig, 'DMPAFT', 2000, "<ACK>");

    const year = effectiveStartDate.getFullYear();
    const month = effectiveStartDate.getMonth() + 1;
    const day = effectiveStartDate.getDate();
    const hours = effectiveStartDate.getHours();
    const minutes = effectiveStartDate.getMinutes();
console.log(O.RED, 'year =',year, 'month =', month, 'day =',day, 'hours =', hours, 'minutes =', minutes);
    const dateStamp = (year - 2000) * 512 + month * 32 + day;
    const timeStamp = (hours) * 100 + minutes; // -1 pour test
console.log(O.RED, dateStamp, timeStamp);
    const datePayload = Buffer.from([ dateStamp & 0xFF, dateStamp >> 8, timeStamp & 0xFF, timeStamp >> 8]);
    
    const dateCrc = calculateCRC(datePayload);
    const dateCrcBytes = Buffer.from([dateCrc >> 8, dateCrc & 0xFF]);
    const fullPayload = Buffer.concat([datePayload, dateCrcBytes]);
    
console.log(O.RED, dateStamp, timeStamp, datePayload, dateCrcBytes, fullPayload, fullPayload.toString('hex'), fullPayload.toString('binary')); // 13123 2100 <Buffer 43 33 34 08> 8684
    // on envoit la date de la 1er archive souhaitée
    const pageInfo = await sendCommand(req, stationConfig, fullPayload, 3000, "<ACK>4<CRC>");
    const numberOfPages = pageInfo.readUInt16LE(0);
    let firstReccord = pageInfo.readUInt8(2);
    
    // const sendProgress = (page, total) => {
    //     if (total > 1) {
    //         const out = {
    //             status: 'in progress',
    //             processedPages: page,
    //             totalPages: total,
    //         }
    //     }
    // };
    // sendProgress(0, numberOfPages);
    const allRecords = {};

    // on se limite a 50 archives a la fois pour laisser la station aquerir les nouvelles données
    for (let i = 0; i < numberOfPages && i < 50; i++) {

        // on envoit l'ACK, demande de la suivante
        const pageData = await sendCommand(req, stationConfig, ACK, 2000, "265<CRC>");
        const pageNumber = pageData.readUInt8(0);
        const pageDataOnly = pageData.slice(1, pageData.length-4);
        
        for (let j = firstReccord; j < 5; j++) {
            const recordBuffer = pageDataOnly.slice(j * 52, (j + 1) * 52);
            if (recordBuffer.length === 52) {
                const parsedRecord = parseDMPRecord(recordBuffer);
                const processedData = processWeatherData(parsedRecord, stationConfig, 'metric');
                const nativedate = convertRawValue2NativeValue( parsedRecord.date.value, 'date_YYMMdd', null);
                const nativetime = convertRawValue2NativeValue( parsedRecord.time.value, 'time', null);
                const datetime = conversionTable.date['yyyy-mm-dd'](nativedate) + ' ' + conversionTable.time['hh:mm'](nativetime);
                if ( (new Date(datetime)) > effectiveStartDate) {
                    allRecords[datetime] = processedData;
                    const WriteToDB = await writeArchiveToInfluxDB(processedData, new Date(datetime), stationConfig.id);
                    if (WriteToDB){
                        console.log(`${V.package} Pages ${pageNumber+1}.${j+1}/${numberOfPages} Archives / Write ${WriteToDB} points influxDb for [${datetime}] ✅`);
                        stationConfig.lastArchiveDate = datetime;
                        // configManager.autoSaveConfig(stationConfig);
                    } else {
                        console.warn(`${V.package} Pages ${pageNumber+1}.${j+1}/${numberOfPages} Archives / Error writing points influxDb for [${datetime}] ${V.error}`);
                    }
                } else {
                    console.warn(`${V.Gyro} ${pageNumber+1}[${j+1}]/${numberOfPages}: ${datetime} <= ${stationConfig.lastArchiveDate}`);
                }
            }
        }
        firstReccord = 0;
        // sendProgress(i+1, numberOfPages);
    }
    await sendCommand(req, stationConfig, ESC_LF, 1200, "2");
    if (!numberOfPages){
        console.log(V.Warn, `Aucune archive supplementaire pour le moment.`);
        return { status: 'success', message: 'Aucune archive supplementaire pour le moment.' };
    }
    return { status: 'success', message: `${Object.keys(allRecords).length} pages sur ${numberOfPages} archive téléchargées.`, data: allRecords };
}


module.exports = {
    getVp2DateTime,
    updateStationTime,
    syncStationSettings,
    updateArchiveConfiguration,
    getCurrentWeatherData,
    getStationInfo,
    writeArchiveToInfluxDB,
    downloadArchiveData
};