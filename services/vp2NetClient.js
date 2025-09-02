// services/vp2NetClient.js
const net = require('net');
const fs = require('fs');
const path = require('path');
const { calculateCRC } = require('../utils/crc');
const { O, V } = require('../utils/icons');

const LOCK_DIR = path.resolve(__dirname, '../config');
const LOCK_TIMEOUT_MS = 5000; // 5 secondes
const LOCK_CHECK_RETRIES = 3;
const LOCK_CHECK_INTERVAL_MS = 2000; // 2 secondes

/**
 * Vérifie si un fichier de verrou est expiré
 * @param {string} lockPath Chemin vers le fichier de verrou
 * @returns {boolean} True si le verrou est libre (expiré ou inexistant)
 */
function isLockFree(lockPath) {
    try {
        const stats = fs.statSync(lockPath);
        const age = Date.now() - stats.mtime.getTime();
        return age > LOCK_TIMEOUT_MS;
    } catch (error) {
        // Fichier n'existe pas = verrou libre
        return true;
    }
}

/**
 * Crée ou met à jour le fichier de verrou
 * @param {string} lockPath Chemin vers le fichier de verrou
 */
function touchLockFile(lockPath) {
    const now = new Date();
    try {
        fs.writeFileSync(lockPath, now.toISOString());
        // fs.utimesSync(lockPath, now, now);
    } catch (error) {
        // Si le fichier n'existe pas, le créer
        fs.writeFileSync(lockPath, now.toString());
    }
}

/**
 * Supprime le fichier de verrou
 * @param {string} lockPath Chemin vers le fichier de verrou
 */
function releaseLockFile(lockPath) {
    try {
        fs.unlinkSync(lockPath);
    } catch (error) {
        // Ignore si le fichier n'existe pas déjà
    }
}

/**
 * Tente d'acquérir le verrou avec retry
 * @param {string} stationId ID de la station
 * @returns {Promise<string>} Retourne le chemin du fichier de verrou
 */
async function acquireLock(stationId) {
    const lockPath = path.join(LOCK_DIR, `${stationId}.lock`);
    
    for (let attempt = 1; attempt <= LOCK_CHECK_RETRIES; attempt++) {
        if (isLockFree(lockPath)) {
            touchLockFile(lockPath);
            console.log(`${V.Check} Lock acquired for ${stationId} (attempt ${attempt}/${LOCK_CHECK_RETRIES})`);
            return lockPath;
        }
        
        console.warn(`${V.timeout} Lock busy for ${stationId}, attempt ${attempt}/${LOCK_CHECK_RETRIES}`);
        
        if (attempt < LOCK_CHECK_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, LOCK_CHECK_INTERVAL_MS));
        }
    }
    
    throw new Error(`Cannot acquire lock for ${stationId} after ${LOCK_CHECK_RETRIES} attempts`);
}

/**
 * Crée un nouveau socket pour une station
 * @param {object} stationConfig Configuration de la station
 * @param {string} lockPath Chemin du fichier de verrou
 * @returns {Promise<net.Socket>} Socket connecté
 */
async function createSocket(stationConfig, lockPath) {
    const key = `${stationConfig.host}:${stationConfig.port}`;
    console.log(`${V.satellite} Creating new socket for ${key}`);
    
    const socket = new net.Socket();
    socket.setTimeout(10000);
    socket.setKeepAlive(true, 30000);
    
    // // Override de la méthode write pour toucher le verrou automatiquement
    // const originalWrite = socket.write.bind(socket);
    // socket.write = function(data, encoding, callback) {
    //     console.log(`${O.white} Writing to ${lockPath}`);
    //     touchLockFile(lockPath);
    //     return originalWrite(data, encoding, callback);
    // };
    
    // Stockage du lockPath dans le socket pour libération ultérieure
    socket._lockPath = lockPath;
    socket._stationId = stationConfig.id;
    
    socket.on('close', (hadError) => {
        console.log(`${V.BlackFlag} Socket closed for ${key} (hadError: ${hadError})`);
        releaseLockFile(lockPath);
    });
    
    socket.on('error', (err) => {
        console.error(`${V.error} Socket error for ${key}: ${err.message}`);
        releaseLockFile(lockPath);
    });
    
    socket.on('timeout', () => {
        console.warn(`${V.timeout} Socket timeout for ${key}`);
        socket.destroy();
    });
    
    // Connexion avec timeout
    return new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
            socket.destroy();
            reject(new Error(`Connection timeout to ${key}`));
        }, 5000);
        
        socket.connect(stationConfig.port, stationConfig.host, () => {
            clearTimeout(connectTimeout);
            // console.log(`${V.connect} Connected to ${key}`);
            resolve(socket);
        });
        
        socket.once('error', (err) => {
            clearTimeout(connectTimeout);
            reject(err);
        });
    });
}

