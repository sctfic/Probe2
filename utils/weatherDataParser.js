// utils/weatherDataParser.js
const unitsProvider = require('../services/unitsProvider');

/**
 * Retrieves sensor type information from UnitsProvider.
 * If a sensorName is provided, it returns the full type object for that sensor.
 * If no sensorName is provided, it returns a map of all sensors to their type.
 * @param {string} [sensorName] - The name of the sensor to look for.
 * @returns {object | undefined} The type object or the sensor-to-type map.
 */
function getSensorType(sensorName) {
    const units = unitsProvider.getUnits();
    if (sensorName) {
        for (const type in units) {
            if (units[type].sensors?.includes(sensorName)) {
                return units[type];
            }
        }
        return undefined; // Not found
    } else {
        return unitsProvider.getSensorTypeMap();
    }
}

function mapDegreesToCardinal(degrees) {
    if (degrees > 337.5) return "N/A";
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(degrees / 22.5);
    return directions[index % 16];
}
function mapCardinalToDegrees(cardinal) {
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = directions.indexOf(cardinal);
    return index * 22.5;
}
const dir = {
    "N": { "angle": 0, "sinus": 0, "cosinus": 1 },
    "NNE": { "angle": 22.5, "sinus": 0.3826834323650898, "cosinus": 0.9238795325112867 },
    "NE": { "angle": 45, "sinus": 0.7071067811865475, "cosinus": 0.7071067811865476 },
    "ENE": { "angle": 67.5, "sinus": 0.9238795325112867, "cosinus": 0.38268343236508984 },
    "E": { "angle": 90, "sinus": 1, "cosinus": 0 },
    "ESE": { "angle": 112.5, "sinus": 0.9238795325112867, "cosinus": -0.3826834323650897 },
    "SE": { "angle": 135, "sinus": 0.7071067811865476, "cosinus": -0.7071067811865475 },
    "SSE": { "angle": 157.5, "sinus": 0.3826834323650899, "cosinus": -0.9238795325112867 },
    "S": { "angle": 180, "sinus": 0, "cosinus": -1 },
    "SSW": { "angle": 202.5, "sinus": -0.3826834323650892, "cosinus": -0.923879532511287 },
    "SW": { "angle": 225, "sinus": -0.7071067811865475, "cosinus": -0.7071067811865477 },
    "WSW": { "angle": 247.5, "sinus": -0.9238795325112868, "cosinus": -0.3826834323650895 },
    "W": { "angle": 270, "sinus": -1, "cosinus": 0 },
    "WNW": { "angle": 292.5, "sinus": -0.9238795325112866, "cosinus": 0.38268343236509 },
    "NW": { "angle": 315, "sinus": -0.7071067811865477, "cosinus": 0.7071067811865474 },
    "NNW": { "angle": 337.5, "sinus": -0.38268343236508956, "cosinus": 0.9238795325112868 }
};
// conversion des valeur binaire avec gestion des valeurs aberantes

function readSignedInt16LE(buffer, offset, badValue = -32768) {
    let val = buffer.readUInt16LE(offset);
    val = (val > 0x7FFF ? val - 0x10000 : val);
    return val === badValue ? NaN : val;
}

function readInt8(buffer, offset, badValue = -128) {
    const val = buffer.readInt8(offset);
    return val === badValue ? NaN : val;
}

function readUInt16LE(buffer, offset, badValue = 65535) {
    const val = buffer.readUInt16LE(offset);
    if (val === badValue) { console.error("Bad value", val, "at offset", offset); }
    return val === badValue ? NaN : val;
}

function readUInt8(buffer, offset, badValue = 255) {
    const val = buffer.readUInt8(offset);
    return val === badValue ? NaN : val;
}

