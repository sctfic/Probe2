# Documentation API – Serveur Venti’Connect

configurer le wifi (depuis l'application) et une IP fixe (reservation DHCP sur le routeur)
[url](http://venticonnect.local/)

## liste des routes GET

| type | path           | Format | reponce                                                                                                                                              |
| :--- | :------------- | :----: | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET  | /Chart1.json   |  json  | historique des mesures capteurs aujourd'hui                                                                                                          |
| GET  | /Chart7.json   |  json  | historique des mesures capteurs jour -6 [de 1 a 7]                                                                                                   |
| GET  | /JsonConf.json |  json  | config actuellement en vigeur                                                                                                                        |
| GET  | /LogFile1.json |  json  | fichier de log d'aujourd'hui                                                                                                                         |
| GET  | /LogFile3.json |  json  | fichier de log jour -2 [de 1 a 3]                                                                                                                    |
| GET  | /off           |        | Stoppe le moteur et arrete l'asservissements                                                                                                         |
| GET  | /restart       |        | redemare le firmware, l'esp32                                                                                                                        |
| GET  | /auto          |        | mode**hiver**, si la source exterieure est plus chaude que la sonde interieur,`<br>`le moteur demarre (pendant les periode d'ensoleillement) |
| GET  | /ete           |        | mode**ete**, si la source exterieure est plus fraiche que la sonde interieur,`<br>`le moteur demarre (principalement la nuit en ete)         |
| GET  | /Silence       |        | passe le moteur en vitesse**lente**                                                                                                            |
| GET  | /Normal        |        | passe le moteur en vitesse**moyenne**                                                                                                          |
| GET  | /Boost         |        | force le moteur en vitesse**rapide**                                                                                                           |
| GET  | /RecupInfo     |  json  | Informations en temps réel, Renvoie un CSV                                                                                                          |

## liste des parametre POST /Consigne dans le body

| type |   path   | parametre |           reponce           |
| :--- | :-------: | :-------: | :--------------------------: |
| POST | /Consigne |   JSON   | defini de nouveau paramettre |

| Paramètre possible         |                                                                                      Description                                                                                      | Valeurs possibles                        |
| --------------------------- | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ---------------------------------------- |
| **ConsigneDegre**     | Définit la température de consigne qui arretera le moteur si elle est atteinte a l'interieur,`<br>`(cote collecteur elle sera le minimum en mode hiver et le maximum en mode ete) | 15–30 °C                               |
| **ConsigneDegreElec** |                                                                            Consigne chauffage électrique.                                                                            | 1–25 °C                                |
| **ipPC**              |                                                                                      Adresse IP.                                                                                      | Adresse IP valide de l'ESP32 sur le wifi |
| **NumberGain**        |                                                                                  Paramètre de gain.                                                                                  | {2, 3, 4, 5}                             |
| **ChoixGaine**        |                                                                         Sélection d’une longueur de gaine.                                                                         | 0 / 10m / 20m / 30m                      |
| **ChoixForce**        |                                                                                force la vitesse moteur                                                                                | 0 / 1 / 2 / 3                            |

## detail des routes

1. /Chart1.json
   la derniere mesure est en dernier dans le tableau

```json
[
    {
        "H": 14, // heure
        "M": 10, // minute
        "HE": 65, // Humidite exterieure
        "HI": 47.38, // Humidite interieur
        "TI": 24.6, // temperature interieur
        "TP": 30.8, // thermocouple gaine
        "MO": 0 // mode
    }
]
```

1. /RecupInfo
   27 valeurs separees par des virgules

|    | venticonnect.local/RecupInfo | descriptions                                        |
| :-: | ---------------------------: | :-------------------------------------------------- |
| 1 |                           20 | temp SHT31 Interieur                                |
| 2 |                           15 | temp thermistance Gaine/Collecteur                  |
| 3 |                           25 | consigne Solaire                                    |
| 4 |                       Rapide | Mode                                                |
| 5 |     14h46 - ip 192.168.1.101 | Horloge - IP sur le wifi (DHCP Only)                |
| 6 |                           19 | Consigne Quietude                                   |
| 7 |                            0 | résistance Quiétude presente                      |
| 8 |                            0 | ????                                                |
| 9 |                       CM2047 | consigne Moteur (CM2047 = rapide / CM0 = off / ...) |
| 10 |                        RM600 | rotation Level                                      |
| 11 |                         ???? |                                                     |
| 12 |                        V2477 | tensionAlim*100                                     |
| 13 |                       VM2441 | tensionM*100                                        |
| 14 |                      12V1151 | Tension 12V (pour le moteur)                        |
| 15 |                  LastTemp188 | LastTempCount                                       |
| 16 |                  ExtBatt4096 | tensionRemoteBatt*1000(none=4096)                   |
| 17 |                       TMax17 | Tmax17                                              |
| 18 |                       TMin14 | Tmin14                                              |
| 19 |                      RPM2880 | Vitesse Rotation Moteur                             |
| 20 |                 TempThermi15 | Temp Gaine/collecteur                               |
| 21 |                    TempSHT16 | Temp SHT31 Ext Moteur                               |
| 22 |               deltaTemp-5.11 | deltaTemp_Gaine-In                                  |
| 23 |              DeltaSHTThermi0 | Delta_Ext-Gaine pourquoi toujours a 0 ?             |
| 24 |                        SHT11 | SHT11                                               |
| 25 |                        Firm1 | Firm1                                               |
| 26 |              testinprogress0 | mesure test en cour                                 |
| 27 |                          QE0 | QE0                                                 |
