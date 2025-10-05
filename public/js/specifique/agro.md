a partir du fichier raws.json (ces donnes sont locale , station meteorologique et exploitation des cultures a 200m alentour), je voudrai une function qui m'aide a comprendre et planifier mes cultures en exterieur et sous serres.
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

nous aurons aussi besoin d'un object pour decrire chaque culture, dans un premier temps la tomate et la pomme de terre
utilise la literature scientifique agronomique pour caracteriser chaque culture

Table 2. Temperature requirements during different growth stages for tomato andcucumber (Tommie, 2018; Haifa, 2017)

| Growth stage          | Minimum | Maximum | Optimal |
| --------------------- | ------- | ------- | ------- |
| Germination           | 11      | 34      | 16-29   |
| Vegetative growth     | 18      | 32      | 21-24   |
| Fruit setting (night) | 10      | 21      | 14-18   |
| Fruit setting (day)   | 18      | 31      | 21-25   |
| cold damage           |         |         | <6      |
| frost damage          |         |         | <1      |
| dead damage           |         |         | <-2     |

| Relative humidity             |
| ----------------------------- |
| 60%-70%                       |
| Relative humidity             |
| ----------------------------- |
| Germination                   |
| Vegetative growth             |
| nouaison                      |
| damage                        |

| Light(hours)   | optimal | min | max |
| -------------- | ------- | --- | --- |
| day            | 16      | 8   | 18  |

| Light(W/m²)    | optimal | min | max |
| -------------- | ------- | --- | --- |
| day            | 250     | 100 | 300 |

⚠️ Au-delà de 250 W/m² (500 μmol/m²/s), il y a saturation de la photosynthèse chez la tomate, sauf si CO₂ et température sont augmentés (ex. en serre climatisée). Une photopériode trop longue (>18h) peut induire du stress physiologique ou retarder la floraison chez certaines variétés.

| water requirement             |
| ----------------------------- |
| 900 l/m2/year (2.5 l/m2/jour) |

