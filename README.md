# Probe

## Description

Probe est une application conçue pour collecter, stocker et afficher des données météorologiques provenant de multiples sources. Elle agrège les informations d'une station météo locale VP2 ainsi que des données de prévisions et historiques via l'API [Open-Meteo](https://open-meteo.com/).

Le projet permet de suivre une grande variété de mesures telles que la température, l'humidité, la vitesse et la direction du vent, les précipitations, l'indice UV, et bien plus encore.

## Fonctionnalités

*   **Multi-source** : Collecte des données depuis une station météo personnelle ("Station") et l'API Open-Meteo.
*   **Données Complètes** : Prend en charge un large éventail de capteurs :
    *   Température (intérieure, extérieure, sol, feuille)
    *   Humidité (intérieure, extérieure, sol, feuille)
    *   Données sur le vent (vitesse, direction, rafales)
    *   Pression atmosphérique
    *   Précipitations et évapotranspiration
    *   Données solaires (Irradiance, Index UV)
*   **Configuration Flexible** : La gestion des capteurs et de leur configuration est centralisée dans le fichier `config/dbProbes.json`.

## Configuration

La configuration des capteurs se trouve dans le fichier `config/dbProbes.json`. Ce fichier JSON définit chaque sonde de données disponible dans l'application.

### Structure d'un objet Sonde

Chaque entrée dans le fichier de configuration représente un capteur et suit la structure suivante :

```json
"identifiant:unique": {
    "label": "Nom lisible du capteur",
    "comment": "Courte description du capteur.",
    "currentMap": "Clé de mapping pour les données actuelles",
    "period": 2592000,
    "groupUsage": "db",
    "groupCustom": "Groupe du capteur (ex: Station, open-meteo)",
    "sensorDb": "Identifiant du capteur dans la base de données",
    "measurement": "Type de mesure (ex: temperature, humidity)"
}
```

### Exemples

**Capteur de la station locale :**
```json
"temperature:outTemp": {
    "label": "Température Extérieure",
    "comment": "Température extérieure",
    "currentMap": "outTemp",
    "period": 2592000,
    "groupUsage": "db",
    "groupCustom": " Station",
    "sensorDb": "temperature:outTemp",
    "measurement": "temperature"
}
```

**Capteur Open-Meteo :**
```json
"temperature:open-meteo_outTemp": {
    "label": "Température Extérieure (Open-Meteo)",
    "comment": "Température extérieure (Open-Meteo)",
    "currentMap": "outTemp",
    "period": 2592000,
    "groupUsage": "db",
    "groupCustom": "open-meteo",
    "sensorDb": "temperature:open-meteo_outTemp",
    "measurement": "temperature"
}
```

## Installation

*(Veuillez ajouter ici les étapes pour installer et lancer votre projet.)*

## Utilisation

*(Veuillez décrire ici comment utiliser votre application.)*
