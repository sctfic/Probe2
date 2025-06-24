// config/vp2NetClient.js
const net = require('net');
const path = require('path');
const { calculateCRC } = require('../utils/crc');

// Charge la configuration de la station VP2
let vp2Config;
try {
    vp2Config = require(path.resolve(__dirname, 'VP2.json'))[0]; //
} catch (error) {
    console.error(`Erreur lors du chargement de config/VP2.json: ${error.message}`);
    process.exit(1);
}

const host = vp2Config.host; //
const port = vp2Config.port; //

let client = new net.Socket();
let isConnecting = false;
let isConnected = false;

// Variables pour gérer la réponse en cours pour la dernière commande envoyée
let currentResponseBuffer = Buffer.from([]);
let currentResponsePromiseResolve = null;
let currentResponsePromiseReject = null;
let currentCommandTimeoutId = null;


// Écouteur global pour toutes les données entrantes du socket TCP
client.on('data', (data) => {
    // console.log(`[VP2 Client] Incoming data chunk (${data.toString('hex')})`);

    currentResponseBuffer = Buffer.concat([currentResponseBuffer, data]);

    // Si une promesse est en attente, le listener spécifique à la commande la traitera
    // (Voir la logique de 'responseListener' dans sendCommand).
});

client.on('connect', () => {
    console.log(`[VP2 Client] Connected to station VP2 via TCP: ${host}:${port}`); //
    isConnected = true;
    isConnecting = false;
});

client.on('close', () => {
    console.log('[VP2 Client] Connection TCP closed to station VP2.'); //
    isConnected = false;
    isConnecting = false;
    if (currentResponsePromiseReject) { // Si une promesse est en attente, la rejeter
        clearTimeout(currentCommandTimeoutId);
        currentResponsePromiseReject(new Error('Connexion TCP fermée de manière inattendue.'));
        currentResponsePromiseResolve = null;
        currentResponsePromiseReject = null;
    }
});

client.on('error', (err) => {
    console.error(`[VP2 Client] TCP connection error to station VP2: ${err.message}`); //
    isConnected = false;
    isConnecting = false;
    if (currentResponsePromiseReject) {
        clearTimeout(currentCommandTimeoutId);
        currentResponsePromiseReject(new Error(`Erreur TCP: ${err.message}`));
        currentResponsePromiseResolve = null;
        currentResponsePromiseReject = null;
    }
});

/**
 * Analyse la chaîne de format de réponse pour déterminer la structure attendue.
 * @param {string} formatString La chaîne de format (ex: "<ACK>6<CRC>", "<LF><CR>OK<LF><CR>", "<ACK>").
 * @returns {{segments: Array, totalExpectedLength: number, expectsAck: boolean, expectsCrc: boolean, dataLengthForCrc: number}}
 * @throws {Error} Si le format est invalide ou non supporté.
 */
