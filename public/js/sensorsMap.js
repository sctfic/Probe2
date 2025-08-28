const sensorMap = {
    'barometer': {
        label: 'Baromètre',
        measurement: 'pressure',
        period: 60 * 60 * 24 * 7,
        groupUsage: '2/ out',
        groupCustom: 1,
        sensorDb: 'barometer'
    },
    'inTemp': {
        label: 'Température intérieure',
        measurement: 'temperature',
        period: 60 * 60 * 24 * 7,
        groupUsage: '1/ in',
        groupCustom: 1,
        sensorDb: 'inTemp'
    },
    'inHumidity': {
        label: 'Humidité intérieure',
        measurement: 'humidity',
        period: 60 * 60 * 24 * 7,
        groupUsage: '1/ in',
        groupCustom: 1,
        sensorDb: 'inHumidity'
    },
    'outTemp': {
        label: 'Température extérieure',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '2/ out',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'windSpeed': {
        label: 'Vitesse du vent',
        measurement: 'speed',
        period: 60*60*24*7,
        groupUsage: '2/ out',
        groupCustom: 1,
        sensorDb: 'speed'
    },
    'windSpeedMax': {
        label: 'Vitesse du vent max',
        measurement: 'speed',
        period: 60*60*24*3,
        groupUsage: '2/ out',
        groupCustom: 1,
        sensorDb: 'gust'
    },
    'avgWindSpeed10Min': {
        label: 'Vitesse vent moyenne (10min)',
        measurement: 'speed',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: null
    },
    'windDir': {
        label: 'Direction du vent',
        measurement: 'direction',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'angle'
    },
    'windDirMax': {
        label: 'Direction du vent max',
        measurement: 'direction',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'angle'
    },
    'outHumidity': {
        label: 'Humidité extérieure',
        measurement: 'humidity',
        period: 60*60*24*7,
        groupUsage: '2/ out',
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
        label: 'Index UV',
        measurement: 'uv',
        period: 60*60*24*7,
        groupUsage: '3/ sun',
        groupCustom: 1,
        sensorDb: 'UV'
    },
    'solarRadiation': {
        label: 'puissance Radiation solaire',
        measurement: 'powerRadiation',
        period: 60*60*24*7,
        groupUsage: '3/ sun',
        groupCustom: 1,
        sensorDb: 'solarRadiationMax'
    },
    'stormRain': {
        label: "Dernieres preciperiode d'averces",
        measurement: 'rain',
        period: 'dateStormRain',
        groupUsage: '2/ out',
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
        period: 60*60*24*1,
        groupUsage: '2/ out',
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
        groupUsage: '2/ out',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'sunrise': {
        label: 'Lever du soleil',
        measurement: 'time',
        period: 60*60*24*7,
        groupUsage: '3/ sun',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'sunset': {
        label: 'Coucher du soleil',
        measurement: 'time',
        period: 60*60*24*7,
        groupUsage: '3/ sun',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'avgWindSpeed2Min': {
        label: 'Vitesse vent moyenne (2min)',
        measurement: 'speed',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'speed'
    },
    'windGust10Min': {
        label: 'Rafale de vent (10min)',
        measurement: 'speed',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'gust'
    },
    'windGustDir10Min': {
        label: 'Direction rafale (10min)',
        measurement: 'direction',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'angle'
    },
    'dewPoint': {
        label: 'Point de rosée',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '2/ out',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'heatIndex': {
        label: 'Indice de chaleur',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '6/ other',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'windChill': {
        label: 'Refroidissement éolien',
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
        groupUsage: '2/ out',
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
