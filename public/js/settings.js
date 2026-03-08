// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

const SKIN_TYPES = {
    1: { name: "Type 1", description: "Brûle rapidement et ne bronze pas. Peau très claire avec des taches de rousseur, cheveux roux ou blonds, yeux clairs.", dem: 18 },
    2: { name: "Type 2", description: "Brûle facilement et bronze lentement. Peau claire, cheveux blonds, yeux clairs.", dem: 32 },
    3: { name: "Type 3", description: "Brûle rarement et bronze facilement. Peau légèrement mate, cheveux châtain/bruns, yeux foncés.", dem: 46 },
    4: { name: "Type 4", description: "Brûle très rarement et bronze bien. Peau mate, cheveux foncés, yeux foncés, de type méditerranéen.", dem: 60 },
    5: { name: "Type 5", description: "Peau asiatique, très résistante au soleil.", dem: 76 },
    6: { name: "Type 6", description: "Peau noire, extrêmement résistante au soleil.", dem: 98 }
};

let currentUnitsSettings = {};
let currentSkinType = 2; // Type par défaut

let currentInfluxSettings = {};

// --- Preferences Section ---

async function fetchSettings() {
    showGlobalStatus('Chargement des paramètres...', 'loading');
    const container = document.getElementById('preferences-container');
    container.innerHTML = ''; // Clear previous content

    try {
        const [unitsResponse, influxResponse] = await Promise.all([
            fetch('/api/settings'),
            fetch('/api/influxdb')
        ]);

        if (!unitsResponse.ok) throw new Error('Erreur de chargement des unités');
        if (!influxResponse.ok) throw new Error('Erreur de chargement de la configuration InfluxDB');

        const unitsData = await unitsResponse.json();
        console.log(unitsData);
        const influxData = await influxResponse.json();
        console.log(influxData);

        if (unitsData.success && unitsData.settings) {
            currentUnitsSettings = unitsData.settings;
            displayUnitsForm(unitsData.settings);
        } else {
            throw new Error('Format de données invalide pour les unités');
        }

        if (influxData.success && influxData.settings) {
            currentInfluxSettings = influxData.settings;
            displayInfluxForm(influxData.settings);
        } else {
            throw new Error('Format de données invalide pour la configuration InfluxDB');
        }

        displayUpdateForm();

        showGlobalStatus('Paramètres chargés avec succès', 'success');

    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}

function displayUpdateForm() {
    const container = document.getElementById('preferences-container');
    const updateFormHTML = `
        <div class="settings-group">
            <h3>Mise à jour de l'application V<b id="current-version-display"></b></h3>
            <div class="settings-form">
                <div class="settings-field condition-tile">
                    <button type="button" id="verify-update-btn">
                        Vérifier les mises à jour
                    </button>
                </div>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', updateFormHTML);

    const localVersion = document.getElementById('version').textContent;
    document.getElementById('current-version-display').textContent = localVersion;

    document.getElementById('verify-update-btn').addEventListener('click', handleVerifyUpdate);
}

async function handleApplyUpdate() {
    if (!confirm("Êtes-vous sûr de vouloir lancer la mise à jour ? Le serveur va redémarrer et l'interface sera bloquée momentanément.")) return;

    const updateButton = document.getElementById('verify-update-btn');
    const localVersion = document.getElementById('version').textContent;

    // Geler l'interface
    updateButton.disabled = true;
    updateButton.textContent = 'Mise à jour lancée, en attente du redémarrage...';
    showGlobalStatus('Mise à jour en cours... Le serveur va redémarrer.', 'loading');

    const overlay = document.createElement('div');
    overlay.id = 'update-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: '9998', cursor: 'wait'
    });
    document.body.appendChild(overlay);

    // Lancer la mise à jour sans attendre la réponse
    fetch('/api/update', { method: 'POST' });

    // Démarrer la boucle de vérification
    const maxAttempts = 12; // 12 tentatives * 5 secondes = 60 secondes max
    let attempt = 0;

    const poll = setInterval(async () => {
        attempt++;
        updateButton.textContent = `Vérification du redémarrage... (${attempt}/${maxAttempts})`;

        if (attempt >= maxAttempts) {
            clearInterval(poll);
            showGlobalStatus('La mise à jour a expiré. Le serveur n\'a peut-être pas redémarré correctement.', 'error');
            updateButton.textContent = 'La mise à jour a échoué';
            document.body.removeChild(overlay);
            return;
        }

        try {
            const response = await fetch('/api/health', { cache: 'no-cache' });
            if (response.ok) {
                const healthData = await response.json();
                if (healthData.version && healthData.version !== localVersion) {
                    clearInterval(poll);
                    showGlobalStatus(`Mise à jour vers la version ${healthData.version} réussie ! Rechargement...`, 'success');
                    updateButton.textContent = 'Mise à jour terminée !';
                    setTimeout(() => window.location.reload(), 2000);
                }
                // Si la version est la même, on continue de boucler
            }
            // Si response.ok est faux (ex: 502 Bad Gateway pendant le redémarrage), on continue de boucler
        } catch (error) {
            // Erreur réseau, le serveur est probablement en train de redémarrer, on continue de boucler
            console.warn(`Tentative de vérification ${attempt} échouée (normal pendant le redémarrage):`, error.message);
        }
    }, 5000);
}

async function handleVerifyUpdate(event) {
    const button = event.target;

    button.disabled = true;
    button.innerHTML = '<div class="spinner" style="display: inline-block; margin-right: 8px;"></div>Vérification...';

    try {
        const response = await fetch('https://raw.githubusercontent.com/sctfic/Probe2/refs/heads/main/package.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error('Impossible de contacter le serveur de mise à jour.');

        const remotePackage = await response.json();
        const remoteVersion = remotePackage.version;
        const localVersion = document.getElementById('version').textContent;

        if (remoteVersion > localVersion) {
            button.innerHTML = `<img src="svg/access-control.svg" title="authentification requise!" class="access-control-icon">Nouvelle version disponible : V${remoteVersion} => Mettre à jour maintenant !`;
            button.onclick = handleApplyUpdate;
        } else {
            button.textContent = 'À jour';
        }
    } catch (error) {
        button.textContent = `Erreur : ${error.message}`;
    } finally {
        button.disabled = false;
    }
}

function displayInfluxForm(settings) {
    const container = document.getElementById('preferences-container');

    // On s'assure d'avoir au moins 'eternal' comme référence
    const eternalConfig = settings.eternal || {};

    let influxFormHTML = `
        <div class="settings-group">
            <h3>Configuration InfluxDB</h3>
            <div class="influx-tabs-header" style="display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 10px;">
                <button type="button" class="tab-btn active" data-tab="eternal" style="padding: 8px 15px; cursor: pointer; border-radius: 4px 4px 0 0; border: 1px solid #ddd; background: var(--header-bg);">Eternal</button>
                <button type="button" class="tab-btn" data-tab="longRetention" style="padding: 8px 15px; cursor: pointer; border-radius: 4px 4px 0 0; border: 1px solid #ddd; background: var(--header-bg);">Long Retention</button>
                <button type="button" class="tab-btn" data-tab="shortRetention" style="padding: 8px 15px; cursor: pointer; border-radius: 4px 4px 0 0; border: 1px solid #ddd; background: var(--header-bg);">Short Retention</button>
            </div>
            <form id="influx-settings-form" class="settings-form">
    `;

    const bucketKeys = ['eternal', 'longRetention', 'shortRetention'];

    bucketKeys.forEach((bucketKey, index) => {
        const bucketConfig = settings[bucketKey] || {};
        const isActive = index === 0;

        // Fallback sur 'eternal' pour url, org, token si vide (sauf pour eternal lui-même)
        const displayUrl = (bucketKey !== 'eternal' && !bucketConfig.url) ? eternalConfig.url : bucketConfig.url;
        const displayOrg = (bucketKey !== 'eternal' && !bucketConfig.org) ? eternalConfig.org : bucketConfig.org;
        const displayToken = (bucketKey !== 'eternal' && !bucketConfig.token) ? eternalConfig.token : bucketConfig.token;
        const displayBucket = bucketConfig.bucket || '';

        let bucketLabel = bucketKey === 'eternal' ? 'Données de Station (Eternal)' :
            bucketKey === 'longRetention' ? 'Données Intégrateurs (1 An)' :
                bucketKey === 'shortRetention' ? 'Prévisions (Court Terme)' : bucketKey.toUpperCase();

        influxFormHTML += `
            <div id="tab-${bucketKey}" class="tab-content" style="display: ${isActive ? 'block' : 'none'}; padding: 15px; border-radius: 8px; background: rgba(255,255,255,0.05);">
                <h4 style="margin-top: 0; color: var(--accent-blue);">${bucketLabel}</h4>
                <p style="font-size: 0.8em; margin-bottom: 15px; opacity: 0.8;">${bucketConfig.comment || ''}</p>
                <div class="settings-row">
                    ${generateInfluxField(bucketKey, 'url', 'URL du serveur', displayUrl, 'url')}
                    ${generateInfluxField(bucketKey, 'org', 'Organisation', displayOrg, 'text')}
                    ${generateInfluxField(bucketKey, 'bucket', 'Bucket', displayBucket, 'text')}
                </div>
                <div class="settings-row" style="margin-top: 10px;">
                    ${generateInfluxField(bucketKey, 'token', 'Token d\'authentification', displayToken, 'text')}
                </div>
            </div>
        `;
    });

    influxFormHTML += `
                <div class="settings-actions" style="margin-top: 20px;">
                    <button type="submit">
                        <img src="svg/access-control.svg" title="authentification requise!" class="access-control-icon">Enregistrer la configuration InfluxDB
                    </button>
                </div>
            </form>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', influxFormHTML);

    // Gérer le changement d'onglet
    const tabButtons = container.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Masquer tous les contenus
            container.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });

            // Supprimer la classe active de tous les boutons
            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.style.background = 'var(--header-bg)';
                b.style.borderBottom = '1px solid #ddd';
            });

            // Afficher le contenu cible
            const content = container.querySelector(`#tab-${targetTab}`);
            if (content) content.style.display = 'block';

            // Activer le bouton cliqué
            btn.classList.add('active');
            btn.style.background = 'rgba(255,255,255,0.1)';
            btn.style.borderBottom = 'none';
        });
    });

    const form = document.getElementById('influx-settings-form');
    form.addEventListener('submit', handleInfluxFormSubmit);

    // Style initial pour le bouton actif
    const activeBtn = container.querySelector('.tab-btn.active');
    if (activeBtn) {
        activeBtn.style.background = 'rgba(255,255,255,0.1)';
        activeBtn.style.borderBottom = 'none';
    }
}

