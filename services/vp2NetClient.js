// config/vp2NetClient.js
const net = require('net');
const path = require('path');
const { calculateCRC } = require('../utils/crc');
const connectionPool = {};
const { O, V } = require('../utils/icons');
const configManager = require('./configManager');

/**
 * Vérifie si nous possédons actuellement le verrou SANS créer de connexion
 * @param {object} stationConfig Configuration de la station
 * @param {object} [freshConfig] Configuration déjà chargée pour éviter une lecture redondante
 * @returns {boolean} True si nous possédons le verrou
 */
function hasConnectionLock(stationConfig, freshConfig) {
    const configToCheck = freshConfig || configManager.loadConfig(stationConfig.id);
    return configToCheck.connectionInUse && configToCheck.lockOwner === process.pid;
}

/**
 * Acquiert un verrou pour une station donnée avec retry
 * IMPORTANT: Ne crée AUCUNE connexion TCP avant d'avoir acquis le verrou
 * @param {object} stationConfig Configuration de la station
 * @param {number} maxRetries Nombre maximum de tentatives
 * @param {number} retryDelay Délai entre les tentatives en ms
 * @param {string} operationType Type d'opération (pour déterminer les timeouts)
 * @returns {Promise<void>} Résout quand le verrou est acquis
 */
async function acquireConnectionLock(stationConfig, maxRetries = 5, retryDelay = 1000, operationType = 'default') {
    let attempts = 0;

    // Déterminer les timeouts selon le type d'opération
    const timeouts = {
        'default': 15000,      // 15 secondes
        'archive': 1800000,    // 30 minutes pour les archives (peut être très long)
        'sync': 60000,         // 1 minute pour la synchronisation
        'collect': 20000       // 20 secondes pour la collecte
    };

    const lockTimeout = timeouts[operationType] || timeouts['default'];

    while (attempts < maxRetries) {
        const now = new Date();
        
        // IMPORTANT: Recharger la configuration depuis le fichier pour avoir les dernières valeurs
        const freshConfig = configManager.loadConfig(stationConfig.id);
        
        if (!freshConfig.connectionInUse) {
            // Connexion libre, on peut acquérir le verrou
            stationConfig.lastTcpConnection = now;
            stationConfig.connectionInUse = true;
            stationConfig.operationType = operationType;
            stationConfig.lockTimeout = lockTimeout;
            stationConfig.lockOwner = process.pid; // Identifier le processus propriétaire
            configManager.autoSaveConfig(stationConfig);
            console.log(`${O.orange} Connection lock acquired for ${stationConfig.id} (operation: ${operationType}, timeout: ${Math.round(lockTimeout/1000)}s, pid: ${process.pid})`);
            return;
        }
        
        // Connexion occupée, vérifier si elle a expiré
        const lastConnectionTime = new Date(freshConfig.lastTcpConnection).getTime();
        const timeSinceLastConnection = now.getTime() - lastConnectionTime;
        const currentLockTimeout = freshConfig.lockTimeout || timeouts['default'];
        const isLockExpired = timeSinceLastConnection > currentLockTimeout;
        
        if (isLockExpired) {
            console.warn(`${V.timeout} Connection lock expired for ${stationConfig.id} (${freshConfig.operationType || 'unknown'} operation locked for ${Math.round(timeSinceLastConnection/1000)}s, max was: ${Math.round(currentLockTimeout/1000)}s)`);
            
            // Nettoyer l'ancien état de connexion avant de forcer l'acquisition
            const key = `${stationConfig.host}:${stationConfig.port}`;
            if (connectionPool[key]) {
                console.warn(`${V.warning} Cleaning up stale connection state for ${key}`);
                if (connectionPool[key].client && !connectionPool[key].client.destroyed) {
                    connectionPool[key].client.destroy();
                }
                delete connectionPool[key];
            }
            
            // Forcer la libération du verrou expiré
            stationConfig.lastTcpConnection = now;
            stationConfig.connectionInUse = true;
            stationConfig.operationType = operationType;
            stationConfig.lockTimeout = lockTimeout;
            stationConfig.lockOwner = process.pid;
            configManager.autoSaveConfig(stationConfig);
            console.log(`${O.orange} Connection lock forcibly acquired for ${stationConfig.id} (operation: ${operationType}, pid: ${process.pid})`);
            return;
        }
        
        attempts++;
        const lockAge = Math.round(timeSinceLastConnection / 1000);
        const remainingTimeout = Math.max(0, Math.round((currentLockTimeout - timeSinceLastConnection) / 1000));
        
        console.warn(`${V.timeout} Connection busy for ${stationConfig.id} (${freshConfig.operationType || 'unknown'} operation by pid ${freshConfig.lockOwner || 'unknown'}, locked for ${lockAge}s, expires in ${remainingTimeout}s), attempt ${attempts}/${maxRetries}`);
        
        if (attempts < maxRetries) {
            // Si l'opération va bientôt expirer, attendre moins longtemps
            const waitTime = remainingTimeout > 0 && remainingTimeout < retryDelay/1000 ? 
                Math.min(remainingTimeout * 1000 + 1000, retryDelay) : retryDelay;
            console.log(`${V.sleep} Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    throw new Error(`Cannot acquire connection lock for ${stationConfig.id} after ${maxRetries} attempts - station is busy with ${stationConfig?.operationType || 'unknown'} operation (pid: ${stationConfig?.lockOwner || 'unknown'})`);
}

/**
 * Libère le verrou de connexion
 * @param {object} stationConfig Configuration de la station
 */
function releaseConnectionLock(stationConfig) {
    const operationType = stationConfig.operationType || 'unknown';
    const lockOwner = stationConfig.lockOwner || 'unknown';
    
    // Vérifier que nous sommes bien le propriétaire du verrou
    if (stationConfig.lockOwner && stationConfig.lockOwner !== process.pid) {
        console.warn(`${V.warning} Attempted to release lock owned by different process (owner: ${stationConfig.lockOwner}, current: ${process.pid})`);
        return;
    }
    
    stationConfig.connectionInUse = false;
    stationConfig.operationType = null;
    stationConfig.lockTimeout = null;
    stationConfig.lockOwner = null;
    configManager.autoSaveConfig(stationConfig);
    console.log(`${O.blue} Connection lock released for ${stationConfig.id} (was: ${operationType}, pid: ${lockOwner})`);
}

/**
 * Crée et initialise l'état pour une nouvelle connexion de station.
 * @param {object} stationConfig La configuration de la station (host, port, etc.).
 * @returns {object} L'objet d'état de la connexion.
 */
function _createConnectionState(stationConfig) {
    const key = `${stationConfig.host}:${stationConfig.port}`;
    
    // Vérifier qu'on a bien le verrou avant de créer une nouvelle connexion
    if (!hasConnectionLock(stationConfig)) {
        throw new Error(`Cannot create connection - lock not owned by this process (pid: ${process.pid})`);
    }
    
    console.log(`${V.satellite} Creating new connection state for ${key} (pid: ${process.pid})`);

    const state = {
        config: stationConfig,
        client: new net.Socket(),
        isConnecting: false,
        isConnected: false,
        currentResponseBuffer: Buffer.from([]),
        currentResponsePromiseResolve: null,
        currentResponsePromiseReject: null,
        currentCommandTimeoutId: null,
        createdBy: process.pid,
    };

    // Configuration du socket avec des timeouts appropriés
    state.client.setTimeout(10000); // 10 secondes timeout pour les opérations socket
    state.client.setKeepAlive(true, 30000); // Keep-alive pour détecter les déconnexions

    state.client.on('data', (data) => {
        state.currentResponseBuffer = Buffer.concat([state.currentResponseBuffer, data]);
    });

    state.client.on('connect', () => {
        console.log(`${V.connect} Connected to station ${key} (pid: ${process.pid})`);
        state.isConnected = true;
        state.isConnecting = false;
        // Mettre à jour lastTcpConnection lors de la connexion
        stationConfig.lastTcpConnection = new Date();
        configManager.autoSaveConfig(stationConfig);
    });

    state.client.on('timeout', () => {
        console.warn(`${V.timeout} Socket timeout for station ${key}`);
        state.client.destroy();
    });

    state.client.on('close', (hadError) => {
        console.log(`${V.BlackFlag} Connection TCP closed to station ${key} (hadError: ${hadError}, pid: ${process.pid})`);
        state.isConnected = false;
        state.isConnecting = false;
        
        if (state.currentResponsePromiseReject) {
            clearTimeout(state.currentCommandTimeoutId);
            state.currentResponsePromiseReject(new Error('Connexion TCP fermée de manière inattendue.'));
            state.currentResponsePromiseResolve = null;
            state.currentResponsePromiseReject = null;
        }
        
        // Libérer le verrou seulement si nous en sommes propriétaire
        if (hasConnectionLock(stationConfig)) {
            releaseConnectionLock(stationConfig);
        }
        
        delete connectionPool[key];
    });

    state.client.on('error', (err) => {
        console.error(`${V.error} TCP connection error to station ${key}: ${err.message} (pid: ${process.pid})`);
        state.isConnected = false;
        state.isConnecting = false;
        
        if (state.currentResponsePromiseReject) {
            clearTimeout(state.currentCommandTimeoutId);
            state.currentResponsePromiseReject(new Error(`Erreur TCP: ${err.message}`));
            state.currentResponsePromiseResolve = null;
            state.currentResponsePromiseReject = null;
        }
        
        // Libérer le verrou seulement si nous en sommes propriétaire
        if (hasConnectionLock(stationConfig)) {
            releaseConnectionLock(stationConfig);
        }
    });

    connectionPool[key] = state;
    return state;
}

/**
 * Récupère l'état de connexion pour une station donnée SEULEMENT si nous avons le verrou.
 * CRITIQUE: Ne crée JAMAIS de connexion TCP sans vérifier le verrou d'abord
 * @param {object} stationConfig La configuration de la station.
 * @returns {object} L'objet d'état de la connexion.
 * @throws {Error} Si nous n'avons pas le verrou
 */
function _getConnectionState(stationConfig) {
    // VÉRIFICATION CRITIQUE: Ne jamais créer de connexion sans le verrou
    if (!hasConnectionLock(stationConfig)) {
        throw new Error(`CRITICAL: Cannot create TCP connection - lock not owned by this process (pid: ${process.pid}). This would cause ECONNRESET on existing connections.`);
    }
    
    const key = `${stationConfig.host}:${stationConfig.port}`;
    
    // Vérifier si nous avons déjà une connexion valide
    const existingState = connectionPool[key];
    if (existingState) {
        // Double vérification : la connexion doit appartenir à ce processus
        if (existingState.createdBy !== process.pid) {
            console.warn(`${V.warning} Found connection created by different process (${existingState.createdBy} vs ${process.pid}) - cleaning up`);
            if (!existingState.client.destroyed) {
                existingState.client.destroy();
            }
            delete connectionPool[key];
        } else {
            return existingState;
        }
    }
    
    // Créer une nouvelle connexion SEULEMENT si nous avons le verrou
    return _createConnectionState(stationConfig);
}

/**
 * Analyse la chaîne de format de réponse pour déterminer la structure attendue.
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
 * Assure que la connexion TCP est établie.
 */
async function ensureConnection(state) {
    if (state.isConnected && !state.client.destroyed) {
        return;
    }
    
    if (state.isConnecting) {
        // Attend que la connexion actuelle se termine
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (state.isConnected && !state.client.destroyed) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (!state.isConnecting) {
                    clearInterval(checkInterval);
                    const key = `${state.config.host}:${state.config.port}`;
                    reject(new Error(`Échec de la connexion TCP à ${key}.`));
                }
            }, 100);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Timeout lors de l\'attente de la connexion TCP.'));
            }, 10000);
        });
    }

    state.isConnecting = true;
    return new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
            state.client.destroy();
            reject(new Error('Timeout de connexion TCP.'));
        }, 5000);

        state.client.connect(state.config.port, state.config.host, () => {
            clearTimeout(connectTimeout);
            resolve();
        });
        
        const errorHandler = (err) => {
            clearTimeout(connectTimeout);
            state.client.removeListener('error', errorHandler);
            reject(err);
        };
        
        state.client.once('error', errorHandler);
    }).finally(() => {
        state.isConnecting = false;
    });
}

/**
 * Fonction pour le réveil de la console.
 * CRITIQUE: Vérifie le verrou AVANT toute tentative de connexion TCP
 */
async function wakeUpConsole(stationConfig, screen = null) {
    // VÉRIFICATION CRITIQUE: Arrêter immédiatement si on n'a pas le verrou
    if (!hasConnectionLock(stationConfig)) {
        const freshConfig = configManager.loadConfig(stationConfig.id);
        const errorMsg = `CRITICAL: Cannot wake up console - lock not owned by this process (pid: ${process.pid}). Current owner: ${freshConfig?.lockOwner || 'unknown'} with ${freshConfig?.operationType || 'unknown'} operation. This prevents TCP collisions.`;
        throw new Error(errorMsg);
    }
    
    // Maintenant on peut créer/récupérer la connexion en toute sécurité
    let state;
    try {
        state = _getConnectionState(stationConfig);
    } catch (error) {
        // Si la création de l'état échoue, c'est probablement un problème de verrou
        throw new Error(`Failed to get connection state: ${error.message}`);
    }
    
    await ensureConnection(state);

    let attempts = 0;
    const maxAttempts = 3;
    const wakeupTimeout = 1200;

    while (attempts < maxAttempts) {
        state.currentResponseBuffer = Buffer.from([]);
        try {
            const wakeUpBuffer = Buffer.from([0x1B, 0x0A]);
            const response = await new Promise((resolve, reject) => {
                let timeoutId = setTimeout(() => reject(new Error(`${V.timeout} Timeout`)), wakeupTimeout);
                
                const onDataTemp = (data) => {
                    state.currentResponseBuffer = Buffer.concat([state.currentResponseBuffer, data]);
                    if (state.currentResponseBuffer.includes(0x0A) && state.currentResponseBuffer.includes(0x0D)) {
                        clearTimeout(timeoutId);
                        state.client.removeListener('data', onDataTemp);
                        resolve(state.currentResponseBuffer);
                    }
                };
                state.client.on('data', onDataTemp);
                
                state.client.write(wakeUpBuffer, (err) => {
                    if (err) {
                        clearTimeout(timeoutId);
                        state.client.removeListener('data', onDataTemp);
                        reject(err);
                    }
                });
            });

            if (response.includes(0x0A) && response.includes(0x0D)) {
                if (screen === true) {
                    await sendCommand(stationConfig, `LAMPS 1`, 2000, "<LF><CR>OK<LF><CR>");
                    console.log(`${O.yellow} ${stationConfig.id} - Screen ON`);
                } else if (screen === false) {
                    await sendCommand(stationConfig, `LAMPS 0`, 2000, "<LF><CR>OK<LF><CR>");
                    console.log(`${O.black} ${stationConfig.id} - Screen OFF`);
                } else {
                    console.log(`${O.purple} ${stationConfig.id} - WakeUp!`);
                }
                return;
            } else {
                console.warn(`${V.sleep} Unexpected wakeup response (no \\n\\r): ${response.toString('hex')}`);
            }
        } catch (error) {
            console.error(`${V.error} Wakeup attempt failed: ${error.message}, attempt ${attempts + 1}/${maxAttempts}`);
        }
        attempts++;
        if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    throw new Error(`Failed to wake up console after ${maxAttempts} attempts`);
}

/**
 * Gère l'envoi brut d'une commande et la réception d'une réponse.
 */
function _internalSendAndReceive(state, command, timeout, parsedFormat) {
    return new Promise((resolve, reject) => {
        if (state.currentResponsePromiseResolve) {
            return reject(new Error('Une commande est déjà en attente de réponse.'));
        }

        state.currentResponsePromiseResolve = resolve;
        state.currentResponsePromiseReject = reject;
        state.currentResponseBuffer = Buffer.from([]);

        const commandDescription = typeof command === 'string' ? command.trim() : `Binary (${command.length} bytes)`;

        const cleanup = (finalStatus, logMessage) => {
            clearTimeout(state.currentCommandTimeoutId);
            state.client.removeListener('data', responseListener);
            state.currentResponsePromiseResolve = null;
            state.currentResponsePromiseReject = null;
            console.log(`${V.receive} Message: ${logMessage}`);
        };

        state.currentCommandTimeoutId = setTimeout(() => {
            const errorMessage = `Timeout pour la commande '${commandDescription}'. Données: ${state.currentResponseBuffer.toString('hex')}`;
            cleanup('TIMEOUT', errorMessage);
            reject(new Error(errorMessage));
        }, timeout);

        const responseListener = (dataChunk) => {
            if (state.currentResponseBuffer.length < parsedFormat.totalExpectedLength) {
                console.log(`${V.cut} Response Listener - Not enough data yet (${state.currentResponseBuffer.length}/${parsedFormat.totalExpectedLength}). Returning.`);
                return;
            }

            let currentOffset = 0;
            const dataSegments = [];
            const crcSegments = [];

            for (const segment of parsedFormat.segments) {
                const segmentData = state.currentResponseBuffer.slice(currentOffset, currentOffset + segment.length);

                switch (segment.type) {
                    case 'ACK':
                        if (segmentData[0] !== segment.value) {
                            cleanup('VALIDATION_ERROR', `ACK attendu (0x${segment.value.toString(16)}), mais reçu 0x${segmentData[0].toString(16)} à l'offset ${currentOffset}.`);
                            return reject(new Error(`Octet ACK invalide.`));
                        }
                        break;
                    case 'LITERAL':
                        if (!segmentData.equals(segment.value)) {
                            cleanup('VALIDATION_ERROR', `Littéral attendu (${segment.value.toString('hex')}), mais reçu ${segmentData.toString('hex')} à l'offset ${currentOffset}.`);
                            return reject(new Error(`Réponse littérale invalide.`));
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

            cleanup('SUCCESS', `Réponse complète et validée, longueur [${state.currentResponseBuffer.length}]`);
            resolve(Buffer.concat([...dataSegments, ...crcSegments]));
        };

        state.client.on('data', responseListener);

        const dataToSend = typeof command === 'string' ? Buffer.from(`${command}\n`) : command;
        try {
            state.client.write(dataToSend, (err) => {
                if (err) {
                    cleanup('WRITE_ERROR', `Erreur d'écriture sur le socket: ${err.message}`);
                    reject(err);
                }
            });
        } catch (error) {
            cleanup('WRITE_ERROR', `Erreur d'écriture sur le socket: ${error.message}`);
            reject(error);
        }
    });
}

