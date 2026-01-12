// public/js/station.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

let currentStationSettings = null;
// Variable globale pour stocker l'état des extendeurs pendant l'édition
// Structure: { "WhisperEye": [ {name, host...} ], "Venti'Connect": [] }
let localExtendersState = {
    "WhisperEye": [],
    "Venti'Connect": []
};

// Variable pour suivre l'onglet actif (identifié par type + index, ex: "WhisperEye-0")
let activeExtenderTab = null;

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

// Génère une clé API sécurisée pour les URLs
function generateApiKey() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function fetchStationSettings(data = null) {
    if (!selectedStation) {
        showGlobalStatus('Aucune station sélectionnée', 'error');
        return;
    }

    showGlobalStatus('Chargement des paramètres...', 'loading');

    try {

        if (!data) {
            const response = await fetch(`/api/station/${selectedStation.id}`);
            if (!response.ok) throw new Error('Erreur de récupération des paramètres');
            data = await response.json();
        }

        if (data.success && data.settings) {
            currentStationSettings = data.settings;

            // Initialisation de l'état local des extendeurs
            if (currentStationSettings.extenders) {
                localExtendersState = JSON.parse(JSON.stringify(currentStationSettings.extenders));
            } else {
                localExtendersState = { "WhisperEye": [], "Venti'Connect": [] };
            }

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

    // Injection du style CSS UNIQUEMENT pour les onglets et le contenu des extendeurs
    // Le style de la MODALE est désormais géré par le CSS global de index.html
    if (!document.getElementById('extender-styles')) {
        const style = document.createElement('style');
        style.id = 'extender-styles';
        style.textContent = `
            /* Styles des onglets */
            .extender-tabs-container {
                display: flex;
                align-items: center;
            }
            .extender-tabs-list {
                display: flex;
                gap: 5px;
                flex-grow: 1;
                overflow-x: auto;
            }
            .extender-tab { 
                background: #333; 
                border: none; 
                color: #aaa; 
                padding: 6px 10px; 
                cursor: pointer; 
                font-weight: bold;
                border-top-left-radius: 5px;
                border-top-right-radius: 5px;
                transition: all 0.2s;
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .extender-tab:hover { background: #444; color: #fff; }
            .extender-tab.active { background: #555; color: #fff; border-bottom: 2px solid #007bff; }
            
            /* Badge de type caché par défaut, visible au survol */
            .extender-type-badge {
                font-size: 0.7em;
                background: #222;
                padding: 2px 5px;
                border-radius: 4px;
                color: #888;
                display: none; 
            }
            .extender-tab:hover .extender-type-badge, 
            .extender-tab.active .extender-type-badge {
                display: inline-block;
            }

            /* Bouton Ajout dans la barre d'onglets */
            .btn-add-tab {
                background: #28a745;
                color: white;
                border: none;
                padding: 5px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                margin-left: 10px;
                height: 30px;
                display: flex;
                align-items: center;
            }
            .btn-add-tab:hover { background: #218838; }

            /* Contenu de l'extendeur */
            .extender-details { 
                background: #2a2a2a; 
                padding: 15px; 
                border-radius: 6px; 
                border: 1px solid #444; 
            }
            
            /* Header de l'extendeur */
            .extender-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                border-bottom: 1px solid #444;
                padding-bottom: 10px;
            }

            .extender-form-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
            .extender-form-row label { width: 120px; font-size: 0.9em; color: #ccc; }
            .extender-form-row input { flex: 1; background: #111; border: 1px solid #555; color: white; padding: 6px; border-radius: 4px; }
            .extender-form-row input:focus { border-color: #007bff; outline: none; }
            
            .ping-indicator {
                display: inline-block; width: 10px; height: 10px; border-radius: 50%; 
                background-color: #555; margin-right: 5px;
            }
            .ping-success { background-color: #28a745; box-shadow: 0 0 5px #28a745; }
            .ping-fail { background-color: #dc3545; }
            
            .btn-delete-extender {
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            .btn-delete-extender:hover {
                opacity: 1;
            }

        /* Styles pour les tuiles avec bouton d'action */
        .condition-tile {
            position: relative;
        }
        .tile-action-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            transition: all 0.2s;
            cursor: pointer;
            text-decoration: none;
        }
        .tile-action-btn:hover {
        }
        .tile-action-btn svg {
            width: 16px;
            height: 16px;
            fill: #aaa;
        }
        .tile-action-btn:hover svg {
            fill: var(--accent-blue);
            transform: scale(1.2);
        }
        .tile-action-btn-secondary {
            position: absolute;
            top: 8px;
            right: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 24px;
            padding: 0 6px;
            border-radius: 4px;
            transition: all 0.2s;
            cursor: pointer;
            text-decoration: none;
            background: rgba(255, 255, 255, 0.1);
            color: #aaa;
            font-size: 0.75em;
            font-weight: bold;
            border: 1px solid transparent;
        }
        .tile-action-btn-secondary:hover {
            color: var(--accent-blue);
            background: rgba(255, 255, 255, 0.2);
            border-color: var(--accent-blue);
        }
        .spinner {
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: var(--accent-blue);
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        `;
        document.head.appendChild(style);
    }

    const excludeKeys = ['id', 'lastArchiveDate', 'deltaTimeSeconds', 'path', 'extenders'];

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
            fields: ['archiveInterval', 'AMPMMode', 'dateFormat', 'windCupSize', 'rainCollectorSize', 'rainSaisonStart']
        },
        database: {
            title: 'Base de données',
            fields: ['collect', 'historical', 'forecast']
        },
        extenders: {
            title: 'Extendeurs (Périphériques additionnels)',
            fields: ['extendersManager'] // Champ spécial
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

    Object.entries(groups).forEach(([groupKey, group]) => { // parcoure les groupes de proprietees
        formHTML += `
            <div class="settings-group">
                <h3>${group.title}</h3>
                <div class="settings-row">
        `;

        group.fields.forEach(fieldKey => { // parcour les properties 
            if (fieldKey === 'historical') {
                const field = { comment: "Complète la base de données avec les archives d'Open-Meteo sur 50 ans pour cette localisation. (chaque jour a 23h30)" };
                formHTML += createHistoricalFieldHTML(field, openMeteoRange, currentStationSettings.historical);
            } else if (fieldKey === 'forecast') {
                formHTML += createForecastFieldHTML(currentStationSettings.forecast);
            } else if (fieldKey === 'collect') {
                formHTML += createCollectFieldHTML(currentStationSettings.collect);
            } else if (fieldKey === 'extendersManager') {
                formHTML += `<div id="extenders-manager-container" style="width: 100%;"></div>`;
            } else if (currentStationSettings.hasOwnProperty(fieldKey) && !excludeKeys.includes(fieldKey)) {
                formHTML += createSettingFieldHTML(fieldKey, currentStationSettings[fieldKey]);
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

    // Initialiser le gestionnaire d'onglets pour les extendeurs
    renderExtendersManager();

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

    // --- Switchs Listeners ---
    const historicalSwitch = document.getElementById('setting-historical-enabled');
    if (historicalSwitch) {
        historicalSwitch.addEventListener('change', async (e) => {
            const switchElement = e.target;
            const isEnabled = switchElement.checked;
            const settings = { historical: { ...currentStationSettings.historical, enabled: isEnabled } };
            const success = await updatePartialSettings(settings);
            if (!success) {
                switchElement.checked = !isEnabled;
            }
        });
    }

    const collectToggleSwitch = document.getElementById('setting-collect-enabled');
    const collectValueSelect = document.getElementById('setting-collect-value');
    if (collectToggleSwitch) {
        collectToggleSwitch.addEventListener('change', async (e) => {
            const switchElement = e.target;
            const isEnabled = switchElement.checked;
            if (collectValueSelect) collectValueSelect.disabled = !isEnabled;
            const settings = { collect: { ...currentStationSettings.collect, enabled: isEnabled, value: Number(collectValueSelect.value) } };
            const success = await updatePartialSettings(settings);
            if (!success) {
                switchElement.checked = !isEnabled;
                if (collectValueSelect) collectValueSelect.disabled = isEnabled;
            }
        });
    }

    if (collectValueSelect) {
        collectValueSelect.addEventListener('change', async (e) => {
            const selectElement = e.target;
            const value = Number(selectElement.value);
            const settings = { collect: { ...currentStationSettings.collect, value: value } };
            await updatePartialSettings(settings);
        });
    }

    const forecastSwitch = document.getElementById('setting-forecast-enabled');
    const forecastModelSelect = document.getElementById('setting-forecast-model');

    if (forecastSwitch) {
        forecastSwitch.addEventListener('change', async (e) => {
            const switchElement = e.target;
            const isEnabled = switchElement.checked;
            if (forecastModelSelect) forecastModelSelect.disabled = !isEnabled;
            const settings = { forecast: { ...currentStationSettings.forecast, enabled: isEnabled } };
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
            const settings = { forecast: { ...currentStationSettings.forecast, model: modelValue } };
            await updatePartialSettings(settings);
        });
    }
}

// ------------------------------------------------------------------
// Gestion des Extendeurs
// ------------------------------------------------------------------

function renderExtendersManager() {
    const container = document.getElementById('extenders-manager-container');
    if (!container) return;

    const allExtenders = [];
    Object.keys(localExtendersState).forEach(type => {
        localExtendersState[type].forEach((ext, index) => {
            allExtenders.push({
                type: type,
                index: index,
                name: ext.name || `${type} #${index + 1}`
            });
        });
    });

    if (!activeExtenderTab && allExtenders.length > 0) {
        activeExtenderTab = `${allExtenders[0].type}-${allExtenders[0].index}`;
    }

    let tabsHTML = '';
    allExtenders.forEach(item => {
        const tabId = `${item.type}-${item.index}`;
        const isActive = tabId === activeExtenderTab ? 'active' : '';
        const safeType = item.type.replace(/'/g, "\\'");

        tabsHTML += `
            <button type="button" class="extender-tab ${isActive}" onclick="switchExtenderDevice('${safeType}', ${item.index})">
                ${item.name}
                <span class="extender-type-badge">${item.type}</span>
            </button>
        `;
    });

    container.innerHTML = `
        <div class="extender-tabs-container">
            <div class="extender-tabs-list">
                ${tabsHTML.length > 0 ? tabsHTML : '<span style="color:#666; padding:5px;">Aucun périphérique configuré.</span>'}
            </div>
            <button type="button" class="btn-add-tab" onclick="openExtenderModal()">
                [+] Add
            </button>
        </div>
        <div id="extender-details-content">
        </div>
    `;

    renderExtenderDetails();
}

window.switchExtenderDevice = function (type, index) {
    activeExtenderTab = `${type}-${index}`;
    renderExtendersManager();
};

function renderExtenderDetails() {
    const contentDiv = document.getElementById('extender-details-content');
    if (!contentDiv) return;

    if (!activeExtenderTab) {
        contentDiv.innerHTML = '';
        return;
    }

    let currentExtender = null;
    let currentType = null;
    let currentIndex = -1;

    Object.keys(localExtendersState).forEach(type => {
        localExtendersState[type].forEach((ext, index) => {
            if (`${type}-${index}` === activeExtenderTab) {
                currentExtender = ext;
                currentType = type;
                currentIndex = index;
            }
        });
    });

    if (!currentExtender) {
        contentDiv.innerHTML = '';
        return;
    }

    const safeType = currentType.replace(/'/g, "\\'");

    const pingStatus = currentExtender.available ? 'ping-success' : 'ping-fail';
    const pingTitle = currentExtender.available ? 'En ligne' : 'Hors ligne';

    let apiKeyField = '';
    if (currentType === 'WhisperEye') {
        apiKeyField = `
            <div class="extender-form-row">
                <label>API Key:</label>
                <input type="text" value="${currentExtender.apiKey || ''}" readonly style="background:#222; color:#888; cursor:not-allowed;" title="Généré automatiquement">
            </div>
        `;
    }

    contentDiv.innerHTML = `
        <div class="extender-details">
            <div class="extender-header">
                <div>
                    <span class="ping-indicator ${pingStatus}" title="${pingTitle}"></span> 
                    <span style="font-size:0.9em; color:#888;">${pingTitle}</span>
                </div>
                <img src="svg/delete.svg" class="nav-icon btn-delete-extender" 
                     onclick="removeExtender('${safeType}', ${currentIndex})"
                     alt="Supprimer" title="Supprimer ce périphérique">
            </div>

            <div class="extender-form-row">
                <label>Nom:</label>
                <input type="text" value="${currentExtender.name || ''}" 
                    onchange="updateExtenderField('${safeType}', ${currentIndex}, 'name', this.value)">
            </div>
            
            <div class="extender-form-row">
                <label>Host / IP:</label>
                <input type="text" value="${currentExtender.host || ''}" 
                    onchange="updateExtenderField('${safeType}', ${currentIndex}, 'host', this.value)">
            </div>

            <div class="extender-form-row">
                <label>Description:</label>
                <input type="text" value="${currentExtender.description || ''}" 
                    onchange="updateExtenderField('${safeType}', ${currentIndex}, 'description', this.value)">
            </div>

            ${apiKeyField}
        </div>
    `;
}

// ------------------------------------------------------------------
// Logique MODAL (Ajout)
// ------------------------------------------------------------------

window.openExtenderModal = function () {
    const modal = document.getElementById('add-extender-modal');
    if (!modal) return;

    // Reset champs
    document.getElementById('new-ext-name').value = '';
    document.getElementById('new-ext-host').value = '';
    document.getElementById('new-ext-type').selectedIndex = 0;

    // Reset erreurs
    document.querySelectorAll('#add-extender-modal .error-msg').forEach(el => el.style.display = 'none');

    modal.classList.add('show');
    document.getElementById('new-ext-name').focus();
};

window.closeExtenderModal = function () {
    const modal = document.getElementById('add-extender-modal');
    if (modal) modal.classList.remove('show');
};

window.submitNewExtender = async function () {
    const typeSelect = document.getElementById('new-ext-type');
    const nameInput = document.getElementById('new-ext-name');
    const hostInput = document.getElementById('new-ext-host');

    const type = typeSelect.value;
    const name = nameInput.value.trim();
    const host = hostInput.value.trim();

    let isValid = true;

    // Validation Name
    const nameError = document.getElementById('new-ext-name-error');
    const existingNames = (localExtendersState[type] || []).map(e => e.name);

    if (!name) {
        nameError.textContent = "Le nom est obligatoire.";
        nameError.style.display = 'block';
        isValid = false;
    } else if (existingNames.includes(name)) {
        nameError.textContent = `Le nom "${name}" existe déjà pour le type ${type}.`;
        nameError.style.display = 'block';
        isValid = false;
    } else {
        nameError.style.display = 'none';
    }

    // Validation Host
    const hostError = document.getElementById('new-ext-host-error');
    if (!host) {
        hostError.style.display = 'block';
        isValid = false;
    } else {
        hostError.style.display = 'none';
    }

    if (!isValid) return;

    // Création de l'objet
    const newExtender = {
        name: name,
        host: host,
        description: '',
        available: false
    };

    if (type === 'WhisperEye') {
        newExtender.apiKey = generateApiKey();
    }

    if (!localExtendersState[type]) localExtendersState[type] = [];
    localExtendersState[type].push(newExtender);

    // Sauvegarde Immédiate
    showGlobalStatus('Sauvegarde du nouveau périphérique...', 'loading');
    closeExtenderModal();

    const settingsToSave = {
        extenders: localExtendersState
    };

    try {
        const response = await fetch(`/api/station/${selectedStation.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsToSave)
        });

        const result = await response.json();

        if (result.success) {
            showGlobalStatus('Périphérique ajouté et configuration rechargée', 'success');
            const newIndex = localExtendersState[type].length - 1;
            activeExtenderTab = `${type}-${newIndex}`;

            // Recharger tout le formulaire
            setTimeout(() => {
                fetchStationSettings(result);
            }, 500);
        } else {
            throw new Error(result.error || "Erreur sauvegarde");
        }
    } catch (e) {
        console.error(e);
        showGlobalStatus("Erreur lors de l'ajout: " + e.message, 'error');
        localExtendersState[type].pop();
        renderExtendersManager();
    }
};

// ------------------------------------------------------------------

window.removeExtender = async function (type, index) {
    const item = localExtendersState[type][index];
    if (confirm(`Voulez-vous vraiment supprimer "${item.name}" ?`)) {
        // 1. Suppression locale
        localExtendersState[type].splice(index, 1);
        activeExtenderTab = null;

        // 2. Sauvegarde immédiate (comme pour l'ajout)
        showGlobalStatus('Suppression du périphérique...', 'loading');

        try {
            // On réutilise la logique d'update partiel
            const settingsToSave = {
                extenders: localExtendersState
            };

            const response = await fetch(`/api/station/${selectedStation.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave)
            });

            const result = await response.json();

            if (result.success) {
                showGlobalStatus('Périphérique supprimé', 'success');
                // Rechargement pour être sûr de la synchro
                fetchStationSettings(result);
            } else {
                throw new Error(result.error || "Erreur lors de la suppression");
            }
        } catch (e) {
            console.error(e);
            showGlobalStatus("Erreur: " + e.message, 'error');
            // En cas d'erreur, on rechargerait idéalement les settings pour annuler la suppression locale
            fetchStationSettings();
        }
    }
};

window.updateExtenderField = function (type, index, field, value) {
    if (localExtendersState[type] && localExtendersState[type][index]) {
        localExtendersState[type][index][field] = value;
        if (field === 'name') {
            renderExtendersManager();
        }
    }
};

// ------------------------------------------------------------------
// HELPERS 
// ------------------------------------------------------------------

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

function createHistoricalFieldHTML(field, range, historicalSettings) {
    const isEnabled = historicalSettings && historicalSettings.enabled === true;
    const rangeText = (range.first && range.last)
        ? `Archived since ${new Date(range.first).toLocaleDateString()} to ${new Date(range.last).toLocaleDateString()}`
        : "No Open-Meteo data !";
    const downloadUrl = `/query/${selectedStation.id}/dbexpand`;

    const lastRun = historicalSettings?.lastRun ? new Date(historicalSettings.lastRun).toLocaleString() : 'Jamais';
    const msg = historicalSettings?.msg || '';
    const titleAttr = `Collect Now!\nLast run: ${lastRun}${msg ? '\nMsg: ' + msg : ''}`;

    return `
        <div class="settings-field condition-tile">
        <button type="button" class="tile-action-btn-secondary" title="Import +10 years" onclick="runHistoricalExpand(this, '${selectedStation.id}', 10)">
            [+10]
        </button>
        <a href="${downloadUrl}" target="_blank" class="tile-action-btn" title="${titleAttr}">
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </a>
            <label>
                Collect historical data
                <span class="tooltip" data-tooltip="${field.comment}">?</span>
            </label>
            <div class="db-expand-controls" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                <div class="cron-container">
                    <label class="switch" title="Activer la mise à jour quotidienne à 23h30">
                        <input type="checkbox" id="setting-historical-enabled" ${isEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                    <text>${rangeText}</text>
                </div>
            </div>
        </div>
    `;
}

function createForecastFieldHTML(forecastSettings) {
    const isEnabled = forecastSettings && forecastSettings.enabled === true;
    const currentModel = (forecastSettings && forecastSettings.model) ? forecastSettings.model : 'best_match';
    const downloadUrl = `/query/${selectedStation.id}/forecast`;

    const lastRun = forecastSettings?.lastRun ? new Date(forecastSettings.lastRun).toLocaleString() : 'Jamais';
    const msg = forecastSettings?.msg || '';
    const titleAttr = `Télécharger maintenant !\nLast run: ${lastRun}${msg ? '\nMsg: ' + msg : ''}`;

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
        <a href="${downloadUrl}" target="_blank" class="tile-action-btn" title="${titleAttr}">
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </a>
            <label>
                Collect local forecast
                <span class="tooltip" data-tooltip="Récupération automatique des prévisions toutes les heures, pour cette localisation">?</span>
            </label>
            <div class="cron-container">
                <label class="switch" title="Activer la récupération horaire">
                    <input type="checkbox" id="setting-forecast-enabled" ${isEnabled ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
                <select id="setting-forecast-model" ${!isEnabled ? 'disabled' : ''}>
                    ${optionsHTML}
                </select>
            </div>
        </div>
    `;
}

function createCollectFieldHTML(field) {
    const label = "Collect local station";
    const tooltip = field.comment || '';
    const tooltipHTML = tooltip ? `<span class="tooltip" data-tooltip="${tooltip}">?</span>` : '';
    const isEnabled = field.enabled;
    const currentValue = field.value;
    const options = [5, 10, 15, 30, 60, 120, 240, 480];
    const downloadUrl = `/api/station/${selectedStation.id}/collect`;

    const lastRun = field?.lastRun ? new Date(field.lastRun).toLocaleString() : 'Jamais';
    const msg = field?.msg || '';
    const titleAttr = `Exécuter maintenant !\nLast run: ${lastRun}${msg ? '\nMsg: ' + msg : ''}`;

    let optionsHTML = options.map(opt =>
        `<option value="${opt}" ${opt == currentValue ? 'selected' : ''}>${opt} minutes</option>`
    ).join('');

    if (currentValue && !options.includes(currentValue)) {
        optionsHTML = `<option value="${currentValue}" selected>${currentValue} minutes (custom)</option>` + optionsHTML;
    }

    return `
        <div class="settings-field condition-tile">
        <a href="${downloadUrl}" target="_blank" class="tile-action-btn" title="${titleAttr}">
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </a>
            <label for="setting-collect-value">
                ${label}
                ${tooltipHTML}
            </label>
            <div class="cron-container">
                <label class="switch">
                    <input type="checkbox" id="setting-collect-enabled" ${isEnabled ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
                <select id="setting-collect-value" name="collect-value" ${!isEnabled ? 'disabled' : ''}>
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

    return `<input type="${inputType}" id="setting-${key}" name="${key}" value="${value}" ${key == 'timezone' ? 'readonly' : ''}>`;
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
        'collect': 'Collecte auto. (station)',
        'historical': 'Collect historical data',
        'forecast': 'Collect local forecast',
    };

    return labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

async function handleSettingsSubmit(e) {
    const stationSyncFields = ['longitude', 'latitude', 'longitudeEastWest', 'latitudeNorthSouth', 'altitude', 'archiveInterval', 'AMPMMode', 'dateFormat', 'windCupSize', 'rainCollectorSize', 'rainSaisonStart'];
    e.preventDefault();
    if (!selectedStation) return;

    const formData = new FormData(e.target);
    const settings = {};

    for (let [key, value] of formData.entries()) {
        if (key === 'cron-value') continue;
        if (key.startsWith('cron-')) continue;

        if (currentStationSettings.hasOwnProperty(key)) {
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
    }

    // Ajout des Extendeurs
    settings.extenders = localExtendersState;

    if (currentStationSettings.collect) {
        const collectToggleSwitch = document.getElementById('setting-collect-enabled');
        const collectValueSelect = document.getElementById('setting-collect-value');

        settings.collect = { ...currentStationSettings.collect };
        if (collectToggleSwitch && collectValueSelect) {
            settings.collect.enabled = collectToggleSwitch.checked;
            settings.collect.value = Number(collectValueSelect.value);
        }
    }

    if (currentStationSettings.historical) {
        const historicalToggle = document.getElementById('setting-historical-enabled');
        settings.historical = { ...currentStationSettings.historical };
        if (historicalToggle) {
            settings.historical.enabled = historicalToggle.checked;
        }
    }

    if (currentStationSettings.forecast) {
        const forecastToggle = document.getElementById('setting-forecast-enabled');
        const forecastModel = document.getElementById('setting-forecast-model');

        settings.forecast = { ...currentStationSettings.forecast };
        if (forecastToggle) {
            settings.forecast.enabled = forecastToggle.checked;
        }
        if (forecastModel) {
            settings.forecast.model = forecastModel.value;
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
            fetchStationSettings(result);
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

        Object.assign(currentStationSettings, result.settings);

        showGlobalStatus('Paramètre mis à jour', 'success');
        return true;
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
        return false;
    }
}

window.runHistoricalExpand = async function (btn, stationId, years) {
    if (btn.classList.contains('disabled')) return;

    const originalContent = btn.innerHTML;
    btn.classList.add('disabled');
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
    btn.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`/query/${stationId}/dbexpand/${years}`);
        const result = await response.json();
        if (result.success) {
            showGlobalStatus(result.message, 'success');
        } else {
            showGlobalStatus(`Erreur: ${result.error || 'Inconnue'}`, 'error');
        }
    } catch (error) {
        showGlobalStatus(`Erreur réseau: ${error.message}`, 'error');
    } finally {
        btn.classList.remove('disabled');
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.innerHTML = originalContent;
    }
};