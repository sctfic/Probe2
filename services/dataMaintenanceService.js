const influxdbService = require('./influxdbService');
const { Point } = require('@influxdata/influxdb-client');

/**
 * Exports data from a specific bucket to a nested JSON structure.
 * @param {string} bucketKey - The bucket key (e.g., 'Stations', 'Forecasts').
 * @returns {Promise<Object>} The nested JSON object.
 */
async function exportDataToJson(bucketKey) {
    const configs = influxdbService.getSettings();
    const bucketConfig = configs[bucketKey];
    const bucketName = bucketConfig ? bucketConfig.bucket : bucketKey;

    // Query all data from the bucket
    const stop = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const fluxQuery = `from(bucket: "${bucketName}")\n|> range(start: 1970-01-01T00:00:00Z, stop: ${stop})`;
    const data = await influxdbService.executeQuery(fluxQuery, bucketKey);

    const nested = {};
    nested[bucketKey] = {};

    for (const row of data) {
        const sId = row.station_id || 'unknown';
        const time = row._time;
        const meas = row._measurement;
        const sens = row.sensor || 'default';
        const field = row._field;
        const value = row._value;

        if (!nested[bucketKey][sId]) nested[bucketKey][sId] = {};
        if (!nested[bucketKey][sId][time]) nested[bucketKey][sId][time] = {};
        if (!nested[bucketKey][sId][time][meas]) nested[bucketKey][sId][time][meas] = {};
        if (!nested[bucketKey][sId][time][meas][sens]) nested[bucketKey][sId][time][meas][sens] = {};

        nested[bucketKey][sId][time][meas][sens][field] = value;
    }

    return nested;
}

/**
 * Imports data from a nested JSON structure into a specific bucket.
 * @param {string} bucketKey - The bucket key.
 * @param {Object} nestedData - The nested JSON data structure.
 * @returns {Promise<number>} Count of points imported.
 */
async function importDataFromJson(bucketKey, nestedData) {
    if (!nestedData || !nestedData[bucketKey]) {
        throw new Error(`Données invalides : clé de bucket '${bucketKey}' manquante au premier niveau.`);
    }

    const bucketData = nestedData[bucketKey];
    const points = [];
    const BATCH_SIZE = 1000;
    let successCount = 0;

    for (const [sId, times] of Object.entries(bucketData)) {
        for (const [time, measurements] of Object.entries(times)) {
            for (const [meas, sensors] of Object.entries(measurements)) {
                for (const [sens, fields] of Object.entries(sensors)) {

                    const point = new Point(meas).timestamp(new Date(time));

                    // Add Fields
                    for (const [field, value] of Object.entries(fields)) {
                        if (typeof value === 'number') {
                            point.floatField(field, value);
                        } else if (typeof value === 'boolean') {
                            point.booleanField(field, value);
                        } else if (value !== undefined && value !== null) {
                            point.stringField(field, value.toString());
                        }
                    }

                    // Add Tags
                    if (sId && sId !== 'unknown') point.tag('station_id', sId);
                    if (sens && sens !== 'default') point.tag('sensor', sens);

                    points.push(point);

                    if (points.length >= BATCH_SIZE) {
                        const result = await influxdbService.writePoints([...points], bucketKey);
                        if (result) successCount += points.length;
                        points.length = 0;
                    }
                }
            }
        }
    }

    if (points.length > 0) {
        const result = await influxdbService.writePoints(points, bucketKey);
        if (result) successCount += points.length;
    }

    return successCount;
}

module.exports = {
    exportDataToJson,
    importDataFromJson
};
