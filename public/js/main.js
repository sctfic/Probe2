// public/js/app.js

document.addEventListener('DOMContentLoaded', () => {

// Fonction pour vérifier si un élément existe
function elementExists(id) {
    const el = document.getElementById(id);
    console.log(`Element ${id} exists:`, !!el);
    return !!el;
}

// Fonction pour vérifier les écouteurs d'événements
function checkEventListeners(elementId, eventType) {
    const el = document.getElementById(elementId);
    if (!el) {
        console.log(`Element ${elementId} not found`);
        return;
    }
    
    const listeners = getEventListeners(el);
    console.log(`Listeners for ${elementId} (${eventType}):`, listeners[eventType] || []);
}


    const navItems = document.querySelectorAll('.navbar nav ul li');
    const sections = document.querySelectorAll('.content-section');
    const contentContainer = document.getElementById('content-container');
    let currentIndex = 0; // Index de la section active

    // --- Navigation Logic ---
    
    // Fonction pour mettre à jour la vue
    const updateView = () => {
        // Déplace le conteneur pour afficher la section courante
        if (contentContainer) {
            contentContainer.style.transform = `translateX(-${currentIndex * 100}vw)`;
        }

        // Met à jour la classe 'active' pour la navigation
        navItems.forEach((item, index) => {
            if (index === currentIndex) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Trigger data fetch for the active section
        const activeSectionId = sections[currentIndex].id;
        if (activeSectionId === 'currents-section') {
            // fetchCurrentConditions();
        } else if (activeSectionId === 'settings-section') {
            // fetchStationSettings();
        } else if (activeSectionId === 'stations-section') {
            initStationsSection();
        }
    };

    // Gestion du clic sur les éléments de la barre de navigation
    navItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            currentIndex = index;
            // Reset transition for direct clicks to avoid visual glitches from swipe
            if (contentContainer) {
                contentContainer.style.transition = 'transform 0.3s ease-out';
                updateView();
                // Remove transition after a short delay to allow new swipes
                setTimeout(() => { contentContainer.style.transition = ''; }, 300);
            }
        });
    });

    // --- Gestion du glissement latéral (swipe) ---
    let startX = 0;
    let endX = 0;
    let isSwiping = false;

    if (contentContainer) {
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
            if (contentContainer) {
                contentContainer.style.transition = 'transform 0.3s ease-out';
                updateView();

                // Réinitialise la transition après un court délai pour permettre le nouveau swipe
                setTimeout(() => {
                    contentContainer.style.transition = '';
                }, 300);
            }
        });
    }

    // --- Stations Section Logic ---
    const addStationBtn = document.getElementById('add-station-btn');
    const filterStationsInput = document.getElementById('filter-stations');
    const stationsListContainer = document.getElementById('stations-list');
    const stationModal = document.getElementById('station-modal');
    const stationForm = document.getElementById('station-form');
    const modalTitle = document.getElementById('modal-title');
    const cancelStationBtn = document.getElementById('cancel-station');
    const stationIdInput = document.getElementById('station-id');

    // Configuration des stations
    let stationsConfig = {};

    function initStationsSection() {
        console.log("Initializing stations section");
        
        // Vérifier l'existence des éléments
        elementExists('add-station-btn');
        elementExists('station-modal');
        elementExists('station-form');
        
        // Vérifier les écouteurs d'événements
        if (addStationBtn) {
            addStationBtn.addEventListener('click', () => {
                console.log("Add station button clicked");
                showAddStationModal();
            });
        } else {
            console.error("Add station button not found");
        }
        
        if (filterStationsInput) filterStationsInput.addEventListener('input', filterStations);
        if (stationForm) stationForm.addEventListener('submit', handleStationSubmit);
        
        if (cancelStationBtn) {
            cancelStationBtn.addEventListener('click', () => {
                console.log("Cancel button clicked");
                hideStationModal();
            });
        } else {
            console.error("Cancel button not found");
        }
        
        loadStations();
    }

    // Charger les stations depuis l'API
    async function loadStations() {
        try {
            const response = await fetch('http://probe2.lpz.ovh/api/config/vp2');
            if (!response.ok) throw new Error('Network response was not ok');
            stationsConfig = await response.json();
            renderStationsList();
        } catch (error) {
            console.error('Erreur de chargement des stations:', error);
            if (stationsListContainer) {
                stationsListContainer.innerHTML = `<p class="error">Erreur de chargement des stations: ${error.message}</p>`;
            }
        }
    }

    // Afficher la liste des stations
    function renderStationsList() {
        if (!stationsListContainer) return;
        
        stationsListContainer.innerHTML = '';
        
        // Créer un tableau de stations pour le tri
        const stationsArray = Object.keys(stationsConfig).map(id => ({
            id,
            ...stationsConfig[id]
        }));
        
        // Trier par dernière date d'archive
        stationsArray.sort((a, b) => 
            new Date(b.lastArchiveDate || 0) - new Date(a.lastArchiveDate || 0));
        
        stationsArray.forEach(station => {
            const stationElement = createStationElement(station);
            stationsListContainer.appendChild(stationElement);
        });
    }

    // Créer un élément de station
    function createStationElement(station) {
        const stationItem = document.createElement('div');
        stationItem.className = 'station-item';
        stationItem.dataset.id = station.id;
        
        const lastArchiveDate = station.lastArchiveDate ? 
            new Date(station.lastArchiveDate).toLocaleString() : 'N/A';
        
        stationItem.innerHTML = `
            <div class="station-header">
                <div>
                    <span class="station-name">${station.name}</span>
                    <span class="station-last-archive">${lastArchiveDate}</span>
                </div>
                <div>▶</div>
            </div>
            <div class="station-details">
                <div class="station-properties"></div>
                <div class="station-actions">
                    <button class="edit-station">Modifier</button>
                    <button class="delete-station">Supprimer</button>
                </div>
            </div>
        `;
        
        // Remplir les propriétés
        const propertiesContainer = stationItem.querySelector('.station-properties');
        if (propertiesContainer) {
            Object.keys(station).forEach(key => {
                if (key === 'id' || key === 'name' || key === 'lastName' || key === 'comment' || 
                    key === 'lastArchiveDate' || key === 'deltaTimeSeconds') return;
                    
                let value = station[key];
                
                // Gérer les objets imbriqués
                if (typeof value === 'object' && value !== null) {
                    value = value.value !== undefined ? value.value : JSON.stringify(value);
                }
                
                const propertyItem = document.createElement('div');
                propertyItem.className = 'property-item';
                propertyItem.innerHTML = `
                    <span class="property-label">${key}:</span>
                    <div class="property-value">${value}</div>
                `;
                
                propertiesContainer.appendChild(propertyItem);
            });
        }
        
        // Ajouter les écouteurs d'événements
        const header = stationItem.querySelector('.station-header');
        const editBtn = stationItem.querySelector('.edit-station');
        const deleteBtn = stationItem.querySelector('.delete-station');
        
        if (header) {
            header.addEventListener('click', () => {
                const details = stationItem.querySelector('.station-details');
                if (details) {
                    details.classList.toggle('visible');
                    const arrow = header.querySelector('div:last-child');
                    if (arrow) {
                        arrow.textContent = details.classList.contains('visible') ? '▼' : '▶';
                    }
                }
            });
        }
        
        if (editBtn) {
            editBtn.addEventListener('click', () => showEditStationModal(station.id));
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteStation(station.id));
        }
        
        return stationItem;
    }

    // Filtrer les stations
    function filterStations() {
        if (!filterStationsInput || !stationsListContainer) return;
        
        const filter = filterStationsInput.value.toLowerCase();
        const stationItems = stationsListContainer.querySelectorAll('.station-item');
        
        stationItems.forEach(item => {
            const stationId = item.dataset.id;
            const station = stationsConfig[stationId];
            if (!station) return;
            
            const name = station.name ? station.name.toLowerCase() : '';
            const host = station.host ? station.host.toLowerCase() : '';
            const comment = station.comment ? station.comment.toLowerCase() : '';
            
            if (name.includes(filter) || host.includes(filter) || comment.includes(filter)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Afficher le modal pour ajouter une station
    function showAddStationModal() {
        if (!modalTitle || !stationForm || !stationModal) return;
        
        modalTitle.textContent = 'Ajouter une station';
        if (stationIdInput) stationIdInput.value = '';
        if (stationForm) stationForm.reset();
        stationModal.style.display = 'flex';
    }

    // Afficher le modal pour modifier une station
    function showEditStationModal(stationId) {
        const station = stationsConfig[stationId];
        if (!station || !modalTitle || !stationIdInput) return;
        
        modalTitle.textContent = `Modifier ${station.name}`;
        stationIdInput.value = stationId;
        
        // Remplir le formulaire avec les données de la station
        const nameInput = document.getElementById('station-name');
        const hostInput = document.getElementById('station-host');
        const portInput = document.getElementById('station-port');
        const commentInput = document.getElementById('station-comment');
        const latitudeInput = document.getElementById('station-latitude');
        const longitudeInput = document.getElementById('station-longitude');
        const altitudeInput = document.getElementById('station-altitude');
        const isampmmodeInput = document.getElementById('station-isampmmode');
        const dateformatInput = document.getElementById('station-dateformat');
        const windcupsizeInput = document.getElementById('station-windcupsize');
        const raincollectorsizeInput = document.getElementById('station-raincollectorsize');
        const rainseasonstartInput = document.getElementById('station-rainseasonstart');
        const ampmmodeInput = document.getElementById('station-ampmmode');
        const archiveintervalInput = document.getElementById('station-archiveinterval');
        const archiverecordsenableInput = document.getElementById('station-archiverecordsenable');
        
        if (nameInput) nameInput.value = station.name;
        if (hostInput) hostInput.value = station.host;
        if (portInput) portInput.value = station.port;
        if (commentInput) commentInput.value = station.comment || '';
        
        // Paramètres géographiques
        if (latitudeInput) latitudeInput.value = station.latitude?.value || '';
        if (longitudeInput) longitudeInput.value = station.longitude?.value || '';
        if (altitudeInput) altitudeInput.value = station.altitude?.value || '';
        
        // Autres paramètres
        if (isampmmodeInput) isampmmodeInput.value = station.isAMPMMode?.value || '0';
        if (dateformatInput) dateformatInput.value = station.dateFormat?.value || '0';
        if (windcupsizeInput) windcupsizeInput.value = station.windCupSize?.value || '0';
        if (raincollectorsizeInput) raincollectorsizeInput.value = station.rainCollectorSize?.value || '0';
        if (rainseasonstartInput) rainseasonstartInput.value = station.rainSaisonStart?.value || '1';
        if (ampmmodeInput) ampmmodeInput.value = station.AMPMMode?.value || '0';
        if (archiveintervalInput) archiveintervalInput.value = station.archiveInterval?.value || '10';
        if (archiverecordsenableInput) {
            archiverecordsenableInput.checked = station.archiveRecordsEnable?.value || true;
        }
        
        stationModal.style.display = 'flex';
    }

    // Cacher le modal
    function hideStationModal() {
        if (stationModal) stationModal.style.display = 'none';
    }

    // Gérer la soumission du formulaire
    async function handleStationSubmit(e) {
        e.preventDefault();
        
        const stationId = stationIdInput ? stationIdInput.value : '';
        const isNewStation = !stationId;
        
        // Récupérer les valeurs du formulaire
        const nameInput = document.getElementById('station-name');
        const hostInput = document.getElementById('station-host');
        const portInput = document.getElementById('station-port');
        const commentInput = document.getElementById('station-comment');
        const latitudeInput = document.getElementById('station-latitude');
        const longitudeInput = document.getElementById('station-longitude');
        const altitudeInput = document.getElementById('station-altitude');
        const isampmmodeInput = document.getElementById('station-isampmmode');
        const dateformatInput = document.getElementById('station-dateformat');
        const windcupsizeInput = document.getElementById('station-windcupsize');
        const raincollectorsizeInput = document.getElementById('station-raincollectorsize');
        const rainseasonstartInput = document.getElementById('station-rainseasonstart');
        const ampmmodeInput = document.getElementById('station-ampmmode');
        const archiveintervalInput = document.getElementById('station-archiveinterval');
        const archiverecordsenableInput = document.getElementById('station-archiverecordsenable');
        
        if (!nameInput || !hostInput || !portInput) {
            alert('Les champs obligatoires (Nom, Hôte, Port) sont requis');
            return;
        }
        
        const stationData = {
            name: nameInput.value,
            host: hostInput.value,
            port: parseInt(portInput.value),
            comment: commentInput ? commentInput.value : '',
            
            // Paramètres géographiques
            latitude: { value: latitudeInput ? parseFloat(latitudeInput.value) || 0 : 0 },
            longitude: { value: longitudeInput ? parseFloat(longitudeInput.value) || 0 : 0 },
            altitude: { value: altitudeInput ? parseInt(altitudeInput.value) || 0 : 0 },
            
            // Autres paramètres
            isAMPMMode: { value: isampmmodeInput ? parseInt(isampmmodeInput.value) || 0 : 0 },
            dateFormat: { value: dateformatInput ? parseInt(dateformatInput.value) || 0 : 0 },
            windCupSize: { value: windcupsizeInput ? parseInt(windcupsizeInput.value) || 0 : 0 },
            rainCollectorSize: { value: raincollectorsizeInput ? parseInt(raincollectorsizeInput.value) || 0 : 0 },
            rainSaisonStart: { value: rainseasonstartInput ? parseInt(rainseasonstartInput.value) || 0 : 0 },
            AMPMMode: { value: ampmmodeInput ? parseInt(ampmmodeInput.value) || 0 : 0 },
            archiveInterval: { value: archiveintervalInput ? parseInt(archiveintervalInput.value) || 10 : 10 },
            archiveRecordsEnable: { value: archiverecordsenableInput ? archiverecordsenableInput.checked : true }
        };
        
        try {
            let response;
            let newId = '';
            
            if (isNewStation) {
                // Générer un ID unique
                newId = `vp2_${stationData.name.replace(/\s+/g, '_')}`;
                
                // Ajouter la nouvelle station
                response = await fetch(`http://probe2.lpz.ovh/api/config/vp2/${newId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stationData)
                });
            } else {
                // Mettre à jour la station existante
                response = await fetch(`http://probe2.lpz.ovh/api/config/vp2/${stationId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stationData)
                });
            }
            
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Une erreur est survenue');
            }
            
            // Recharger la liste des stations
            await loadStations();
            hideStationModal();
        } catch (error) {
            alert(`Erreur: ${error.message}`);
        }
    }

    // Supprimer une station
    async function deleteStation(stationId) {
        const station = stationsConfig[stationId];
        if (!station) {
            alert('Station introuvable !');
            return;
        }
        
        if (!confirm(`Êtes-vous sûr de vouloir supprimer la station ${station.name}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`http://probe2.lpz.ovh/api/config/vp2/${stationId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Une erreur est survenue');
            }
            
            // Recharger la liste des stations
            await loadStations();
        } catch (error) {
            alert(`Erreur: ${error.message}`);
        }
    }

    // --- API Interaction Logic (autres fonctions) ---

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
        const stationId = 'vp2_Serramoune'; // TODO: Rendre ceci dynamique en fonction de la sélection de l'utilisateur
        setTimeBtn.addEventListener('click', async () => {
            displayMessage('time-status', 'Synchronisation en cours...');
            try {
                const response = await fetch(`/api/station/${stationId}/set-time`);
                const data = await response.json();
                console.log('Set time response:', data);
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
            const stationId = 'vp2_Serramoune'; // TODO: Rendre ceci dynamique
            e.preventDefault();
            displayMessage('location-status', 'Définition de la localisation en cours...');
            const latitude = parseFloat(document.getElementById('latitude').value);
            const longitude = parseFloat(document.getElementById('longitude').value);
            const elevation = parseInt(document.getElementById('elevation').value, 10);

            try {
                const response = await fetch(`/api/station/${stationId}/set-location`, {
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
                if (presetOptionsDiv) presetOptionsDiv.style.display = 'block';
                if (customOptionsDiv) customOptionsDiv.style.display = 'none';
            } else {
                if (presetOptionsDiv) presetOptionsDiv.style.display = 'none';
                if (customOptionsDiv) customOptionsDiv.style.display = 'block';
            }
        });
        // Initial state
        timezoneTypeSelect.dispatchEvent(new Event('change'));
    }

    if (setTimezoneForm) {
        setTimezoneForm.addEventListener('submit', async (e) => {
            const stationId = 'vp2_Serramoune'; // TODO: Rendre ceci dynamique
            e.preventDefault();
            displayMessage('timezone-status', 'Définition du fuseau horaire en cours...');
            const type = timezoneTypeSelect.value;
            let body = { type };
            if (type === 'preset') {
                const indexInput = document.getElementById('timezone-index');
                if (indexInput) body.index = parseInt(indexInput.value, 10);
            } else {
                const offsetInput = document.getElementById('timezone-offset');
                if (offsetInput) body.offsetGMT = parseInt(offsetInput.value, 10);
            }

            try {
                const response = await fetch(`/api/station/${stationId}/set-timezone`, {
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
        const stationId = 'vp2_Serramoune'; // TODO: Rendre ceci dynamique
        displayMessage('conditions-data', 'Chargement des conditions actuelles...');
        try {
            const response = await fetch(`/api/station/${stationId}/current-conditions`);
            const data = await response.json();
            if (response.ok) {
                // Supposons que data.data est l'objet avec les valeurs converties
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

    // Get Station Settings
    const getSettingsBtn = document.getElementById('get-settings-btn');
    if (getSettingsBtn) {
        getSettingsBtn.addEventListener('click', fetchStationSettings);
    }

    async function fetchStationSettings() {
        const stationId = 'vp2_Serramoune'; // TODO: Rendre ceci dynamique
        displayMessage('settings-data', 'Chargement des paramètres de la station...');
        try {
            const response = await fetch(`/api/station/${stationId}/settings`);
            const data = await response.json();
            if (response.ok) {
                // Supposons que data.settings est l'objet avec les paramètres
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