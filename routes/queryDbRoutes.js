// routes/queryDbRoutes.js
const express = require('express');
const router = express.Router();
const queryDbController = require('../controllers/queryDbController');
// ["_measurement"] == [temperature, speed, direction, pressure, rain, rainRate, uv, powerRadiation, humidity, battery]
// ["sensor_ref"] == [barometer, inTemp, inHumidity, outTemp, windSpeed, avgWindSpeed10Min, windDir, outHumidity, rainRate, rainFall, UV, solarRadiation, stormRain, dateStormRain, dayRain, monthRain, yearRain, dayET, monthET, yearET, batteryVoltage, avgWindSpeed2Min, windGust10Min, windGustDir10Min, dewPoint, heatIndex, windChill, THSW, last15MinRain, lastHourRain, last24HourRain, ForecastIcon, sunrise, sunset, date, time]


// Route to clear all data from the bucket
router.get('/clear', queryDbController.clearAllData); // http://probe2.lpz.ovh/query/clear
// .\influx-client.exe delete --bucket Probe --start '2025-09-02T20:30:00Z'  --stop '2025-09-02T23:00:00Z'

// Route to get metadata for a station
router.get('/:stationId', queryDbController.getQueryMetadata); // http://probe2.lpz.ovh/query/VP2_Serramoune

// Route to get the date range for a sensor (startDate and endDate are optional)
router.get('/:stationId/Range', queryDbController.getQueryRange); // http://probe2.lpz.ovh/query/VP2_Serramoune/Range?stepCount=500
router.get('/:stationId/Range/:sensorRef', queryDbController.getQueryRange); // http://probe2.lpz.ovh/query/VP2_Serramoune/Range/inTemp?stepCount=500

// Route to get raw data for a sensor (startDate and endDate are optional)
router.get('/:stationId/Raw/:sensorRef', queryDbController.getQueryRaw); // http://probe2.lpz.ovh/query/VP2_Serramoune/Raw/barometer?stepCount=500

// Route to get raw data for many sensors (startDate and endDate are optional)
router.get('/:stationId/Raws/:sensorRefs', queryDbController.getQueryRaws); // http://probe2.lpz.ovh/query/VP2_Serramoune/Raws/barometer,inTemp,UV?stepCount=12&startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:00:00.000Z

// Route to get wind data (startDate and endDate are optional)
router.get('/:stationId/WindRose', queryDbController.getQueryWindRose); // http://probe2.lpz.ovh/query/VP2_Serramoune/WindRose?stepCount=5

// Route to get wind data (startDate and endDate are optional)
router.get('/:stationId/WindVectors', queryDbController.getQueryWindVectors); // http://probe2.lpz.ovh/query/VP2_Serramoune/WindVectors?stepCount=500
router.get('/:stationId/WindVectors/:sensorRef', queryDbController.getQueryWindVectors); // http://probe2.lpz.ovh/query/VP2_Serramoune/WindVectors/Gust?stepCount=500

// Route to get candle data
router.get('/:stationId/Candle/:sensorRef', queryDbController.getQueryCandle); // http://probe2.lpz.ovh/query/VP2_Serramoune/Candle/barometer?stepCount=500



module.exports = router;