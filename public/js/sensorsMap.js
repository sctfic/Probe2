const sensorMap = {
    'barometer': {
        label: 'Baromètre',
        measurement: 'pressure',
        period: 60 * 60 * 24 * 30,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'barometer'
    },
    'inTemp': {
        label: 'Température intérieure',
        measurement: 'temperature',
        period: 60 * 60 * 24 * 7,
        groupUsage: '3/ Intdoor',
        groupCustom: 1,
        sensorDb: 'inTemp'
    },
    'inHumidity': {
        label: 'Humidité intérieure',
        measurement: 'humidity',
        period: 60 * 60 * 24 * 7,
        groupUsage: '3/ Intdoor',
        groupCustom: 1,
        sensorDb: 'inHumidity'
    },
    'outTemp': {
        label: 'Température extérieure',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'windSpeed': {
        label: 'Vitesse du vent',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'speed:Wind'
    },
    'windSpeedMax': {
        label: 'Vitesse du vent max',
        measurement: 'wind',
        period: 60*60*24*3,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'speed:Gust'
    },
    'avgWindSpeed10Min': {
        label: 'Vitesse vent moyenne (10min)',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'speed:Wind'
    },
    'windDir': {
        label: 'Direction du vent',
        measurement: 'direction',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'direction:Wind'
    },
    'outHumidity': {
        label: 'Humidité extérieure',
        measurement: 'humidity',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outHumidity'
    },
    'rainRate': {
        label: 'Taux de précipitation',
        measurement: 'rainRate',
        period: 60*60*24*7,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: null
    },
    'UV': {
        label: 'Index UV (duree avant coup de soleil)',
        measurement: 'uv',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: 'UV'
    },
    'solarRadiation': {
        label: 'puissance Radiation solaire',
        measurement: 'powerRadiation',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: 'solarRadiationMax'
    },
    'stormRain': {
        label: "Preciperiode d'averces actuelle",
        measurement: 'rain',
        period: 'dateStormRain',
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'dayRain': {
        label: 'Pluie du jour',
        measurement: 'rain',
        period: 60*60*24*1,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'monthRain': {
        label: 'Pluie du mois',
        measurement: 'rain',
        period: 60*60*24*30,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'yearRain': {
        label: 'Pluie de l\'année',
        measurement: 'rain',
        period: 60*60*24*365,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'dayET': {
        label: 'Évapotranspiration du jour',
        measurement: 'rain',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'ET'
    },
    'monthET': {
        label: 'Évapotranspiration du mois',
        measurement: 'rain',
        period: 60*60*24*30,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'ET'
    },
    'yearET': {
        label: 'Évapotranspiration de l\'année',
        measurement: 'rain',
        period: 60*60*24*365,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'ET'
    },
    'batteryVoltage': {
        label: 'Voltage batterie',
        measurement: 'battery',
        period: 60*60*24*7,
        groupUsage: '6/ other',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'ForecastNum': {
        label: 'Prévision météo',
        measurement: 'Forecast',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'sunrise': {
        label: 'Lever du soleil',
        measurement: 'time',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'sunset': {
        label: 'Coucher du soleil',
        measurement: 'time',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'avgWindSpeed2Min': {
        label: 'Vitesse vent moyenne (2min)',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'speed:Wind'
    },
    'windGust10Min': {
        label: 'Rafale de vent (10min)',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'speed:Gust'
    },
    'windGustDir10Min': {
        label: 'Direction rafale (10min)',
        measurement: 'direction',
        period: 60*60*1,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'direction:Gust'
    },
    'dewPoint': {
        label: 'Point de rosée',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'heatIndex': {
        label: 'Indice de chaleur (heatIndex)',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '6/ other',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'windChill': {
        label: 'Refroidissement éolien (wind Chill)',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '6/ other',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'THSW': {
        label: 'Indice THSW',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'dateStormRain': {
        label: 'Date de début des dernieres averces',
        measurement: 'date',
        period: 60*60*24*7,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'last15MinRain': {
        label: 'Pluie (15 dernières min)',
        measurement: 'rain',
        period: 60*60*24*7,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'lastHourRain': {
        label: 'Pluie (dernière heure)',
        measurement: 'rain',
        period: 60*60,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'last24HourRain': {
        label: 'Pluie (24 dernières heures)',
        measurement: 'rain',
        period: 60*60*24*1,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    }
};
