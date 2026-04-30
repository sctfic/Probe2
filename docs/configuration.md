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

Each station has its own configuration file (e.g., `VP2_Serramoune.json`). The application synchronizes some of these parameters directly with the VP2's internal EEPROM, which is why many hardware settings are objects containing a `desired` and `lastReadValue`.

### Identity & Connectivity
- `id`: Internal unique ID of the station (e.g., `"VP2_Serramoune"`).
- `name`: Display name on the UI.
- `comment`: Station description.
- `host` & `port`: Network address for the VP2 station on the LAN (typically via a TCP/IP datalogger, e.g., `"vp2.lan"` and `22222`).

### Location & Environment
- `location`: Textual address/location (e.g., `"Lasseube, FR"`).
- `latitude`, `longitude`, `altitude`: GPS coordinates and elevation (crucial for calculated sensors like sunset/sunrise and Open-Meteo matching). Stored as objects: `{ desired: X, lastReadValue: Y }`.
- `timezone`: Local time zone. Includes `value` (e.g., `"Europe/Paris"`) and `method` (e.g., `"GPS"`).

### VP2 Hardware Settings (EEPROM Synced)
These parameters mirror the console's internal settings. They are stored as `{ comment, desired, lastReadValue }`:
- `AMPMMode`: `0` for AM/PM, `1` for 24h format.
- `dateFormat`: `0` for Month/Day, `1` for Day/Month.
- `windCupSize`: `0` for Small, `1` for Large cups.
- `rainCollectorSize`: `0` for 0.01in, `1` for 0.2mm, `2` for 0.1mm.
- `rainSaisonStart`: Month number for the yearly rain reset.
- `latitudeNorthSouth`: `0` for South, `1` for North.
- `longitudeEastWest`: `0` for East, `1` for West.
- `archiveInterval`: The logging interval configured on the VP2 hardware in minutes (e.g., `5`).

### Cron & Data Processing Modules
These objects manage the background tasks. They contain an `enabled` flag, a `comment`, and automatically record their `lastRun` date and a status `msg`.
- **`collect`**: Controls the local data collection from the VP2 and extenders.
  - `value`: Polling frequency in minutes.
- **`forecast`**: Controls the Open-Meteo forecast synchronization.
  - `model`: Which weather model to use (e.g., `"best_match"`).
- **`historical`**: Controls the Open-Meteo historical backfill.
  - `since`: The start year for the backfill operation (e.g., `1970`).

### System State & Extenders
- `deltaTimeSeconds`: Evaluated clock drift between the server and the VP2 internal clock.
- `extenders`: Configuration arrays for secondary LAN sensors (e.g., `WhisperEye`, `Venti'Connect`).
- `lastArchiveDate`: The timestamp of the last successful archive downloaded from the station.
