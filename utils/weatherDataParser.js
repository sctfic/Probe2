// utils/weatherDataParser.js

function mapDegreesToCardinal(degrees) {
    if (degrees === 0 || degrees > 360) return "N/A";
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(degrees / 22.5);
    return directions[index % 16];
}

function readSignedInt16LE(buffer, offset) {
    let val = buffer.readUInt16LE(offset);
    val = (val > 0x7FFF ? val - 0x10000 : val);
    return val === -32768 ? NaN : val;
}

function readInt8(buffer, offset) {
    const val = buffer.readInt8(offset);
    return val === -128 ? NaN : val;
}

function readUInt16LE(buffer, offset) {
    const val = buffer.readUInt16LE(offset);
    return val === 65535 ? NaN : val;
}

function readUInt8(buffer, offset) {
    const val = buffer.readUInt8(offset);
    return val === 255 ? NaN : val;
}

function parseLOOP1Data(data) {
    const weatherData = {};
    weatherData.barometer = { value: readUInt16LE(data, 7), native_unit: "inHg_1000th" };
    weatherData.inTemp = { value: readSignedInt16LE(data, 9), native_unit: "F_tenths" };
    weatherData.inHumidity = { value: readUInt8(data, 11), native_unit: "percent" };
    weatherData.outTemp = { value: readSignedInt16LE(data, 12), native_unit: "F_tenths" };
    weatherData.windSpeed = { value: readUInt8(data, 14), native_unit: "mph_whole" };
    weatherData.avgWindSpeed10Min = { value: readUInt8(data, 15), native_unit: "mph_whole" };
    weatherData.windDir = { value: readUInt16LE(data, 16), native_unit: "degrees" };
    weatherData.outHumidity = { value: readUInt8(data, 33), native_unit: "percent" };
    weatherData.rainRate = { value: readUInt16LE(data, 41), native_unit: "clicks*cup_size" };
    weatherData.uvIndex = { value: readUInt8(data, 43), native_unit: "uv_index" };
    weatherData.solarRadiation = { value: readUInt16LE(data, 44), native_unit: "w/m²" };
    // weatherData.stormRain = { value: readUInt16LE(data, 46), native_unit: "in_100th" };
    weatherData.dayRain = { value: readUInt16LE(data, 50), native_unit: "clicks*cup_size" };
    weatherData.monthRain = { value: readUInt16LE(data, 52), native_unit: "clicks*cup_size" };
    weatherData.yearRain = { value: readUInt16LE(data, 54), native_unit: "clicks*cup_size" };
    weatherData.dayET = { value: readUInt16LE(data, 56), native_unit: "in_1000th" };
    weatherData.monthET = { value: readUInt16LE(data, 58), native_unit: "in_100th" };
    weatherData.yearET = { value: readUInt16LE(data, 60), native_unit: "in_100th" };
    weatherData.batteryVoltage = { value: readUInt16LE(data, 87), native_unit: "((DataRaw * 3)/512) V" };
    weatherData.ForecastIcon = { value: readUInt8(data, 89), native_unit: "ForecastNum" };
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
    weatherData.uvIndex = { value: readUInt8(data, 43), native_unit: "uv_index" };
    weatherData.solarRadiation = { value: readUInt16LE(data, 44), native_unit: "w/m²" };
    weatherData.stormRain = { value: readUInt16LE(data, 46), native_unit: "clicks*cup_size" };
    weatherData.dateStormRain = { value: readUInt16LE(data, 48), native_unit: "date" };
    weatherData.dayRain = { value: readUInt16LE(data, 50), native_unit: "clicks*cup_size" };
    weatherData.last15MinRain = { value: readUInt16LE(data, 52), native_unit: "clicks*cup_size" };
    weatherData.lastHourRain = { value: readUInt16LE(data, 54), native_unit: "clicks*cup_size" };
    weatherData.dayET = { value: readUInt16LE(data, 56), native_unit: "in_1000th" };
    weatherData.last24HourRain = { value: readUInt16LE(data, 58), native_unit: "clicks*cup_size" };
    return weatherData;
}

