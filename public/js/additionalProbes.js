let currentProbesSettings = {};

async function fetchAdditionalProbes() {
    showProbesStatus('Chargement des sondes calculées...', 'loading');

    try {
        const response = await fetch('/api/additional-probes');
        if (!response.ok) throw new Error('Erreur de chargement des sondes');

        const data = await response.json();
        if (data.success && data.settings) {
            currentProbesSettings = data.settings;
            displayProbesForm(data.settings);
            showProbesStatus('Sondes chargées avec succès', 'success');
        } else {
            throw new Error('Format de données invalide pour les sondes');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showProbesStatus(`Erreur: ${error.message}`, 'error');
        document.getElementById('additional-probes-container').innerHTML = '';
    }
}

function displayProbesForm(settings) {
    const container = document.getElementById('additional-probes-container');
    
    let formHTML = '<form id="additional-probes-form" class="settings-form">';
    formHTML += '<h1>Configuration des Sondes Calculées</h1>';

    Object.entries(settings).forEach(([probeKey, probeData]) => {
        formHTML += `
            <div class="settings-group">
                <h3>Sonde : ${probeKey}</h3>
                <div class="probe-fields">
                    ${generateProbeField(probeKey, 'label', probeData.label, 'text', 'Label affiché')}
                    ${generateProbeField(probeKey, 'comment', probeData.comment, 'text', 'Commentaire')}
                    ${generateProbeField(probeKey, 'fnCalc', probeData.fnCalc, 'textarea', 'Fonction de calcul')}
                    ${generateProbeField(probeKey, 'dataNeeded', (probeData.dataNeeded || []).join(','), 'text', 'Données requises (séparées par une virgule)')}
                    ${generateProbeField(probeKey, 'currentMap', JSON.stringify(probeData.currentMap, null, 2), 'textarea', 'Mapping pour données temps réel (JSON)')}
                    ${generateProbeField(probeKey, 'scriptJS', (probeData.scriptJS || []).join(','), 'text', 'Scripts JS requis (séparés par une virgule)')}
                    ${generateProbeField(probeKey, 'period', probeData.period, 'number', 'Période pour les graphiques (secondes)')}
                    ${generateProbeField(probeKey, 'sensorDb', probeData.sensorDb, 'text', 'Nom du capteur dans la BDD')}
                </div>
            </div>
        `;
    });

    formHTML += `
        <div class="settings-actions">
            <button type="submit">Enregistrer les modifications</button>
        </div>
    </form>
    `;

    container.innerHTML = formHTML;

    const form = document.getElementById('additional-probes-form');
    if (form) {
        form.addEventListener('submit', handleProbesFormSubmit);
    }
}

function generateProbeField(probeKey, fieldKey, value, type = 'text', placeholder = '') {
    const inputId = `probe-${probeKey}-${fieldKey}`;
    let inputHTML = '';
    if (type === 'textarea') {
        inputHTML = `<textarea id="${inputId}" name="${probeKey}.${fieldKey}" placeholder="${placeholder}" rows="4">${value || ''}</textarea>`;
    } else {
        inputHTML = `<input type="${type}" id="${inputId}" name="${probeKey}.${fieldKey}" value="${value || ''}" placeholder="${placeholder}">`;
    }

    return `
        <div class="settings-field">
            <label for="${inputId}">${fieldKey}</label>
            ${inputHTML}
        </div>
    `;
}

async function handleProbesFormSubmit(event) {
    event.preventDefault();
    showProbesStatus('Enregistrement des sondes...', 'loading');

    try {
        const formData = new FormData(event.target);
        const updatedSettings = JSON.parse(JSON.stringify(currentProbesSettings)); // Deep copy

        for (const [key, value] of formData.entries()) {
            const [probeKey, fieldKey] = key.split('.');
            
            if (updatedSettings[probeKey]) {
                if (fieldKey === 'dataNeeded' || fieldKey === 'scriptJS') {
                    updatedSettings[probeKey][fieldKey] = value.split(',').map(s => s.trim()).filter(s => s);
                } else if (fieldKey === 'currentMap') {
                    try {
                        updatedSettings[probeKey][fieldKey] = JSON.parse(value);
                    } catch (e) {
                        throw new Error(`JSON invalide pour le champ currentMap de la sonde ${probeKey}`);
                    }
                } else if (fieldKey === 'period') {
                    updatedSettings[probeKey][fieldKey] = Number(value);
                } else {
                    updatedSettings[probeKey][fieldKey] = value;
                }
            }
        }

        const response = await fetch('/api/additional-probes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: updatedSettings })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
        }

        const result = await response.json();
        
        if (result.success) {
            currentProbesSettings = updatedSettings;
            showProbesStatus('Sondes enregistrées avec succès !', 'success');
            // Optionnel: recharger le formulaire pour voir les données formatées
            displayProbesForm(currentProbesSettings);
        } else {
            throw new Error(result.message || 'Erreur lors de la sauvegarde');
        }

    } catch (error) {
        console.error('Erreur:', error);
        showProbesStatus(`Erreur: ${error.message}`, 'error');
    }
}

function showProbesStatus(message, type) {
    const statusElement = document.getElementById('status-bar');
    if (!statusElement) return;

    if (message) {
        statusElement.textContent = message;
        statusElement.className = `status-message status-${type}`;
        statusElement.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    } else {
        statusElement.style.display = 'none';
    }
}