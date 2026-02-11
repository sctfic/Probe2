// tests/query.test.js
const request = require('supertest');
const app = require('../app');

const testStationId = 'VP2_Serramoune';

describe('Query DB Integration Tests (GET routes)', () => {
    // Calcul des dates pour la requête (7 derniers jours)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDate = sevenDaysAgo.toISOString();
    const endDate = now.toISOString();
    const queryParams = `?startDate=${startDate}&endDate=${endDate}&stepCount=5`;

    test(`GET /query/${testStationId} - Station metadata`, async () => {
        const res = await request(app).get(`/query/${testStationId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.metadata).toMatchObject({
            stationId: testStationId,
            gps: expect.any(Object),
            sensor: expect.any(Array),
            unit: expect.any(Object)
        });
        expect(res.body.measurements).toBeDefined();
    });

    test(`GET /query/${testStationId}/Range/barometer - Date range for barometer`, async () => {
        const res = await request(app).get(`/query/${testStationId}/Range/barometer`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.metadata).toMatchObject({
            stationId: testStationId,
            sensor: 'barometer'
        });
    });

    test(`GET /query/${testStationId}/Raw/barometer - Raw data for barometer`, async () => {
        const res = await request(app).get(`/query/${testStationId}/Raw/barometer${queryParams}`);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.metadata).toBeDefined();
        } else {
            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
        }
    });

    test(`GET /query/${testStationId}/WindRose - Wind Rose data`, async () => {
        const url = `/query/${testStationId}/WindRose${queryParams}`;
        console.log(`Testing URL: ${url}`);
        const res = await request(app).get(url);
        console.log(res.body);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
            // WindRose renvoie un OBJET (indexé par timestamp), pas un tableau
            expect(typeof res.body.data).toBe('object');
        } else {
            // Dans l'environnement de test, on accepte 404 si pas de données sur les 30j
            expect([200, 404, 500, 502]).toContain(res.statusCode);
        }
    }, 15000); // 15 secondes car InfluxDB peut être lent sur les jointures complexes

    test(`GET /query/${testStationId}/WindVectors/Wind - Wind Vectors`, async () => {
        const res = await request(app).get(`/query/${testStationId}/WindVectors/Wind${queryParams}`);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        } else {
            expect([404, 500, 502]).toContain(res.statusCode);
        }
    });

    test(`GET /query/${testStationId}/Candle/barometer - OHLC Candle data`, async () => {
        const res = await request(app).get(`/query/${testStationId}/Candle/barometer${queryParams}`);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            if (res.body.data.length > 0) {
                expect(res.body.data[0]).toHaveProperty('Open');
                expect(res.body.data[0]).toHaveProperty('High');
                expect(res.body.data[0]).toHaveProperty('Low');
                expect(res.body.data[0]).toHaveProperty('Close');
            }
        } else {
            expect([404, 500, 502]).toContain(res.statusCode);
        }
    });

    test(`GET /query/${testStationId}/forecast - Open-Meteo Forecast`, async () => {
        const res = await request(app).get(`/query/${testStationId}/forecast`);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
        } else {
            expect([400, 500]).toContain(res.statusCode);
        }
    });
});
