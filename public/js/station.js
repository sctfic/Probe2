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

            /* Indicateur de ping dans l'onglet */
            .extender-tab .ping-indicator {
                width: 8px;
                height: 8px;
                margin: 0;
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
                background: var(--accent-blue); 
                padding: 15px; 
                border-radius: 6px; 
                border: 1px solid #444; 
            }
            
            /* Header de l'extendeur */
            .extender-header {
                display: flex;
                flex-wrap: wrap; /* Retour à la ligne dynamique */
                gap: 20px;
                position: relative; /* Pour l'ancrage des actions */
                padding-right: 40px; /* Espace pour le bouton delete */
                margin-bottom: 15px;
                border-bottom: 1px solid #444;
                padding-bottom: 15px;
            }

            .extender-header-actions {
                position: absolute;
                top: 0;
                right: 0;
            }

            .extender-input-container, .extender-sensors, .extender-actionners {
                flex: 1 1 300px;
                min-width: 250px;
            }

            .extender-form-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
            .extender-form-row label { width: 120px; font-size: 0.9em }
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
            title: 'Roles et fonctionnalitées',
            fields: ['collect', 'historical', 'forecast']
        },
        extenders: {
            title: 'Extendeurs (Périphériques additionnels)',
            fields: ['extendersManager'] // Champ spécial
        }
    };

    // Fetch Open-Meteo data range asynchronously
    fetchOpenMeteoRange(selectedStation.id);

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
                formHTML += createHistoricalFieldHTML(field, null, currentStationSettings.historical);
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
    // Lancer un refresh asynchrone du status
    refreshExtendersStatus();

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

        const currentExt = localExtendersState[item.type][item.index];
        const pingStatus = currentExt.available ? 'ping-success' : 'ping-fail';
        const pingTitle = currentExt.available ? 'En ligne' : 'Hors ligne';

        tabsHTML += `
            <button type="button" class="extender-tab ${isActive}" onclick="switchExtenderDevice('${safeType}', ${item.index})">
                <span class="ping-indicator ${pingStatus}" title="${pingTitle}"></span>
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
                <div title='Supprimer toute les donnees des extendeurs' onclick="deleteAllExtenderData()">
                    <svg class="nav-icon-red" style="width:48px; height:32px;" viewBox="0 0 189 134" fill="currentColor">
                        <g transform="translate(0.000000,134.000000) scale(0.100000,-0.100000)" fill="currentColor" stroke="none">
                            <path d="M1665 1238 c-5 -24 -35 -428 -35 -473 0 -34 38 -34 78 0 23 19 31 36 36 75 6 47 8 50 36 50 46 0 70 40 70 115 0 67 -7 78 -52 89 -26 6 -28 10 -28 60 0 66 -26 106 -71 106 -22 0 -30 -5 -34 -22z m65 -27 c14 -26 12 -108 -5 -276 -11 -110 -18 -142 -32 -152 -35 -26 -37 0 -20 214 10 115 17 214 17 221 0 19 28 14 40 -7z m74 -154 c14 -10 17 -25 14 -72 -3 -59 -3 -60 -33 -60 l-30 0 4 65 c4 85 9 93 45 67z"/>
                            <path d="M337 1217 l-128 -32 -44 -71 -45 -71 23 -99 c12 -53 28 -99 35 -102 17 -5 15 31 -7 116 -14 53 -16 74 -8 77 7 2 28 8 47 13 l35 9 -2 54 -3 55 118 26 c98 22 118 24 125 12 14 -24 29 -16 25 14 -4 36 -18 36 -171 -1z m-117 -123 c0 -13 -30 -28 -38 -19 -3 3 1 16 8 30 10 19 16 22 22 13 4 -7 8 -18 8 -24z"/>
                            <path d="M939 1227 c-79 -30 -149 -89 -149 -125 0 -11 15 -2 43 25 141 138 355 96 423 -84 22 -58 14 -77 -31 -69 -26 5 -37 3 -41 -8 -6 -17 85 -179 101 -179 11 0 104 151 105 171 1 28 -20 8 -56 -53 -21 -36 -43 -64 -48 -62 -10 3 -64 85 -65 100 -1 4 18 7 40 7 l42 0 -6 49 c-3 28 -13 65 -23 83 -23 47 -82 106 -129 130 -50 26 -156 34 -206 15z"/>
                            <path d="M457 1136 l-139 -31 -45 -73 -45 -72 13 -57 c17 -68 46 -89 36 -25 -4 22 -9 47 -13 55 -4 11 8 18 46 27 l52 13 -6 37 c-3 21 -9 45 -12 53 -4 12 14 19 83 35 166 39 160 39 168 0 36 -179 53 -226 69 -200 6 11 -49 251 -60 262 -5 4 -71 -7 -147 -24z m-137 -139 c-4 -5 -15 -7 -24 -5 -15 3 -15 5 0 27 17 23 18 23 25 5 4 -10 3 -23 -1 -27z"/>
                            <path d="M707 994 c-14 -15 7 -24 54 -24 l49 0 0 -36 c0 -24 4 -34 13 -32 15 5 21 41 13 74 -6 22 -12 24 -65 24 -32 0 -61 -3 -64 -6z"/>
                            <path d="M433 945 c-77 -19 -88 -24 -76 -36 14 -14 183 23 183 41 0 13 -42 11 -107 -5z"/>
                            <path d="M446 881 c-65 -16 -102 -42 -59 -41 41 1 167 36 171 48 5 16 -26 14 -112 -7z"/>
                            <path d="M655 830 l-28 -30 -251 -2 -251 -3 -4 -25 c-4 -33 39 -312 52 -327 14 -19 650 -19 665 0 12 15 63 383 55 403 -4 11 -29 14 -107 14 -100 0 -103 -1 -131 -30z m207 -2 c3 -7 -3 -67 -12 -133 -10 -66 -20 -146 -24 -177 l-7 -58 -309 0 c-170 0 -311 4 -314 9 -7 10 -46 252 -46 281 0 19 6 20 240 20 l240 0 38 35 c35 33 40 34 113 35 53 0 78 -4 81 -12z"/>
                            <path d="M1000 702 c0 -4 5 -13 11 -19 6 -6 19 -126 30 -274 11 -145 24 -274 29 -286 9 -23 12 -23 209 -23 149 0 201 3 209 13 6 7 20 136 32 287 16 207 25 278 36 286 8 6 14 14 14 18 0 3 -128 6 -285 6 -157 0 -285 -4 -285 -8z m505 -21 c3 -6 -4 -123 -15 -260 -11 -138 -20 -259 -20 -271 0 -19 -6 -20 -185 -20 -140 0 -187 3 -190 13 -7 21 -44 531 -39 539 7 11 442 10 449 -1z"/>
                            <path d="M1144 636 c-10 -25 14 -458 26 -470 20 -20 22 27 10 246 -11 209 -20 266 -36 224z"/>
                            <path d="M1270 405 c0 -193 3 -246 13 -243 9 4 12 61 12 243 0 182 -3 239 -12 243 -10 3 -13 -50 -13 -243z"/>
                            <path d="M1397 643 c-11 -17 -29 -465 -19 -475 6 -6 12 -6 16 1 12 19 30 461 19 472 -6 6 -13 7 -16 2z"/>
                        </g>
                    </svg>
                </div>
                <div title='ajouter un extendeurs' onclick="openExtenderModal()">
                    <svg class="nav-icon-green" style="width:32px; height:32px;" viewBox="0 0 512 512" fill="currentColor">
                        <g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)" fill="currentColor" stroke="none">
                            <path d="M1721 4551 c-10 -10 -21 -39 -25 -65 -4 -25 -13 -46 -19 -46 -7 0 -36 -12 -66 -25 l-54 -26 -37 26 c-59 41 -82 35 -156 -42 -35 -38 -64 -77 -64 -88 0 -11 11 -37 25 -58 l26 -37 -27 -70 c-23 -57 -32 -70 -49 -70 -36 0 -85 -21 -95 -40 -14 -26 -13 -167 1 -193 16 -29 25 -34 74 -41 41 -7 42 -8 69 -76 l27 -70 -26 -37 c-14 -21 -25 -47 -25 -58 0 -30 129 -155 159 -155 13 0 39 12 58 26 l34 26 69 -29 c68 -28 70 -29 76 -71 10 -69 32 -82 135 -82 103 0 123 12 136 79 8 43 11 46 75 74 l66 29 38 -26 c58 -39 77 -34 150 36 74 70 80 98 39 158 l-25 36 19 40 c11 22 23 52 26 67 6 22 14 27 52 33 73 11 83 28 83 137 0 108 -7 120 -79 134 -43 8 -45 10 -72 77 l-28 69 26 33 c40 53 34 77 -38 150 -73 74 -101 80 -156 38 l-34 -26 -47 22 c-25 12 -56 26 -68 30 -16 6 -23 20 -27 52 -9 65 -31 78 -138 78 -74 0 -92 -3 -108 -19z m143 -136 c7 -45 33 -75 67 -75 9 0 53 -18 98 -41 l82 -40 45 26 c36 21 48 24 60 15 19 -16 17 -30 -6 -60 -25 -32 -25 -67 0 -107 10 -18 28 -60 40 -94 26 -79 32 -87 86 -95 41 -6 45 -9 42 -33 -2 -21 -9 -27 -40 -32 -48 -7 -74 -31 -82 -74 -4 -18 -20 -60 -36 -92 -35 -68 -37 -99 -10 -133 24 -30 25 -44 5 -60 -13 -10 -22 -8 -53 14 -21 14 -42 26 -48 26 -5 0 -34 -13 -64 -29 -30 -16 -75 -35 -100 -42 -60 -17 -77 -33 -85 -80 -6 -35 -10 -39 -36 -39 -25 0 -29 4 -29 28 0 45 -22 75 -60 84 -19 5 -69 25 -112 45 l-76 36 -45 -26 c-43 -25 -45 -26 -61 -8 -15 16 -14 20 9 51 31 43 31 47 -4 117 -16 32 -34 76 -40 98 -15 59 -31 76 -79 82 -38 5 -42 8 -42 33 0 24 5 28 47 36 l48 9 26 75 c14 41 36 91 47 110 28 45 28 57 -4 103 -20 31 -23 41 -14 53 17 19 24 18 71 -13 l40 -26 72 36 c40 21 87 40 105 43 39 8 72 46 72 84 0 32 7 40 36 40 18 0 23 -7 28 -45z"/>
                            <path d="M1728 4215 c-100 -38 -174 -120 -205 -224 -53 -182 86 -378 282 -398 38 -4 73 0 125 16 268 82 298 450 49 586 -44 24 -68 29 -134 32 -52 2 -93 -2 -117 -12z m207 -128 c21 -12 53 -42 70 -65 26 -39 30 -52 30 -112 0 -60 -4 -74 -30 -111 -52 -75 -131 -106 -219 -87 -63 13 -141 86 -152 142 -35 191 136 323 301 233z"/>
                            <path d="M3266 4467 c-18 -18 -26 -44 -36 -109 l-13 -86 -41 -12 c-23 -7 -66 -25 -96 -40 l-56 -28 -74 54 c-43 31 -85 54 -99 54 -35 0 -231 -196 -231 -231 0 -14 23 -57 54 -99 l54 -75 -28 -55 c-15 -30 -33 -74 -40 -97 l-13 -41 -83 -12 c-54 -8 -93 -19 -109 -32 -25 -19 -25 -22 -25 -162 0 -173 2 -177 121 -196 42 -7 81 -15 86 -19 16 -9 85 -191 79 -204 -3 -7 -26 -41 -51 -76 -25 -35 -45 -74 -45 -86 0 -15 32 -56 98 -124 118 -123 125 -125 231 -50 l72 51 67 -30 c37 -16 80 -34 97 -39 28 -9 31 -15 46 -94 9 -46 19 -92 23 -101 11 -25 60 -38 147 -38 l79 0 0 -683 0 -683 -34 -12 c-56 -20 -122 -102 -137 -168 -38 -167 116 -323 279 -283 184 46 250 250 125 389 -24 27 -60 55 -79 62 l-34 12 0 113 0 113 195 0 195 0 21 -45 c40 -84 120 -135 213 -136 132 -2 239 105 238 238 -1 171 -176 283 -332 212 -59 -26 -87 -53 -116 -111 l-24 -48 -195 0 -195 0 1 533 c0 456 3 545 18 626 l17 93 64 24 c36 13 66 24 67 24 1 0 3 -193 5 -428 3 -475 1 -460 71 -502 30 -19 52 -20 349 -20 l318 0 15 -37 c63 -151 265 -193 384 -80 48 46 71 101 71 172 0 100 -55 183 -145 221 -47 19 -131 20 -178 1 -51 -22 -108 -77 -129 -125 l-19 -42 -307 2 -307 3 -3 413 -2 414 42 -31 c70 -52 87 -46 200 67 119 119 121 126 48 227 -27 38 -50 73 -50 78 0 4 11 29 24 55 13 26 29 66 36 89 14 47 14 47 116 63 112 18 114 22 114 194 0 174 0 174 -127 196 l-85 15 -34 85 c-19 47 -37 90 -40 97 -3 7 17 45 45 85 30 42 51 83 51 97 -1 39 -188 231 -225 231 -17 0 -55 -20 -102 -54 l-74 -54 -42 23 c-23 12 -66 30 -95 40 -60 19 -57 14 -73 114 -18 116 -26 121 -194 121 -129 0 -137 -1 -159 -23z m252 -177 c8 -47 21 -92 29 -101 8 -10 35 -22 61 -29 26 -6 85 -29 131 -51 46 -21 90 -39 98 -39 8 0 47 23 86 50 l71 50 55 -54 55 -55 -42 -58 c-72 -98 -71 -93 -25 -186 22 -45 48 -107 57 -138 9 -31 22 -62 30 -68 10 -8 155 -41 184 -41 1 0 2 -35 2 -78 l0 -79 -80 -11 c-44 -6 -89 -16 -99 -22 -12 -6 -27 -38 -41 -82 -12 -40 -37 -101 -56 -135 -19 -34 -34 -68 -34 -76 0 -7 23 -46 50 -85 28 -39 50 -75 50 -79 0 -10 -92 -103 -102 -103 -5 0 -41 22 -80 50 -39 27 -77 50 -83 50 -7 0 -41 -15 -76 -34 -35 -19 -97 -44 -137 -56 -39 -12 -75 -27 -79 -33 -4 -7 -15 -50 -23 -97 l-16 -85 -77 -3 c-87 -3 -77 -14 -98 108 -6 36 -15 70 -21 77 -5 7 -35 19 -66 28 -30 9 -91 34 -134 56 -42 21 -83 39 -90 39 -6 0 -45 -23 -85 -51 l-73 -50 -55 47 c-30 25 -55 50 -55 55 0 5 23 40 50 78 28 38 50 76 50 85 0 9 -15 47 -34 85 -19 37 -44 98 -56 134 -12 36 -27 70 -33 75 -7 6 -50 16 -97 24 l-85 13 -3 78 c-2 42 -2 77 0 77 42 0 176 34 188 47 9 10 24 45 34 78 10 33 33 89 52 125 19 35 34 71 34 80 0 9 -23 49 -51 89 l-52 73 55 55 55 55 71 -51 c38 -28 77 -51 86 -51 10 0 54 18 99 39 45 22 102 45 127 51 65 17 77 32 90 113 19 116 11 108 98 105 l77 -3 13 -85z m1293 -2323 c45 -30 61 -63 56 -116 -12 -117 -165 -150 -227 -48 -36 59 -18 130 43 167 42 26 86 25 128 -3z m-498 -475 c23 -23 31 -42 35 -80 4 -46 2 -53 -30 -87 -66 -72 -172 -52 -207 39 -13 33 -13 44 0 79 30 89 136 114 202 49z m-718 -486 c60 -26 85 -109 51 -174 -31 -60 -112 -80 -173 -42 -36 21 -50 43 -53 80 -4 51 1 69 27 100 42 51 86 61 148 36z"/>
                            <path d="M3280 4001 c-94 -30 -162 -71 -226 -135 -101 -101 -154 -231 -154 -376 0 -141 46 -254 146 -360 104 -109 222 -160 374 -160 160 0 262 42 376 155 109 108 154 214 154 364 0 154 -46 266 -150 372 -71 72 -152 119 -247 144 -77 20 -204 18 -273 -4z m213 -101 c189 -31 331 -186 344 -377 9 -133 -32 -237 -130 -331 -62 -58 -112 -85 -185 -101 -194 -41 -379 46 -467 218 -119 236 18 523 280 587 63 16 86 16 158 4z"/>
                            <path d="M1845 3234 c-142 -30 -264 -89 -356 -172 -67 -61 -150 -178 -169 -240 -7 -20 -16 -41 -20 -45 -4 -5 -31 3 -60 18 -206 104 -483 54 -656 -119 -113 -114 -165 -233 -170 -396 l-4 -105 -55 -18 c-77 -26 -154 -98 -189 -177 -25 -55 -28 -71 -24 -148 2 -66 9 -99 26 -135 31 -62 95 -127 157 -157 l50 -25 1390 -3 c1541 -3 1436 -7 1529 64 162 123 179 361 36 504 -39 39 -128 90 -159 90 -9 0 -12 8 -8 27 9 46 -12 155 -42 219 -75 160 -231 250 -419 242 -86 -3 -87 -3 -90 22 -6 53 -46 158 -83 222 -123 211 -352 341 -592 337 -40 -1 -81 -3 -92 -5z m217 -119 c112 -23 193 -68 278 -154 86 -87 133 -172 156 -284 l15 -71 -28 -20 c-41 -29 -91 -83 -121 -130 -56 -88 -80 -230 -45 -268 35 -38 93 -9 93 47 0 17 7 54 15 81 84 285 474 314 599 45 17 -38 21 -65 21 -156 0 -60 3 -115 7 -121 4 -6 31 -14 59 -18 63 -9 94 -24 136 -68 106 -110 77 -285 -60 -353 l-51 -25 -1345 0 c-931 0 -1358 3 -1385 11 -23 6 -57 29 -86 58 -39 39 -50 59 -61 105 -30 135 57 254 199 272 54 7 82 24 82 50 0 8 -5 47 -11 85 -49 316 249 595 563 528 138 -30 269 -131 326 -251 31 -65 52 -146 52 -200 0 -55 44 -83 91 -58 15 9 19 22 19 68 0 118 -56 262 -136 351 -54 60 -54 73 -3 176 110 225 375 353 621 300z"/>
                            <path d="M1167 1462 c-15 -16 -17 -49 -17 -260 l0 -242 -183 0 -183 0 -34 52 c-45 67 -101 98 -180 98 -49 0 -65 -5 -106 -32 -69 -47 -97 -104 -91 -186 11 -139 127 -220 264 -181 52 14 119 73 129 113 l6 25 215 3 215 3 29 33 29 32 0 270 c0 256 -1 270 -19 280 -29 15 -56 12 -74 -8z m-526 -488 c44 -40 32 -112 -27 -150 -21 -14 -31 -15 -65 -5 -73 22 -89 104 -31 158 22 20 34 24 65 20 21 -3 47 -13 58 -23z"/>
                            <path d="M1457 1462 c-15 -16 -17 -48 -17 -240 0 -187 2 -223 16 -236 21 -21 57 -20 77 2 15 16 17 48 17 239 0 200 -2 221 -18 236 -24 22 -55 21 -75 -1z"/>
                            <path d="M1747 1462 c-15 -16 -17 -49 -17 -260 l0 -241 -35 -17 c-39 -18 -91 -73 -106 -111 -5 -13 -9 -47 -9 -75 0 -178 208 -271 340 -152 104 94 87 258 -35 329 l-45 27 0 237 c0 198 -3 240 -16 259 -18 27 -55 29 -77 4z m84 -622 c28 -16 51 -67 44 -99 -7 -32 -39 -65 -72 -75 -28 -9 -88 16 -102 42 -44 82 49 175 130 132z"/>
                            <path d="M2034 1466 c-18 -13 -19 -30 -22 -228 -3 -240 2 -261 55 -266 58 -6 63 14 63 255 0 200 -1 214 -20 233 -24 24 -49 25 -76 6z"/>
                            <path d="M2320 1460 c-19 -19 -20 -33 -20 -265 0 -359 -12 -345 290 -345 200 0 201 0 209 -23 27 -71 111 -127 191 -127 110 0 210 98 210 205 0 71 -62 164 -127 192 -42 17 -137 17 -172 -1 -33 -18 -96 -86 -106 -115 -6 -20 -12 -21 -190 -21 l-184 0 -3 246 c-3 230 -4 247 -22 260 -27 19 -52 18 -76 -6z m729 -486 c26 -21 31 -33 31 -68 0 -51 -29 -84 -83 -93 -31 -5 -40 -1 -67 25 -43 43 -43 100 1 136 17 15 43 26 59 26 16 0 42 -11 59 -26z"/>
                        </g>
                    </svg>
                </div>
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
                <div class="extender-input-container">
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
                </div>
                <div class="extender-sensors">
                    <div class="extender-form-row">
                        
                    </div>
                </div>
                <div class="extender-actionners">
                    <div class="extender-form-row">
                    </div>
                </div>
                <div class="extender-header-actions">
                    <img src="svg/delete.svg" class="nav-icon btn-delete-extender" 
                        onclick="removeExtender('${safeType}', ${currentIndex})"
                        alt="Supprimer" title="Supprimer ce périphérique">
                </div>
            </div>

            <!-- ID masqué selon demande utilisateur -->
            <input type="hidden" value="${currentExtender.id || ''}">


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

    // Création de l'identifiant (2 lettres type + 3 digits incremental)
    const prefixMap = {
        "WhisperEye": "WE",
        "Venti'Connect": "VC"
    };
    const prefix = prefixMap[type] || "EX";

    // Trouver le numéro maximum utilisé pour ce préfixe de type
    let maxNum = 0;
    Object.keys(localExtendersState).forEach(t => {
        localExtendersState[t].forEach(ext => {
            if (ext.id && ext.id.startsWith(prefix)) {
                const numPart = ext.id.substring(prefix.length);
                const num = parseInt(numPart, 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            }
        });
    });
    const nextId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;

    // Création de l'objet
    const newExtender = {
        id: nextId,
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

window.deleteAllExtenderData = async function () {
    if (!selectedStation) return;

    if (confirm('Voulez-vous vraiment supprimer TOUTES les données InfluxDB de TOUS les extendeurs de cette station ? Cette action est irréversible.')) {
        showGlobalStatus('Suppression de toutes les données extendeurs...', 'loading');
        try {
            const response = await fetch(`/api/station/${selectedStation.id}/extenders/data`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                showGlobalStatus(`${result.count || 0} points supprimés avec succès`, 'success');
            } else {
                throw new Error(result.error || 'Erreur inconnue');
            }
        } catch (error) {
            console.error('Erreur:', error);
            showGlobalStatus(`Erreur: ${error.message}`, 'error');
        }
    }
};

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
                showGlobalStatus('Périphérique supprimé, suppression des données...', 'loading');

                // 3. Suppression des données InfluxDB associées
                try {
                    const dataResponse = await fetch(`/api/station/${selectedStation.id}/extenders/${item.id}/data`, {
                        method: 'DELETE'
                    });
                    const dataResult = await dataResponse.json();
                    if (dataResult.success) {
                        showGlobalStatus(`Périphérique et ${dataResult.count || 0} points supprimés`, 'success');
                    } else {
                        showGlobalStatus('Périphérique supprimé (échec suppression données InfluxDB)', 'warning');
                    }
                } catch (dataError) {
                    console.error('Erreur suppression données InfluxDB:', dataError);
                    showGlobalStatus('Périphérique supprimé (erreur InfluxDB)', 'warning');
                }

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

/**
 * Appelle l'API pour vérifier l'état de tous les extendeurs
 * et rafraîchit l'affichage des onglets.
 */
window.refreshExtendersStatus = async function () {
    if (!selectedStation) return;

    try {
        const response = await fetch(`/api/station/${selectedStation.id}/extenders/status`);
        const result = await response.json();

        if (result.success && result.extenders) {
            // Mettre à jour l'état local avec les infos de disponibilité
            Object.keys(result.extenders).forEach(type => {
                if (localExtendersState[type]) {
                    result.extenders[type].forEach((extStatus, index) => {
                        if (localExtendersState[type][index]) {
                            localExtendersState[type][index].available = extStatus.available;
                        }
                    });
                }
            });
            // Rafraîchir l'affichage
            renderExtendersManager();
        }
    } catch (error) {
        console.error("Erreur lors du rafraîchissement du status des extendeurs:", error);
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
    const rangeText = (range && range.first && range.last)
        ? `Archived since ${new Date(range.first).toLocaleDateString()} to ${new Date(range.last).toLocaleDateString()}`
        : (range === null ? "Loading Open-Meteo range..." : "No Open-Meteo data !");
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
                    <text id="open-meteo-range-info">${rangeText}</text>
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
    } else if (inputType === 'decimal') {
        return `<input type="number" step="0.000001" id="setting-${key}" name="${key}" value="${value}">`;
    } else if (inputType === 'number') {
        return `<input type="number" id="setting-${key}" name="${key}" value="${value}">`;
    } else {
        return `<input type="${inputType}" id="setting-${key}" name="${key}" value="${value}" ${key == 'timezone' ? 'readonly' : ''}>`;
    }
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
        ],
        'rainSaisonStart': [
            { value: 1, label: 'Janvier' },
            { value: 2, label: 'Février' },
            { value: 3, label: 'Mars' },
            { value: 4, label: 'Avril' },
            { value: 5, label: 'Mai' },
            { value: 6, label: 'Juin' },
            { value: 7, label: 'Juillet' },
            { value: 8, label: 'Août' },
            { value: 9, label: 'Septembre' },
            { value: 10, label: 'Octobre' },
            { value: 11, label: 'Novembre' },
            { value: 12, label: 'Décembre' }
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
    if (['AMPMMode', 'archiveInterval', 'dateFormat', 'windCupSize', 'rainCollectorSize', 'latitudeNorthSouth', 'longitudeEastWest', 'rainSaisonStart'].includes(key)) {
        return 'select';
    }
    if (['port', 'altitude'].includes(key)) {
        return 'number';
    }
    if (['longitude', 'latitude'].includes(key)) {
        return 'decimal';
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
async function fetchOpenMeteoRange(stationId) {
    const infoEl = document.getElementById('open-meteo-range-info');
    if (!infoEl) return;
    try {
        const rangeResponse = await fetch(`/query/${stationId}/Range/open-meteo_barometer`);
        const rangeData = await rangeResponse.json();
        if (rangeData.success && rangeData.metadata.first && rangeData.metadata.last) {
            const rangeText = `Archived since ${new Date(rangeData.metadata.first).toLocaleDateString()} to ${new Date(rangeData.metadata.last).toLocaleDateString()}`;
            infoEl.textContent = rangeText;
        } else {
            infoEl.textContent = "No Open-Meteo data !";
        }
    } catch (e) {
        console.warn("Could not fetch Open-Meteo date range.", e);
        infoEl.textContent = "Error fetching range";
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