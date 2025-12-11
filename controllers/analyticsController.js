const fs = require('fs').promises;
const path = require('path');


// Constantes
const DATA_FILE = path.join(__dirname, '../visits/analytics.json');
const BOT_FILE = path.join(__dirname, '../visits/bots.json');
const MAX_HISTORY_PER_VISITOR = 1000; // Limite pour éviter des fichiers trop gros

/**
 * Lecture sécurisée du fichier de données
 */
async function readDataFile() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {}; // Fichier n'existe pas encore
        }
        throw error;
    }
}

/**
 * Lecture du fichier des bots
 */
async function readBotFile() {
    try {
        const data = await fs.readFile(BOT_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { bots: [], suspicious: [] };
        }
        throw error;
    }
}

/**
 * Obtient la géolocalisation via IP (API ip-api.com)
 */
const getGeoLocation = (ip) => {
    return new Promise((resolve) => {
        // IPs locales
        if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.')) {
            return resolve({ city: 'Local', country: 'Lan', lat: 0, lon: 0 });
        }

        const url = `http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`;

        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status === 'success') {
                        resolve({ 
                            city: json.city, 
                            country: json.country,
                            lat: json.lat,
                            lon: json.lon
                        });
                    } else {
                        resolve({ city: 'Unknown', country: 'Unknown', lat: 0, lon: 0 });
                    }
                } catch (e) {
                    resolve({ city: 'Error', country: 'Error', lat: 0, lon: 0 });
                }
            });
        }).on('error', () => {
            resolve({ city: 'Unreachable', country: 'Unreachable', lat: 0, lon: 0 });
        });
    });
};
/**
 * Validation des données d'entrée
 */
function validateVisitData(data) {
    const errors = [];
    
    if (!data.visitorId || typeof data.visitorId !== 'string') {
        errors.push('visitorId is required and must be a string');
    }
    
    if (data.visitorId && data.visitorId.length > 100) {
        errors.push('visitorId too long');
    }
    
    if (data.url && data.url.length > 2000) {
        errors.push('url too long');
    }
    
    if (data.duration && (typeof data.duration !== 'number' || data.duration < 0)) {
        errors.push('duration must be a positive number');
    }
    
    if (data.duration && data.duration > 86400) { // Plus de 24h
        errors.push('duration unrealistic');
    }
    
    return errors;
}

/**
 * Détermine si on doit enregistrer ce visiteur
 */
function shouldRecordVisit(botDetection, classification) {
    // Ne pas enregistrer les bots connus
    if (classification === 'bot' && botDetection.isKnownBot) {
        return { record: false, reason: 'known_bot' };
    }
    
    // Enregistrer mais flaguer les suspects
    if (classification === 'suspicious' || classification === 'bot') {
        return { record: true, flag: true, reason: classification };
    }
    
    return { record: true, flag: false };
}

/**
 * Détecte les IPs suspectes (VPN, proxy, data centers)
 */
function detectSuspiciousIP(ip, geo) {
    const suspiciousFlags = [];
    
    // IPs locales/privées
    if (ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        suspiciousFlags.push('private_ip');
    }
    
    // Vérifier si c'est un data center connu (à adapter selon votre service de geo)
    if (geo.isHosting || geo.isProxy || geo.isVpn) {
        suspiciousFlags.push('hosting_ip');
    }
    
    return suspiciousFlags;
}

/**
 * Calcule des métriques de comportement
 */
function calculateBehaviorMetrics(history, newEntry) {
    const allEntries = [...history, newEntry];
    
    // Durée moyenne
    const avgDuration = allEntries.length > 0 
        ? allEntries.reduce((sum, e) => sum + (e.duration || 0), 0) / allEntries.length 
        : 0;
    
    // Pages vues
    const uniquePages = new Set(allEntries.map(e => e.url)).size;
    
    // Temps total passé
    const totalTime = allEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
    
    // Taux de rebond (une seule page visitée)
    const bounceRate = allEntries.length === 1 ? 1 : 0;
    
    return {
        totalVisits: allEntries.length,
        uniquePages,
        avgDuration: Math.round(avgDuration),
        totalTime: Math.round(totalTime),
        bounceRate
    };
}

