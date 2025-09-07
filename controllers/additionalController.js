// controllers/additionalController.js
const units = require('../config/Units.json');
// const additionalProbe = require('../config/aditionnalProbe.json');

const Probes = { // toujours finir d'un '.calc'
    "SUN.calc": {
        "label": 'Phase du soleil',
        "Value": null,
        "Unit": "",
        "userUnit": "",
        "toUserUnit": "",
        "fn": "(d,lon,lat) => { return SunCalc.getPosition(new Date(d), lat, lon); }",
        "dataNeeded": ["solarRadiation"],
        "js":["/js/sunCalc.js"], // https://suncalc.net/
        "comment": "calcul de la phase du soleil",
        "period": 60*60*24*7,
        groupUsage:'Calculation',
        groupCustom: 1
    },
    "MOON.calc": {
        "label": 'Phase de la lune',
        "Value": null,
        "Unit": "",
        "userUnit": "",
        "toUserUnit": "",
        "fn": "(data) => { return data.solarRadiation; }",
        "dataNeeded": ["solarRadiation"],
        "js":["/js/sunCalc.js"],
        "comment": "calcul de la phase de la lune",
        "period": 60*60*24*7,
        groupUsage:'Calculation',
        groupCustom: 1
    },
    "THSW.calc": {
        "label": 'Température THSW',
        "Value": 0,
        "Unit": "K",
        "userUnit": "°C",
        "toUserUnit": "(K) => Number((K-273.15).toFixed(2))",
        "fn": "(data) => { return data.outTemp * data.outHumidity * data.windSpeed; }",
        "dataNeeded": ["outTemp", "outHumidity", "speed:Wind"],
        "js":["/js/THSW.js"],
        "comment": "Température de Sensibilisation, Thermique, Humidité, Soleil et Vent",
        "period": 60*60*24*7,
        groupUsage:'Calculation',
        groupCustom: 1
    }
};

async function getAdditionalProbe (req, res){
    const stationConfig = req.stationConfig;
    const timeStamp = new Date().toISOString();

    try {
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: timeStamp,
            data: Probes
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