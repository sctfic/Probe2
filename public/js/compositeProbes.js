let currentProbesSettings = {};
let sensorList = [];

/**
 * Fetches the list of calculated probes from the server.
 */
async function fetchcompositeProbes() {
    showProbesStatus('Chargement des sondes calculées...', 'loading');

    try {
        const response = await fetch('/api/composite-probes');
        if (!response.ok) throw new Error('Erreur de chargement des sondes');

        const data = await response.json();
        if (data.success && data.settings) {
            currentProbesSettings = data.settings;
            displayProbesList(data.settings);
            showProbesStatus('Sondes chargées avec succès', 'success');
        } else {
            throw new Error('Format de données invalide pour les sondes');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showProbesStatus(`Erreur: ${error.message}`, 'error');
        document.getElementById('composite-probes-container').innerHTML = '';
    }
}

/**
 * Displays the list of calculated probes as collapsible items.
 * @param {object} settings - The probes configuration object.
 */
function displayProbesList(settings) {
    const container = document.getElementById('composite-probes-container');

    let listHTML = `
        <div class="probes-header">
            <h1>Configuration des Sondes Calculées</h1>
            <button id="add-probe-btn" class="btn btn-primary">Ajouter une Sonde</button>
        </div>
        <div id="probes-list" class="settings-form">
    `;

    Object.entries(settings).forEach(([probeKey, probeData]) => {
        listHTML += createProbeItemHTML(probeKey, probeData);
    });

    listHTML += '</div>';
    container.innerHTML = listHTML;

    // Add event listeners
    document.getElementById('add-probe-btn').addEventListener('click', showAddProbeModal);
    container.querySelectorAll('.probe-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-delete-probe')) return;
            const content = header.nextElementSibling;
            const icon = header.querySelector('.toggle-icon');
            content.classList.toggle('open');
            icon.textContent = content.classList.contains('open') ? '▼' : '▶';
        });
    });

    container.querySelectorAll('.btn-delete-probe').forEach(button => {
        button.addEventListener('click', handleDeleteProbe);
    });

    container.querySelectorAll('textarea[name$=".fnCalc"]').forEach(setupFnCalcAutocompletion);
    container.addEventListener('submit', handleProbesFormSubmit);
}

/**
 * Creates the HTML for a single probe item in the list.
 * @param {string} probeKey - The unique key for the probe.
 * @param {object} probeData - The data for the probe.
 * @param {boolean} [isOpen=false] - Whether the item should be open by default.
 * @returns {string} The HTML string for the probe item.
 */