function generateInfluxField(bucketKey, field, label, value, type) {
    return `
        <div class="settings-field condition-tile">
            <label for="influx-${bucketKey}-${field}">${label}</label>
            <input type="${type}" id="influx-${bucketKey}-${field}" name="${bucketKey}.${field}" value="${value || ''}">
        </div>
    `;
}

function displayUnitsForm(settings) {
    const container = document.getElementById('preferences-container');

    // Récupérer le skin type actuel depuis les settings UV
    if (settings.uv && settings.uv.available_units && settings.uv.available_units.min && settings.uv.available_units.min.skin) {
        currentSkinType = settings.uv.available_units.min.skin;
    }

    const groupedCategories = {
        'Unités Météorologiques': ['temperature', 'humidity', 'pressure'],
        'Unités Vent et Direction': ['speed', 'direction'],
        'Unités Précipitations': ['rain', 'rainRate'],
        'Unités Rayonnement': ['uv', 'irradiance'],
        'Unités Système': ['voltage', 'date', 'time'],
        'Unités Supplémentaires': [] // Sera peuplé dynamiquement
    };

    // Récupérer toutes les clés d'unités déjà catégorisées
    const categorizedKeys = new Set(Object.values(groupedCategories).flat());

    // Trouver les clés qui ne sont dans aucune catégorie prédéfinie et les ajouter aux unités supplémentaires
    Object.keys(settings).forEach(key => {
        if (!categorizedKeys.has(key)) {
            groupedCategories['Unités Supplémentaires'].push(key);
        }
    });

    let formHTML = `
    <div class="settings-group">
        <form id="units-preferences-form" class="settings-form">
    `;

    Object.entries(groupedCategories).forEach(([groupName, categoryKeys]) => {
        formHTML += `
            <div class="settings-group">
                <h3>${groupName}</h3>
                <div class="settings-row">
        `;

        categoryKeys.forEach(categoryKey => {
            if (settings[categoryKey]) {
                formHTML += generateUnitField(categoryKey, settings[categoryKey]);
            }
        });

        formHTML += `
                </div>
            </div>
        `;
    });

    formHTML += `
        <div class="settings-actions">
            <button type="button" class="btn-secondary" id="reset-units-preferences">Réinitialiser les unités</button>
            <button type="submit">
                <img src="svg/access-control.svg" title="authentification requise!" class="access-control-icon">Enregistrer les unités
            </button>
        </div>
    </form>
    </div>
    `; // Close settings-group

    container.innerHTML = formHTML;

    // Ajouter les event listeners
    const form = document.getElementById('units-preferences-form');
    const resetBtn = document.getElementById('reset-units-preferences');

    if (form) {
        form.addEventListener('submit', handleUnitsFormSubmit);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetUnitsToDefault);
    }

    // Ajouter les event listeners pour les changements d'unités UV
    const uvSelect = document.getElementById('unit-select-uv');
    if (uvSelect) {
        uvSelect.addEventListener('change', handleUVUnitChange);
        // Initialiser l'affichage du sélecteur de type de peau si nécessaire
        handleUVUnitChange();
    }
}