function parseLOOP1Data(data) {
    const weatherData = {};
    // weatherData.barometer = { value: readUInt16LE(data, 7), native_unit: "inHg_1000th" };
    // weatherData.inTemp = { value: readSignedInt16LE(data, 9), native_unit: "F_tenths" };
    // weatherData.inHumidity = { value: readUInt8(data, 11), native_unit: "percent" };
    // weatherData.outTemp = { value: readSignedInt16LE(data, 12), native_unit: "F_tenths" };
    // weatherData.windSpeed = { value: readUInt8(data, 14), native_unit: "mph_whole" };
    // weatherData.avgWindSpeed10Min = { value: readUInt8(data, 15), native_unit: "mph_whole" };
    // weatherData.windDir = { value: readUInt16LE(data, 16), native_unit: "degrees" };
    // weatherData.outHumidity = { value: readUInt8(data, 33), native_unit: "percent" };
    // weatherData.rainRate = { value: readUInt16LE(data, 41), native_unit: "clicks*cup_size" };
    // weatherData.UV = { value: readUInt8(data, 43), native_unit: "uvIndex_tenths" };
    // weatherData.solar = { value: readUInt16LE(data, 44, 32767), native_unit: "w/m²" };
    // weatherData.stormRain = { value: readUInt16LE(data, 46), native_unit: "in_100th" };
    // weatherData.dayRain = { value: readUInt16LE(data, 50), native_unit: "clicks*cup_size" };
    weatherData.monthRain = { value: readUInt16LE(data, 52), native_unit: "clicks*cup_size" };
    weatherData.yearRain = { value: readUInt16LE(data, 54), native_unit: "clicks*cup_size" };
    // weatherData.dayET = { value: readUInt16LE(data, 56), native_unit: "in_1000th" };
    weatherData.monthET = { value: readUInt16LE(data, 58), native_unit: "in_100th" };
    weatherData.yearET = { value: readUInt16LE(data, 60), native_unit: "in_100th" };
    weatherData.battery = { value: readUInt16LE(data, 87), native_unit: "((DataRaw * 3)/512) V" };
    weatherData.ForecastNum = { value: readUInt8(data, 89), native_unit: "ForecastNum" };
    weatherData.sunrise = { value: readUInt16LE(data, 91), native_unit: "time" };
    weatherData.sunset = { value: readUInt16LE(data, 93), native_unit: "time" };
    return weatherData;
}

function parseLOOP2Data(data) {
    const weatherData = {};
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
    weatherData.UV = { value: readUInt8(data, 43), native_unit: "uvIndex_tenths" };
    weatherData.solar = { value: readUInt16LE(data, 44, 32767), native_unit: "w/m²" };
    weatherData.stormRain = { value: readUInt16LE(data, 46), native_unit: "clicks*cup_size" };
    weatherData.dateStormRain = { value: readUInt16LE(data, 48), native_unit: "date_MMddYY" };
    weatherData.dayRain = { value: readUInt16LE(data, 50), native_unit: "clicks*cup_size" };
    weatherData.last15MinRain = { value: readUInt16LE(data, 52), native_unit: "clicks*cup_size" };
    weatherData.lastHourRain = { value: readUInt16LE(data, 54), native_unit: "clicks*cup_size" };
    weatherData.dayET = { value: readUInt16LE(data, 56), native_unit: "in_1000th" };
    weatherData.last24HourRain = { value: readUInt16LE(data, 58), native_unit: "clicks*cup_size" };
    return weatherData;
}