/**
 * Récupère ou crée un socket stocké dans la requête
 * @param {object} req Objet de requête Express
 * @param {object} stationConfig Configuration de la station
 * @returns {Promise<net.Socket>} Socket connecté
 */
async function getOrCreateSocket(req, stationConfig) {
    // Vérifier si on a déjà un socket valide dans cette requête
    if (req.weatherSocket && 
        !req.weatherSocket.destroyed && 
        req.weatherSocket.readyState === 'open' &&
        req.weatherSocket._stationId === stationConfig.id) {
        
        // console.log(`${V.connect} Reusing socket for ${stationConfig.id} in this request`);
        // Toucher le verrou pour le maintenir actif
        // if (req.weatherSocket._lockPath) {
            touchLockFile(req.weatherSocket._lockPath);
        // }
        return req.weatherSocket;
    }
    
    // Nettoyer l'ancien socket s'il existe
    if (req.weatherSocket && !req.weatherSocket.destroyed) {
        console.log(`${V.warning} Cleaning up old socket for ${stationConfig.id}`);
        req.weatherSocket.destroy();
    } else {
        // console.log(`${V.Check} No old socket found for ${stationConfig.id}`, V.Check);
    }
    
    // Acquérir le verrou et créer un nouveau socket
    const lockPath = await acquireLock(stationConfig.id);
    
    try {
        const socket = await createSocket(stationConfig, lockPath);
        req.weatherSocket = socket; // Stocker dans la requête
    } catch (error) {
        releaseLockFile(lockPath);
        throw error;
    }
}

/**
 * Parse le format de réponse attendu
 */
function parseAnswerFormatString(formatString) {
    const segments = [];
    let totalExpectedLength = 0;
    let expectsAck = false;
    let expectsCrc = false;
    let dataLengthForCrc = 0;

    let tempString = formatString;
    
    while (tempString.length > 0) {
        if (tempString.startsWith('<ACK>')) {
            segments.push({ type: 'ACK', value: 0x06, length: 1 });
            totalExpectedLength += 1;
            expectsAck = true;
            tempString = tempString.substring('<ACK>'.length);
        } else if (tempString.startsWith('<LF><CR>OK<LF><CR>')) {
            segments.push({ type: 'LITERAL', value: Buffer.from('\n\rOK\n\r'), length: 6 });
            totalExpectedLength += 6;
            tempString = tempString.substring('<LF><CR>OK<LF><CR>'.length);
        } else if (tempString.startsWith('<LF><CR>')) {
            segments.push({ type: 'LITERAL', value: Buffer.from('\n\r'), length: 2 });
            totalExpectedLength += 2;
            tempString = tempString.substring('<LF><CR>'.length);
        } else if (tempString.startsWith('<CRC>')) {
            segments.push({ type: 'CRC', length: 2 });
            totalExpectedLength += 2;
            expectsCrc = true;
            tempString = tempString.substring('<CRC>'.length);
        } else {
            const dataMatch = tempString.match(/^(\d+)/);
            if (dataMatch) {
                const dataLength = parseInt(dataMatch[1], 10);
                segments.push({ type: 'DATA', length: dataLength });
                totalExpectedLength += dataLength;
                dataLengthForCrc += dataLength;
                tempString = tempString.substring(dataMatch[0].length);
            } else {
                throw new Error(`Invalid or unsupported answerFormat segment: ${tempString}`);
            }
        }
    }
    return { segments, totalExpectedLength, expectsAck, expectsCrc, dataLengthForCrc };
}