function generateUnitField(categoryKey, categoryData) {
    if (!categoryData.title) return ''; // Ne pas afficher si la catégorie n'a pas de titre

    const currentUnit = categoryData.user;
    const availableUnits = categoryData.available_units;
    const sensors = categoryData.sensors || [];

    const tooltip = `${categoryData.description || ''}${sensors.length > 0 ? '\nCapteurs: ' + sensors.join(', ') : ''}`;

    let fieldHTML = `
        <div class="settings-field condition-tile">
            <label for="unit-select-${categoryKey}">
                ${categoryData.title}
                <span class="tooltip" data-tooltip="${tooltip}">?</span>
            </label>
            <select id="unit-select-${categoryKey}" name="${categoryKey}">
    `;

    Object.entries(availableUnits).forEach(([unitKey, unitData]) => {
        const selected = unitKey === currentUnit ? 'selected' : '';
        fieldHTML += `<option value="${unitKey}" ${selected}>[${unitKey}] ${unitData.title}</option>`;
    });

    fieldHTML += '</select>';

    // Ajouter le sélecteur de type de peau pour UV si l'unité est 'min'
    if (categoryKey === 'uv') {
        fieldHTML += generateSkinTypeSelector();
    }

    fieldHTML += '</div>';

    return fieldHTML;
}

