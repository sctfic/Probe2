# Probe

## Overview

Probe is a professional-grade weather data collection and visualization application **compatible with VP2 stations only**. It is designed to operate **offline on a local network (LAN)**, ensuring total privacy and independence from external services like `www.wunderground.com`.

## Key Features

### 📡 Data Collection
- **VP2 Integration**: Direct communication with Davis Vantage Pro 2 stations.
- **Offline First**: All data is stored locally in an InfluxDB database.
- **High Resolution**: Archive intervals are synchronized with the hardware settings (1 to 60 minutes).

### 📈 Advanced Visualization
- **Dynamic 2D/3D Charts**: High-performance interactive visualizations (Time Series, 3D Spirals).
- **Shareable URLs**: Open any chart in a new tab; the URL contains the full context for easy sharing.
- **Custom Dashboards**: Aggregate data from multiple sensors.

### 🧪 Advanced Probes
- **Composite Probes**: Create new parameters (e.g., THSW, Dew Point) using mathematical functions applied to real sensors.
- **Integrator Probes**: Analyze trends by integrating data over specific time windows.

### 🌍 Historical & Forecasts
- **Backfill to 1940**: Import historical weather data from Open-Meteo archives.
- **Short-term Forecasts**: Enable 2-7 day forecasts tailored to your station's coordinates.

---

## 🛠 Operation & Cron Jobs

The application relies on scheduled tasks (Crons) to maintain up-to-date data. These tasks are configured in each `config/stations/*.json` file.

### 1. Station Collect (Every X minutes)
The primary loop that pulls new archive records from the VP2.
- **Trigger**: Depends on the `collect.value` setting (e.g., every 5 minutes).
- **Action**: Connects to the station, downloads new records, and writes them to InfluxDB.

### 2. Extender Collect
Pulls data from secondary sensors (e.g., WhisperEye, Venti'Connect).
- **Trigger**: Runs concurrently with the main collection loop.

### 3. Historical Backfill (Daily)
Automated synchronization with historical archives.
- **Trigger**: Every day at **23:50:02** (Europe/Paris).
- **Action**: Fills any gaps in the local database using Open-Meteo as a fallback.

### 4. Forecast Sync (Hourly)
- **Trigger**: Every hour at **minute 1 and 02 seconds**.
- **Action**: Updates the forecast database and removes outdated predictions.

---

## 📂 Project Structure

- `docs/`: Technical documentation.
  - [configuration.md](./docs/configuration.md): Guide to all config files and station parameters.
  - [api.md](./docs/api.md): Detailed API reference and data handling logic.
- `config/`: JSON configuration files for stations, probes, and database.
- `public/`: Frontend assets and dynamic plotting logic.
- `services/`: Core logic for networking, crons, and data transformation.

---

## 🚀 Getting Started

### Installation
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Configure your InfluxDB connection in `config/influx.json`.
4. Add your station in `config/stations/YourStation.json`.

### Running the App
- Start the server: `npm start`.
- Access the dashboard at `http://localhost:3000`.
