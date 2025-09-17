// controllers/additionalController.js
const units = require('../config/Units.json');
const {V, O} = require('../utils/icons');
// const additionalProbe = require('../config/aditionnalProbe.json');

const Probes = { // toujours finir d'un '.calc'
    "SUN.calc": {
        "label": 'Phase du soleil',
        "Value": null,
        "Unit": "",
        "userUnit": "",
        "toUserUnit": "(data, lon=%longitude%, lat=%latitude% , alt=%altitude%) => { return SunCalc.getPosition(new Date(d), lat, lon); }",
        "dataNeeded": ["solarRadiation","UV","ET"],
        "js":["/js/sunCalc.js"], // https://suncalc.net/
        "comment": "calcul de la phase du soleil",
        "period": 60*60*24*7,
        sensorDb:'Calc',
        groupUsage:'Calculation',
        groupCustom: 1
    },
    "MOON.calc": {
        "label": 'Phase de la lune',
        "Value": null,
        "Unit": "",
        "userUnit": "",
        "toUserUnit": "(data, lon=%longitude%, lat=%latitude% , alt=%altitude%) => { return data.solarRadiation; }",
        "dataNeeded": ["solarRadiation"],
        "js":["/js/sunCalc.js"],
        "comment": "calcul de la phase de la lune",
        "period": 60*60*24*7,
        sensorDb:'Calc',
        groupUsage:'Calculation',
        groupCustom: 1
    },
    "THSW.calc": {
        "label": 'Température THSW',
        "Value": 0,
        "Unit": "K",
        "userUnit": "°C",
        "toUserUnit": "(data) => calcTHSW(data.outTemp, data.outHumidity, data.solarRadiation, data.windSpeed, data.UV, data.ET)",
        "dataNeeded": ["outTemp", "outHumidity", "speed:Wind", "solarRadiation", "ET"],
        "js":["/js/THSW.js"],
        "comment": "Température de Sensibilisation, Thermique, Humidité, Soleil et Vent",
        "period": 60*60*24*7,
        sensorDb:'Calc',
        groupUsage:'Calculation',
        groupCustom: 1
    },
    "AirWater.calc": {
        "label": 'masse d\'H2O dans l\'air',
        "Value": 0,
        "Unit": "g/m³",
        "userUnit": "l/m³",
        "toUserUnit": "(data) => waterInAir(data.outTemp, data.outHumidity, data.barometer).L_per_m3",
        "dataNeeded": ["outTemp", "outHumidity", "barometer"],
        "js":["/js/AirWater.js"],
        "comment": "masse d'eau par mettre cube d'air (ou g/l)",
        "period": 60*60*24*7,
        sensorDb:'Calc',
        groupUsage:'Calculation',
        groupCustom: 1
    }
};

async function getAdditionalProbe (req, res){
    const stationConfig = req.stationConfig;
    const sensors = req.params.sensors;
    const timeStamp = new Date().toISOString();
    let ProbeReduced = null;
    let sensorList = [];
    // si il y a une liste de sensors on garde seulement ces sensors dans Probes
    if (sensors) sensorList = sensors.split(',');
    ProbeReduced = Object.keys(Probes).reduce((acc, key) => {
        if (!sensors || sensorList.includes(key)) acc[key] = Probes[key];
        acc[key].toUserUnit = acc[key].toUserUnit.replace("%longitude%", req.stationConfig.longitude.lastReadValue)
            .replace("%latitude%", req.stationConfig.latitude.lastReadValue)
            .replace("%altitude%", req.stationConfig.altitude.lastReadValue);
        return acc;
    }, {});
    try {
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: timeStamp,
            data: ProbeReduced || Probes
        });
    } catch (error) {
        console.error(`${V.error} Erreur dans getCurrentWeather pour ${req.stationConfig?.id}:`, error);
        res.status(500).json({
            success: false,
            stationId: req.stationConfig?.id || 'unknown',
            error: error.message
        });
    }
}

module.exports = {
    getAdditionalProbe
};