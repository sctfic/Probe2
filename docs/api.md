# API Documentation

This document describes the API endpoints and the internal logic for data handling.
## Endpoints Summary

### General API
- `GET /api`: General application information.
- `GET /api/health`: Health check route.
- `POST /api/login`: User login / session opening.
- `POST /api/logout`: User logout / session closing.
- `PUT /api/password`: Change password.
- `GET /api/auth/status`: Authentication status.

### Configuration
- `GET /api/settings`, `PUT /api/settings`: Measurement units configuration.
- `GET /api/influxdb`, `PUT /api/influxdb`: InfluxDB connection settings.
- `GET /api/composite-probes`, `PUT /api/composite-probes`: Composite probes configuration.
- `GET /api/integrator-probes`, `PUT /api/integrator-probes`: Integrator probes configuration.

### Station Management
- `GET /api/stations`: List all configured stations.
- `POST /api/new`: Create a new station configuration.
- `GET /api/station/:stationId`: Get station configuration.
- `PUT /api/station/:stationId`: Update station configuration and sync.
- `DELETE /api/station/:stationId`: Delete station configuration.
- `GET /api/station/:stationId/info`: Short recap of station configs.
- `GET /api/station/:stationId/test`: Test connection to a station.
- `GET /api/station/:stationId/sync-settings`: Synchronize station settings.
- `GET /api/station/:stationId/update-datetime`: Update station date/time.

### Data Collection
- `GET /api/station/:stationId/collect`: Collect archive data since last retrieval.
- `GET /api/station/:stationId/collectAll`: Collect entire archive buffer (512 pages).
- `GET /api/station/:stationId/current-conditions`: Collect current conditions.
- `GET /api/station/:stationId/extenders`: Collect data from extenders.
- `GET /api/station/:stationId/extenders/status`: Availability status of extenders.

### Data Queries
- `GET /query/:stationId`: Metadata, sensor list, unit properties, and DB structure.
- `GET /query/:stationId/Candle/:sensorRef`: Candlestick data for a sensor.
- `GET /query/:stationId/Raw/:sensorRef`: Raw data for a sensor.
- `GET /query/:stationId/Raws/:sensorRefs`: Raw data for multiple sensors.
- `GET /query/:stationId/Range/:sensorRef`: Start and end dates for a sensor.
- `GET /query/:stationId/WindRose`: Wind rose data.
- `GET /query/:stationId/WindVectors/:sensorRef`: Wind vector data.

### Historical & Forecast
- `GET /query/:stationId/dbexpand`: Backfill missing historical data (Open-Meteo).
- `GET /query/:stationId/dbexpand/:moreYears`: Collect extra years of history.
- `GET /query/:stationId/forecast`: Collect and clean up forecast data.

### Miscellaneous
- `POST /api/visit`: Register a visit.
- `GET /api/stats`: Visit statistics.
- `POST /api/update`: Application update (Not functional).

### Parameters
Most data query endpoints accept optional query parameters:
- `startDate`: Start date for the query.
- `endDate`: End date for the query.
- `stepCount`: Number of steps/points to return.

## Data Collection Logic

The application uses several mechanisms to collect data:

### 1. VP2 Archive Collection (`/api/station/:id/collect`)
The system connects to the VP2 station via TCP/IP and requests archive records.
- **Incremental**: Only records newer than the `lastArchiveDate` stored in the station config are fetched.
- **Persistence**: Data is converted and stored in **InfluxDB** with appropriate tags (`station_id`, `sensor`, `source`).

### 2. Current Conditions (`/api/station/:id/current-conditions`)
Fetches the instantaneous data from the station.
- **Calculated Probes**: After fetching raw data, the system computes **Composite Probes** (like THSW index) on the fly using the current raw values.

### 3. External Data (Open-Meteo)
- **Forecasts**: Fetches hourly predictions for the coming days and cleans up expired forecasts.
- **Historical**: Backfills data using Open-Meteo archives (reliable for filling gaps when the station was offline).

## Data Queries Logic (`/query/...`)

Queries are optimized for dynamic visualization:

### 1. Optimal Interval Calculation
When requesting data for a plot (e.g., `Raw` or `Candle`), the system calculates an **optimal interval** based on the requested time range and a `stepCount` (defaulting to 10,000 points). This ensures that charts stay fluid by avoiding the retrieval of millions of redundant data points.

### 2. Sensor Types & Conversions
- **Metric to User Units**: Data is stored in metric units in InfluxDB. The API automatically converts values to the user's preferred units (defined in `Units.json`) before sending the response.
- **Calculated Sensors**: If a query targets a sensor ending in `_calc` or `_trend`, the system retrieves the required raw dependencies and executes the calculation logic before returning the result.

### 3. Visualization Formats
- **Raw**: Linear data points.
- **Candle**: OHLC (Open, High, Low, Close) plus Average and Count for candlestick charts.
- **WindRose/WindVectors**: Specialized vector math for wind direction and speed visualization.
