// controllers/compositeController.js
const unitsProvider = require('../services/unitsProvider');
const Probes = require('../config/compositeProbes.json');
const { sensorTypeMap } = require('../utils/weatherDataParser');
// const compositeProbes = require('../config/aditionnalProbe.json');

async function getcompositeProbes(req, res) {
    const stationConfig = req.stationConfig;
    const sensors = req.params.sensors;
    const timeStamp = new Date().toISOString();
    let ProbeReduced = null;
    let sensorList = [];
    // si il y a une liste de sensors on garde seulement ces sensors dans Probes
    if (sensors) sensorList = sensors.split(',');
    ProbeReduced = Object.keys(Probes).reduce((acc, key) => {
        if (!sensors || sensorList.includes(key)) acc[key] = Probes[key];
        acc[key].fnCalc = acc[key].fnCalc?.replace("%longitude%", req.stationConfig.longitude.lastReadValue)
            .replace("%latitude%", req.stationConfig.latitude.lastReadValue)
            .replace("%altitude%", req.stationConfig.altitude.lastReadValue);
        const units = unitsProvider.getUnits();
        const measurement = units[unitsProvider.getSensorTypeMap()[key]];
        // acc[key].value = calculate(acc[key].fnCalc);
        acc[key].userUnit = measurement?.user || null
        acc[key].Unit = measurement?.metric || null
        acc[key].toUserUnit = measurement?.available_units[measurement.user].fnFromMetric || null
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
        res.status(500).json({
            success: false,
            stationId: req.stationConfig?.id || 'unknown',
            error: error.message
        });
    }
}

module.exports = {
    // getcompositeProbes
};