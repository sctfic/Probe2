# Configuration Documentation

This document describes the configuration files used by the Probe application.

## `config/dbProbes.json`

`dbProbes.json` defines all sensor probes available in the system. Each entry includes:
- `label`: Human-readable name
- `comment`: Description of the sensor
- `currentMap`: Mapping key for current data
- `period`: Data retention period (seconds) or `null`
- `groupUsage` / `groupCustom`: Logical grouping for UI
- `sensorDb`: Identifier used in the InfluxDB database
- `measurement`: Type of measurement (e.g., `temperature`, `humidity`, `wind`)

The file contains definitions for a wide range of sensors such as temperature, humidity, wind vectors, pressure, rain, UV index, and many custom/extra sensors.

## `config/compositeProbes.json`

Composite probes are calculated sensors that combine multiple raw measurements in real-time.
- `fnCalc`: A JavaScript arrow function used to compute the value. It can access `longitude`, `latitude`, and `altitude` variables.
- `dataNeeded`: List of required raw sensor keys (e.g., `temperature:outTemp`).
- `scriptJS`: Optional external logic (e.g., SunCalc or custom formulas).

## `config/integratorProbes.json`

Integrator probes aggregate sensor data over a time period (e.g., calculating a trend or a rolling average over several days).

## `config/stations/*.json`

Each station has its own configuration file (e.g., `VP2_Serramoune.json`).

### Identity & Connectivity
- `id`: Internal unique ID of the station.
- `name`: Display name.
- `host` & `port`: Network address for the VP2 station (typically via a TCP/IP datalogger).

### Location & Environment
- `latitude`, `longitude`, `altitude`: GPS coordinates and elevation (crucial for calculated sensors like sunset/sunrise).
- `timezone`: Local time zone (e.g., `Europe/Paris`).

### Hardware Settings
- `windCupSize`: 0 for Small, 1 for Large.
- `rainCollectorSize`: 0 for 0.01in, 1 for 0.2mm, 2 for 0.1mm.
- `archiveInterval`: The logging interval configured on the VP2 hardware (e.g., 5 minutes).

### Data Processing Toggles
- `collect`: Enables the local sensor collection cron.
- `forecast`: Enables the Open-Meteo forecast cron.
- `historical`: Enables the Open-Meteo historical backfill cron.
