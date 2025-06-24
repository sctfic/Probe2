// public/js/app.js
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.navbar nav ul li');
    const sections = document.querySelectorAll('.content-section');
    const contentContainer = document.getElementById('content-container');
    let currentIndex = 0; // Index de la section active

    // --- Navigation Logic ---
    
    // Fonction pour mettre à jour la vue
    const updateView = () => {
        // Déplace le conteneur pour afficher la section courante
        contentContainer.style.transform = `translateX(-${currentIndex * 100}vw)`;

        // Met à jour la classe 'active' pour la navigation
        navItems.forEach((item, index) => {
            if (index === currentIndex) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Trigger data fetch for the active section if it's a data-display section
        const activeSectionId = sections[currentIndex].id;
        if (activeSectionId === 'conditions-section') {
            fetchCurrentConditions();
        } else if (activeSectionId === 'settings-section') {
            fetchStationSettings();
        }
    };

    // Gestion du clic sur les éléments de la barre de navigation
    navItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            currentIndex = index;
            // Reset transition for direct clicks to avoid visual glitches from swipe
            contentContainer.style.transition = 'transform 0.3s ease-out';
            updateView();
            // Remove transition after a short delay to allow new swipes
            setTimeout(() => { contentContainer.style.transition = ''; }, 300);
        });
    });

    // --- Gestion du glissement latéral (swipe) ---
    let startX = 0;
    let endX = 0;
    let isSwiping = false;

    contentContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isSwiping = true;
    });

    contentContainer.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        // Empêche le défilement vertical pendant le swipe horizontal
        e.preventDefault();
        endX = e.touches[0].clientX;
        const diffX = startX - endX;
        // Applique une translation temporaire pour suivre le doigt
        contentContainer.style.transform = `translateX(calc(-${currentIndex * 100}vw - ${diffX}px))`;
    });

    contentContainer.addEventListener('touchend', () => {
        if (!isSwiping) return;
        isSwiping = false;
        const diffX = startX - endX;

        // Détermine si le swipe est suffisant pour changer de section (seuil de 50px)
        if (diffX > 50 && currentIndex < sections.length - 1) {
            // Swipe vers la gauche (prochaine section)
            currentIndex++;
        } else if (diffX < -50 && currentIndex > 0) {
            // Swipe vers la droite (section précédente)
            currentIndex--;
        }
        // Réinitialise la transition pour un mouvement fluide vers la position finale
        contentContainer.style.transition = 'transform 0.3s ease-out';
        updateView();

        // Réinitialise la transition après un court délai pour permettre le nouveau swipe
        setTimeout(() => {
            contentContainer.style.transition = ''; // Retire la transition pour le mouvement du doigt
        }, 300);
    });

    // --- API Interaction Logic ---

    // Helper function to display messages
    const displayMessage = (elementId, message, isError = false) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.style.color = isError ? 'red' : 'green';
        }
    };

    // Set Time
    const setTimeBtn = document.getElementById('set-time-btn');
    if (setTimeBtn) {
        setTimeBtn.addEventListener('click', async () => {
            displayMessage('time-status', 'Synchronisation en cours...');
            try {
                const response = await fetch('/api/station/set-time');
                const data = await response.json();
                if (response.ok) {
                    displayMessage('time-status', data.message);
                } else {
                    displayMessage('time-status', `Erreur: ${data.error}`, true);
                }
            } catch (error) {
                displayMessage('time-status', `Erreur de connexion: ${error.message}`, true);
            }
        });
    }

    // Set Location
    const setLocationForm = document.getElementById('set-location-form');
    if (setLocationForm) {
        setLocationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            displayMessage('location-status', 'Définition de la localisation en cours...');
            const latitude = parseFloat(document.getElementById('latitude').value);
            const longitude = parseFloat(document.getElementById('longitude').value);
            const elevation = parseInt(document.getElementById('elevation').value, 10);

            try {
                const response = await fetch('/api/station/set-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude, longitude, elevation })
                });
                const data = await response.json();
                if (response.ok) {
                    displayMessage('location-status', data.message);
                } else {
                    displayMessage('location-status', `Erreur: ${data.error}`, true);
                }
            } catch (error) {
                displayMessage('location-status', `Erreur de connexion: ${error.message}`, true);
            }
        });
    }

    // Set Timezone
    const setTimezoneForm = document.getElementById('set-timezone-form');
    const timezoneTypeSelect = document.getElementById('timezone-type');
    const presetOptionsDiv = document.getElementById('preset-options');
    const customOptionsDiv = document.getElementById('custom-options');

    if (timezoneTypeSelect) {
        timezoneTypeSelect.addEventListener('change', () => {
            if (timezoneTypeSelect.value === 'preset') {
                presetOptionsDiv.style.display = 'block';
                customOptionsDiv.style.display = 'none';
            } else {
                presetOptionsDiv.style.display = 'none';
                customOptionsDiv.style.display = 'block';
            }
        });
        // Initial state
        timezoneTypeSelect.dispatchEvent(new Event('change'));
    }

    if (setTimezoneForm) {
        setTimezoneForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            displayMessage('timezone-status', 'Définition du fuseau horaire en cours...');
            const type = timezoneTypeSelect.value;
            let body = { type };
            if (type === 'preset') {
                body.index = parseInt(document.getElementById('timezone-index').value, 10);
            } else {
                body.offsetGMT = parseInt(document.getElementById('timezone-offset').value, 10);
            }

            try {
                const response = await fetch('/api/station/set-timezone', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await response.json();
                if (response.ok) {
                    displayMessage('timezone-status', data.message);
                } else {
                    displayMessage('timezone-status', `Erreur: ${data.error}`, true);
                }
            } catch (error) {
                displayMessage('timezone-status', `Erreur de connexion: ${error.message}`, true);
            }
        });
    }

    // Get Current Conditions
    const getConditionsBtn = document.getElementById('get-conditions-btn');
    if (getConditionsBtn) {
        getConditionsBtn.addEventListener('click', fetchCurrentConditions);
    }

    async function fetchCurrentConditions() {
        displayMessage('conditions-data', 'Chargement des conditions actuelles...');
        try {
            const response = await fetch('/api/station/current-conditions');
            const data = await response.json();
            if (response.ok) {
                for (const key in data.data) {
                    const span = document.getElementById(key);
                    if (span) {
                        span.textContent = `${data.data[key].value} ${data.data[key].unit}`;
                    }
                }
                displayMessage('conditions-data', data.message);
            } else {
                displayMessage('conditions-data', `Erreur: ${data.error}`, true);
            }
        } catch (error) {
            displayMessage('conditions-data', `Erreur de connexion: ${error.message}`, true);
        }
    }

    // Get Station Settings (NEW)
    const getSettingsBtn = document.getElementById('get-settings-btn');
    if (getSettingsBtn) {
        getSettingsBtn.addEventListener('click', fetchStationSettings);
    }

    async function fetchStationSettings() {
        displayMessage('settings-data', 'Chargement des paramètres de la station...');
        try {
            const response = await fetch('/api/station/settings');
            const data = await response.json();
            if (response.ok) {
                for (const key in data.settings) {
                    const span = document.getElementById(`setting-${key}`);
                    if (span) {
                        span.textContent = data.settings[key];
                    }
                }
                displayMessage('settings-data', data.message);
            } else {
                displayMessage('settings-data', `Erreur: ${data.error}`, true);
            }
        } catch (error) {
            displayMessage('settings-data', `Erreur de connexion: ${error.message}`, true);
        }
    }

    // Initialisation de la vue au chargement
    updateView();
});