function parseAnswerFormatString(formatString) {
    const segments = [];
    let totalExpectedLength = 0;
    let expectsAck = false;
    let expectsCrc = false;
    let dataLengthForCrc = 0; // Longueur du segment de données avant CRC

    let tempString = formatString;
    
    while (tempString.length > 0) {
        if (tempString.startsWith('<ACK>')) {
            segments.push({ type: 'ACK', value: 0x06, length: 1 });
            totalExpectedLength += 1;
            expectsAck = true;
            tempString = tempString.substring('<ACK>'.length);
        } else if (tempString.startsWith('<LF><CR>OK<LF><CR>')) { // Specific literal for OK response
            segments.push({ type: 'LITERAL', value: Buffer.from('\n\rOK\n\r'), length: 6 });
            totalExpectedLength += 6;
            tempString = tempString.substring('<LF><CR>OK<LF><CR>'.length);
        } else if (tempString.startsWith('<LF><CR>')) { // General LFCR literal
            segments.push({ type: 'LITERAL', value: Buffer.from('\n\r'), length: 2 });
            totalExpectedLength += 2;
            tempString = tempString.substring('<LF><CR>'.length);
        } else if (tempString.startsWith('<CRC>')) { // CRC token
            segments.push({ type: 'CRC', length: 2 });
            totalExpectedLength += 2;
            expectsCrc = true;
            tempString = tempString.substring('<CRC>'.length);
        } else { // Try to match a DATA segment (a number representing length)
            const dataMatch = tempString.match(/^(\d+)/);
            if (dataMatch) { // If a number is found, it's a DATA segment
                const dataLength = parseInt(dataMatch[1], 10);
                segments.push({ type: 'DATA', length: dataLength });
                totalExpectedLength += dataLength;
                // Only accumulate dataLengthForCrc if CRC is expected later in the format string.
                // This is handled by checking expectsCrc flag in sendCommand.
                // For now, we just add it to the segment. The sum will be done in sendCommand.
                // Or, we can sum it here if we know CRC will always follow DATA.
                // Given the new flexible format, it's better to sum in sendCommand or pass segments.
                // Let's remove dataLengthForCrc from here and calculate it in sendCommand if needed.
                // No, dataLengthForCrc is used for slicing in sendCommand, so it needs to be the sum of all DATA segments.
                dataLengthForCrc += dataLength; // Accumulate for CRC calculation later
                tempString = tempString.substring(dataMatch[0].length);
            } else {
                throw new Error(`Invalid or unsupported answerFormat segment: ${tempString}`);
            }
        }
    }
    return { segments, totalExpectedLength, expectsAck, expectsCrc, dataLengthForCrc };
}

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
                } else if (!isConnecting) { // Connexion a échoué pendant l'attente
                    clearInterval(checkInterval);
                    reject(new Error('Échec de la connexion TCP.'));
                }
            }, 100);
        });
    }

    isConnecting = true;
    return new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
            client.destroy(new Error('Timeout de connexion TCP.')); // Force l'erreur pour le client
            reject(new Error('Timeout de connexion TCP.'));
        }, 5000); // Timeout pour l'établissement de la connexion

        client.connect(port, host, () => {
            clearTimeout(connectTimeout);
            resolve();
        });
        client.once('error', (err) => { // Écoute l'erreur juste pour cette tentative de connexion
            clearTimeout(connectTimeout);
            reject(err);
        });
    }).finally(() => {
        isConnecting = false;
    });
}

/**
 * Fonction pour le réveil de la console.
 * Exécute la procédure de réveil et assure que la console est prête à recevoir les commandes.
 * @returns {Promise<void>} Résout si la console est réveillée, rejette sinon.
 */
async function wakeUpConsole() {
    await ensureConnection(); // S'assurer que la connexion TCP est active avant le réveil

    let attempts = 0;
    const maxAttempts = 3; //
    const wakeupTimeout = 1200; // 1.2 seconds

    while (attempts < maxAttempts) {
        console.log(`[VP2 Client] Attempting console wakeup (${attempts + 1}/${maxAttempts})...`); //
        currentResponseBuffer = Buffer.from([]); // Vider le buffer pour la réponse de réveil
        try {
            const wakeUpBuffer = Buffer.from([0x0A]); // Envoyer un Line Feed (0x0A)
            const response = await new Promise((resolve, reject) => {
                let timeoutId = setTimeout(() => reject(new Error('Wakeup response timeout')), wakeupTimeout);
                
                const onDataTemp = (data) => {
                    currentResponseBuffer = Buffer.concat([currentResponseBuffer, data]);
                    // Vérifie si la réponse de réveil complète (\n\r) a été reçue
                    if (currentResponseBuffer.includes(0x0A) && currentResponseBuffer.includes(0x0D)) { // Attendre \n\r
                        clearTimeout(timeoutId);
                        client.removeListener('data', onDataTemp); // Nettoyer l'écouteur temporaire
                        resolve(currentResponseBuffer);
                    }
                };
                client.on('data', onDataTemp); // Ajout d'un écouteur temporaire pour la réponse de réveil
                
                client.write(wakeUpBuffer, (err) => {
                    if (err) {
                        clearTimeout(timeoutId);
                        client.removeListener('data', onDataTemp);
                        reject(err);
                    }
                });
            });

            if (response.includes(0x0A) && response.includes(0x0D)) { // Vérification de la réponse
                return; // Console est réveillée
            } else {
                console.warn(`[VP2 Client] Unexpected wakeup response (no \\n\\r): ${response.toString('hex')}`); //
            }
        } catch (error) {
            console.warn(`[VP2 Client] Wakeup attempt failed: ${error.message}`); //
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500)); // Petite pause avant de réessayer
    }
    throw new Error('Console could not be woken up after 3 attempts.'); //
}

