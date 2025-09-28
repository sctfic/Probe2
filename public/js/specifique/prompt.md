a partir du fichier raws.json (ces donnes sont locale , station meteorologique et exploitation des cultures a 500m alentour), je voudrai une function qui m'aide a comprendre et planifier mes cultures en exterieur et sous serres.
il est important que cet outil m'indique :
 - les periodes de semi (d'apres la date, la position GPS, l'historique des conditions meteo locale incluant les degres heure...)
 - les risque de maladies, de dommage et de parasites potentiel
 - la qualite de floraison / fructification (ex: certaines conditions tue les fleurs donc pas pollenisation ni de fruits)

ne me code pas cette fonction, pour l'instant etudions ensemble les possibilitees les ameliorations possible ou les parametres inutiles ou d'impact trop faible (rainfall ?)
il faudra retourner les data suivante, heure par heure, pour une culture et retourner un object avec les informations suivantes:
return data = [{
    "d": "2025-09-15T00:02:00Z",  // DateTime (nom obligatoire)
    "v": 12,                    // Degrés-heures corrigés (nom obligatoire)
    "dhSum": 185,                // Degrés-heures cumuler depuis le dernier semis
    "lightSum": 254,              // light cumulé
    "tx": 67,                     // Taux de croissance/devellopemet (%)
    "status": "germination",             // periode de semi, germination, croissance_vegetative, floraison, fructification, maturation, recolte
    "risque": ["MANQUE_LUMIERE"], // Types de danger, facteurs limitant
    "stress": {                  // Taux de stress par facteur (%)
            thermique: 15,       // Combinaison temp + amplitude
            hydrique: 20,        // Humidité + ET + pluie
            lumineux: 10,        // Radiation + durée jour
            biotique: 5          // Risques maladies (pluie + humidité)
        }
    },
    ...
]

nous aurons aussi besoin d'un object pour decrire chaque culture
ble, mais, tournesol,
tomate, radis, carotte, epinard, courgette, aubergine, poivron, concombre, haricot_vert, petit_pois,
oignon, ail, betterave, chou, brocoli, navet, celeri, persil, basilic, melon, pasteque,
vigne, poirier, pecher, abricotier, prunier, cerisier, citronnier, oranger, oliviers, figuier, avocatier

exemple a ameliorer (Photoperiodisme, Intensité Lumineuse, Cumul de Lumière) :
"%culture%" = { // reference ou url de la source
    "groupeCultural" : "legume_fruit",
    "besoinsEau" : "eleve", // faible, moyen, eleve
    "sensibiliteGel" : "sensible",
    "exigences" : {
        "temperature" : { "ideal" : [18, 25], "stress" : [10, 35] },
        "humidite" : { "ideal" : [60, 80], "stress" : [40, 90] },
        "lumiere": { "dailyMin": 200, "dailyOptimal": 400 }, // W/m² cumulés jour
        "eau": { "besoins": "moyen", "sensibilitéMildiou": "elevee" }
    },
    "sensibilites": {
        "gel": 2,        // °C au-dessus de 0 pour déclencher alerte
        "fleur": { "min": 25, "max": 32},,        // °C au-dessus de 0 pour déclencher alerte
        "vent": 30,      // km/h max
        "amplitude": 15  // °C max entre jour/nuit
    },
    "seasonalInfo": { // Informations saisonnières
        "sowing": { // condition favorable au semie
            "start": { "week": 12 },
            "end": { "week": 24}
        },
        "optimalDHPerWeek": 100, // pertinance ?
        "minDHForGermination": 50 // pertinance ?
    },
    "phenologyThresholds": {
            "germination": { "min": 100, "max": 250 },
            "croissance_vegetative": { "min": 250, "max": 1200 },
            "floraison": { "min": 1200, "max": 1600 },
            "fructification": { "min": 1600, "max": 2200 },
            "maturation": { "min": 2200, "max": 2800 },
            "recolte": { "min": 2800, "max": Infinity }
    }
}

raws.json sera fournis par une api ( /query/VP2_Serramoune/Raws/temperature:outTemp,powerRadiation:solarRadiation,rain:ET,humidity:outHumidity,rain:rainFall,speed:Wind?stepCount=120&startDate=2025-09-15&endDate=2025-09-20) avec la meme structure
il pourra contenir 'uv:UV', 'humidity:extraSoilMoisture1' et 'temperature:soilTemp1' en option (si le capteur est present, sinon faire sans ou faire une estimation d'apres les conditions precedentes)
fais moi des suggestion pour etre le plus pertinant dans la gestion de mes cultures