function generateSkinTypeSelector() {
    let skinHTML = `
        <div class="skin-type-field" id="skin-type-field" style="display: ${currentUnitsSettings.uv && currentUnitsSettings.uv.user === 'min' ? 'block' : 'none'}; margin-top: 10px;">
            <label for="skin-type-select">Type de peau pour le calcul du temps d'exposition :</label>
            <select id="skin-type-select" name="skin_type">
    `;

    Object.entries(SKIN_TYPES).forEach(([typeKey, typeData]) => {
        const selected = parseInt(typeKey) === currentSkinType ? 'selected' : '';
        skinHTML += `<option value="${typeKey}" ${selected}>${typeData.name} - ${typeData.description}</option>`;
    });

    skinHTML += `
            </select>
            <input type="number" id="dem-input" name="dem" value="${SKIN_TYPES[currentSkinType].dem}" hidden>
            <div class="skin-type-info" style="margin-top: 8px; padding: 8px; background: #f0f8ff; border-radius: 4px; font-size: 0.9em;">
                <p style="margin: 0 0 5px 0; color: #666;">Le facteur DEM (Dose Érythémale Minimale) détermine la sensibilité de votre peau aux UV.</p>
                <div class="current-dem" style="font-weight: bold; color: var(--accent-blue);">DEM actuel : <span id="current-dem-value">${SKIN_TYPES[currentSkinType].dem}</span></div>
            </div>
        </div>
    `;

    return skinHTML;
}

function handleUVUnitChange() {
    const uvSelect = document.getElementById('unit-select-uv');
    const skinTypeField = document.getElementById('skin-type-field');

    if (uvSelect && skinTypeField) {
        skinTypeField.style.display = uvSelect.value === 'min' ? 'block' : 'none';
    }

    // Mettre à jour l'event listener pour le changement de type de peau
    const skinTypeSelect = document.getElementById('skin-type-select');
    if (skinTypeSelect) {
        skinTypeSelect.removeEventListener('change', updateSkinTypeDEM);
        skinTypeSelect.addEventListener('change', updateSkinTypeDEM);
    }
}

function updateSkinTypeDEM() {
    const skinTypeSelect = document.getElementById('skin-type-select');
    if (!skinTypeSelect) return;

    const selectedType = parseInt(skinTypeSelect.value);
    const demValue = SKIN_TYPES[selectedType].dem;
    const demDisplay = document.getElementById('current-dem-value');
    const demInput = document.getElementById('dem-input');

    if (demDisplay) {
        demDisplay.textContent = demValue;
    }
    if (demInput) {
        demInput.value = demValue;
        console.log('demInput.value', demInput.value);
    }
    currentSkinType = selectedType;
}