/**
 * Nettoie l'historique si trop long
 */
function cleanHistory(history) {
    if (history.length > MAX_HISTORY_PER_VISITOR) {
        // Garder les plus récents
        return history.slice(-MAX_HISTORY_PER_VISITOR);
    }
    return history;
}

/**
 * Enregistre une visite (VERSION AMÉLIORÉE)
 */
exports.recordVisit = async (req, res) => {
    try {
        const { 
            visitorId, 
            sessionStart,
            url, 
            referrer, 
            eventType = 'view', 
            duration = 0,
            botDetection = {},
            fingerprint = {}
        } = req.body;
        
        // 1. VALIDATION
        const validationErrors = validateVisitData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                success: false, 
                errors: validationErrors 
            });
        }

        // 2. EXTRACTION IP ET GEO
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        if (ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip.startsWith('::ffff:')) ip = ip.substring(7);

        const geo = await getGeoLocation(ip);
        const timestamp = new Date().toISOString();

        // 3. DÉTECTION DE BOT
        const classification = botDetection.classification || 'unknown';
        const botScore = botDetection.score || 0;
        const decision = shouldRecordVisit(botDetection, classification);

        // Si c'est un bot connu, on l'enregistre à part
        if (!decision.record) {
            await recordBotVisit({
                visitorId,
                ip,
                timestamp,
                url,
                botDetection,
                userAgent: req.headers['user-agent']
            });
            
            return res.status(200).json({ 
                success: true, 
                recorded: false,
                reason: decision.reason 
            });
        }

        // 4. DÉTECTION IP SUSPECTE
        const ipFlags = detectSuspiciousIP(ip, geo);

        // 5. LIRE LA BASE DE DONNÉES
        const db = await readDataFile();

        // 6. INITIALISER OU METTRE À JOUR LE VISITEUR
        if (!db[visitorId]) {
            db[visitorId] = {
                firstSeen: timestamp,
                lastSeen: timestamp,
                geo: {
                    ip: ip,
                    city: geo.city,
                    country: geo.country,
                    region: geo.region || null,
                    lat: geo.lat,
                    lon: geo.lon
                },
                history: [],
                flags: {
                    isBot: decision.flag,
                    botScore: botScore,
                    suspiciousIP: ipFlags.length > 0,
                    ipFlags: ipFlags
                },
                fingerprint: fingerprint.userAgent ? {
                    userAgent: fingerprint.userAgent,
                    language: fingerprint.language,
                    platform: fingerprint.platform,
                    screenResolution: fingerprint.screenResolution,
                    timezone: fingerprint.timezone
                } : null,
                stats: {
                    totalVisits: 0,
                    uniquePages: 0,
                    avgDuration: 0,
                    totalTime: 0,
                    lastEventType: eventType
                }
            };
        } else {
            // Mise à jour du profil existant
            db[visitorId].lastSeen = timestamp;
            
            // Mise à jour de la géolocalisation (si changée)
            if (db[visitorId].geo.ip !== ip) {
                db[visitorId].geo = {
                    ip: ip,
                    city: geo.city,
                    country: geo.country,
                    region: geo.region || null,
                    lat: geo.lat,
                    lon: geo.lon,
                    previousIp: db[visitorId].geo.ip // Garder trace
                };
            }
            
            // Mise à jour des flags si nécessaire
            if (decision.flag && botScore > (db[visitorId].flags?.botScore || 0)) {
                db[visitorId].flags = {
                    ...db[visitorId].flags,
                    isBot: true,
                    botScore: botScore
                };
            }
            
            // Vérifier les IPs suspectes
            if (ipFlags.length > 0) {
                db[visitorId].flags = db[visitorId].flags || {};
                db[visitorId].flags.suspiciousIP = true;
                db[visitorId].flags.ipFlags = [
                    ...(db[visitorId].flags.ipFlags || []),
                    ...ipFlags
                ];
            }
            
            // Mettre à jour le dernier type d'événement
            if (!db[visitorId].stats) {
                db[visitorId].stats = {};
            }
            db[visitorId].stats.lastEventType = eventType;
        }

        // 7. AJOUTER L'ÉVÉNEMENT DANS L'HISTORIQUE
        // On enregistre tous les événements maintenant (start, end, heartbeat)
        if (eventType === 'end' || eventType === 'start' || eventType === 'heartbeat') {
            const historyEntry = {
                type: eventType,
                start: sessionStart || timestamp,
                end: timestamp,
                url: url,
                ref: referrer || 'direct',
                duration: duration,
                interactions: botDetection.interactions || null,
                timestamp: timestamp
            };
            
            // Ajouter l'entrée
            db[visitorId].history.push(historyEntry);
            
            // Nettoyer l'historique si trop long
            db[visitorId].history = cleanHistory(db[visitorId].history);
            
            // Calculer les métriques de comportement
            if (eventType === 'end') {
                const metrics = calculateBehaviorMetrics(
                    db[visitorId].history.filter(h => h.type === 'end'),
                    historyEntry
                );
                db[visitorId].stats = {
                    ...db[visitorId].stats,
                    ...metrics
                };
            }
        }

        // 8. SAUVEGARDER (asynchrone mais non-bloquant)
        await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));

        // 9. RÉPONSE
        res.status(200).json({ 
            success: true, 
            recorded: true,
            flagged: decision.flag || false,
            classification: classification
        });

    } catch (error) {
        console.error('Erreur controller analytics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Enregistre les visites de bots à part
 */
async function recordBotVisit(botData) {
    try {
        const bots = await readBotFile();
        
        bots.bots = bots.bots || [];
        bots.bots.push({
            ...botData,
            recordedAt: new Date().toISOString()
        });
        
        // Limiter à 1000 entrées
        if (bots.bots.length > 1000) {
            bots.bots = bots.bots.slice(-1000);
        }
        
        await fs.writeFile(BOT_FILE, JSON.stringify(bots, null, 2));
    } catch (error) {
        console.error('Erreur enregistrement bot:', error);
        // Ne pas bloquer si ça échoue
    }
}

/**
 * Récupère les statistiques globales
 */
exports.getStats = async (req, res) => {
    try {
        const db = await readDataFile();
        const bots = await readBotFile();
        
        const visitors = Object.values(db);
        const humanVisitors = visitors.filter(v => !v.flags?.isBot);
        const suspiciousVisitors = visitors.filter(v => v.flags?.isBot);
        
        const totalVisits = humanVisitors.reduce((sum, v) => sum + (v.stats?.totalVisits || 0), 0);
        const totalDuration = humanVisitors.reduce((sum, v) => sum + (v.stats?.totalTime || 0), 0);
        
        const stats = {
            totalVisitors: visitors.length,
            humanVisitors: humanVisitors.length,
            suspiciousVisitors: suspiciousVisitors.length,
            knownBots: bots.bots?.length || 0,
            totalVisits: totalVisits,
            avgDurationPerVisit: totalVisits > 0 ? Math.round(totalDuration / totalVisits) : 0,
            countries: [...new Set(humanVisitors.map(v => v.geo?.country).filter(Boolean))].length,
            topCountries: getTopCountries(humanVisitors),
            topPages: getTopPages(humanVisitors)
        };
        
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Erreur getStats:', error);
        res.status(500).json({ success: false });
    }
};

function getTopCountries(visitors, limit = 10) {
    const countryCount = {};
    visitors.forEach(v => {
        const country = v.geo?.country;
        if (country) {
            countryCount[country] = (countryCount[country] || 0) + 1;
        }
    });
    
    return Object.entries(countryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([country, count]) => ({ country, count }));
}

function getTopPages(visitors, limit = 10) {
    const pageCount = {};
    visitors.forEach(v => {
        v.history?.forEach(h => {
            if (h.url) {
                pageCount[h.url] = (pageCount[h.url] || 0) + 1;
            }
        });
    });
    
    return Object.entries(pageCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([url, count]) => ({ url, count }));
}