function parseDMPRecord(recordBuffer) {
    const record = {};
    record.date = { value: readUInt16LE(recordBuffer, 0), native_unit: "date_YYMMdd" }
    record.time = { value: readUInt16LE(recordBuffer, 2), native_unit: "time" };
    record.inTemp = { value: readSignedInt16LE(recordBuffer, 20, 32767), native_unit: "F_tenths" };
    record.outTemp = { value: readSignedInt16LE(recordBuffer, 4, 32767), native_unit: "F_tenths" };
    record.barometer = { value: readUInt16LE(recordBuffer, 14, 0), native_unit: "inHg_1000th" };
    record.inHumidity = { value: readUInt8(recordBuffer, 22), native_unit: "percent" };
    record.outHumidity = { value: readUInt8(recordBuffer, 23), native_unit: "percent" };
    record.ET = { value: readUInt8(recordBuffer, 29, 0), native_unit: "in_100th" };
    record.rainFall = { value: readUInt16LE(recordBuffer, 10), native_unit: "clicks*cup_size" };
    record.windSpeed = { value: readUInt8(recordBuffer, 24), native_unit: "mph_whole" };
    record.windSpeedMax = { value: readUInt8(recordBuffer, 25), native_unit: "mph_whole" };
    record.windDir = { value: readUInt8(recordBuffer, 26), native_unit: "cardinalInt" };
    record.windDirMax = { value: readUInt8(recordBuffer, 27), native_unit: "cardinalInt" };
    record.UV = { value: readUInt8(recordBuffer, 28), native_unit: "uvIndex_tenths" };
    record.UVMax = { value: readUInt8(recordBuffer, 32), native_unit: "uvIndex_tenths" };
    record.solar = { value: readUInt16LE(recordBuffer, 16, 32767), native_unit: "w/m²" };
    record.solarMax = { value: readUInt16LE(recordBuffer, 30, 32767), native_unit: "w/m²" };
    record.ForecastNum = { value: readUInt8(recordBuffer, 33, 193), native_unit: "ForecastNum" };
    record.leafTemp1 = { value: readUInt8(recordBuffer, 34), native_unit: "F_whole" };
    record.leafTemp2 = { value: readUInt8(recordBuffer, 35), native_unit: "F_whole" };
    record.leafWetness1 = { value: readUInt8(recordBuffer, 36), native_unit: "percent" };
    record.leafWetness2 = { value: readUInt8(recordBuffer, 37), native_unit: "percent" };
    record.soilTemp1 = { value: readUInt8(recordBuffer, 38), native_unit: "F_whole" };
    record.soilTemp2 = { value: readUInt8(recordBuffer, 39), native_unit: "F_whole" };
    record.soilTemp3 = { value: readUInt8(recordBuffer, 40), native_unit: "F_whole" };
    record.soilTemp4 = { value: readUInt8(recordBuffer, 41), native_unit: "F_whole" };
    record.extraHumidity1 = { value: readUInt8(recordBuffer, 43), native_unit: "percent" };
    record.extraHumidity2 = { value: readUInt8(recordBuffer, 44), native_unit: "percent" };
    record.extraTemp1 = { value: readUInt8(recordBuffer, 45), native_unit: "F_whole" };
    record.extraTemp2 = { value: readUInt8(recordBuffer, 46), native_unit: "F_whole" };
    record.extraTemp3 = { value: readUInt8(recordBuffer, 47), native_unit: "F_whole" };
    record.extraSoilMoisture1 = { value: readUInt8(recordBuffer, 48), native_unit: "percent" };
    record.extraSoilMoisture2 = { value: readUInt8(recordBuffer, 49), native_unit: "percent" };
    record.extraSoilMoisture3 = { value: readUInt8(recordBuffer, 50), native_unit: "percent" };
    record.extraSoilMoisture4 = { value: readUInt8(recordBuffer, 51), native_unit: "percent" };
    return record;
}