function parseDMPRecord(recordBuffer) {
    const record = {};
    record.date = { value: readUInt16LE(recordBuffer, 0), native_unit: "date"}
    record.time = { value: readUInt16LE(recordBuffer, 2), native_unit: "time" };
    record.outTemp = { value: readSignedInt16LE(recordBuffer, 4), native_unit: "F_tenths" };
    record.rainFlow = { value: readUInt16LE(recordBuffer, 10), native_unit: "clicks*cup_size" };
    record.barometer = { value: readUInt16LE(recordBuffer, 14), native_unit: "inHg_1000th" };
    record.powerRadiation = { value: readUInt16LE(recordBuffer, 16), native_unit: "w/m²" };
    record.inTemp = { value: readSignedInt16LE(recordBuffer, 20), native_unit: "F_tenths" };
    record.inHumidity = { value: readUInt8(recordBuffer, 22), native_unit: "percent" };
    record.outHumidity = { value: readUInt8(recordBuffer, 23), native_unit: "percent" };
    record.windSpeed = { value: readUInt8(recordBuffer, 25), native_unit: "mph_whole" };
    record.windDir = { value: readUInt8(recordBuffer, 27), native_unit: "degrees" };
    record.uvIndex = { value: readUInt8(recordBuffer, 28), native_unit: "uv_index" };
    record.ET = { value: readUInt8(recordBuffer, 29), native_unit: "in_100th" };
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
        case 'F_tenths': return rawValue / 10;
        case 'F_whole': return rawValue;
        case 'F_-90': return rawValue - 90;
        case 'inHg_1000th': return rawValue / 1000;
        case 'in_100th': return rawValue / 100;
        case 'in_1000th': return rawValue / 1000;
        case 'clicks*cup_size': // doit etre en mm
            // stationConfig.rainCollectorSize.value peut avoir 3 valeurs : "1-0.2mm", "2-0.1mm", "0-0.01mm"
            const cup = stationConfig.rainCollectorSize.value.split('-')[0]*1;
            switch (cup) {
                case 0: return Math.round(rawValue * 0.254 * 1000)/1000;
                case 1: return Math.round(rawValue * 0.2 * 100)/100;
                case 2: return Math.round(rawValue * 0.1 * 10)/10;
                default: return rawValue;
            }
        case 'mph_tenths': return rawValue / 10;
        case '((DataRaw * 3)/512) V': return Math.round((rawValue * 3) / 512 * 1000) / 1000;
        case 'time':
            const hours = Math.floor(rawValue / 100).toString().padStart(2, '0');
            const minutes = (rawValue % 100).toString().padStart(2, '0');
            // console.warn(`raw: ${rawValue}, hours: ${hours}, minutes: ${minutes}`);
            return `${hours}:${minutes}`;
        case 'date':
            // Bit 15 to bit 12 is the month, bit 11 to bit 7 is the day and bit 6 to bit 0 is the year offseted by 2000.
            const year = (Math.floor(rawValue / 512)).toString().padStart(2, '0'); // Bit 15 to bit 12
            const month = Math.floor(rawValue / 32 & 0x0F).toString().padStart(2, '0'); // Bit 11 to bit 7
            const day = (rawValue % 32).toString().padStart(2, '0'); // Bit 6 to bit 0
            // console.warn(`raw: ${rawValue}, year: 20${year}, month: ${month}, day: ${day}`);
            return `20${year}/${month}/${day}`;
        default:
            return rawValue;
    }
}

