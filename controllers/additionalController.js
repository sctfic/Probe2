const units = require('../config/Units.json');
const additionalProbe = require('../config/aditionnalProbe.json');

const Probes = {
    "sun": {
        "Value": null,
        "Unit": "mm",
        "userUnit": "l/m²",
        "toUserUnit": "(mm) => Number((mm*10).toFixed(2))",
        "fn": (timeStamp, solarRadiation) => { return solarRadiation; },
        "dataNeed": ["timeStamp", "solarRadiation"]
    },
    "moon": {
        "Value": null,
        "Unit": "mm",
        "userUnit": "l/m²",
        "toUserUnit": "(mm) => Number((mm*10).toFixed(2))",
        "fn": (timeStamp, solarRadiation) => { return solarRadiation; },
        "dataNeed": ["timeStamp", "solarRadiation"]
    },
    "THSW": {
        "Value": null,
        "Unit": "mm",
        "userUnit": "l/m²",
        "toUserUnit": "(mm) => Number((mm*10).toFixed(2))",
        "fn": (timeStamp, outTemp, outHumidity, windSpeed) => { return {outTemp, outHumidity, windSpeed}; },
        "dataNeed": ["timeStamp", "outTemp", "outHumidity", "windSpeed"]
    }
}

async function getAdditionalProbe (req, res){
    const stationConfig = req.stationConfig;
    try {
        res.json({
            success: true,
            stationId: stationConfig.id,
            timestamp: new Date().toISOString(),
            data: null
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

module.exports = getAdditionalProbe;