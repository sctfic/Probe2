// public/js/tracker.js
(function() {
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

    // --- Gestion du Temps ---
    // On capture l'heure de démarrage de la session (ISO) dès le chargement du script
    const sessionStartISO = new Date().toISOString();
    
    // Variables pour le calcul de la durée active
    let startTime = Date.now();
    let totalActiveTime = 0; // en millisecondes
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

        const payload = {
            eventType: eventType, // 'start' ou 'end'
            visitorId: getVisitorId(),
            sessionStart: sessionStartISO, // On envoie l'heure de début fixe
            url: window.location.href,
            referrer: document.referrer || 'direct',
            duration: durationSeconds
        };

        fetch('/api/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(err => console.warn('Tracker: API error', err));
    }

    // Envoi au démarrage (pour mettre à jour le lastSeen et la Geo)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => sendData('start'));
    } else {
        sendData('start');
    }

    // Envoi à la fin (pour enregistrer l'historique complet)
    window.addEventListener('beforeunload', () => {
        sendData('end');
    });

})();