/**
 * Gère l'envoi brut d'une commande et la réception d'une réponse.
 * @private
 */
function _internalSendAndReceive(command, timeout, parsedFormat) {
    return new Promise((resolve, reject) => {
        if (currentResponsePromiseResolve) {
            return reject(new Error('Une commande est déjà en attente de réponse.'));
        }

        currentResponsePromiseResolve = resolve;
        currentResponsePromiseReject = reject;
        currentResponseBuffer = Buffer.from([]);

        const commandDescription = typeof command === 'string' ? command.trim() : `Binary (${command.length} bytes)`;

        const cleanup = (finalStatus, logMessage, finalData) => {
            clearTimeout(currentCommandTimeoutId);
            client.removeListener('data', responseListener);
            currentResponsePromiseResolve = null;
            currentResponsePromiseReject = null;
            console.log(`[VP2 Client] Command ${command} finished (${finalStatus}). Final buffer: ${finalData ? finalData.toString('hex') : 'empty'}`);
            // console.log(`[VP2 Client] Message: ${logMessage}`);
        };

        currentCommandTimeoutId = setTimeout(() => {
            const errorMessage = `Timeout pour la commande '${commandDescription}'. Données: ${currentResponseBuffer.toString('hex')}`;
            cleanup('TIMEOUT', errorMessage, currentResponseBuffer);
            reject(new Error(errorMessage));
        }, timeout);

        const responseListener = (dataChunk) => {
            // currentResponseBuffer est mis à jour globalement

            // Vérifier la complétude basée sur la longueur totale attendue
            console.log(`[VP2 Client] Response Listener - Buffer length: ${currentResponseBuffer.length}, Expected: ${parsedFormat.totalExpectedLength}`);
            if (currentResponseBuffer.length < parsedFormat.totalExpectedLength) { // [cite: vp2NetClient.js]
                console.log(`[VP2 Client] Response Listener - Not enough data yet. Returning.`);
                return; // Pas assez de données encore
            }

            console.log(`[VP2 Client] Response Listener - Enough data received. Proceeding with validation.`);
            // Si nous arrivons ici, nous avons suffisamment de données. Procéder à la validation des segments.
            let currentOffset = 0;
            const dataSegments = [];
            const crcSegments = [];

            for (const segment of parsedFormat.segments) {
                const segmentData = currentResponseBuffer.slice(currentOffset, currentOffset + segment.length);

                switch (segment.type) {
                    case 'ACK':
                        if (segmentData[0] !== segment.value) {
                            cleanup('VALIDATION_ERROR', `ACK attendu (0x${segment.value.toString(16)}), mais reçu 0x${segmentData[0].toString(16)} à l'offset ${currentOffset}.`, currentResponseBuffer);
                            return reject(new Error(`Octet ACK invalide.`));
                        }
                        break;
                    case 'LITERAL':
                        if (!segmentData.equals(segment.value)) {
                            cleanup('VALIDATION_ERROR', `Littéral attendu (${segment.value.toString('hex')}), mais reçu ${segmentData.toString('hex')} à l'offset ${currentOffset}.`, currentResponseBuffer);
                            return reject(new Error(`Réponse littérale invalide.`));
                        }
                        break;
                    case 'DATA':
                        dataSegments.push(segmentData);
                        break;
                    case 'CRC':
                        // On extrait le CRC pour le passer à sendCommand pour validation.
                        crcSegments.push(segmentData);
                        break;
                }
                currentOffset += segment.length;
            }

            // Si nous arrivons ici, tous les segments sont présents et la validation de base a réussi.
            cleanup('SUCCESS', 'Réponse complète et validée reçue.', currentResponseBuffer);
            // Retourne les segments de données ET les segments CRC concaténés pour validation dans sendCommand.
            resolve(Buffer.concat([...dataSegments, ...crcSegments]));
        };

        client.on('data', responseListener);

        const dataToSend = typeof command === 'string' ? Buffer.from(`${command}\n`) : command;
        client.write(dataToSend, (err) => {
            if (err) {
                cleanup('WRITE_ERROR', `Erreur d'écriture sur le socket: ${err.message}`, null);
                reject(err);
            }
        });
    });
}