/**
 * Envoie une commande et attend la réponse
 * @param {net.Socket} socket Socket connecté
 * @param {string|Buffer} command Commande à envoyer
 * @param {number} timeout Timeout en ms
 * @param {object} parsedFormat Format de réponse parsé
 * @returns {Promise<Buffer>} Réponse reçue
 */
function sendAndReceive(weatherSocket, command, timeout, parsedFormat) {
    return new Promise((resolve, reject) => {
        // Vérifier que le socket est toujours valide
        if (weatherSocket.destroyed || weatherSocket.readyState !== 'open') {
            return reject(new Error('Socket is not connected'));
        }
        
        let responseBuffer = Buffer.from([]);
        let timeoutId;
        let dataHandler;
        
        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (dataHandler) weatherSocket.removeListener('data', dataHandler);
        };
        
        dataHandler = (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);
            
            if (responseBuffer.length < parsedFormat.totalExpectedLength) {
                return; // Pas assez de données
            }
            
            // Valider la réponse
            let currentOffset = 0;
            const dataSegments = [];
            const crcSegments = [];
            
            try {
                for (const segment of parsedFormat.segments) {
                    const segmentData = responseBuffer.slice(currentOffset, currentOffset + segment.length);
                    
                    switch (segment.type) {
                        case 'ACK':
                            if (segmentData[0] !== segment.value) {
                                throw new Error(`Invalid ACK byte: expected 0x${segment.value.toString(16)}, got 0x${segmentData[0].toString(16)}`);
                            }
                            break;
                        case 'LITERAL':
                            if (!segmentData.equals(segment.value)) {
                                throw new Error(`Invalid literal response`);
                            }
                            break;
                        case 'DATA':
                            dataSegments.push(segmentData);
                            break;
                        case 'CRC':
                            crcSegments.push(segmentData);
                            break;
                    }
                    currentOffset += segment.length;
                }
                
                cleanup();
                resolve(Buffer.concat([...dataSegments, ...crcSegments]));
            } catch (error) {
                cleanup();
                reject(error);
            }
        };
        
        timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Command timeout: ${responseBuffer.toString('hex')}`));
        }, timeout);
        
        weatherSocket.on('data', dataHandler);
        
        const dataToSend = typeof command === 'string' ? Buffer.from(`${command}\n`) : command;
        weatherSocket.write(dataToSend, (err) => {
            if (err) {
                cleanup();
                reject(err);
            }
        });
        touchLockFile(weatherSocket._lockPath);
    });
}

/**
 * Fonction principale pour envoyer une commande
 * @param {object} req Objet de requête Express (pour stocker le socket)
 * @param {object} stationConfig Configuration de la station
 * @param {string|Buffer} command Commande à envoyer
 * @param {number} timeout Timeout en ms
 * @param {string} answerFormat Format de réponse attendu
 * @returns {Promise<Buffer>} Données de réponse
 */
async function sendCommand(req, stationConfig, command, timeout = 2000, answerFormat = "") {
    const parsedFormat = parseAnswerFormatString(answerFormat);
    let commandDescription;
    const commandText = command.toString()
            .replace(/\r/g, '<CR>') // Retour chariot, decimal 13, hex \x0D
            .replace(/\n/g, '<LF>') // Retour ligne, decimal 10, hex \x0A
            .replace(/\x06/g, '<ACK>') // ACK, decimal 6, hex \x06
            .replace(/\x21/g, '<NAK>') // NAK, decimal 33, hex \x21
            .replace(/\x18/g, '<CANCEL>') // CANCEL, decimal 24, hex \x18
            .replace(/\x1B/g, '<ESC>') // ESC, decimal 27, hex \x1B
    if (typeof command === 'string') {
        // command = command // ne fonctionne pas mour ACK
        //     .replace('<CR>', '\r')
        //     .replace('<LF>', '\n')
        //     .replace('<ACK>', '\x06')
        //     .replace('<NAK>', '\x15')
        //     .replace('<CANCEL>', '\x18')
        //     .replace('<ESC>', '\x1B');
        commandDescription = command.trim();
    } else {
        commandDescription = `Binary (${command.length} bytes)`;
    }
    let attempts = 0;
    const maxAttempts = 2;
    
    while (attempts < maxAttempts) {
        attempts++;
        console.log(`${V.send} Sending to ${stationConfig.id} [${stationConfig.host}:${stationConfig.port}] (${attempts}/${maxAttempts}): '${commandText}', AnswerFormat: ${answerFormat}`);
        
        try {
            await getOrCreateSocket(req, stationConfig);
            await new Promise(resolve => setTimeout(resolve, 200)); // Petite pause
            
            const payload = await sendAndReceive(req.weatherSocket, command, timeout, parsedFormat);
            
            console.log(`${V.receive} Received from ${stationConfig.id} [${stationConfig.host}:${stationConfig.port}]: data(${payload.toString('hex').length < 20 ? payload.toString('hex') : payload.toString('hex').slice(0, 20) + '... (' + payload.length + ' bytes)' })`);

            if (parsedFormat.expectsCrc) {
                const data = payload.slice(0, parsedFormat.dataLengthForCrc);
                const receivedCrcBytes = payload.slice(parsedFormat.dataLengthForCrc, parsedFormat.dataLengthForCrc + 2);
                const receivedCrc = receivedCrcBytes.readUInt16BE(0);
                const calculatedCrc = calculateCRC(data);
                
                if (calculatedCrc !== receivedCrc) {
                    const crcError = new Error(`Invalid CRC. Calculated: 0x${calculatedCrc.toString(16)}, Received: 0x${receivedCrc.toString(16)}`);
                    crcError.name = 'CRCError';
                    throw crcError;
                }
                return data;
            }
            
            return payload;
        } catch (error) {
            if (error.name === 'CRCError' && attempts < maxAttempts) {
                console.warn(`${V.Radioactive} CRC error for ${stationConfig.id} (attempt ${attempts}). Retrying...`);
            } else {
                console.error(`${O.red} Command '${commandDescription}' failed for ${stationConfig.id} after ${attempts} attempt(s): ${error.message}`);
                throw error;
            }
        }
    }
    
    throw new Error('Logic error: exited retry loop');
}

/**
 * Réveille la console avec gestion du verrou intégrée
 * @param {object} req Objet de requête Express
 * @param {object} stationConfig Configuration de la station
 * @param {boolean|null} screen true=allumer écran, false=éteindre, null=juste réveil
 */
async function wakeUpConsole(req, stationConfig, screen = null) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        attempts++;
        
        try {
            const ESC_LF = Buffer.from([0x1B, 0x0A]);
            
            const response = await sendCommand(req, stationConfig, ESC_LF, 2000, "2");
            
            if (response.toString('hex') === '0a0d') {
                if (screen === true) {
                    await sendCommand(req, stationConfig, `LAMPS 1`, 2000, "<LF><CR>OK<LF><CR>");
                    console.log(`${O.yellow} ${stationConfig.id} - Screen ON`);
                } else if (screen === false) {
                    await sendCommand(req, stationConfig, `LAMPS 0`, 2000, "<LF><CR>OK<LF><CR>");
                    console.log(`${O.black} ${stationConfig.id} - Screen OFF`);
                } else {
                    console.log(`${O.purple} ${stationConfig.id} - WakeUp!`);
                }
                return;
            } else {
                console.warn(`${V.sleep} Unexpected wakeup response: ${response.toString('hex')}`);
            }
        } catch (error) {
            console.error(`${V.error} Wakeup attempt failed: ${error.message}, attempt ${attempts}/${maxAttempts}`);
        }
        
        if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    throw new Error(`Failed to wake up console after ${maxAttempts} attempts`);
}

// Fonctions compatibles avec l'ancien système (pour la transition)
// async function acquireConnectionLock(stationConfig, maxRetries = 10, retryDelay = 2000, operationType = 'default') {
//     // Cette fonction est maintenant intégrée dans getOrCreateSocket
//     console.log(`${O.orange} Lock will be acquired automatically when needed for ${stationConfig.id}`);
// }

// function releaseConnectionLock(stationConfig) {
//     console.log(`${O.blue} Socket will be automatically closed at end of request for ${stationConfig.id}`);
// }

// function hasConnectionLock(stationConfig) {
//     const lockPath = path.join(LOCK_DIR, `${stationConfig.id}.lock`);
//     return !isLockFree(lockPath);
// }

module.exports = {
    sendCommand,
    wakeUpConsole,
    getOrCreateSocket
};