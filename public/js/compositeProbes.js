let currentProbesSettings = {};

let jsCompletions = [
    'function () {\n|\n}', '(x)=>{|}', 'const  = ;', 'let  = ;', 'var  = ;',
    'if (|) {}', 'else if (|) {}', 'else {|}', 'for (i = 0; i < 10; i++) {|}', 'while (i < 10) {|}', 'do {|}', 'switch (i) {\ncase 1: break;\ndefault: \n}', 'case :', 'break;', 'continue;', 'return;',
    'return', 'try {|}\ncatch {}\nfinally {}', 'try {|}', 'catch {|}', 'finally {|}', 'throw', 'class', 'extends', 'import', 'export', 'default', 'async', 'await',
    'console.log();', 'console.error();', 'console.warn();', 'console.info();', 'console.table();',
    'document.getElementById();', 'document.querySelector();', 'document.querySelectorAll();', 'document.createElement();',
    'addEventListener();', 'removeEventListener();', 'preventDefault();', 'stopPropagation();',
    'setTimeout();', 'setInterval();', 'clearTimeout();', 'clearInterval();',
    'JSON.stringify();', 'JSON.parse();', 'Object.keys();', 'Object.values();', 'Object.entries();', 'Array.isArray();',
    'fetch();', 'Promise();', 'try {}\ncatch {}\nfinally {}', 'resolve () {}', 'reject () {}',
    'alert();', 'prompt();', 'confirm();',
    'localStorage();', 'sessionStorage();', 'getItem();', 'setItem();', 'removeItem();',
    'Math.random();', 'Math.floor();', 'Math.ceil();', 'Math.round();', 'Math.max();', 'Math.min();'
];

const HELP_CONTENT_HTML = `
    <p>La fonction doit retourner la valeur calculée. Vous avez accès à l'objet <code>data</code> qui contient les valeurs des capteurs nécessaires.</p>
    <h4>Paramètres disponibles</h4>
    <ul>
        <li><code>data['measurement:sensor']</code> : valeur d'un capteur</li>
        <li><code>data.d</code> : Timestamp de la donnée au format ISO 8601.</li>
        <li><code>%longitude%</code>, <code>%latitude%</code>, <code>%altitude%</code> : Seront remplacés à l'exécution par les coordonnées de la station.</li>
    </ul>
    <h4>Raccourcis de l'éditeur</h4>
    <ul>
        <li><code>Tab</code> : Indenter ou valider l'autocomplétion.</li>
        <li><code>Shift + Tab</code> : Désindenter.</li>
        <li><code>Ctrl + /</code> : Commenter/décommenter la ligne.</li>
        <li><code>↑ / ↓</code> : Naviguer dans les suggestions d'autocomplétion.</li>
        <li><code>Enter</code> : Valider la suggestion sélectionnée.</li>
        <li><code>Escape</code> : Fermer la liste de suggestions.</li>
    </ul>
`;

function hideHelpModal() {
    const modal = document.getElementById('help-modal');
    modal.classList.remove('show');
    window.removeEventListener('click', outsideModalClickHandler);
    document.removeEventListener('keydown', escapeKeyHandler);
}

function outsideModalClickHandler(event) {
    if (event.target == document.getElementById('help-modal')) {
        hideHelpModal();
    }
}

function escapeKeyHandler(event) {
    if (event.key === 'Escape') {
        hideHelpModal();
    }
}

function showHelpModal() {
    document.getElementById('help-modal-body').innerHTML = HELP_CONTENT_HTML;
    document.getElementById('help-modal').classList.add('show');
    window.addEventListener('click', outsideModalClickHandler);
    document.addEventListener('keydown', escapeKeyHandler);
}

function outsideAddProbeModalClickHandler(event) {
    if (event.target == document.getElementById('add-probe-modal')) {
        hideAddProbeModal();
    }
}

function escapeAddProbeModalKeyHandler(event) {
    if (event.key === 'Escape') {
        hideAddProbeModal();
    }
}

/**
 * Fetches the list of calculated probes from the server.
 */
