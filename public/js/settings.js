// DEM values for different skin types
const SKIN_TYPES = {
    1: { name: "Type 1", description: "Brûle rapidement et ne bronze pas. Peau très claire avec des taches de rousseur, cheveux roux ou blonds, yeux clairs.", dem: 2.5 },
    2: { name: "Type 2", description: "Brûle facilement et bronze lentement. Peau claire, cheveux blonds, yeux clairs.", dem: 3.0 },
    3: { name: "Type 3", description: "Brûle rarement et bronze facilement. Peau légèrement mate, cheveux châtain/bruns, yeux foncés.", dem: 4.0 },
    4: { name: "Type 4", description: "Brûle très rarement et bronze bien. Peau mate, cheveux foncés, yeux foncés, de type méditerranéen.", dem: 5.0 },
    5: { name: "Type 5", description: "Peau asiatique, très résistante au soleil.", dem: 8.0 },
    6: { name: "Type 6", description: "Peau noire, extrêmement résistante au soleil.", dem: 15.0 }
};

// Catégories d'unités avec leurs icônes et descriptions
const UNIT_CATEGORIES = {
    temperature: {
        icon: '🌡️',
        title: 'Température',
        description: 'Unités de mesure de la température'
    },
    speed: {
        icon: '💨',
        title: 'Vitesse du vent',
        description: 'Unités de mesure de la vitesse du vent'
    },
    direction: {
        icon: '🧭',
        title: 'Direction du vent',
        description: 'Format d\'affichage de la direction du vent'
    },
    pressure: {
        icon: '📊',
        title: 'Pression atmosphérique',
        description: 'Unités de mesure de la pression barométrique'
    },
    rain: {
        icon: '🌧️',
        title: 'Précipitations',
        description: 'Unités de mesure des précipitations'
    },
    rainRate: {
        icon: '⛈️',
        title: 'Intensité de pluie',
        description: 'Unités de mesure de l\'intensité des précipitations'
    },
    uv: {
        icon: '☀️',
        title: 'Rayonnement UV',
        description: 'Format d\'affichage de l\'index UV'
    },
    powerRadiation: {
        icon: '🔆',
        title: 'Rayonnement solaire',
        description: 'Unités de mesure du rayonnement solaire'
    },
    humidity: {
        icon: '💧',
        title: 'Humidité',
        description: 'Unités de mesure de l\'humidité'
    },
    battery: {
        icon: '🔋',
        title: 'Batterie',
        description: 'Format d\'affichage de l\'état de la batterie'
    },
    date: {
        icon: '📅',
        title: 'Date',
        description: 'Format d\'affichage des dates'
    },
    time: {
        icon: '🕐',
        title: 'Heure',
        description: 'Format d\'affichage de l\'heure'
    },
    Forecast: {
        icon: '🌤️',
        title: 'Prévisions météo',
        description: 'Format d\'affichage des prévisions'
    }
};

let currentUnitsSettings = {};
let currentSkinType = 3; // Type par défaut

// --- Preferences Section: Units Settings ---

async function fetchUnitsPreferences() {
    showPreferencesStatus('Chargement des préférences d\'unités...', 'loading');

    try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Erreur de chargement des préférences');

        const data = await response.json();
        if (data.success && data.settings) {
            currentUnitsSettings = data.settings;
            displayPreferencesForm(data.settings);
            showPreferencesStatus('Préférences chargées avec succès', 'success');
        } else {
            throw new Error('Format de données invalide pour les préférences');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showPreferencesStatus(`Erreur: ${error.message}`, 'error');
        document.getElementById('preferences-container').innerHTML = '';
    }
}

function displayPreferencesForm(settings) {
    const container = document.getElementById('preferences-container');
    
    // Récupérer le skin type actuel depuis les settings UV
    if (settings.uv && settings.uv.available_units && settings.uv.available_units.min && settings.uv.available_units.min.skin) {
        currentSkinType = settings.uv.available_units.min.skin;
    }

    // Grouper les catégories par type
    const groupedCategories = {
        'Conditions Météorologiques': ['temperature', 'humidity', 'pressure'],
        'Vent et Direction': ['speed', 'direction'],
        'Précipitations': ['rain', 'rainRate'],
        'Rayonnement': ['uv', 'powerRadiation'],
        'Système': ['battery', 'date', 'time', 'Forecast']
    };

    let formHTML = '<form id="units-preferences-form" class="settings-form">';
    formHTML += '<h1>Configuration des Unités de Mesure</h1>';

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
            <button type="button" class="btn-secondary" id="reset-preferences">Réinitialiser</button>
            <button type="submit">Enregistrer les modifications</button>
        </div>
    </form>
    `;

    container.innerHTML = formHTML;

    // Ajouter les event listeners
    const form = document.getElementById('units-preferences-form');
    const resetBtn = document.getElementById('reset-preferences');

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
    const category = UNIT_CATEGORIES[categoryKey];
    if (!category) return '';

    const currentUnit = categoryData.user;
    const availableUnits = categoryData.available_units;
    const sensors = categoryData.sensors || [];

    const tooltip = `${category.description}${sensors.length > 0 ? '\nCapteurs: ' + sensors.join(', ') : ''}`;

    let fieldHTML = `
        <div class="settings-field condition-tile">
            <label for="unit-select-${categoryKey}">
                ${category.title}
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
    
    if (demDisplay) {
        demDisplay.textContent = demValue;
    }
    currentSkinType = selectedType;
}

async function handleUnitsFormSubmit(event) {
    event.preventDefault();
    
    showPreferencesStatus('Enregistrement des préférences...', 'loading');

    try {
        const formData = new FormData(event.target);
        const updatedSettings = { ...currentUnitsSettings };

        // Mettre à jour les unités sélectionnées
        for (const [key, value] of formData.entries()) {
            if (key === 'skin_type') {
                // Traitement spécial pour le type de peau UV
                if (updatedSettings.uv && updatedSettings.uv.available_units && updatedSettings.uv.available_units.min) {
                    updatedSettings.uv.available_units.min.skin = parseInt(value);
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
            showPreferencesStatus('Préférences enregistrées avec succès !', 'success');
            
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
        showPreferencesStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function resetUnitsToDefault() {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser toutes les unités aux valeurs par défaut ?')) {
        return;
    }

    showPreferencesStatus('Réinitialisation des préférences...', 'loading');

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
            showPreferencesStatus('Préférences réinitialisées avec succès !', 'success');
            
            // Recharger le formulaire avec les nouvelles valeurs
            setTimeout(() => {
                displayPreferencesForm(defaultSettings);
            }, 2000);
        } else {
            throw new Error(result.message || 'Erreur lors de la réinitialisation');
        }

    } catch (error) {
        console.error('Erreur:', error);
        showPreferencesStatus(`Erreur: ${error.message}`, 'error');
    }
}

function showPreferencesStatus(message, type) {
    const statusElement = document.getElementById('status-bar');
    if (!statusElement) return;

    if (message) {
        statusElement.textContent = message;
        statusElement.className = `status-message status-${type}`;
        statusElement.style.display = 'block';
        
        // Masquer automatiquement les messages de succès après 5 secondes (cohérent avec station.js)
        if (type === 'success') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    } else {
        statusElement.style.display = 'none';
    }
}