const sensorTypeMap = {
    // designation du capteur : type de données a convertir
    barometer: 'pressure',
    inTemp: 'temperature',
    inHumidity: 'humidity',
    outTemp: 'temperature',
    windSpeed: 'speed',
    avgWindSpeed10Min: 'speed',
    windDir: 'direction',
    outHumidity: 'humidity',
    rainRate: 'rainRate',
    uvIndex: 'uv',
    solarRadiation: 'powerRadiation',
    stormRain: 'rain',
    dateStormRain: 'date',
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
    ForecastIcon: 'Forecast',
    sunrise: 'time',
    sunset: 'time',
    date: 'date',
    time: 'time'
};

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
        'mm': (mm) => mm,
        'in': (mm) => mm/25.4,
        'l/m²': (mm) => mm
    },
    rainRate: {
        'mm/h': (in_h) => in_h * 25.4,
        'in/h': (in_h) => in_h,
        'l/m²/h': (in_h) => in_h * 25.4
    },
    uv: {
        'index': (uv) => uv ,
        'min': (uv) => 180/(uv*uv)
    },
    powerRadiation: {
        'w/m²': (w) => w
    },
    humidity: {
        '%': (h) => h
    },
    battery: {
        'V': (v) => v ,
        '%': (v) => v > 4.7 ? 'BATTERY MISSING' : (v/4.56)*100 // 3*1.52v = 4.56v = 100% et 3*1.05 v = 3.15v = 0% et si > 4.7v = -1 for BATTERY MISSING !
    },
    Forecast: {
        // d'apres les valeur dans la documentation Docs/VantageSerialProtocolDocs_v261.pdf page 23
        // 8 = Sun
        // 6 = Partial Sun + Cloud
        // 2 = Cloud
        // 3 = Cloud + Rain
        // 18 = Cloud + Snow
        // 19 = Cloud + Rain + Snow
        // 7 = Partial Sun + Cloud + Rain
        // 22 = Partial Sun + Cloud + Snow
        // 23 = Partial Sun + Cloud + Rain + Snow
        'ForecastNum': (f) => f,
        'ForecastClass': (f) => {
            switch (f) {
                case 8: return 'Sun';
                case 6: return 'PartialSun Cloud';
                case 2: return 'Cloud';
                case 3: return 'Cloud Rain';
                case 18: return 'Cloud Snow';
                case 19: return 'Cloud Rain Snow';
                case 7: return 'Partial Sun Cloud Rain';
                case 22: return 'Partial Sun Cloud Snow';
                case 23: return 'Partial Sun Cloud Rain Snow';
                default: return 'Unknown';
            }
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

const metricUnits = {
    temperature: 'K',
    speed: 'm/s',
    direction: '°',
    pressure: 'hpa',
    rain: 'mm',
    rainRate: 'mm/h',
    uv: 'index',
    powerRadiation: 'w/m²',
    humidity: '%',
    battery: 'V',
    Forecast: 'ForecastClass',
    date: 'iso8601',
    time: 'iso8601'
};

function convertToMetric(nativeValue, key) {
    const type = sensorTypeMap[key];
    if (!type){
        console.error(`No type found for ${key}`);
        return nativeValue;
    }
    const targetUnit = metricUnits[type];
    if (!targetUnit){
        console.error(`No target unit found for ${type}`);
        return nativeValue;
    }
    const convertFn = conversionTable[type]?.[targetUnit];
    if (!convertFn){
        console.error(`No conversion function found for ${type} to ${targetUnit}`);
        return nativeValue;
    }
    console.log(`Converting ${nativeValue} to ${targetUnit}`);
    // on affiche la fonction de conversion
    console.log(`Conversion function: ${convertFn}`);

    const convertedValue = convertFn(nativeValue);
    if (typeof convertedValue === 'string')
        return convertedValue;
    else if (Math.abs(convertedValue) < 1) // si la valeur absolue est inferieur a 1, on arrondit a 4 chiffres apres la virgule
        return Number(convertedValue.toFixed(4));
    else if (Math.abs(convertedValue) < 10)
        return Number(convertedValue.toFixed(3));
    else if (Math.abs(convertedValue) < 100)
        return Number(convertedValue.toFixed(2));
    else if (Math.abs(convertedValue) < 1000)
        return Number(convertedValue.toFixed(1));
    else
        return Number(convertedValue.toFixed(0));
}

function convertToUser(nativeValue, key, userUnitsConfig) {
    const type = sensorTypeMap[key];
    if (!type) return nativeValue;
    const userUnit = userUnitsConfig[type]?.unit;
    if (!userUnit) {
        console.error(`No user unit found for ${type}`);
        return nativeValue;
    }
    const convertFn = conversionTable[type]?.[userUnit];
    if (!convertFn) {
        console.error(`No conversion function found for ${type} to ${userUnit}`);
        return nativeValue;
    }

    const convertedValue = convertFn(nativeValue);
    if (typeof convertedValue === 'string')
        return convertedValue;
    else if (Math.abs(convertedValue) < 1) // si la valeur absolue est inferieur a 1, on arrondit a 4 chiffres apres la virgule
        return Number(convertedValue.toFixed(4));
    else if (Math.abs(convertedValue) < 10)
        return Number(convertedValue.toFixed(3));
    else if (Math.abs(convertedValue) < 100)
        return Number(convertedValue.toFixed(2));
    else if (Math.abs(convertedValue) < 1000)
        return Number(convertedValue.toFixed(1));
    else
        return Number(convertedValue.toFixed(0));
}

function processWeatherData(weatherData, stationConfig, userUnitsConfig) {
    const processed = {};
    for (const [key, data] of Object.entries(weatherData)) {
        if (!isNaN(data.value)) {
            const nativeValue = convertRawValue2NativeValue(data.value, data.native_unit, stationConfig);
            const nativeUnit = data.native_unit;
            if (userUnitsConfig){
                processed['datagramme'] = {Type:"User units", message:"Success"};
                processed[key] = { Value: convertToUser(nativeValue, key, userUnitsConfig), Unit: userUnitsConfig[sensorTypeMap[key]]?.unit || nativeUnit };
            } else if (stationConfig) {
                processed['datagramme'] = {Type:"Metric units", message:"Units.json not found"};
                processed.metric[key] = { Value: convertToMetric(nativeValue, key), Unit: metricUnits[sensorTypeMap[key]] || nativeUnit };
            } else {
                processed['datagramme'] = {Type:"Native units", message:"Units.json & VP2.json not found"};
                processed[key] = { Value: nativeValue, Unit: nativeUnit };
            }
        }
    }
    return processed;
}

module.exports = {
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