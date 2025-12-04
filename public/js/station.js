// public/js/station.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

let currentStationSettings = null;
/**
 * Formate une durée en secondes au format HH:MM:SS.
 * @param {number} totalSeconds - Le nombre total de secondes.
 * @returns {string} La durée formatée.
 */
function formatDeltaTime(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

async function fetchStationSettings() {
    if (!selectedStation) {
        showGlobalStatus('Aucune station sélectionnée', 'error');
        return;
    }

    showGlobalStatus('Chargement des paramètres...', 'loading');

    try {
        const response = await fetch(`/api/station/${selectedStation.id}`);
        if (!response.ok) throw new Error('Erreur de récupération des paramètres');
        
        const data = await response.json();
        if (data.success && data.settings) {
            currentStationSettings = data.settings;
            displaySettingsForm();
            showGlobalStatus('Paramètres chargés avec succès', 'success');
        } else {
            throw new Error('Format de données invalide');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
        document.getElementById('settings-container').innerHTML = '';
    }
}

async function displaySettingsForm() {
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
            title: 'Localisation (synchronisée dans la Station Davis)',
            fields: ['longitude', 'latitude', 'longitudeEastWest', 'latitudeNorthSouth', 'altitude']
        },
        meteo: {
            title: 'Paramètres météo (synchronisés dans la Station Davis)',
            fields: ['archiveInterval','AMPMMode', 'dateFormat', 'windCupSize', 'rainCollectorSize', 'rainSaisonStart']
        },
        database: {
            title: 'Base de données',
            fields: ['dbexpand', 'forecast', 'cron']
        }
    };

    // Fetch Open-Meteo data range
    let openMeteoRange = { first: null, last: null };
    try {
        const rangeResponse = await fetch(`/query/${selectedStation.id}/Range/open-meteo_barometer`);
        const rangeData = await rangeResponse.json();
        if (rangeData.success) {
            openMeteoRange = { first: rangeData.metadata.first, last: rangeData.metadata.last };
        }
    } catch (e) { console.warn("Could not fetch Open-Meteo date range.", e); }

    let formHTML = '<form id="station-settings-form" class="settings-form">';
    
    Object.entries(groups).forEach(([groupKey, group]) => {
        formHTML += `
            <div class="settings-group">
                <h3>${group.title}</h3>
                <div class="settings-row">
        `;
        
        group.fields.forEach(fieldKey => {
            if (fieldKey === 'dbexpand') { // Special case for our new button
                const field = { comment: "Complète la base de données avec les archives d'Open-Meteo sur 50 ans pour cette localisation. (chaque jour a 23h30)" };
                formHTML += createDbExpandFieldHTML(field, openMeteoRange, currentStationSettings.cron?.openMeteo);
            } else if (fieldKey === 'forecast') { // Special case for forecast switch and model
                formHTML += createForecastFieldHTML(currentStationSettings.cron);
            } else if (currentStationSettings.hasOwnProperty(fieldKey) && !excludeKeys.includes(fieldKey)) {
                const field = currentStationSettings[fieldKey]; // Standard fields
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
            <button type="button" class="btn-primary" id="sync-time-btn">
                <img src="svg/access-control.svg" title="authentification requise!" class="access-control-icon">Synchroniser l'horloge
            </button>
            <button type="submit">
                <img src="svg/access-control.svg" title="authentification requise!" class="access-control-icon">Enregistrer
            </button>
        </div>
    </form>
    `;

    settingsContainer.innerHTML = formHTML;

    const form = document.getElementById('station-settings-form');
    const resetBtn = document.getElementById('reset-settings');
    const syncTimeBtn = document.getElementById('sync-time-btn');

    if (currentStationSettings.deltaTimeSeconds !== null) {
        const formattedDelta = formatDeltaTime(currentStationSettings.deltaTimeSeconds);
        syncTimeBtn.title = `Synchroniser l'horloge (delta ${formattedDelta})`;
    }

    if (currentStationSettings.deltaTimeSeconds > 5) {
        syncTimeBtn.classList.remove('btn-primary');
        syncTimeBtn.classList.add('btn-danger');
    }

    if (form) {
        form.addEventListener('submit', handleSettingsSubmit);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            displaySettingsForm();
        });
    }

    if (syncTimeBtn) {
        syncTimeBtn.addEventListener('click', async () => {
            if (!selectedStation) return;
            showGlobalStatus('Synchronisation de l\'horloge...', 'loading');
            syncTimeBtn.disabled = true;
            try {
                const datetimeResponse = await fetch(`/api/station/${selectedStation.id}/update-datetime`);
                const datetimeResult = await datetimeResponse.json();
                if (datetimeResult.success) {
                    showGlobalStatus(`Horloge synchronisée: ${datetimeResult.message}`, 'success');
                } else {
                    throw new Error(datetimeResult.error || 'Erreur inconnue lors de la synchronisation de l\'horloge.');
                }
            } catch (error) {
                console.error('Erreur lors de la synchronisation de l\'horloge:', error);
                showGlobalStatus(`Erreur de synchronisation de l'horloge: ${error.message}`, 'error');
            } finally {
                syncTimeBtn.disabled = false;
            }
        });
    }

    // --- Ajout des écouteurs pour les switchs avec mise à jour instantanée ---

    // 1. Switch pour la collecte automatique Open-Meteo
    const openMeteoCronSwitch = document.getElementById('setting-cron-openMeteo');
    if (openMeteoCronSwitch) {
        openMeteoCronSwitch.addEventListener('change', async (e) => {
            const switchElement = e.target;
            const isEnabled = switchElement.checked;
            const settings = { cron: { ...currentStationSettings.cron, openMeteo: isEnabled } };
            const success = await updatePartialSettings(settings);
            if (!success) {
                // Revenir à l'état précédent en cas d'échec
                switchElement.checked = !isEnabled;
            }
        });
    }

    // 2. Switch pour la collecte automatique de la station
    const cronToggleSwitch = document.getElementById('setting-cron-enabled');
    if (cronToggleSwitch) {
        cronToggleSwitch.addEventListener('change', async (e) => {
            const switchElement = e.target;
            const cronValueSelect = document.getElementById('setting-cron-value');
            const isEnabled = switchElement.checked;

            // Mettre à jour l'état visuel du select
            if (cronValueSelect) {
                cronValueSelect.disabled = !isEnabled;
            }

            const settings = { cron: { ...currentStationSettings.cron, enabled: isEnabled, value: Number(cronValueSelect.value) } };
            const success = await updatePartialSettings(settings);
            if (!success) {
                // Revenir à l'état précédent en cas d'échec
                switchElement.checked = !isEnabled;
                if (cronValueSelect) cronValueSelect.disabled = isEnabled; // Inverser aussi l'état du select
            }
        });
    }

    // 3. Switch et Select pour les prévisions Open-Meteo
    const forecastSwitch = document.getElementById('setting-cron-forecast');
    const forecastModelSelect = document.getElementById('setting-cron-model');

    if (forecastSwitch) {
        forecastSwitch.addEventListener('change', async (e) => {
            const switchElement = e.target;
            const isEnabled = switchElement.checked;
            
            if (forecastModelSelect) {
                forecastModelSelect.disabled = !isEnabled;
            }

            const settings = { cron: { ...currentStationSettings.cron, forecast: isEnabled } };
            const success = await updatePartialSettings(settings);
            if (!success) {
                switchElement.checked = !isEnabled;
                if (forecastModelSelect) forecastModelSelect.disabled = isEnabled;
            }
        });
    }

    if (forecastModelSelect) {
        forecastModelSelect.addEventListener('change', async (e) => {
            const selectElement = e.target;
            const modelValue = selectElement.value;

            const settings = { cron: { ...currentStationSettings.cron, model: modelValue } };
            const success = await updatePartialSettings(settings);
            if (!success) {
                // On pourrait remettre l'ancienne valeur ici si on la gardait en mémoire
            }
        });
    }
}
function createSettingFieldHTML(key, field) {
    if (key === 'cron') {
        return createCronFieldHTML(key, field);
    }

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

function createDbExpandFieldHTML(field, range, isEnabled) {
    const rangeText = (range.first && range.last)
        ? `Archived since ${new Date(range.first).toLocaleDateString()} to ${new Date(range.last).toLocaleDateString()}`
        : "No Open-Meteo data !";

    return `
        <div class="settings-field condition-tile">
            <label>
                ${formatSettingLabel('dbexpand')}
                <span class="tooltip" data-tooltip="${field.comment}">?</span>
            </label>
            <div class="db-expand-controls" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                <div class="cron-container">
                    <label class="switch" title="Activer la mise à jour quotidienne à 23h30">
                        <input type="checkbox" id="setting-cron-openMeteo" ${isEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                    <text>${rangeText}</text>
                </div>
            </div>
        </div>
    `;
}

function createForecastFieldHTML(cronSettings) {
    const isEnabled = cronSettings && cronSettings.forecast === true;
    const currentModel = (cronSettings && cronSettings.model) ? cronSettings.model : 'best_match';

    const models = [
        { value: 'best_match', label: 'Best Match (14d)' },
        { value: 'meteofrance_arome_france', label: 'Météo-France AROME France (4d)' },
        { value: 'meteofrance_arome_france_hd', label: 'Météo-France AROME France HD (2d)' },
        { value: 'meteofrance_arpege_europe', label: 'Météo-France ARPEGE Europe (4d)' },
        { value: 'meteofrance_arpege_world', label: 'Météo-France ARPEGE World (4d)' },
        { value: 'meteofrance_seamless', label: 'Météo-France Seamless (4d)' }
    ];

    let optionsHTML = models.map(m => 
        `<option value="${m.value}" ${m.value === currentModel ? 'selected' : ''}>${m.label}</option>`
    ).join('');

    return `
        <div class="settings-field condition-tile">
            <label>
                Collect local forecast
                <span class="tooltip" data-tooltip="Récupération automatique des prévisions toutes les heures, pour cette localisation">?</span>
            </label>
            <div class="cron-container">
                <label class="switch" title="Activer la récupération horaire">
                    <input type="checkbox" id="setting-cron-forecast" ${isEnabled ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
                <select id="setting-cron-model" ${!isEnabled ? 'disabled' : ''}>
                    ${optionsHTML}
                </select>
            </div>
        </div>
    `;
}

function createCronFieldHTML(key, field) {
    const label = formatSettingLabel(key);
    const tooltip = field.comment || '';
    const tooltipHTML = tooltip ? `<span class="tooltip" data-tooltip="${tooltip}">?</span>` : '';
    const isEnabled = field.enabled;
    const currentValue = field.value;
    const options = [5, 10, 15, 30, 60, 120, 240, 480];

    let optionsHTML = options.map(opt => 
        `<option value="${opt}" ${opt == currentValue ? 'selected' : ''}>${opt} minutes</option>`
    ).join('');

    // If current value is not in options, add it.
    if (currentValue && !options.includes(currentValue)) {
        optionsHTML = `<option value="${currentValue}" selected>${currentValue} minutes (custom)</option>` + optionsHTML;
    }

    return `
        <div class="settings-field condition-tile">
            <label for="setting-${key}-value">
                ${label}
                ${tooltipHTML}
            </label>
            <div class="cron-container">
                <label class="switch">
                    <input type="checkbox" id="setting-${key}-enabled" ${isEnabled ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
                <select id="setting-${key}-value" name="cron-value" ${!isEnabled ? 'disabled' : ''}>
                    ${optionsHTML}
                </select>
            </div>
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
        'longitudeEastWest': 'Longitude Est/Ouest',
        'cron': 'Collecte auto. (station)',
        'dbexpand': 'Collect historical data',
    };
    
    return labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

async function handleSettingsSubmit(e) {
    const stationSyncFields = ['longitude', 'latitude', 'longitudeEastWest', 'latitudeNorthSouth', 'altitude', 'archiveInterval','AMPMMode', 'dateFormat', 'windCupSize', 'rainCollectorSize', 'rainSaisonStart'];
    e.preventDefault();
    if (!selectedStation) return;

    const formData = new FormData(e.target);
    const settings = {};

    for (let [key, value] of formData.entries()) {
        if (key === 'cron-value') continue; // Géré par le switch
        if (key.startsWith('cron-')) continue; // Skip cron fields for now

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

    // Handle special cron field
    if (currentStationSettings.cron) {
        // Collecte Station
        const cronToggleSwitch = document.getElementById('setting-cron-enabled');
        const cronValueSelect = document.getElementById('setting-cron-value');
        
        // Collecte Historique OpenMeteo
        const openMeteoToggle = document.getElementById('setting-cron-openMeteo');

        // Prévisions OpenMeteo
        const forecastToggle = document.getElementById('setting-cron-forecast');
        const forecastModel = document.getElementById('setting-cron-model');
        
        // Reconstruire l'objet cron complet
        settings.cron = {
            ...currentStationSettings.cron,
        };

        if (cronToggleSwitch && cronValueSelect) {
            settings.cron.enabled = cronToggleSwitch.checked;
            settings.cron.value = Number(cronValueSelect.value);
        }

        if (openMeteoToggle) {
            settings.cron.openMeteo = openMeteoToggle.checked;
        }

        if (forecastToggle) {
            settings.cron.forecast = forecastToggle.checked;
        }
        
        if (forecastModel) {
            settings.cron.model = forecastModel.value;
        }
    }
    showGlobalStatus('Enregistrement des paramètres...', 'loading');

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
        
        // Vérifier si un champ nécessitant la synchronisation a été modifié
        let needsSync = false;
        for (const field of stationSyncFields) {
            if (settings[field] && settings[field].desired !== currentStationSettings[field].desired) {
                needsSync = true;
                break;
            }
        }

        if (needsSync) {
            showGlobalStatus('Synchronisation avec la station...', 'loading');
            const syncResponse = await fetch(`/api/station/${selectedStation.id}/sync-settings`);
            const syncResult = await syncResponse.json();
            if (!syncResult.success) {
                console.warn('Avertissement synchronisation:', syncResult.message || 'Erreur inconnue');
            }
        }

        showGlobalStatus('Paramètres sauvegardés et synchronisés avec succès', 'success');
        
        setTimeout(() => {
            fetchStationSettings();
        }, 2000);

    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function updatePartialSettings(settings) {
    if (!selectedStation) return false;
    showGlobalStatus('Enregistrement...', 'loading');

    try {
        const response = await fetch(`/api/station/${selectedStation.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Erreur lors de la sauvegarde');

        // Mettre à jour la configuration locale pour que les actions suivantes soient correctes
        Object.assign(currentStationSettings, result.settings);

        showGlobalStatus('Paramètre mis à jour', 'success');
        return true;
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
        return false;
    }
}