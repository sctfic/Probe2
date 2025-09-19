const sensorMap = {
    'barometer': {
        label: 'Baromètre',
        comment: 'Pression atmosphérique',
        measurement: 'pressure',
        period: 60 * 60 * 24 * 30,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'barometer'
    },
    'inTemp': {
        label: 'Température intérieure',
        comment: 'Température intérieure',
        measurement: 'temperature',
        period: 60 * 60 * 24 * 7,
        groupUsage: '3/ Intdoor',
        groupCustom: 1,
        sensorDb: 'inTemp'
    },
    'inHumidity': {
        label: 'Humidité intérieure',
        comment: 'Humidité intérieure',
        measurement: 'humidity',
        period: 60 * 60 * 24 * 7,
        groupUsage: '3/ Intdoor',
        groupCustom: 1,
        sensorDb: 'inHumidity'
    },
    'outTemp': {
        label: 'Température extérieure',
        comment: 'Température extérieure',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'windSpeed': {
        label: 'Vitesse du vent',
        comment: 'Vitesse du vent',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'speed:Wind'
    },
    'windSpeedMax': {
        label: 'Vitesse du vent max',
        comment: 'Vitesse de rafale de vent max',
        measurement: 'wind',
        period: 60*60*24*3,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'speed:Gust'
    },
    'avgWindSpeed10Min': {
        label: 'Vitesse vent moyenne (10min)',
        comment: 'Vitesse moyenne du vent sur 10 minutes',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'vector:Wind'
    },
    'windDir': {
        label: 'Direction du vent',
        comment: 'Direction d\'ou provient le vent',
        measurement: 'direction',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'rose:Wind'
    },
    'outHumidity': {
        label: 'Humidité extérieure',
        comment: 'Humidité extérieure',
        measurement: 'humidity',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outHumidity'
    },
    'rainRate': {
        label: 'Taux de précipitation',
        comment: 'Taux de précipitation instantané',
        measurement: 'rainRate',
        period: 60*60*24*7,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: null
    },
    'UV': {
        label: 'Index UV',
        comment: 'Indice d\'érythème cutané',
        measurement: 'uv',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: 'UV'
    },
    'solarRadiation': {
        label: 'Irradiance solaire',
        comment: 'puissance Radiation solaire',
        measurement: 'powerRadiation',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: 'solarRadiationMax'
    },
    'stormRain': {
        label: "Preciperiode d'averces actuelle",
        comment: 'Précipitation depuis le début de la période d\'averses',
        measurement: 'rain',
        period: 'dateStormRain',
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'dayRain': {
        label: 'Pluie du jour',
        comment: 'Pluie depuis le début du jour',
        measurement: 'rain',
        period: 60*60*24*1,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'monthRain': {
        label: 'Pluie du mois',
        comment: 'Pluie depuis le début du mois',
        measurement: 'rain',
        period: 60*60*24*30,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'yearRain': {
        label: 'Pluie de l\'année',
        comment: 'Pluie depuis le début de l\'année',
        measurement: 'rain',
        period: 60*60*24*365,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'dayET': {
        label: 'Évapotranspiration du jour',
        comment: 'Évapotranspiration depuis le début du jour',
        measurement: 'rain',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'ET'
    },
    'monthET': {
        label: 'Évapotranspiration du mois',
        comment: 'Évapotranspiration depuis le début du mois',
        measurement: 'rain',
        period: 60*60*24*30,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'ET'
    },
    'yearET': {
        label: 'Évapotranspiration de l\'année',
        comment: 'Évapotranspiration depuis le début de l\'année',
        measurement: 'rain',
        period: 60*60*24*365,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'ET'
    },
    'batteryVoltage': {
        label: 'Niveau batterie',
        comment: 'Niveau de la batterie',
        measurement: 'battery',
        period: 60*60*24*7,
        groupUsage: '6/ other',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'ForecastNum': {
        label: 'Prévision météo',
        comment: 'Prévision météo',
        measurement: 'Forecast',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'sunrise': {
        label: 'Lever du soleil',
        comment: 'Heure du lever du soleil',
        measurement: 'time',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'sunset': {
        label: 'Coucher du soleil',
        comment: 'Heure du coucher du soleil',
        measurement: 'time',
        period: 60*60*24*7,
        groupUsage: '2/ Sun',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'avgWindSpeed2Min': {
        label: 'Vitesse vent moyenne (2min)',
        comment: 'Vitesse moyenne du vent sur 2 minutes',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: null
    },
    'windGust10Min': {
        label: 'Rafale de vent (10min)',
        comment: 'Rafale de vent sur 10 minutes',
        measurement: 'wind',
        period: 60*60*24*7,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'vector:Gust'
    },
    'windGustDir10Min': {
        label: 'Direction rafale (10min)',
        comment: 'Direction de la rafale de vent sur 10 minutes',
        measurement: 'direction',
        period: 60*60*1,
        groupUsage: '5/ other_wind',
        groupCustom: 1,
        sensorDb: 'rose:Gust'
    },
    'dewPoint': {
        label: 'Point de rosée',
        comment: 'Temperature de formation du brouillard',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'heatIndex': {
        label: 'Indice de chaleur (heatIndex)',
        comment: 'Temperature perçue',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '6/ other',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'windChill': {
        label: 'Refroidissement éolien (wind Chill)',
        comment: 'Temperature perçue',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '6/ other',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'THSW': {
        label: 'Indice THSW',
        comment: 'Temperature perçue',
        measurement: 'temperature',
        period: 60*60*24*7,
        groupUsage: '1/ Outdoor',
        groupCustom: 1,
        sensorDb: 'outTemp'
    },
    'dateStormRain': {
        label: 'Date de début des dernieres averces',
        comment: 'Date de début des dernieres averces',
        measurement: 'date',
        period: 60*60*24*7,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'last15MinRain': {
        label: 'Pluie (15 dernières min)',
        comment: 'Pluie sur les 15 dernières minutes',
        measurement: 'rain',
        period: 60*60*24*7,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: null // Pas disponible dans la liste des fields
    },
    'lastHourRain': {
        label: 'Pluie (dernière heure)',
        comment: 'Pluie sur les dernières heures',
        measurement: 'rain',
        period: 60*60,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    },
    'last24HourRain': {
        label: 'Pluie (24 dernières heures)',
        comment: 'Pluie sur les 24 dernières heures',
        measurement: 'rain',
        period: 60*60*24*1,
        groupUsage: '4/ other_rain',
        groupCustom: 1,
        sensorDb: 'rainFall'
    }
};
