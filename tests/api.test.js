// tests/api.test.js
const request = require('supertest');
const app = require('../app');

const testStationId = 'VP2_Serramoune';

describe('API Integration Tests (GET routes)', () => {

    test('GET /api/ - Root information', async () => {
        const res = await request(app).get('/api/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({
            success: true,
            message: expect.stringContaining('API Probe'),
            version: expect.any(String),
            endpoints: expect.any(Object),
            stations: expect.any(Array)
        });
    });

    test('GET /api/status - Status check', async () => {
        const res = await request(app).get('/api/status');
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({
            status: 'healthy',
            timestamp: expect.any(String),
            uptime: expect.any(Number),
            system: expect.any(Object),
            stations: expect.any(Array),
            influxdb: expect.any(Object)
        });
    });

    test('GET /api/stations - List of stations', async () => {
        const res = await request(app).get('/api/stations');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.stations)).toBe(true);
        if (res.body.stations.length > 0) {
            expect(res.body.stations[0]).toMatchObject({
                id: expect.any(String),
                name: expect.any(String),
                host: expect.any(String),
                port: expect.any(Number)
            });
        }
    });

    test('GET /api/settings - Units configuration', async () => {
        const res = await request(app).get('/api/settings');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.settings).toBeDefined();
        expect(res.body.settings.temperature).toBeDefined();
        expect(res.body.settings.temperature.available_units).toBeDefined();
    });

    test('GET /api/composite-probes - Composite probes configuration', async () => {
        const res = await request(app).get('/api/composite-probes');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.settings).toBe('object');
    });

    test('GET /api/integrator-probes - Integrator probes configuration', async () => {
        const res = await request(app).get('/api/integrator-probes');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.settings).toBe('object');
    });

    test('GET /api/influxdb - InfluxDB configuration', async () => {
        const res = await request(app).get('/api/influxdb');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.settings).toMatchObject({
            url: expect.any(String),
            org: expect.any(String),
            bucket: expect.any(String)
        });
        // Token should be masked if present
        if (res.body.settings.token) {
            expect(res.body.settings.token).toMatch(/^\*+$/);
        }
    });

    describe('Station Specific Routes (VP2_Serramoune)', () => {

        test(`GET /api/station/${testStationId} - Station configuration`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.settings.id).toBe(testStationId);
        });

        test(`GET /api/station/${testStationId}/info - Detailed station info`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/info`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.stationId).toBe(testStationId);
            expect(res.body.data.stationId).toBe(testStationId);
        });

        test(`GET /api/station/${testStationId}/current-conditions - Live weather data`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/current-conditions`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
        });

        test(`GET /api/station/${testStationId}/collect - Trigger archive collection`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/collect`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test(`GET /api/station/${testStationId}/extenders - Collect data from extenders`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/extenders`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test(`GET /api/station/${testStationId}/extenders/status - Check extenders status`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/extenders/status`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test(`GET /api/station/${testStationId}/collectAll - Full archive collection`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/collectAll`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test(`GET /api/station/${testStationId}/test - TCP connection test`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/test`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test(`GET /api/station/${testStationId}/sync-settings - Sync console settings`, async () => {
            const res = await request(app).get(`/api/station/${testStationId}/sync-settings`);
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});