/**
 * Envoie une commande, valide la réponse, et réessaye en cas d'échec CRC.
 * CRITIQUE: Vérifie le verrou AVANT toute tentative de connexion TCP
 */
async function sendCommand(stationConfig, command, timeout = 2000, answerFormat = "") {
    // VÉRIFICATION CRITIQUE: Arrêter immédiatement si on n'a pas le verrou
    if (!hasConnectionLock(stationConfig)) {
        const freshConfig = configManager.loadConfig(stationConfig.id);
        const errorMsg = `CRITICAL: Cannot send command - lock not owned by this process (pid: ${process.pid}). Current owner: ${freshConfig?.lockOwner || 'unknown'} with ${freshConfig?.operationType || 'unknown'} operation. This prevents TCP collisions.`;
        throw new Error(errorMsg);
    }
    
    // Maintenant on peut créer/récupérer la connexion en toute sécurité
    let state;
    try {
        state = _getConnectionState(stationConfig);
    } catch (error) {
        // Si la création de l'état échoue, c'est probablement un problème de verrou
        throw new Error(`Failed to get connection state: ${error.message}`);
    }
    
    let attempts = 0;
    const maxAttempts = 2;
    const commandDescription = typeof command === 'string' ? command.trim() : `Binary (${command.length} bytes)`;
    const parsedFormat = parseAnswerFormatString(answerFormat);

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
        
        const commandText = command.toString()
            .replace(/\r/g, '<CR>')
            .replace(/\n/g, '<LF>')
            .replace(/\x06/g, '<ACK>')
            .replace(/\x21/g, '<NAK>')
            .replace(/\x18/g, '<CANCEL>')
            .replace(/\x1B/g, '<ESC>');
            
        console.log(`${V.send} Sending to ${stationConfig.id} [${stationConfig.host}:${stationConfig.port}] (${attempts}/${maxAttempts}): '${commandText}', AnswerFormat: ${answerFormat} (pid: ${process.pid}, lock: ${hasConnectionLock(stationConfig) ? 'OK' : 'MISSING'})`);

        try {
            await ensureConnection(state);
            const payload = await _internalSendAndReceive(state, command, timeout, parsedFormat);
            
            // Mettre à jour le timestamp pour maintenir le verrou
            stationConfig.lastTcpConnection = new Date();
            configManager.autoSaveConfig(stationConfig);
            
            if (parsedFormat.expectsCrc) {
                const data = payload.slice(0, parsedFormat.dataLengthForCrc);
                const receivedCrcBytes = payload.slice(parsedFormat.dataLengthForCrc, parsedFormat.dataLengthForCrc + 2);
                const receivedCrc = receivedCrcBytes.readUInt16BE(0);
                const calculatedCrc = calculateCRC(data);
                
                if (calculatedCrc !== receivedCrc) {
                    const crcError = new Error(`CRC invalide. Calculé: 0x${calculatedCrc.toString(16)}, Reçu: 0x${receivedCrc.toString(16)}`);
                    crcError.name = 'CRCError';
                    throw crcError;
                }
                return data;
            }
            return payload;
        } catch (error) {
            if (error.name === 'CRCError' && attempts < maxAttempts) {
                console.warn(`${V.Radioactive} Erreur CRC pour ${stationConfig.id} (tentative ${attempts}). Nouvel essai...`);
            } else {
                console.error(`${O.red} La commande '${commandDescription}' pour ${stationConfig.id} a échoué après ${attempts} tentative(s): ${error.message} (pid: ${process.pid})`);
                throw error;
            }
        }
    }
    throw new Error('Logique sendCommand: sortie de la boucle de tentatives.');
}

module.exports = {
    sendCommand,
    wakeUpConsole,
    acquireConnectionLock,
    releaseConnectionLock,
    hasConnectionLock
};