async function fetchcompositeProbes() {
    showGlobalStatus('Chargement des sondes calculées...', 'loading');

    try {
        // --- Fetch sensors for autocompletion ---
        try {
            console.log(selectedStation.id);
            const metadataResponse = await fetch(`/query/${selectedStation.id}`);
            if (metadataResponse.ok) {
                const metadataPayload = await metadataResponse.json();
                if (metadataPayload.success && metadataPayload.metadata.sensor) {
                    const sensorCompletions = metadataPayload.metadata.sensor.map(s => `data['${s}']`);
                    const newCompletions = [...sensorCompletions, 'data.d'];
                    jsCompletions.push(...newCompletions.filter(c => !jsCompletions.includes(c)));
                }
            }
        } catch (e) {
            console.warn("Impossible de récupérer la liste des capteurs pour l'autocomplétion.", e);
        }
        // --- End fetch sensors ---

        const response = await fetch('/api/composite-probes');
        if (!response.ok) throw new Error('Erreur de chargement des sondes');

        const data = await response.json();
        if (data.success && data.settings) {
            currentProbesSettings = data.settings;
            displayProbesList(data.settings);
            showGlobalStatus('Sondes chargées avec succès', 'success');
        } else {
            throw new Error('Format de données invalide pour les sondes');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
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
            <button id="add-probe-btn" class="btn btn-primary add-station-btn">Ajouter une Sonde</button>
        </div>
        <div id="probes-list" class="settings-form">
    `;

    Object.entries(settings).forEach(([probeKey, probeData]) => {
        listHTML += createProbeItemHTML(probeKey, probeData);
    });

    listHTML += '</div>';
    container.innerHTML = listHTML;

    document.getElementById('add-probe-btn').addEventListener('click', showAddProbeModal);

    // Initialize code editors for all textareas
    Object.keys(settings).forEach(probeKey => {
        const textareaId = `probe-${probeKey}-fnCalc`;
        if (document.getElementById(textareaId)) {
            createCodeEditor(textareaId, jsCompletions);
        }
    });

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

    // Use event delegation for help buttons for better performance and simplicity
    container.addEventListener('click', function(event) {
        if (event.target.matches('.btn-show-help')) {
            showHelpModal();
        }
    });
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
    const fnCalcValue = probeData.fnCalc || '';
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
                        <div class="settings-field">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <label for="probe-${probeKey}-fnCalc">Fonction de calcul</label>
                                <button type="button" class="btn-help btn-show-help">Aide</button>
                            </div>
                            <textarea id="probe-${probeKey}-fnCalc" name="${probeKey}.fnCalc" placeholder="Fonction de calcul" rows="10">${fnCalcValue}</textarea>
                        </div>
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
    document.getElementById('cancel-probe-btn').onclick = hideAddProbeModal;
    document.getElementById('add-probe-form').onsubmit = handleAddProbe;
    window.addEventListener('click', outsideAddProbeModalClickHandler);
    document.addEventListener('keydown', escapeAddProbeModalKeyHandler);
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
    let probeKey = keyInput.value.trim();
    const errorDiv = document.getElementById('probe-key-error');

    if (!probeKey) {
        errorDiv.textContent = 'La clé est requise.';
        errorDiv.style.display = 'block';
        return;
    }
    // Valider les caractères et ajouter "_calc" si manquant.
    const baseKey = probeKey.endsWith('_calc') ? probeKey.slice(0, -5) : probeKey;
    if (!/^[a-zA-Z0-9_]+$/.test(baseKey) || !baseKey) {
        errorDiv.textContent = 'La clé doit être alphanumérique et peut contenir des underscores.';
        errorDiv.style.display = 'block';
        return;
    }
    probeKey = baseKey + '_calc';
    if (currentProbesSettings[probeKey]) {
        errorDiv.textContent = 'Cette clé de sonde existe déjà.';
        errorDiv.style.display = 'block';
        return;
    }
    
    errorDiv.style.display = 'none';

    const newProbeData = {
        label: "", comment: "", fnCalc: "(data, lon=%longitude%, lat=%latitude% , alt=%altitude%) => {\n  return null;\n}",
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

    // Initialize code editor for the new textarea
    const textareaId = `probe-${probeKey}-fnCalc`;
    if (document.getElementById(textareaId)) {
        createCodeEditor(textareaId, jsCompletions);
    }

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
    if (dataNeeded.length === 0) {
        dataNeeded.push('pressure:barometer');
    }
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

    showGlobalStatus(`Enregistrement de ${probeKey}...`, 'loading');

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
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function saveAllProbesSettings(settings) {
    showGlobalStatus('Enregistrement des sondes...', 'loading');
    try {
        const response = await fetch('/api/composite-probes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: settings })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
        }
        const result = await response.json();
        if (result.success) {
            currentProbesSettings = settings;
            showGlobalStatus('Sondes enregistrées avec succès !', 'success');
        } else {
            throw new Error(result.message || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}