function convertRawValue2NativeValue(rawValue, nativeUnit, stationConfig) {
    switch (nativeUnit) {
        case 'uvIndex_tenths': return rawValue / 10;
        case 'F_tenths': return rawValue / 10;
        case 'F_whole': return rawValue;
        case 'F_-90': return rawValue - 90;
        case 'inHg_1000th': return rawValue / 1000;
        case 'in_100th': return rawValue / 100;
        case 'in_1000th': return rawValue / 1000;
        case 'clicks*cup_size':
            // stationConfig.rainCollectorSize.value peut avoir 3 valeurs : "1-0.2mm", "2-0.1mm", "0-0.01mm"
            const cup = stationConfig.rainCollectorSize.lastReadValue;
            switch (cup) {
                case 0: return Math.round(rawValue * 0.254 * 1000) / 1000;
                case 1: return Math.round(rawValue * 0.2 * 10) / 10;
                case 2: return Math.round(rawValue * 0.1 * 10) / 10;
                default: return rawValue;
            }
        case 'mph_tenths': return rawValue / 10;
        case '((DataRaw * 3)/512) V': return Math.round((rawValue * 3) / 512 * 1000) / 1000;
        case 'time':
            const hours = Math.floor(rawValue / 100).toString().padStart(2, '0');
            const minutes = (rawValue % 100).toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        case 'date_YYMMdd':
            const year = (Math.floor(rawValue / 512)).toString().padStart(2, '0');
            const month = Math.floor(rawValue / 32 & 0x0F).toString().padStart(2, '0');
            const day = (rawValue % 32).toString().padStart(2, '0');
            return `20${year}/${month}/${day}`;
        case 'date_MMddYY':
            // Bit 15 to bit 12 is the month, bit 11 to bit 7 is the day and bit 6 to bit 0 is the year offseted by 2000.
            const mm = ((rawValue >> 12) & 0x0F).toString().padStart(2, '0'); // Bit 15 to bit 12 (4 bits)
            const dd = ((rawValue >> 7) & 0x1F).toString().padStart(2, '0');  // Bit 11 to bit 7 (5 bits)
            const yy = (rawValue & 0x7F).toString().padStart(2, '0');         // Bit 6 to bit 0 (7 bits)
            return `20${yy}/${mm}/${dd}`;
        case 'cardinalInt':
            return 22.5 * rawValue;
        default:
            return rawValue;
    }
}

// sensorTypeMap will be retrieved dynamically from unitsProvider when needed

