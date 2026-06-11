// tests/extenders_add.test.js
const request = require('supertest');

jest.mock('../middleware/authMiddleware', () => ({
    isAuthenticated: (req, res, next) => {
        next();
    }
}));

const app = require('../app');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const WhisperEyeService = require('../services/WhisperEyeService');

jest.mock('axios');

const testStationId = 'VP2_Serramoune';
const configDir = path.resolve(__dirname, '../config/stations');
const originalConfigPath = path.join(configDir, `${testStationId}.json`);
let originalConfigContent = '';

beforeAll(() => {
    // Save original config content to restore later
    if (fs.existsSync(originalConfigPath)) {
        originalConfigContent = fs.readFileSync(originalConfigPath, 'utf8');
    }
});

afterEach(() => {
    // Restore original config content after each test
    if (originalConfigContent) {
        fs.writeFileSync(originalConfigPath, originalConfigContent, 'utf8');
    }
    jest.clearAllMocks();
});

describe('POST /api/station/:stationId/extenders', () => {
    test('successfully adds a new WhisperEye extender', async () => {
        // Mock WhisperEye /api/config POST response (TOTP key setup)
        axios.post.mockResolvedValue({ status: 200, data: 'OK' });

        // Mock WhisperEye capacity mock
        WhisperEyeService.fetchWhisperEyeCapacity.mockResolvedValue({
            mac: '11:22:33:44:55:66',
            name: 'Test WhisperEye Extender',
            description: 'My custom description',
            sensors: [
                { Name: 'sht45_temp', description: 'SHT45 Temperature', Type: 'Temperature' },
                { Name: 'sht45_hum', description: 'SHT45 Humidity', Type: 'Humidity' }
            ],
            actuators: [
                { Name: 'rla', description: 'Relais A', Type: 'tout ou rien', range: 'bool:0 1' }
            ]
        });

        const newExtenderPayload = {
            type: 'WhisperEye',
            host: '192.168.1.100'
        };

        const res = await request(app)
            .post(`/api/station/${testStationId}/extenders`)
            .send(newExtenderPayload);

        // Assert response
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.settings).toBeDefined();

        // Verify JSON file was updated
        const updatedConfig = JSON.parse(fs.readFileSync(originalConfigPath, 'utf8'));
        expect(updatedConfig.extenders).toBeDefined();
        expect(updatedConfig.extenders.WhisperEye).toBeDefined();

        const addedExt = updatedConfig.extenders.WhisperEye.find(ext => ext.mac === '11:22:33:44:55:66');
        expect(addedExt).toBeDefined();
        expect(addedExt.name.startsWith('Test WhisperEye')).toBe(true);
        expect(addedExt.host).toBe('192.168.1.100');
        expect(addedExt.description).toBe('My custom description');
        expect(addedExt.apiKey).toHaveLength(64); // 64-character hex key (32 bytes)
        expect(addedExt.available).toBe(true);
        expect(addedExt.sensors).toHaveLength(2);
        expect(addedExt.actuators).toHaveLength(1);

        // Verify axios requests
        expect(axios.post).toHaveBeenCalledWith(
            'http://192.168.1.100/api/config',
            expect.objectContaining({
                totp_secret: addedExt.apiKey,
                apply_only: true
            }),
            expect.any(Object)
        );
    });

    test('fails if required parameters are missing', async () => {
        const res = await request(app)
            .post(`/api/station/${testStationId}/extenders`)
            .send({
                // missing type
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("Le type d'extendeur est requis.");
    });

    test('fails if WhisperEye is unreachable', async () => {
        // Mock capacity GET to succeed
        WhisperEyeService.fetchWhisperEyeCapacity.mockResolvedValue({
            mac: '77:88:99:AA:BB:CC',
            name: 'Unreachable Extender',
            description: 'Unreachable'
        });

        // Mock POST config to fail (unreachable)
        axios.post.mockRejectedValue(new Error('Network Error / Timeout'));

        const res = await request(app)
            .post(`/api/station/${testStationId}/extenders`)
            .send({
                type: 'WhisperEye',
                host: '192.168.1.199'
            });

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("Échec de la négociation TOTP");
    });
});

describe('DELETE /api/station/:stationId/extenders/:mac', () => {
    let mockDateNow;

    beforeEach(() => {
        mockDateNow = jest.spyOn(Date, 'now').mockImplementation(() => 1700000000 * 1000);
    });

    afterEach(() => {
        if (mockDateNow) {
            mockDateNow.mockRestore();
        }
    });

    test('supprime avec succès un extendeur de la configuration et envoie la commande clear-totp au WhisperEye', async () => {
        // Préparer une configuration avec un extendeur existant
        const config = JSON.parse(fs.readFileSync(originalConfigPath, 'utf8'));
        const testMac = '22:33:44:55:66:77';
        const testApiKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
        config.extenders = {
            WhisperEye: [
                {
                    mac: testMac,
                    name: 'Extender A Supprimer',
                    description: 'A supprimer',
                    host: '192.168.1.150',
                    apiKey: testApiKey,
                    available: true,
                    sensors: [],
                    actuators: []
                }
            ]
        };
        fs.writeFileSync(originalConfigPath, JSON.stringify(config, null, 4), 'utf8');

        // Mock axios POST /api/clear-totp
        axios.post.mockResolvedValue({ status: 200, data: 'OK' });

        const res = await request(app)
            .delete(`/api/station/${testStationId}/extenders/${testMac}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.settings).toBeDefined();

        // Vérifier qu'il est retiré de la configuration
        const updatedConfig = JSON.parse(fs.readFileSync(originalConfigPath, 'utf8'));
        const found = updatedConfig.extenders.WhisperEye.find(ext => ext.mac === testMac);
        expect(found).toBeUndefined();

        // Vérifier l'appel axios
        expect(axios.post).toHaveBeenCalledWith(
            'http://192.168.1.150/api/clear-totp',
            { token: testApiKey },
            expect.any(Object)
        );
    });

    test('supprime quand même de la configuration locale si le WhisperEye est hors ligne', async () => {
        // Préparer une configuration avec un extendeur existant
        const config = JSON.parse(fs.readFileSync(originalConfigPath, 'utf8'));
        const testMac = '22:33:44:55:66:77';
        const testApiKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
        config.extenders = {
            WhisperEye: [
                {
                    mac: testMac,
                    name: 'Extender Hors Ligne',
                    description: 'Hors ligne',
                    host: '192.168.1.150',
                    apiKey: testApiKey,
                    available: true,
                    sensors: [],
                    actuators: []
                }
            ]
        };
        fs.writeFileSync(originalConfigPath, JSON.stringify(config, null, 4), 'utf8');

        // Mock axios POST /api/clear-totp pour échouer (hors ligne)
        axios.post.mockRejectedValue(new Error('Network Error / Timeout'));

        const res = await request(app)
            .delete(`/api/station/${testStationId}/extenders/${testMac}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        // Vérifier qu'il est bien retiré malgré l'erreur réseau
        const updatedConfig = JSON.parse(fs.readFileSync(originalConfigPath, 'utf8'));
        const found = updatedConfig.extenders.WhisperEye.find(ext => ext.mac === testMac);
        expect(found).toBeUndefined();
    });
});