function createProbeItemHTML(probeKey, probeData, isOpen = false) {
    return `
        <div class="settings-group probe-item" data-probe-key="${probeKey}">
            <div class="probe-header">
                <h3>
                    <span class="toggle-icon">${isOpen ? '▼' : '▶'}</span>
                    Sonde : ${probeKey} <em class="probe-label-preview">(${probeData.label || 'N/A'})</em>
                </h3>
                <button type="button" class="btn-delete-probe" data-probe-key="${probeKey}" title="Supprimer la sonde">&times;</button>
            </div>
            <div class="probe-content ${isOpen ? 'open' : ''}">
                <form data-probe-key="${probeKey}">
                    <div class="probe-fields">
                        <div class="form-row">
                            ${generateProbeField(probeKey, 'label', probeData.label, 'text', 'Label affiché')}
                            ${generateProbeField(probeKey, 'comment', probeData.comment, 'text', 'Commentaire')}
                        </div>
                        ${generateProbeField(probeKey, 'fnCalc', probeData.fnCalc, 'textarea', 'Fonction de calcul')}
                        <div class="form-row">
                            ${generateProbeField(probeKey, 'scriptJS', (probeData.scriptJS || []).join(','), 'text', 'Scripts JS (séparés par une virgule)')}
                            ${generateProbeField(probeKey, 'period', probeData.period, 'number', 'Période (secondes)')}
                        </div>
                        <input type="hidden" name="${probeKey}.sensorDb" value="${probeData.sensorDb || probeKey}">
                    </div>
                    <div class="settings-actions">
                        <button type="submit">Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function generateProbeField(probeKey, fieldKey, value, type = 'text', label = '') {
    const inputId = `probe-${probeKey}-${fieldKey}`;
    let inputHTML = '';
    if (type === 'textarea') {
        inputHTML = `<textarea id="${inputId}" name="${probeKey}.${fieldKey}" placeholder="${label}" rows="4">${value || ''}</textarea>`;
    } else {
        inputHTML = `<input type="${type}" id="${inputId}" name="${probeKey}.${fieldKey}" value="${value || ''}" placeholder="${label}">`;
    }

    return `
        <div class="settings-field">
            <label for="${inputId}">${label}</label>
            ${inputHTML}
        </div>
    `;
}

function showAddProbeModal() {
    const modal = document.getElementById('add-probe-modal');
    modal.classList.add('show');
    document.getElementById('new-probe-key').focus();
    document.querySelector('#add-probe-modal .close-probe-modal').onclick = hideAddProbeModal;
    document.getElementById('cancel-probe-btn').onclick = hideAddProbeModal;
    document.getElementById('add-probe-form').onsubmit = handleAddProbe;
}

function hideAddProbeModal() {
    const modal = document.getElementById('add-probe-modal');
    modal.classList.remove('show');
    document.getElementById('add-probe-form').reset();
    const errorDiv = document.getElementById('probe-key-error');
    errorDiv.style.display = 'none';
}

function handleAddProbe(event) {
    event.preventDefault();
    const keyInput = document.getElementById('new-probe-key');
    const probeKey = keyInput.value.trim();
    const errorDiv = document.getElementById('probe-key-error');

    if (!probeKey) {
        errorDiv.textContent = 'La clé est requise.';
        errorDiv.style.display = 'block';
        return;
    }
    if (!/^[a-zA-Z0-9_]+_calc$/.test(probeKey)) {
        errorDiv.textContent = 'La clé doit être alphanumérique, utiliser des underscores, et se terminer par "_calc".';
        errorDiv.style.display = 'block';
        return;
    }
    if (currentProbesSettings[probeKey]) {
        errorDiv.textContent = 'Cette clé de sonde existe déjà.';
        errorDiv.style.display = 'block';
        return;
    }
    
    errorDiv.style.display = 'none';

    const newProbeData = {
        label: "", comment: "", fnCalc: "(data) => {\n  return null;\n}",
        dataNeeded: [], currentMap: {}, scriptJS: [],
        period: 604800, sensorDb: probeKey
    };
    currentProbesSettings[probeKey] = newProbeData;

    const list = document.getElementById('probes-list');
    list.insertAdjacentHTML('beforeend', createProbeItemHTML(probeKey, newProbeData, true));
    
    const newItem = list.lastElementChild;
    newItem.querySelector('.probe-header').addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-probe')) return;
        const content = newItem.querySelector('.probe-content');
        const icon = newItem.querySelector('.toggle-icon');
        content.classList.toggle('open');
        icon.textContent = content.classList.contains('open') ? '▼' : '▶';
    });
    newItem.querySelector('.btn-delete-probe').addEventListener('click', handleDeleteProbe);
    setupFnCalcAutocompletion(newItem.querySelector(`textarea[name$=".fnCalc"]`));

    hideAddProbeModal();
    newItem.scrollIntoView({ behavior: 'smooth' });
}

function handleDeleteProbe(event) {
    const probeKey = event.target.dataset.probeKey;
    if (confirm(`Êtes-vous sûr de vouloir supprimer la sonde "${probeKey}" ? Cette action est irréversible.`)) {
        delete currentProbesSettings[probeKey];
        document.querySelector(`.probe-item[data-probe-key="${probeKey}"]`).remove();
        saveAllProbesSettings(currentProbesSettings);
    }
}

function parseFnCalc(fnCalcStr) {
    const regex = /data\['([^']+)'\]/g;
    const matches = [...fnCalcStr.matchAll(regex)];
    const dataNeeded = [...new Set(matches.map(m => m[1]))];
    
    const currentMap = { d: "timestamp" };
    dataNeeded.forEach(key => {
        const parts = key.split(':');
        currentMap[key] = parts.length > 1 ? parts[1] : parts[0];
    });

    return { dataNeeded, currentMap };
}

async function handleProbesFormSubmit(event) {
    event.preventDefault();
    if (event.target.tagName !== 'FORM') return;

    const form = event.target;
    const probeKey = form.dataset.probeKey;
    if (!probeKey) return;

    showProbesStatus(`Enregistrement de ${probeKey}...`, 'loading');

    try {
        const formData = new FormData(form);
        const probeData = { ...currentProbesSettings[probeKey] };

        for (const [key, value] of formData.entries()) {
            const [probeKey, fieldKey] = key.split('.');
            if (fieldKey === 'scriptJS') {
                probeData[fieldKey] = value.split(',').map(s => s.trim()).filter(s => s);
            } else if (fieldKey === 'period') {
                probeData[fieldKey] = Number(value);
            } else {
                probeData[fieldKey] = value;
            }
        }

        const { dataNeeded, currentMap } = parseFnCalc(probeData.fnCalc);
        probeData.dataNeeded = dataNeeded;
        probeData.currentMap = currentMap;
        
        currentProbesSettings[probeKey] = probeData;

        await saveAllProbesSettings(currentProbesSettings);

        const item = document.querySelector(`.probe-item[data-probe-key="${probeKey}"]`);
        if (item) {
            item.querySelector('.probe-label-preview').textContent = `(${probeData.label || 'N/A'})`;
        }
    } catch (error) {
        console.error('Erreur:', error);
        showProbesStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function saveAllProbesSettings(settings) {
    showProbesStatus('Enregistrement des sondes...', 'loading');
    try {
        const response = await fetch('/api/composite-probes', {
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
            currentProbesSettings = settings;
            showProbesStatus('Sondes enregistrées avec succès !', 'success');
        } else {
            throw new Error(result.message || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showProbesStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function fetchSensorList() {
    if (!selectedStation || sensorList.length > 0) return;
    try {
        const response = await fetch(`/query/${selectedStation.id}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.success && data.metadata && data.metadata.sensor) {
            sensorList = data.metadata.sensor;
        }
    } catch (error) {
        console.error('Failed to fetch sensor list for autocompletion:', error);
    }
}