exemple de culture :
{
  "tomato": {
    "name": "tomato_indeterminate",
    "culturalType": "fruit-vegetable",
    "culturalGroup": "Solanaceae",
    "referenceLink": ["https://www.fao.org/3/T0279E/T0279E00.htm"],
    "stages": {
      "SOWING": { // pour determiner le moment de semis
        "temp": {
          "lethalLow": 4,
          "min": 10,
          "opt": 25,
          "max": 35,
          "lethalHigh": 40,
          "betaShape": null,
          "acclim": null
        },
        "humidity": {
          "lethalLow": 40,
          "min": 60,
          "opt": 70,
          "max": 80,
          "lethalHigh": 95
        },
        "lightPower": {
          "opt": 250,
          "min": 100,
          "max": 300				
        },
        "lightHours": {
          "opt": 16,
          "min": 8,
          "max": 18
        },
        "thermal": {
          "degree-hours": 240,
          "periodDays": 10
        },
        "windMax_m_s": 5,
        "water": 2.5 // l/m2/jour
      },
      "GERMINATION": {
        "temp": {
          "lethalLow": 4,
          "min": 10,
          "opt": 25,
          "max": 35,
          "lethalHigh": 40,
          "betaShape": null,
          "acclim": null
        },
        "humidity": {
          "lethalLow": 40,
          "min": 60,
          "opt": 70,
          "max": 80,
          "lethalHigh": 95
        },
        "lightPower": {
          "opt": 250,
          "min": 100,
          "max": 300				
        },
        "lightHours": {
          "opt": 16,
          "min": 8,
          "max": 18
        },
        "thermal": {
          "degree-hours": 240,
          "periodDays": 10
        },
        "windMax_m_s": 5,
        "water": 2.5 // l/m2/jour
      },
      "VEGETATIVE": {
        "temp": {
          "lethalLow": 4,
          "min": 8,
          "opt": 26,
          "max": 34,
          "lethalHigh": 38,
          "betaShape": { "m": 2.0, "n": 3.0 },
          "acclim": { "tauDays": 3.0, "shiftPerDegree": 0.2, "shrinkPerDegree": 0.04 },
        },
        "humidity": {
          "lethalLow": 40,
          "min": 55,
          "opt": 65,
          "max": 75,
          "lethalHigh": 95
        },
        "lightPower": {
          "opt": 250,
          "min": 100,
          "max": 300				
        },
        "lightHours": {
          "opt": 16,
          "min": 8,
          "max": 18
        },
        "thermal": {
          "degree-hours": 240,
          "periodDays": 10
        },
        "windMax_m_s": 6,
        "water": 2.5 // l/m2/jour
      },
      "FLOWERING": {
        "temp": {
          "lethalLow": 5,
          "min": 8,
          "opt": 24,
          "max": 32,
          "lethalHigh": 36,
          "betaShape": { "m": 2.3, "n": 3.2 },
          "acclim": { "tauDays": 2.5, "shiftPerDegree": 0.18, "shrinkPerDegree": 0.035 },
        },
        "humidity": {
          "lethalLow": 40,
          "min": 50,
          "opt": 60,
          "max": 70,
          "lethalHigh": 95
        },
        "lightPower": {
          "opt": 220,
          "min": 100,
          "max": 300			
        },
        "lightHours": {
          "opt": 16,
          "min": 8,
          "max": 18
        },
        "thermal": {
          "degree-hours": 240,
          "periodDays": 10
        },
        "windMax_m_s": 5,
        "water": 2.5 // l/m2/jour
      },
      "FRUIT_DAY": {
        "temp": {
          "lethalLow": 6,
          "min": 12,
          "opt": 24,
          "max": 32,
          "lethalHigh": 36,
          "betaShape": { "m": 2.5, "n": 2.8 },
          "acclim": { "tauDays": 2.0, "shiftPerDegree": 0.15, "shrinkPerDegree": 0.03 },
        },
        "humidity": {
          "lethalLow": 40,
          "min": 50,
          "opt": 60,
          "max": 70,
          "lethalHigh": 95
        },
        "lightPower": {
          "opt": 200,
          "min": 100,
          "max": 300			
        },
        "lightHours": {
          "opt": 16,
          "min": 8,
          "max": 18
        },
        "thermal": {
          "degree-hours": 240,
          "periodDays": 10
        },
        "windMax_m_s": 4,
        "water": 2.5 // l/m2/jour
      },
      "FRUIT_NIGHT": {
        "temp": {
          "lethalLow": 5,
          "min": 10,
          "opt": 18,
          "max": 25,
          "lethalHigh": 28,
          "betaShape": { "m": 2.0, "n": 4.0 },
          "acclim": { "tauDays": 3.5, "shiftPerDegree": 0.1, "shrinkPerDegree": 0.02 },
        },
        "humidity": {
          "lethalLow": 40,
          "min": 50,
          "opt": 60,
          "max": 70,
          "lethalHigh": 95
        },
        "lightPowerS": {
          "opt": 200,
          "min": 100,
          "max": 300			
        },
        "lightHours": {
          "opt": 16,
          "min": 8,
          "max": 18
        },
        "thermal": {
          "degree-hours": 240,
          "periodDays": 10
        },
        "windMax_m_s": 3,
        "water": 2.5 // l/m2/jour
      }
    }
  }
}


- a ameliorer (Photoperiodisme, Intensité Lumineuse, Cumul de Lumière) :
  "tomate" = {
  "groupeCultural" : "legume_fruit",
  "typeCultural" : "tomate",
  "RefAgronomiques" : [],
  "models":{ // modele a aclimatation dynamique
    "humidity":""
    "water" : "(et) => et * besoinEau", // les besoin d'eau sont en fonction de la evapotranspiration
    "temp" : "(t,{LOW = -1,MIN = 10,OPT = 25,MAX = 35,HIGH = 40,EXP_COLD = 2.2,EXP_HOT = 3.5}={}) => {\n  if (t <= LOW) return -1;\n  if (t >= HIGH) return -1;\n  if (t < OPT) {\n    const normalized = (t - OPT) / (OPT - MIN);\n    return 1 - Math.pow(Math.abs(normalized), EXP_COLD);\n  } else {\n    const normalized = (t - MAX) / (MAX - OPT);\n    return 1 - Math.pow(normalized, EXP_HOT);\n  }\n};",
  }
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


raws.json sera fournis par une api ( /query/VP2_Serramoune/Raws/temperature:outTemp,irradiance:solar,rain:ET,humidity:outHumidity,rain:rainFall,speed:Wind?stepCount=120&startDate=2025-09-15&endDate=2025-09-20) avec la meme structure
il pourra contenir 'uv:UV', 'humidity:extraSoilMoisture1' et 'temperature:soilTemp1' en option (si le capteur est present, sinon faire sans ou faire une estimation d'apres les conditions precedentes)
fais moi des suggestion pour etre le plus pertinant dans la gestion de mes cultures
