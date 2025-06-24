// /home/alban/www/Probe2/controllers/stationController.test.js

// Mock dependencies before they are imported by the controller
jest.mock('../config/vp2NetClient');
jest.mock('../config/VP2.json', () => ([{
    "Name": "vp2 Serramoune",
    "host": "vp2",
    "port": 22222,
    "longitude": -0.479901,
    "latitude": 43.20758,
    "altitude": 242,
    "timezone": "Europe/Paris",
    "windCupSize": "1-Large",
    "rainCollectorSize": "1-0.2mm",
    "rainSaisonStart": "1-Janvier"
}]), { virtual: true });

const { setStationTime, setStationLocation, setStationTimezone } = require('./stationController');
const { sendCommand, wakeUpConsole, toggleLamps } = require('../config/vp2NetClient');
const { calculateCRC } = require('../utils/crc');

// Helper to create mock Express response objects
const getMockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('stationController', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        // Provide default successful implementations for vp2NetClient functions
        wakeUpConsole.mockResolvedValue();
        toggleLamps.mockResolvedValue();
    });

    describe('setStationTime', () => {
        let req;
        let res;

        beforeEach(() => {
            req = {};
            res = getMockRes();
            // Set a fixed date for predictable results
            jest.useFakeTimers().setSystemTime(new Date('2023-10-27T10:00:00.000Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should update station time if difference is more than 5 seconds', async () => {
            // Arrange: Station time is 2023-10-27 09:58:30 (local), which is > 5s from target
            const stationTimeData = Buffer.from([30, 58, 9, 27, 10, 123]); // s, m, h, D, M, Y-1900
            const stationTimeCrc = calculateCRC(stationTimeData);
            const stationTimeCrcBytes = Buffer.from([(stationTimeCrc >> 8) & 0xFF, stationTimeCrc & 0xFF]);
            const getTimeResponse = Buffer.concat([Buffer.from([0x06]), stationTimeData, stationTimeCrcBytes]);

            sendCommand.mockImplementation(async (command) => {
                if (command === 'GETTIME') return getTimeResponse;
                if (command === 'SETTIME' || command.startsWith('EEBWR') || command === 'NEWSETUP') return Buffer.from([0x06]); // ACK
                if (command.startsWith('EEWR')) return Buffer.from('\n\rOK\n\r');
                if (Buffer.isBuffer(command)) return Buffer.from([0x06]); // ACK for binary payloads
                throw new Error(`Unhandled mock command: ${command}`);
            });

            // Act
            await setStationTime(req, res);

            // Assert
            expect(wakeUpConsole).toHaveBeenCalledTimes(1);
            expect(toggleLamps).toHaveBeenCalledWith(1);
            expect(sendCommand).toHaveBeenCalledWith('GETTIME', 2000, { expectedResponseLength: 9, expectAck: true });
            expect(sendCommand).toHaveBeenCalledWith('SETTIME', 1000, { expectedResponseLength: 1, expectAck: true });
            expect(sendCommand).toHaveBeenCalledWith('NEWSETUP', 2000, { expectedResponseLength: 1, expectAck: true });
            expect(toggleLamps).toHaveBeenCalledWith(0);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'success',
                message: 'Heure et fuseau horaire de la station définis avec succès.',
            }));
        });

        test('should not update station time if difference is less than 5 seconds', async () => {
            // Arrange: Target local time is ~ 2023-10-27 09:58:40. Station time is 2s off.
            const stationTimeData = Buffer.from([38, 58, 9, 27, 10, 123]);
            const stationTimeCrc = calculateCRC(stationTimeData);
            const stationTimeCrcBytes = Buffer.from([(stationTimeCrc >> 8) & 0xFF, stationTimeCrc & 0xFF]);
            const getTimeResponse = Buffer.concat([Buffer.from([0x06]), stationTimeData, stationTimeCrcBytes]);

            sendCommand.mockResolvedValue(getTimeResponse);

            // Act
            await setStationTime(req, res);

            // Assert
            expect(wakeUpConsole).toHaveBeenCalledTimes(1);
            expect(toggleLamps).toHaveBeenCalledWith(1);
            expect(sendCommand).toHaveBeenCalledWith('GETTIME', 2000, { expectedResponseLength: 9, expectAck: true });
            expect(sendCommand).not.toHaveBeenCalledWith('SETTIME', expect.anything(), expect.anything());
            expect(toggleLamps).toHaveBeenCalledWith(0);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'unchanged',
            }));
        });

        test('should return 500 error if GETTIME response has bad CRC', async () => {
            // Arrange
            const stationTimeData = Buffer.from([30, 58, 9, 27, 10, 123]);
            const badCrcBytes = Buffer.from([0x00, 0x00]); // Incorrect CRC
            const getTimeResponse = Buffer.concat([Buffer.from([0x06]), stationTimeData, badCrcBytes]);

            sendCommand.mockResolvedValue(getTimeResponse);

            // Act
            await setStationTime(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: expect.stringContaining('Erreur CRC pour la réponse GETTIME'),
            });
            expect(toggleLamps).toHaveBeenCalledWith(0); // finally block should still run
        });
    });

    describe('setStationLocation', () => {
        let req;
        let res;

        beforeEach(() => {
            res = getMockRes();
        });

        test('should set location and return success', async () => {
            // Arrange
            req = {
                body: { latitude: 43.3, longitude: -0.33, elevation: 100 }
            };

            sendCommand.mockImplementation(async (command) => {
                if (command.startsWith('EEBWR') || Buffer.isBuffer(command) || command === 'NEWSETUP') {
                    return Buffer.from([0x06]); // ACK
                }
                if (command.startsWith('BAR=')) {
                    return Buffer.from('\n\rOK\n\r');
                }
                throw new Error(`Unhandled mock command: ${command}`);
            });

            // Act
            await setStationLocation(req, res);

            // Assert
            expect(wakeUpConsole).toHaveBeenCalledTimes(1);
            expect(toggleLamps).toHaveBeenCalledWith(1);
            expect(sendCommand).toHaveBeenCalledWith('EEBWR 0B 02', 1000, { expectedResponseLength: 1, expectAck: true });
            expect(sendCommand).toHaveBeenCalledWith('EEBWR 0D 02', 1000, { expectedResponseLength: 1, expectAck: true });
            expect(sendCommand).toHaveBeenCalledWith('BAR=0 100', 2000, { expectedResponseLength: 6, expectOkCRLF: true, expectAck: false });
            expect(sendCommand).toHaveBeenCalledWith('NEWSETUP', 2000, { expectedResponseLength: 1, expectAck: true });
            expect(toggleLamps).toHaveBeenCalledWith(0);
            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                message: 'Localisation de la station définie avec succès.'
            });
        });

        test('should return 400 if parameters are missing', async () => {
            // Arrange
            req = { body: { latitude: 43.3 } }; // Missing longitude and elevation

            // Act
            await setStationLocation(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Les paramètres latitude, longitude et elevation sont requis et doivent être des nombres.'
            });
            expect(sendCommand).not.toHaveBeenCalled();
        });

        test('should return 500 if a command fails', async () => {
            // Arrange
            req = {
                body: { latitude: 43.3, longitude: -0.33, elevation: 100 }
            };
            const errorMessage = 'ACK not received';
            sendCommand.mockRejectedValue(new Error(errorMessage));

            // Act
            await setStationLocation(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: errorMessage });
            expect(toggleLamps).toHaveBeenCalledWith(0); // Check finally block
        });
    });

    describe('setStationTimezone', () => {
        let req;
        let res;

        beforeEach(() => {
            res = getMockRes();
        });

        test('should set preset timezone and return success', async () => {
            // Arrange
            req = { body: { type: 'preset', index: 5 } };

            sendCommand.mockImplementation(async (command) => {
                if (command.startsWith('EEWR')) {
                    return Buffer.from('\n\rOK\n\r');
                }
                if (command === 'NEWSETUP') {
                    return Buffer.from([0x06]); // ACK
                }
                throw new Error(`Unhandled mock command: ${command}`);
            });

            // Act
            await setStationTimezone(req, res);

            // Assert
            expect(wakeUpConsole).toHaveBeenCalledTimes(1);
            expect(toggleLamps).toHaveBeenCalledWith(1);
            expect(sendCommand).toHaveBeenCalledWith(`EEWR 11 05`, 2000, { expectedResponseLength: 6, expectOkCRLF: true, expectAck: false });
            expect(sendCommand).toHaveBeenCalledWith(`EEWR 16 00`, 2000, { expectedResponseLength: 6, expectOkCRLF: true, expectAck: false });
            expect(sendCommand).toHaveBeenCalledWith('NEWSETUP', 2000, { expectedResponseLength: 1, expectAck: true });
            expect(toggleLamps).toHaveBeenCalledWith(0);
            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                message: 'Fuseau horaire de la station défini avec succès.'
            });
        });

        test('should set custom timezone and return success', async () => {
            // Arrange
            req = { body: { type: 'custom', offsetGMT: -500 } };

            sendCommand.mockImplementation(async (command) => {
                if (command.startsWith('EEBWR') || Buffer.isBuffer(command) || command === 'NEWSETUP') {
                    return Buffer.from([0x06]); // ACK
                }
                if (command.startsWith('EEWR')) {
                    return Buffer.from('\n\rOK\n\r');
                }
                throw new Error(`Unhandled mock command: ${command}`);
            });

            // Act
            await setStationTimezone(req, res);

            // Assert
            expect(wakeUpConsole).toHaveBeenCalledTimes(1);
            expect(toggleLamps).toHaveBeenCalledWith(1);
            expect(sendCommand).toHaveBeenCalledWith(`EEBWR 14 02`, 1000, { expectedResponseLength: 1, expectAck: true });
            expect(sendCommand).toHaveBeenCalledWith(`EEWR 16 01`, 2000, { expectedResponseLength: 6, expectOkCRLF: true, expectAck: false });
            expect(sendCommand).toHaveBeenCalledWith('NEWSETUP', 2000, { expectedResponseLength: 1, expectAck: true });
            expect(toggleLamps).toHaveBeenCalledWith(0);
            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                message: 'Fuseau horaire de la station défini avec succès.'
            });
        });

        test('should return 400 if parameters are invalid', async () => {
            // Arrange
            req = { body: { type: 'custom' } }; // Missing offsetGMT

            // Act
            await setStationTimezone(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Les paramètres "type" et "index" ou "offsetGMT" sont requis.'
            });
            expect(sendCommand).not.toHaveBeenCalled();
        });

        test('should return 500 if a command fails', async () => {
            // Arrange
            req = { body: { type: 'preset', index: 5 } };
            const errorMessage = 'OK not received';
            sendCommand.mockRejectedValue(new Error(errorMessage));

            // Act
            await setStationTimezone(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: errorMessage });
            expect(toggleLamps).toHaveBeenCalledWith(0);
        });
    });

    describe('getStationSettings', () => {
        let req;
        let res;

        beforeEach(() => {
            req = {};
            res = getMockRes();
            jest.useFakeTimers().setSystemTime(new Date('2023-10-27T10:00:00.000Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should return static and dynamic station settings', async () => {
            // Arrange: Mock GETTIME response for 2023-10-27 10:00:00 UTC
            const stationTimeData = Buffer.from([0, 0, 10, 27, 10, 123]); // s, m, h, D, M, Y-1900
            sendCommand.mockResolvedValueOnce(stationTimeData); // For GETTIME

            // Act
            await setStationSettings(req, res); // Call the correct handler

            // Assert
            expect(wakeUpConsole).toHaveBeenCalledTimes(1);
            expect(toggleLamps).toHaveBeenCalledWith(1);
            expect(sendCommand).toHaveBeenCalledWith('GETTIME', 2000, "<ACK>6<CRC>");
            expect(toggleLamps).toHaveBeenCalledWith(0);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'success',
                message: 'Paramètres de la station récupérés avec succès.',
                settings: expect.objectContaining({
                    name: 'vp2 Serramoune',
                    host: 'vp2', 
                    port: 22222,
                    longitude: -0.479901,
                    latitude: 43.20758,
                    altitude: 242,
                    timezone: 'Europe/Paris',
                    windCupSize: '1-Large',
                    rainCollectorSize: '1-0.2mm',
                    rainSaisonStart: '1-Janvier',
                    currentTime: '2023-10-27T10:00:00.000Z' // Based on mocked GETTIME
                })
            }));
        });

        test('should return 500 if GETTIME command fails', async () => {
            // Arrange
            const errorMessage = 'Failed to get time from station';
            sendCommand.mockRejectedValueOnce(new Error(errorMessage));

            // Act
            await setStationSettings(req, res); // Call the correct handler

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('Failed to get station time') });
            expect(toggleLamps).toHaveBeenCalledWith(0);
        });
    });
});