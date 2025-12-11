// public/js/tracker.js
(function() {
    // --- Détection de Bot ---
    const botDetector = {
        // Liste des bots connus via User-Agent
        knownBots: [
            'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
            'yandexbot', 'facebookexternalhit', 'twitterbot', 'rogerbot',
            'linkedinbot', 'embedly', 'quora link preview', 'showyoubot',
            'outbrain', 'pinterest', 'slackbot', 'vkshare', 'w3c_validator',
            'whatsapp', 'telegrambot', 'applebot', 'discordbot', 'petalbot'
        ],

        // Détection basée sur le User-Agent
        checkUserAgent() {
            const ua = navigator.userAgent.toLowerCase();
            return this.knownBots.some(bot => ua.includes(bot));
        },

        // Détection des propriétés manquantes ou suspectes
        checkWebDriver() {
            return navigator.webdriver === true;
        },

        checkPhantomJS() {
            return window.callPhantom || window._phantom;
        },

        checkHeadlessChrome() {
            return /HeadlessChrome/.test(navigator.userAgent);
        },

        // Vérification des capacités du navigateur
        checkBrowserFeatures() {
            const suspiciousFeatures = [];
            
            // Pas de plugins (rare pour un vrai navigateur)
            if (navigator.plugins.length === 0) {
                suspiciousFeatures.push('no_plugins');
            }

            // Pas de langues
            if (!navigator.languages || navigator.languages.length === 0) {
                suspiciousFeatures.push('no_languages');
            }

            // Dimensions d'écran suspectes
            if (screen.width === 0 || screen.height === 0) {
                suspiciousFeatures.push('invalid_screen');
            }

            return suspiciousFeatures;
        },

        // Test de l'interaction humaine
        hasHumanInteraction() {
            return this.mouseMovements > 0 || this.clicks > 0 || this.scrolls > 0;
        },

        // Compteurs d'interactions
        mouseMovements: 0,
        clicks: 0,
        scrolls: 0,
        keyPresses: 0,

        // Score de bot (0-100, 100 = probablement un bot)
        calculateBotScore() {
            let score = 0;

            if (this.checkUserAgent()) score += 100; // Bot connu = 100%
            if (this.checkWebDriver()) score += 50;
            if (this.checkPhantomJS()) score += 50;
            if (this.checkHeadlessChrome()) score += 50;

            const suspiciousFeatures = this.checkBrowserFeatures();
            score += suspiciousFeatures.length * 15;

            // Après 5 secondes, vérifier l'interaction
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            if (elapsed > 5 && !this.hasHumanInteraction()) {
                score += 30;
            }

            return Math.min(100, score);
        },

        getClassification() {
            const score = this.calculateBotScore();
            if (score >= 70) return 'bot';
            if (score >= 40) return 'suspicious';
            return 'human';
        }
    };

    // Écouter les interactions humaines
    let interactionListenersAdded = false;

    function addInteractionListeners() {
        if (interactionListenersAdded) return;
        interactionListenersAdded = true;

        document.addEventListener('mousemove', () => {
            botDetector.mouseMovements++;
        }, { passive: true, once: false });

        document.addEventListener('click', () => {
            botDetector.clicks++;
        }, { passive: true });

        document.addEventListener('scroll', () => {
            botDetector.scrolls++;
        }, { passive: true });

        document.addEventListener('keydown', () => {
            botDetector.keyPresses++;
        }, { passive: true });
    }

    // --- Gestion de l'identité ---
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getVisitorId() {
        const STORAGE_KEY = 'probe2_visitor_id';
        let visitorId = localStorage.getItem(STORAGE_KEY);
        if (!visitorId) {
            visitorId = generateUUID();
            localStorage.setItem(STORAGE_KEY, visitorId);
        }
        return visitorId;
    }

    // --- Empreinte navigateur (Browser Fingerprint) ---
    function getBrowserFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Browser fingerprint', 2, 2);
        
        return {
            canvas: canvas.toDataURL(),
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            plugins: Array.from(navigator.plugins).map(p => p.name).join(',')
        };
    }

    // --- Gestion du Temps ---
    const sessionStartISO = new Date().toISOString();
    let startTime = Date.now();
    let totalActiveTime = 0;
    let isTabActive = true;

    function updateActiveTime() {
        if (isTabActive) {
            const now = Date.now();
            totalActiveTime += (now - startTime);
            startTime = now;
        }
    }

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            updateActiveTime();
            isTabActive = false;
        } else {
            startTime = Date.now();
            isTabActive = true;
        }
    });

    // --- Envoi des données ---
    function sendData(eventType) {
        updateActiveTime();
        const durationSeconds = Math.round(totalActiveTime / 1000);
        const botScore = botDetector.calculateBotScore();
        const classification = botDetector.getClassification();

        const payload = {
            eventType: eventType,
            visitorId: getVisitorId(),
            sessionStart: sessionStartISO,
            url: window.location.href,
            referrer: document.referrer || 'direct',
            duration: durationSeconds,
            
            // Données de détection de bot
            botDetection: {
                score: botScore,
                classification: classification,
                isKnownBot: botDetector.checkUserAgent(),
                isWebDriver: botDetector.checkWebDriver(),
                interactions: {
                    mouseMovements: botDetector.mouseMovements,
                    clicks: botDetector.clicks,
                    scrolls: botDetector.scrolls,
                    keyPresses: botDetector.keyPresses
                },
                suspiciousFeatures: botDetector.checkBrowserFeatures()
            },
            
            // Empreinte navigateur (optionnel, pour analyse avancée)
            fingerprint: eventType === 'start' ? getBrowserFingerprint() : undefined
        };

        fetch('/api/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(err => console.warn('Tracker: API error', err));
    }

    // Initialisation
    addInteractionListeners();

    // Envoi au démarrage
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => sendData('start'));
    } else {
        sendData('start');
    }

    // Envoi à la fin
    window.addEventListener('beforeunload', () => {
        sendData('end');
    });

    // Envoi périodique pour les sessions longues (optionnel)
    setInterval(() => {
        if (isTabActive) {
            sendData('heartbeat');
        }
    }, 60000); // Toutes les 60 secondes

})();