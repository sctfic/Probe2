// config/vp2NetClient.js
const net = require('net');
const path = require('path');

// Charge la configuration de la station VP2
let vp2Config;
try {
    // Le chemin doit être relatif au fichier où require est appelé, donc depuis config/
    vp2Config = require(path.resolve(__dirname, 'VP2.json'))[0];
} catch (error) {
    console.error(`Erreur lors du chargement de config/VP2.json: ${error.message}`);
    process.exit(1);
}

const host = vp2Config.host;
const port = vp2Config.port;

let client = new net.Socket();
let isConnecting = false;
let isConnected = false;
let responseBuffer = Buffer.from([]);
let responsePromiseResolve = null;
let responsePromiseReject = null;

// Gère les données reçues
client.on('data', (data) => {
    responseBuffer = Buffer.concat([responseBuffer, data]);
    if (responsePromiseResolve) {
        // Dans le cadre du protocole Davis, les réponses se terminent souvent par \n\r (0x0A 0x0D)
        // Ou sont des blocs de données de taille fixe (comme LOOP ou GETTIME)
        // Pour les commandes "OK" / ACK, on attend un court instant ou des caractères spécifiques.
        responsePromiseResolve(responseBuffer);
        responsePromiseResolve = null; // Une fois traitée, réinitialiser
        responsePromiseReject = null;
        responseBuffer = Buffer.from([]); // Vider le buffer après traitement
    }
});

client.on('connect', () => {
    console.log(`Connecté à la station VP2 via TCP: ${host}:${port}`);
    isConnected = true;
    isConnecting = false;
});

client.on('close', () => {
    console.log('Connexion TCP fermée à la station VP2.');
    isConnected = false;
    isConnecting = false;
});

client.on('error', (err) => {
    console.error(`Erreur de connexion TCP à la station VP2: ${err.message}`);
    isConnected = false;
    isConnecting = false;
    if (responsePromiseReject) {
        responsePromiseReject(new Error(`Erreur TCP: ${err.message}`));
        responsePromiseResolve = null;
        responsePromiseReject = null;
    }
});

/**
 * Assure que la connexion TCP est établie.
 * @returns {Promise<void>}
 */
async function ensureConnection() {
    if (isConnected) {
        return;
    }
    if (isConnecting) {
        // Attend que la connexion actuelle se termine
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (isConnected) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (!isConnecting) { // Connexion a échoué
                    clearInterval(checkInterval);
                    reject(new Error('Échec de la connexion TCP.'));
                }
            }, 100);
        });
    }

    isConnecting = true;
    return new Promise((resolve, reject) => {
        client.connect(port, host, () => {
            resolve();
        });
        client.once('error', (err) => { // Écoute l'erreur juste pour cette tentative de connexion
            reject(err);
        });
    }).finally(() => {
        isConnecting = false; // Réinitialise après la tentative, qu'elle soit réussie ou non.
    });
}


/**
 * Fonction pour envoyer une commande à la station et attendre une réponse.
 * Gère le réveil de la console si nécessaire.
 * @param {(string|Buffer)} command La commande ASCII à envoyer (sans \n final si string) ou un Buffer binaire.
 * @param {number} timeout Délai d'attente pour la réponse en ms.
 * @returns {Promise<Buffer>} La réponse binaire de la station.
 */
async function sendCommand(command, timeout = 2000) {
    await ensureConnection();

    // Empêche plusieurs commandes d'écrire en même temps
    // Pour un usage plus avancé, utiliser une file d'attente (queue)
    if (responsePromiseResolve) {
        throw new Error('Une commande est déjà en attente de réponse. Veuillez réessayer plus tard.');
    }

    return new Promise((resolve, reject) => {
        responsePromiseResolve = resolve;
        responsePromiseReject = reject;
        let timeoutId;

        const cleanup = () => {
            clearTimeout(timeoutId);
            responsePromiseResolve = null;
            responsePromiseReject = null;
        };

        timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout de réponse pour la commande: ${command.toString().slice(0, 50)}...`));
        }, timeout);

        let dataToSend;
        if (typeof command === 'string') {
            dataToSend = Buffer.from(`${command}\n`);
            console.log(`Sending command (string): ${command}`);
        } else if (Buffer.isBuffer(command)) {
            dataToSend = command;
            console.log(`Sending command (buffer): ${command.toString('hex')}`);
        } else {
            cleanup();
            return reject(new Error('Commande doit être une chaîne ou un Buffer.'));
        }

        client.write(dataToSend, (err) => {
            if (err) {
                cleanup();
                reject(err);
            }
        });
    });
}

/**
 * Fonction pour le réveil de la console.
 * @returns {Promise<void>} Résout si la console est réveillée, rejette sinon.
 */
async function wakeUpConsole() {
    await ensureConnection(); // S'assurer que la connexion TCP est active.

    let attempts = 0;
    const maxAttempts = 3;
    const wakeupTimeout = 1200; // 1.2 seconds

    while (attempts < maxAttempts) {
        console.log(`Tentative de réveil de la console (${attempts + 1}/${maxAttempts})...`);
        try {
            // Envoyer un Line Feed (0x0A)
            const wakeUpBuffer = Buffer.from([0x0A]);
            const response = await sendCommand(wakeUpBuffer, wakeupTimeout); // Attend le \n\r

            // La doc dit: "Listen for a returned response of Line Feed and Carriage Return characters, ('\n\r')"
            if (response.includes(0x0A) && response.includes(0x0D)) {
                console.log('Console réveillée.');
                return; // Console est réveillée
            } else {
                console.warn(`Réponse de réveil inattendue: ${response.toString('hex')}`);
            }
        } catch (error) {
            console.warn(`Échec de la tentative de réveil: ${error.message}`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500)); // Petite pause avant de réessayer
    }
    throw new Error('La console n\'a pas pu être réveillée après 3 tentatives.');
}


// Fonctions pour les lampes, utilisant le nouveau sendCommand
async function toggleLamps(on = false) {
    await wakeUpConsole();
    console.log(`Allumage des lampes... ${on ? 'ON' : 'OFF'}`);
    const response = await sendCommand(`LAMPS ${on ? 1 : 0}`);
    if (response.toString().includes('OK')) {
        console.log(`Lampes ${on ? 'allumées' : 'éteintes'}.`);
    } else {
        console.warn('La station n\'a pas confirmé l\'allumage des lampes. Réponse:', response.toString());
        throw new Error('Échec de l\'allumage des lampes.');
    }
}
module.exports = {
    client, // Expose le client TCP si besoin pour des usages avancés
    sendCommand,
    wakeUpConsole,
    toggleLamps
};