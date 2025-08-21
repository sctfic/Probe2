// routes/queryDbRoutes.js
const express = require('express');
const router = express.Router();
const queryDbController = require('../controllers/queryDbController');
// ["_measurement"] == [temperature, speed, direction, pressure, rain, rainRate, uv, powerRadiation, humidity, battery]
// ["sensor_ref"] == [barometer, inTemp, inHumidity, outTemp, windSpeed, avgWindSpeed10Min, windDir, outHumidity, rainRate, rainFall, UV, solarRadiation, stormRain, dateStormRain, dayRain, monthRain, yearRain, dayET, monthET, yearET, batteryVoltage, avgWindSpeed2Min, windGust10Min, windGustDir10Min, dewPoint, heatIndex, windChill, THSW, last15MinRain, lastHourRain, last24HourRain, ForecastIcon, sunrise, sunset, date, time]


// Route to get metadata for a station
router.get('/:stationId', queryDbController.getQueryMetadata); // http://probe2.lpz.ovh/query/VP2_Serramoune

// Route to get the date range for a sensor (startDate and endDate are optional)
router.get('/:stationId/Range/:sensorRef', queryDbController.getQueryRange); // http://probe2.lpz.ovh/query/VP2_Serramoune/Range/inTemp?startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:00:00.000Z

// Route to get raw data for a sensor (startDate and endDate are optional)
router.get('/:stationId/Raw/:sensorRef', queryDbController.getQueryRaw); // http://probe2.lpz.ovh/query/VP2_Serramoune/Raw/barometer?startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:00:00.000Z

// Route to get wind data (startDate and endDate are optional)
router.get('/:stationId/Wind', queryDbController.getQueryWind); // NOK  http://probe2.lpz.ovh/query/VP2_Serramoune/Wind?startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:00:00.000Z

// Route to get rain data (startDate and endDate are optional)
router.get('/:stationId/Rain', queryDbController.getQueryRain); // NOK  http://probe2.lpz.ovh/query/VP2_Serramoune/Rain?startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:00:00.000Z

// Route to get candle data
router.get('/:stationId/Candle', queryDbController.getQueryCandle);

module.exports = router;