/**
 * Envoie une commande, valide la réponse, et réessaye en cas d'échec CRC.
 * @param {(string|Buffer)} command La commande à envoyer.
 * @param {number} timeout Timeout en ms.
 * @param {string} answerFormat Format de réponse attendu (ex: "<ACK>", "<LF><CR>OK<LF><CR>", "<ACK>6<CRC>").
 * @returns {Promise<Buffer>} La charge utile validée de la réponse.
 */
async function sendCommand(command, timeout = 2000, answerFormat = "") {
    let attempts = 0;
    const maxAttempts = 2;
    const commandDescription = typeof command === 'string' ? command.trim() : `Binary (${command.length} bytes)`;
    const parsedFormat = parseAnswerFormatString(answerFormat); // Analyse le format une seule fois

    while (attempts < maxAttempts) {
        attempts++;
        console.log(`[VP2 Client] Sending command (Attempt ${attempts}/${maxAttempts}): '${commandDescription}', Format: ${answerFormat}`);

        try {
            // _internalSendAndReceive retourne maintenant la charge utile directement (ou lève une erreur)
            const payload = await _internalSendAndReceive(command, timeout, parsedFormat);

            // Effectuer la validation CRC si applicable
            if (parsedFormat.expectsCrc) {
                const data = payload.slice(0, parsedFormat.dataLengthForCrc);
                const receivedCrcBytes = payload.slice(parsedFormat.dataLengthForCrc, parsedFormat.dataLengthForCrc + 2);
                const receivedCrc = receivedCrcBytes.readUInt16BE(0);
                const calculatedCrc = calculateCRC(data);
                console.log(`[VP2 Client] CRC, Calculé: 0x${calculatedCrc.toString(16)}, Reçu: 0x${receivedCrc.toString(16)}`);
                if (calculatedCrc !== receivedCrc) {
                    const crcError = new Error(`CRC invalide. Calculé: 0x${calculatedCrc.toString(16)}, Reçu: 0x${receivedCrc.toString(16)}`);
                    crcError.name = 'CRCError';
                    throw crcError;
                }
                return data;
            }
            return payload; // Pour les autres formats, payload est déjà la donnée finale (ex: buffer vide pour ACK, 'OK' pour OK_CRLF)
        } catch (error) {
            if (error.name === 'CRCError' && attempts < maxAttempts) {
                console.warn(`[VP2 Client] Erreur CRC (tentative ${attempts}). Nouvel essai...`);
                await new Promise(resolve => setTimeout(resolve, 200));
            } else {
                console.error(`[VP2 Client] La commande '${commandDescription}' a échoué après ${attempts} tentative(s): ${error.message}`);
                throw error;
            }
        }
    }
    throw new Error('Logique sendCommand: sortie de la boucle de tentatives.');
}

/**
 * Fonction pour allumer ou éteindre les lampes de la console.
 * @param {number} state 1 pour allumer, 0 pour éteindre.
 */
async function toggleLamps(state) {
    // wakeUpConsole() est appelée par performStationOperationWithLamps avant toggleLamps.
    
    console.log(`[VP2 Client] Demande ${state === 1 ? 'd\'allumage' : 'd\'extinction'} des lampes...`);
    try {
        // sendCommand avec expectOkCRLF:true garantit que la réponse est "OK" ou lève une erreur.
        await sendCommand(`LAMPS ${state}`, 2000, "<LF><CR>OK<LF><CR>");
        console.log(`[VP2 Client] Screen ${state === 1 ? 'ON 🔥' : 'OFF 🌋'}`);
    } catch (error) {
        console.error(`[VP2 Client] Erreur lors de la commande LAMPS ${state}:`, error.message);
        throw error;
    }
}


module.exports = {
    client,
    sendCommand,
    wakeUpConsole,
    toggleLamps
};