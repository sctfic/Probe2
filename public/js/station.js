let currentStationSettings = null;

async function fetchStationSettings() {
    if (!selectedStation) {
        showSettingsStatus('Aucune station sélectionnée', 'error');
        return;
    }

    showSettingsStatus('Chargement des paramètres...', 'loading');

    try {
        const response = await fetch(`/api/station/${selectedStation.id}`);
        if (!response.ok) throw new Error('Erreur de récupération des paramètres');
        
        const data = await response.json();
        if (data.success && data.settings) {
            currentStationSettings = data.settings;
            displaySettingsForm();
            showSettingsStatus('Paramètres chargés avec succès', 'success');
        } else {
            throw new Error('Format de données invalide');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showSettingsStatus(`Erreur: ${error.message}`, 'error');
        document.getElementById('settings-container').innerHTML = '';
    }
}

function displaySettingsForm() {
    const settingsContainer = document.getElementById('settings-container');
    if (!settingsContainer || !currentStationSettings) return;

    const excludeKeys = ['id', 'lastArchiveDate', 'deltaTimeSeconds', 'path'];
    
    const groups = {
        identity: {
            title: 'Identité',
            fields: ['name', 'location', 'comment']
        },
        network: {
            title: 'Configuration Réseau',
            fields: ['host', 'port']
        },
        localisation: {
            title: 'Localisation',
            fields: ['longitude', 'latitude', 'longitudeEastWest', 'latitudeNorthSouth', 'altitude']
        },
        meteo: {
            title: 'Station Météo',
            fields: ['archiveInterval','AMPMMode', 'dateFormat', 'windCupSize', 'rainCollectorSize', 'rainSaisonStart']
        }
    };

    let formHTML = '<form id="station-settings-form" class="settings-form">';
    
    Object.entries(groups).forEach(([groupKey, group]) => {
        formHTML += `
            <div class="settings-group">
                <h3>${group.title}</h3>
                <div class="settings-row">
        `;
        
        group.fields.forEach(fieldKey => {
            if (currentStationSettings.hasOwnProperty(fieldKey) && !excludeKeys.includes(fieldKey)) {
                const field = currentStationSettings[fieldKey];
                formHTML += createSettingFieldHTML(fieldKey, field);
            }
        });
        
        formHTML += `
                </div>
            </div>
        `;
    });

    formHTML += `
        <div class="settings-actions">
            <button type="button" class="btn-secondary" id="reset-settings">Annuler</button>
            <button type="submit">Enregistrer</button>
        </div>
    </form>
    `;

    settingsContainer.innerHTML = formHTML;

    const form = document.getElementById('station-settings-form');
    const resetBtn = document.getElementById('reset-settings');

    if (form) {
        form.addEventListener('submit', handleSettingsSubmit);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            displaySettingsForm();
        });
    }
}

function createSettingFieldHTML(key, field) {
    const label = formatSettingLabel(key);
    let value = '';
    let tooltip = '';

    if (typeof field === 'object' && field !== null) {
        value = field.desired !== undefined ? field.desired : field.value || '';
        
        const tooltipParts = [];
        if (field.comment) tooltipParts.push(field.comment);
        if (field.lastReadValue !== undefined) tooltipParts.push(`Valeur actuelle: ${field.lastReadValue}`);
        tooltip = tooltipParts.join(' | ');
    } else {
        value = field;
    }

    const inputType = getInputTypeForField(key, value);
    const tooltipHTML = tooltip ? `<span class="tooltip" data-tooltip="${tooltip}">?</span>` : '';

    return `
        <div class="settings-field condition-tile">
            <label for="setting-${key}">
                ${label}
                ${tooltipHTML}
            </label>
            ${createInputHTML(key, value, inputType)}
        </div>
    `;
}

function createInputHTML(key, value, inputType) {
    if (inputType === 'select') {
        return createSelectHTML(key, value);
    }

    return `<input type="${inputType}" id="setting-${key}" name="${key}" value="${value}" ${key=='timezone'?'readonly':''}>`;
}