const conversionTable = {
    // type de données : unités de conversion
    // formule de conversion a partir des données natives
    temperature: {
        '°C': (f) => (f - 32) * 5 / 9,
        '°F': (f) => f,
        'K': (f) => (f - 32) * 5 / 9 + 273.15
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
        'mb': (inHg) => inHg * 33.8639,
        'Bar': (inHg) => inHg * 0.0338639
    },
    rain: {
        'in': (mm) => mm / 25.4,
        'mm': (mm) => mm,
        'l/m²': (mm) => mm
    },
    rainRate: {
        'in/h': (in_h) => in_h,
        'mm/h': (in_h) => in_h * 25.4,
        'l/m²/h': (in_h) => in_h * 25.4
    },
    uv: {
        'index': (uv) => uv,
        'min': (uv, dem = 24) => Number(Math.min(300, (6.5 * dem) / ((uv * Math.exp(uv / dem)))).toFixed(0))
        // temps d'exposition avant un coup de soleil = (DEM*6.5)/(UVIndex*exp(uvindex/DEM))
        // DEM (Dose Erythemale Minimal) = 32 mJ/cm² peau claire de Type 2, (type 6 = noire)
    },
    irradiance: {
        'w/m²': (w) => w
    },
    humidity: {
        '%': (h) => h
    },
    voltage: {
        'V': (v) => v,
        '%': (v) => v > 4.7 ? 'BATTERY MISSING' : (v / 4.56) * 100 // 3*1.52v = 4.56v = 100% et 3*1.05 v = 3.15v = 0% et si > 4.7v = -1 for BATTERY MISSING !
    },
    Forecast: {
        'ForecastNum': (f) => f,
        'ForecastClass': (f) => {// d'apres les valeur dans la documentation Docs/VantageSerialProtocolDocs_v261.pdf page 23
            const icons = [];
            if ((f & 1) !== 0) {
                icons.push("Rain");
            }
            if ((f & 2) !== 0) {
                icons.push("Cloud");
            }
            if ((f & 4) !== 0) {
                icons.push("Sun Cloud");
            }
            if ((f & 8) !== 0) {
                icons.push("Sun");
            }
            if ((f & 16) !== 0) {
                icons.push("Snow");
            }
            return icons.join(" ");
        }
    },
    date: { // format d'entré : yyyy/MM/dd
        'iso8601': (d) => `${d.slice(0, 4)}-${d.slice(5, 7)}-${d.slice(8, 10)}T`,
        'yyyy-mm-dd': (d) => `${d.slice(0, 4)}-${d.slice(5, 7)}-${d.slice(8, 10)}`,
        'yyyy/mm/dd': (d) => d,
        'dd/mm/yyyy': (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
    },
    time: { // format d'entré : hh:mm
        'iso8601': (t) => `${t.slice(0, 2)}:${t.slice(3, 5)}:00.000Z`,// on concatene les 2 premier caractere avec ':' puis les 2 dernier caractere et ':00.000Z'
        'hh:mm:ss': (t) => `${t.slice(0, 2)}:${t.slice(3, 5)}:00`,// on concatene les 2 premier caractere avec ':' puis les 2 dernier caractere et ':00'
        'hh:mm': (t) => t
    }
};

function convertToUnit(nativeValue, key, UnitsType = 'user') {
    const sensorTypeMap = unitsProvider.getSensorTypeMap();
    const type = sensorTypeMap[key];
    if (!type) {
        console.error(`No type found for ${key}`);
        return nativeValue;
    }
    const units = unitsProvider.getUnits();
    const unit = units[type]?.[UnitsType];
    if (!unit) {
        console.error(`No user unit found for ${type}`);
        return nativeValue;
    }
    // console.log(type,unit, nativeValue);
    const convertFn = conversionTable[type]?.[unit];
    if (!convertFn) {
        console.error(`No conversion function found for ${type} to ${unit}`);
        return nativeValue;
    }

    const convertedValue = convertFn(nativeValue);
    if (typeof convertedValue === 'string')
        return convertedValue;
    else if (Math.abs(convertedValue) < 1.2) // si la valeur absolue est inferieur a 1, on arrondit a 4 chiffres apres la virgule
        return Number(convertedValue.toFixed(4));
    else if (Math.abs(convertedValue) < 10)
        return Number(convertedValue.toFixed(3));
    else if (Math.abs(convertedValue) < 100)
        return Number(convertedValue.toFixed(2));
    else if (Math.abs(convertedValue) < 1200) // pour la pression
        return Number(convertedValue.toFixed(1));
    else
        return Number(convertedValue.toFixed(0));
}

function processWeatherData(weatherData, stationConfig, UnitsType = 'metric') {
    const processed = {};
    const units = unitsProvider.getUnits();
    const sensorTypeMap = unitsProvider.getSensorTypeMap();
    // console.warn('weatherData', weatherData.windDir, weatherData.windDirMax);
    for (const [key, data] of Object.entries(weatherData)) {
        if (!isNaN(data.value)) { // on illimine les capteurs sans valeur !
            const nativeValue = convertRawValue2NativeValue(data.value, data.native_unit, stationConfig);
            const userUnit = units[sensorTypeMap[key]]?.["user"];
            // console.log(nativeValue, userUnit, units[sensorTypeMap[key]]?.available_units);
            processed[key] = {
                Value: convertToUnit(nativeValue, key, UnitsType),
                Unit: units[sensorTypeMap[key]]?.[UnitsType] || data.native_unit,
                userUnit: userUnit,
                toUserUnit: units[sensorTypeMap[key]]?.available_units?.[userUnit]?.["fnFromMetric"]
            };
        }
    }
    // console.warn('weatherData', processed.windDir, processed.windDirMax);

    return processed;
}

module.exports = {
    getSensorType,
    get sensorTypeMap() { return unitsProvider.getSensorTypeMap(); },
    mapCardinalToDegrees,
    mapDegreesToCardinal,
    readSignedInt16LE,
    readInt8,
    readUInt16LE,
    readUInt8,
    parseLOOP1Data,
    parseLOOP2Data,
    parseDMPRecord,
    processWeatherData,
    convertRawValue2NativeValue,
    conversionTable // Ajout de conversionTable à l'export
};