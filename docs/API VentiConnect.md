# Documentation API – Serveur Venti’Connect

configurer le wifi (depuis l'application) et une IP fixe (reservation DHCP sur le routeur)
[url](http://venticonnect.lan/)

## liste des routes GET

| type | path           | parametre | reponce |
| :--- | :------------- | :-------: | :-----------------------------------------------------------: |
| GET  | /Chart1.json   |           |                       historique des mesures capteurs aujourd'hui                       |
| GET  | /Chart7.json   |           |                   historique des mesures capteurs jour -6 [de 1 a 7]                    |
| GET  | /JsonConf.json |           |                              config actuellement en vigeur                              |
| GET  | /LogFile1.json |           |                              fichier de log d'aujourd'hui                               |
| GET  | /LogFile3.json |           |                            fichier de log jour -2 [de 1 a 3]                            |
| GET  | /off           |           |                     Stoppe le moteur et arrete les enregistrements                      |
| GET  | /restart       |           |                                    redemare l'esp32                                     |
| GET  | /auto          |           | mode hiver, si la source exterieure est plus chaude que la sonde interieur, le moteur demarre (pendant les periode d'ensoleillement) |
| GET  | /ete           |           | mode ete, si la source exterieure est plus fraiche que la sonde interieur, le moteur demarre (principalement la nuit en ete) |
| GET  | /Silence       |           |                            passe le moteur en vitesse lente                             |
| GET  | /Normal        |           |                           passe le moteur en vitesse moyenne                            |
| GET  | /Boost         |           |                            passe le moteur en vitesse rapide                            |
| GET  | /RecupInfo     |           | Informations en temps réelRenvoie un string CSV contenant : Températures  États système (Hiver/Ete/Silence/Boost), Vitesse moteur, RPM  Tension batterie, Données SHT / thermistance, Dernière réception radio  Version firmware, États internes(Une trame d’état complète pour front-end) |

## liste des parametre POST /Consigne dans le body

| type |   path    | parametre | reponce                      |
| :--- | :-------: | :-------: | :---------------------------: |
| POST | /Consigne |   JSON    | defini de nouveau paramettre |


| Paramètre             | Description | Valeurs possibles |
| --------------------- | :-------: | --------------------- |
| **ConsigneDegre**     | Définit la température de consigne qui arretera le moteur si elle est atteinte a l'interieur, (cote collecteur elle sera le minimum en mode hiver et le maximum en mode ete) | 15–30 °C |
| **ConsigneDegreElec** | Consigne chauffage électrique. | 1–25 °C |
| **ipPC**              | Adresse IP. | Adresse IP valide de l'ESP32 sur le wifi |
| **NumberGain**        | Paramètre de gain. | {2, 3, 4, 5} |
| **ChoixGaine**        | Sélection d’une longueur de gaine. | 0 / 10m / 20m / 30m |
| **ChoixForce**        | force la vitesse moteur | 0 / 1 / 2 / 3 |
