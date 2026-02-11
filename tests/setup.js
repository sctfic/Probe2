// tests/setup.js

// Configuration globale pour les tests
process.env.NODE_ENV = 'test';
process.env.PORT = 3000; // Port identique au serveur réel pour la cohérence

// Mock des services réseau pour éviter les appels réels vers les stations
jest.mock('../services/vp2NetClient', () => ({
    sendCommand: jest.fn().mockImplementation((req, config, cmd) => {
        if (typeof cmd === 'string') {
            if (cmd.startsWith('LAMPS')) return Promise.resolve(Buffer.from("\n\rOK\n\r"));
            if (cmd.startsWith('EEBRD')) return Promise.resolve(Buffer.alloc(100));
            if (cmd === 'WRD') return Promise.resolve(Buffer.alloc(800));
            if (cmd === 'DMPAFT') return Promise.resolve(Buffer.from([0x06]));
            if (cmd.length === 1 && cmd[0] === 0x06) return Promise.resolve(Buffer.alloc(265));
        }
        // Pour DMPAFT (date payload), la station répond avec 4 octets + CRC
        // Les 2 premiers octets = nombre de pages (0 pour nous)
        // Les 2 suivants = index de la première archive
        if (Buffer.isBuffer(cmd) && cmd.length === 6) {
            return Promise.resolve(Buffer.from([0x00, 0x00, 0x00, 0x00]));
        }
        return Promise.resolve(Buffer.from([0x06, 0x01, 0x02, 0x03]));
    }),
    wakeUpConsole: jest.fn().mockResolvedValue(true),
    getOrCreateSocket: jest.fn().mockResolvedValue({}),
    isLockFree: jest.fn().mockReturnValue(true)
}));

jest.mock('../services/networkService', () => ({
    testTCPIP: jest.fn().mockResolvedValue({
        status: 'success',
        message: 'Mock connection successful',
        responseTimeMs: 10
    })
}));

jest.mock('../services/WhisperEyeService', () => ({
    fetchWhisperEyeCurrents: jest.fn().mockResolvedValue({
        dateTime: new Date(),
        temperature: { indoor: 20.5 },
        humidity: { indoor: 45 }
    }),
    fetchWhisperEyeCapacity: jest.fn().mockResolvedValue({
        sensors: [{ Name: 'Temp1', Type: 'Temperature' }]
    }),
    parseWhisperEyeJSON: jest.fn(data => data)
}));

jest.mock('../services/VentiConnectService', () => ({
    fetchVentiConnectInfoAPI: jest.fn().mockResolvedValue({
        dateTime: new Date(),
        temperature: { indoor: 21, fan: 22, collector: 23 },
        humidity: { indoor: 50, fan: 55 },
        fan: { instructions: 40, real: 38, rpm: 1200 }
    }),
    parseVentiConnectJSON: jest.fn(data => data)
}));

jest.mock('../services/cronService', () => ({
    initializeAllJobs: jest.fn(),
    stopAllJobs: jest.fn(),
    scheduledJobs: {}
}));

// Augmenter le timeout global pour InfluxDB si nécessaire
jest.setTimeout(30000);