function setupFnCalcAutocompletion(textarea) {
    textarea.addEventListener('input', (e) => {
        const text = e.target.value;
        const cursorPos = e.target.selectionStart;
        const trigger = "data['";
        const triggerIndex = text.lastIndexOf(trigger, cursorPos);
        if (triggerIndex !== -1 && text.slice(triggerIndex + trigger.length, cursorPos).indexOf("'") === -1) {
            const currentInput = text.slice(triggerIndex + trigger.length, cursorPos);
            showAutocomplete(e.target, currentInput);
        } else {
            hideAutocomplete();
        }
    });
}

function showAutocomplete(textarea, filter) {
    hideAutocomplete();
    fetchSensorList();
    const suggestions = sensorList.filter(s => s.toLowerCase().includes(filter.toLowerCase()));
    if (suggestions.length === 0) return;

    const list = document.createElement('ul');
    list.id = 'fncalc-autocomplete';
    list.className = 'autocomplete-list';
    
    suggestions.forEach(suggestion => {
        const item = document.createElement('li');
        item.textContent = suggestion;
        item.onclick = () => {
            const text = textarea.value;
            const cursorPos = textarea.selectionStart;
            const trigger = "data['";
            const triggerIndex = text.lastIndexOf(trigger, cursorPos);
            const prefix = text.substring(0, triggerIndex + trigger.length);
            const suffix = text.substring(cursorPos);
            textarea.value = `${prefix}${suggestion}']${suffix}`;
            hideAutocomplete();
            textarea.focus();
        };
        list.appendChild(item);
    });

    document.body.appendChild(list);
    const rect = textarea.getBoundingClientRect();
    list.style.left = `${rect.left}px`;
    list.style.top = `${rect.bottom}px`;
    list.style.width = `${rect.width}px`;
}

function hideAutocomplete() {
    const list = document.getElementById('fncalc-autocomplete');
    if (list) list.remove();
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.probe-fields')) {
        hideAutocomplete();
    }
});

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