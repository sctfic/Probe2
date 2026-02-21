// routes/queryDbRoutes.js
const express = require('express');
const router = express.Router();
const queryDbController = require('../controllers/queryDbController');
const { loadStationConfig } = require('../middleware/stationMiddleware');
// const { isAuthenticated } = require('../middleware/authMiddleware');

module.exports = router;

// ["_measurement"] == [temperature, speed, direction, pressure, rain, rainRate, uv, irradiance, humidity, voltage]
// ["sensor_ref"] == [barometer, inTemp, inHumidity, outTemp, windSpeed, avgWindSpeed10Min, windDir, outHumidity, rainRate, rainFall, UV, solar, stormRain, dateStormRain, dayRain, monthRain, yearRain, dayET, monthET, yearET, battery, avgWindSpeed2Min, windGust10Min, windGustDir10Min, dewPoint, heatIndex, windChill, THSW, last15MinRain, lastHourRain, last24HourRain, ForecastIcon, sunrise, sunset, date, time]

// Middleware pour toutes les routes de query
router.use('/:stationId', loadStationConfig); // https://probe.lpz.ovh/query/VP2_Serramoune/

// Retourne toute les metadata d'une station, liste des sensors, les unites avec leur proprietees et la structure des data dans influxdb
router.get('/:stationId', queryDbController.getQueryMetadata); // https://probe.lpz.ovh/query/VP2_Serramoune

// Retourne la date de debut et de fin pour pressure:barometer (?startDate= &endDate= &stepCount= sont optionnels)
router.get('/:stationId/Range', queryDbController.getQueryRange); // https://probe.lpz.ovh/query/VP2_Serramoune/Range?stepCount=500
// idem pour un sensor specifique
router.get('/:stationId/Range/:sensorRef', queryDbController.getQueryRange); // https://probe.lpz.ovh/query/VP2_Serramoune/Range/inTemp?stepCount=500

// Retourne les donnees brutes pour un sensor (?startDate= &endDate= &stepCount= sont optionnels)
router.get('/:stationId/Raw/:sensorRef', queryDbController.getQueryRaw); // https://probe.lpz.ovh/query/VP2_Serramoune/Raw/barometer?stepCount=500

// Retourne les donnees brutes pour plusieurs sensors (?startDate= &endDate= &stepCount= sont optionnels)
router.get('/:stationId/Raws/:sensorRefs', queryDbController.getQueryRaws); // https://probe.lpz.ovh/query/VP2_Serramoune/Raws/barometer,inTemp,UV?stepCount=12&startDate=2025-08-21T00:00:00.000Z&endDate=2025-08-21T23:00:00.000Z

// Retourne les donnees de rose des vents (?startDate= &endDate= &stepCount= sont optionnels)
router.get('/:stationId/WindRose', queryDbController.getQueryWindRose); // https://probe.lpz.ovh/query/VP2_Serramoune/WindRose?stepCount=5

// Retourne les donnees de vecteurs de vents pour un capteur specifique (?startDate= &endDate= &stepCount= sont optionnels)
router.get('/:stationId/WindVectors/:sensorRef', queryDbController.getQueryWindVectors); // https://probe.lpz.ovh/query/VP2_Serramoune/WindVectors/Gust?stepCount=500

// Retourne les donnees au format candlestick pour un capteur specifique (?startDate= &endDate= &stepCount= sont optionnels)
router.get('/:stationId/Candle/:sensorRef', queryDbController.getQueryCandle); // https://probe.lpz.ovh/query/VP2_Serramoune/Candle/barometer?stepCount=500

// Collecte les derniers jours manquant d'historique avec les archives Open-Meteo
router.get('/:stationId/dbexpand', queryDbController.expandDbWithOpenMeteo); // https://probe.lpz.ovh/query/VP2_Serramoune/dbexpand

// Collecte l'historique sur quelque annees de plus avec les archives Open-Meteo
router.get('/:stationId/dbexpand/:moreYears', queryDbController.expandDbWithOpenMeteo); // https://probe.lpz.ovh/query/VP2_Serramoune/dbexpand

// collecte les données de prévision avec Open-Meteo et supprime celle qui sont périmées
router.get('/:stationId/forecast', queryDbController.getOpenMeteoForecast); // https://probe.lpz.ovh/query/VP2_Serramoune/forecast


// const influxdbService = require('../services/influxdbService');
// router.get('/:stationId/delete', influxdbService.deleteLocalDataCollection); // https://probe.lpz.ovh/query/delete

module.exports = router;