async function handleInfluxFormSubmit(event) {
    event.preventDefault();
    showGlobalStatus('Enregistrement de la configuration InfluxDB...', 'loading');

    try {
        const formData = new FormData(event.target);
        const settings = {};

        const rawEntries = Array.from(formData.entries());

        // On récupère d'abord Eternal car il sert de référence
        const eternalEntries = rawEntries.filter(([key]) => key.startsWith('eternal.'));
        settings.eternal = {};
        eternalEntries.forEach(([key, value]) => {
            const field = key.split('.')[1];
            settings.eternal[field] = value;
        });

        // Puis les autres buckets
        rawEntries.forEach(([key, value]) => {
            if (key.startsWith('eternal.')) return;

            const [bucketKey, field] = key.split('.');
            if (!settings[bucketKey]) settings[bucketKey] = {};

            // Si le champ est vide, on prend celui d'eternal (sauf pour le nom du bucket lui-même)
            if (!value && field !== 'bucket' && settings.eternal[field]) {
                settings[bucketKey][field] = settings.eternal[field];
            } else {
                settings[bucketKey][field] = value;
            }
        });

        const response = await fetch('/api/influxdb', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        });

        if (!response.ok) throw new Error('Erreur lors de la sauvegarde de la configuration InfluxDB');

        const result = await response.json();
        if (result.success) {
            showGlobalStatus('Configuration InfluxDB enregistrée avec succès !', 'success');
            setTimeout(() => fetchSettings(), 1500); // Recharger pour afficher le token masqué
        } else {
            throw new Error(result.error || 'Erreur inconnue');
        }
    } catch (error) {
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function handleUnitsFormSubmit(event) {
    event.preventDefault();

    showGlobalStatus('Enregistrement des Unités...', 'loading');

    try {
        const formData = new FormData(event.target);
        const updatedSettings = { ...currentUnitsSettings };

        // Mettre à jour les unités sélectionnées
        for (const [key, value] of formData.entries()) {
            if (key === 'skin_type') {
                const skin_type = parseInt(value);
                updatedSettings.uv.available_units.min.skin = skin_type;
                // Traitement spécial pour le type de peau UV
                if (updatedSettings.uv && updatedSettings.uv.available_units && updatedSettings.uv.available_units.min) {
                    updatedSettings.uv.available_units.min.skin = skin_type;
                    updatedSettings.uv.available_units.min.fnFromMetric = `(uv, dem=${SKIN_TYPES[skin_type].dem}) => Number(Math.min(300, dem*6.5/((uv*Math.exp(uv/dem)))).toFixed(0))`;
                }
            } else if (updatedSettings[key]) {
                updatedSettings[key].user = value;
            }
        }

        // Envoyer les données mises à jour
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                settings: updatedSettings
            })
        });

        if (!response.ok) {
            throw new Error('Erreur lors de la sauvegarde');
        }

        const result = await response.json();

        if (result.success) {
            currentUnitsSettings = updatedSettings;
            showGlobalStatus('Unités enregistrées avec succès !', 'success');

            // Rafraîchir l'affichage si on est sur le dashboard
            if (typeof fetchCurrentConditions === 'function') {
                setTimeout(() => {
                    if (document.querySelector('#dashboard-section.content-section.active')) {
                        fetchCurrentConditions();
                    }
                }, 2000);
            }
        } else {
            throw new Error(result.message || 'Erreur lors de la sauvegarde');
        }

    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function resetUnitsToDefault() {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser toutes les unités aux valeurs initiales ?')) {
        return;
    }

    showGlobalStatus('Réinitialisation des Unités...', 'loading');

    try {
        // Créer un objet avec les unités par défaut
        const defaultSettings = { ...currentUnitsSettings };

        // Réinitialiser chaque unité à sa valeur métrique
        Object.keys(defaultSettings).forEach(key => {
            if (defaultSettings[key].metric) {
                defaultSettings[key].user = defaultSettings[key].metric;
            }
        });

        // Réinitialiser le type de peau UV
        if (defaultSettings.uv && defaultSettings.uv.available_units && defaultSettings.uv.available_units.min) {
            defaultSettings.uv.available_units.min.skin = 3; // Type 3 par défaut
        }

        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                settings: defaultSettings
            })
        });

        if (!response.ok) {
            throw new Error('Erreur lors de la réinitialisation');
        }

        const result = await response.json();

        if (result.success) {
            currentUnitsSettings = defaultSettings;
            currentSkinType = 3;
            showGlobalStatus('Unités réinitialisées avec succès !', 'success');

            // Recharger le formulaire avec les nouvelles valeurs
            setTimeout(() => {
                displayUnitsForm(defaultSettings);
            }, 2000);
        } else {
            throw new Error(result.message || 'Erreur lors de la réinitialisation');
        }

    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}