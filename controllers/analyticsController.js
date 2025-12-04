// controllers/analyticsController.js
const fs = require('fs');
const path = require('path');
const http = require('http');

// Fichier JSON de stockage
const DATA_FILE = path.resolve(__dirname, '../config/visites.json');

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
 * Lit le fichier JSON existant
 */
const readDataFile = () => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
            return fileContent ? JSON.parse(fileContent) : {};
        }
    } catch (error) {
        console.error('Erreur lecture fichier analytics:', error);
    }
    return {};
};

/**
 * Enregistre une visite
 */
exports.recordVisit = async (req, res) => {
    try {
        const { 
            visitorId, 
            sessionStart, // Reçu du client
            url, 
            referrer, 
            eventType = 'view', 
            duration = 0
        } = req.body;
        
        if (!visitorId) {
             return res.status(400).json({ success: false, message: 'Missing visitorId' });
        }

        // Récupération IP
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        if (ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip.startsWith('::ffff:')) ip = ip.substring(7);

        const geo = await getGeoLocation(ip);
        const timestamp = new Date().toISOString(); // Heure serveur actuelle

        // 1. Lire la base
        const db = readDataFile();

        // 2. Initialiser ou Mettre à jour le visiteur
        if (!db[visitorId]) {
            // Création du profil sans 'device'
            db[visitorId] = {
                firstSeen: timestamp,
                lastSeen: timestamp,
                geo: {
                    ip: ip,
                    city: geo.city,
                    country: geo.country,
                    lat: geo.lat,
                    lon: geo.lon
                },
                history: []
            };
        } else {
            // Mise à jour de lastSeen et Geo
            db[visitorId].lastSeen = timestamp;
            db[visitorId].geo = {
                ip: ip,
                city: geo.city,
                country: geo.country,
                lat: geo.lat,
                lon: geo.lon
            };
        }

        // 3. Ajouter l'événement dans l'historique UNIQUEMENT si c'est la fin ('end')
        if (eventType === 'end') {
            const historyEntry = {
                start: sessionStart || timestamp, // Date de chargement de la page (venant du client)
                end: timestamp, // Date actuelle (serveur)
                url: url,
                ref: referrer,
                duration: duration
            };
            db[visitorId].history.push(historyEntry);
        }

        // 4. Sauvegarder
        fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), (err) => {
            if (err) console.error('Erreur sauvegarde analytics:', err);
        });

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Erreur controller analytics:', error);
        res.status(500).json({ success: false });
    }
};