function createSelectHTML(key, value) {
    const selectOptions = {
        'AMPMMode': [
            { value: 0, label: 'AM/PM' },
            { value: 1, label: '24h' }
        ],
        'dateFormat': [
            { value: 0, label: 'Mois/Jour' },
            { value: 1, label: 'Jour/Mois' }
        ],
        'windCupSize': [
            { value: 0, label: 'Petit' },
            { value: 1, label: 'Grand' }
        ],
        'rainCollectorSize': [
            { value: 0, label: '0.01in' },
            { value: 1, label: '0.2mm' },
            { value: 2, label: '0.1mm' }
        ],
        'latitudeNorthSouth': [
            { value: 0, label: 'Sud' },
            { value: 1, label: 'Nord' }
        ],
        'longitudeEastWest': [
            { value: 0, label: 'Est' },
            { value: 1, label: 'Ouest' }
        ],
        'archiveInterval': [
            { value: 1, label: '1 min' },
            { value: 5, label: '5 min' },
            { value: 10, label: '10 min' },
            { value: 15, label: '15 min' },
            { value: 30, label: '30 min' },
            { value: 60, label: '1 heure' },
            { value: 120, label: '2 heures' }
        ]
    };

    if (!selectOptions[key]) return `<input type="text" id="setting-${key}" name="${key}" value="${value}">`;

    let optionsHTML = '';
    selectOptions[key].forEach(option => {
        const selected = option.value == value ? 'selected' : '';
        optionsHTML += `<option value="${option.value}" ${selected}>${option.label}</option>`;
    });

    return `<select id="setting-${key}" name="${key}">${optionsHTML}</select>`;
}

function getInputTypeForField(key, value) {
    if (['AMPMMode', 'archiveInterval', 'dateFormat', 'windCupSize', 'rainCollectorSize', 'latitudeNorthSouth', 'longitudeEastWest'].includes(key)) {
        return 'select';
    }
    if (['port', 'rainSaisonStart'].includes(key)) {
        return 'number';
    }
    if (['longitude', 'latitude', 'altitude'].includes(key)) {
        return 'number';
    }
    return 'text';
}

function formatSettingLabel(key) {
    const labelMap = {
        'name': 'Nom de la station',
        'archiveInterval': 'Intervalle archive (min)',
        'comment': 'Description',
        'host': 'Adresse IP/Host',
        'port': 'Port',
        'location': 'Emplacement',
        'longitude': 'Longitude',
        'latitude': 'Latitude',
        'altitude': 'Altitude (m)',
        'AMPMMode': 'Format heure',
        'dateFormat': 'Format date',
        'windCupSize': 'Taille anémomètre',
        'rainCollectorSize': 'Taille pluviomètre',
        'rainSaisonStart': 'Mois début saison pluie',
        'latitudeNorthSouth': 'Latitude Nord/Sud',
        'longitudeEastWest': 'Longitude Est/Ouest'
    };
    
    return labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    if (!selectedStation) return;

    const formData = new FormData(e.target);
    const settings = {};

    for (let [key, value] of formData.entries()) {
        const currentField = currentStationSettings[key];
        
        if (typeof currentField === 'object' && currentField !== null) {
            settings[key] = {
                ...currentField,
                desired: isNaN(value) ? value : Number(value)
            };
        } else {
            settings[key] = isNaN(value) ? value : Number(value);
        }
    }

    showSettingsStatus('Enregistrement des paramètres...', 'loading');

    try {
        const response = await fetch(`/api/station/${selectedStation.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        const result = await response.json();
        if (!result.success) throw new Error('Erreur lors de la sauvegarde');

        showSettingsStatus('Synchronisation avec la station...', 'loading');

        const syncResponse = await fetch(`/api/station/${selectedStation.id}/sync-settings`);
        const syncResult = await syncResponse.json();
        if (!syncResult.success) {
            console.warn('Avertissement synchronisation:', syncResult.message || 'Erreur inconnue');
        }

        showSettingsStatus('Mise à jour de la date/heure...', 'loading');

        const datetimeResponse = await fetch(`/api/station/${selectedStation.id}/update-datetime`);
        const datetimeResult = await datetimeResponse.json();
        if (!datetimeResult.success) {
            console.warn('Avertissement mise à jour date/heure:', datetimeResult.message || 'Erreur inconnue');
        }

        showSettingsStatus('Paramètres sauvegardés et synchronisés avec succès', 'success');
        
        setTimeout(() => {
            fetchStationSettings();
        }, 2000);

    } catch (error) {
        console.error('Erreur:', error);
        showSettingsStatus(`Erreur: ${error.message}`, 'error');
    }
}

function showSettingsStatus(message, type) {
    const statusEl = document.getElementById('status-bar');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = message ? 'block' : 'none';

    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}