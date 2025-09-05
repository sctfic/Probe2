// services/networkService.js
const net = require('net');
const { V } = require('../utils/icons');

// Fonction pour une seule tentative de connexion TCP/IP
const attemptTCPIPConnection = (stationConfig) => {
    return new Promise((resolve, reject) => {
        const { host, port } = stationConfig;
        const socket = new net.Socket();
        const timeout = 400;
        const startTime = Date.now();

        socket.setTimeout(timeout);

        socket.on('connect', () => {
            const responseTimeMs = Date.now() - startTime;
            console.log(`${V.network} TCP/IP connection to ${host}:${port} successful in ${responseTimeMs}ms.`);
            socket.destroy();
            resolve({
                status: 'success',
                message: `Connection to ${host}:${port} successful.`,
                responseTimeMs: responseTimeMs
            });
        });

        socket.on('timeout', () => {
            socket.destroy();
            const err = new Error(`Connection to ${host}:${port} timed out.`);
            err.code = 'ETIMEDOUT'; // On ajoute un code d'erreur pour l'identifier
            console.error(`${V.error} TCP/IP connection to ${host}:${port} timed out.`);
            reject(err);
        });

        socket.on('error', (err) => {
            socket.destroy();
            console.error(`${V.error} TCP/IP connection error to ${host}:${port}: ${err.message}`);
            reject(new Error(`Failed to connect to ${host}:${port}: ${err.message}`));
        });

        console.log(`${V.network} Testing TCP/IP connection to ${host}:${port}...`);
        socket.connect(port, host);
    });
};

// Fonction avec la logique de nouvelle tentative (retry)
async function testTCPIP(stationConfig) {
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            const result = await attemptTCPIPConnection(stationConfig);
            return result; // Succès, on sort de la boucle
        } catch (error) {
            attempts++;
            if (error.code === 'ETIMEDOUT' && attempts < maxRetries) {
                console.log(`${V.network} Tentative #${attempts} échouée. Nouvelle tentative...`);
            } else {
                throw error; // Erreur non-timeout ou tentatives épuisées, on rejette l'erreur
            }
        }
    }
}
module.exports = {
    testTCPIP
}