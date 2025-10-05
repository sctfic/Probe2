let currentIntegratorProbesSettings = {};
let integratorUnitCategories = {};

let integratorJsCompletions = [
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

const INTEGRATOR_HELP_CONTENT_HTML = `
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

function hideIntegratorHelpModal() {
    const modal = document.getElementById('help-modal');
    modal.classList.remove('show');
    window.removeEventListener('click', outsideIntegratorModalClickHandler);
    document.removeEventListener('keydown', escapeIntegratorKeyHandler);
}

function outsideIntegratorModalClickHandler(event) {
    if (event.target == document.getElementById('help-modal')) {
        hideIntegratorHelpModal();
    }
}

function escapeIntegratorKeyHandler(event) {
    if (event.key === 'Escape') {
        hideIntegratorHelpModal();
    }
}

function showIntegratorHelpModal() {
    document.getElementById('help-modal-body').innerHTML = INTEGRATOR_HELP_CONTENT_HTML;
    document.getElementById('help-modal').classList.add('show');
    window.addEventListener('click', outsideIntegratorModalClickHandler);
    document.addEventListener('keydown', escapeIntegratorKeyHandler);
}

function outsideAddIntegratorProbeModalClickHandler(event) {
    if (event.target == document.getElementById('add-integrator-probe-modal')) {
        hideAddIntegratorProbeModal();
    }
}

function escapeAddIntegratorProbeModalKeyHandler(event) {
    if (event.key === 'Escape') {
        hideAddIntegratorProbeModal();
    }
}

/**
 * Fetches the list of Integrator modeles from the server.
 */
async function fetchIntegratorProbes() {
    showGlobalStatus('Chargement des Modeles Intégrateur...', 'loading');

    try {
        // --- Fetch units settings first for the measurement dropdown ---
        try {
            const unitsResponse = await fetch('/api/settings');
            if (unitsResponse.ok) {
                const unitsData = await unitsResponse.json();
                if (unitsData.success) {
                    integratorUnitCategories = unitsData.settings;
                }
            }
        } catch (e) {
            console.warn("Impossible de charger les catégories d'unités pour les Modeles Intégrateur.", e);
        }

        // --- Fetch sensors for autocompletion ---
        try {
            const metadataResponse = await fetch(`/query/${selectedStation.id}`);
            if (metadataResponse.ok) {
                const metadataPayload = await metadataResponse.json();
                if (metadataPayload.success && metadataPayload.metadata.sensor) {
                    const sensorCompletions = metadataPayload.metadata.sensor.map(s => `data['${s}']`);
                    const newCompletions = [...sensorCompletions, 'data.d'];
                    integratorJsCompletions.push(...newCompletions.filter(c => !integratorJsCompletions.includes(c)));
                }
            }
        } catch (e) {
            console.warn("Impossible de récupérer la liste des capteurs pour l'autocomplétion.", e);
        }
        // --- End fetch sensors ---

        const response = await fetch('/api/integrator-probes');
        if (!response.ok) throw new Error('Erreur de chargement des sondes');

        const data = await response.json();
        if (data.success && data.settings) {
            currentIntegratorProbesSettings = data.settings;
            displayIntegratorProbesList(data.settings);
            showGlobalStatus('Modeles Intégrateur chargées avec succès', 'success');
        } else {
            throw new Error('Format de données invalide pour les sondes');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
        document.getElementById('integrator-probes-container').innerHTML = '';
    }
}

/**
 * Displays the list of Integrator modeles as collapsible items.
 * @param {object} settings - The probes configuration object.
 */
function displayIntegratorProbesList(settings) {
    const container = document.getElementById('integrator-probes-container');

    let listHTML = `
        <div class="probes-header">
            <h1>Modeles Intégrateur</h1>
            <button id="add-integrator-probe-btn" class="station-icon-btn" title="Ajouter une sonde intégrateur">
                <svg class="nav-icon" viewBox="0 0 512 512" fill="currentColor"><g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"><path d="M2270 4975 c-431 -55 -823 -212 -1172 -472 -126 -94 -326 -288 -431 -418 -290 -359 -476 -804 -528 -1265 -15 -133 -6 -479 16 -620 108 -696 497 -1297 1090 -1683 324 -211 687 -338 1080 -378 132 -13 452 -7 570 11 626 96 1175 411 1567 900 110 138 189 264 278 445 254 513 315 1083 179 1645 -78 317 -222 620 -428 895 -85 112 -308 342 -419 429 -362 286 -805 466 -1264 516 -130 14 -408 11 -538 -5z m652 -619 c371 -79 675 -243 930 -502 120 -121 184 -202 267 -335 288 -462 351 -1064 165 -1579 -187 -523 -613 -940 -1138 -1115 -222 -74 -414 -101 -666 -92 -262 10 -483 64 -715 176 -521 252 -880 714 -1002 1291 -25 115 -27 145 -28 360 0 210 3 247 24 350 67 325 213 620 430 867 247 282 601 489 980 573 150 33 223 39 436 35 166 -3 220 -8 317 -29z"></path><path d="M2443 3644 c-60 -22 -127 -86 -160 -152 l-28 -57 -3 -287 -3 -288 -278 0 c-317 0 -340 -4 -419 -75 -73 -66 -97 -122 -97 -225 0 -68 5 -93 23 -127 35 -66 78 -110 140 -140 l57 -28 287 -3 287 -4 3 -291 3 -292 31 -55 c36 -64 107 -123 171 -140 115 -33 253 12 324 104 60 78 62 93 66 404 l4 282 274 0 c321 0 352 6 435 90 147 146 109 384 -74 471 l-61 29 -282 0 -281 0 -4 283 c-3 279 -3 283 -29 337 -37 78 -71 114 -141 149 -52 26 -72 31 -132 30 -39 0 -90 -7 -113 -15z"></path></g></svg>
            </button>
        </div>
        <div id="integrator-probes-list" class="settings-form">
    `;

    Object.entries(settings).forEach(([probeKey, probeData]) => {
        listHTML += createIntegratorProbeItemHTML(probeKey, probeData);
    });

    listHTML += '</div>';
    container.innerHTML = listHTML;

    document.getElementById('add-integrator-probe-btn').addEventListener('click', showAddIntegratorProbeModal);

    // Initialize code editors for all textareas
    Object.keys(settings).forEach(probeKey => {
        const textareaId = `integrator-probe-${probeKey}-fnModel`;
        if (document.getElementById(textareaId)) {
            createCodeEditor(textareaId, integratorJsCompletions);
        }
    });

    container.querySelectorAll('.settings-group-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-delete-integrator-probe')) return;
            const content = header.nextElementSibling;
            content.classList.toggle('open');
            header.classList.toggle('open');
        });
    });

    container.querySelectorAll('.btn-delete-integrator-probe').forEach(button => {
        button.addEventListener('click', handleDeleteIntegratorProbe);
    });

    // Use event delegation for help buttons for better performance and simplicity
    container.addEventListener('click', function(event) {
        if (event.target.matches('.btn-show-integrator-help')) {
            showIntegratorHelpModal();
        }
    });
    container.addEventListener('submit', handleIntegratorProbesFormSubmit);
}

/**
 * Creates the HTML for a single probe item in the list.
 * @param {string} probeKey - The unique key for the probe.
 * @param {object} probeData - The data for the probe.
 * @param {boolean} [isOpen=false] - Whether the item should be open by default.
 * @returns {string} The HTML string for the probe item.
 */
function createIntegratorProbeItemHTML(probeKey, probeData, isOpen = false) {
    const fnModelValue = probeData.fnModel || '';
    const measurementSelectHTML = generateIntegratorMeasurementSelect(probeKey, probeData.measurement);
    return `
        <div class="settings-group" data-probe-key="${probeKey}">
            <div class="settings-group-header ${isOpen ? 'open' : ''}">
                <h3>
                    <span class="toggle-icon">▶</span>
                    Sonde : ${probeKey} <em class="probe-label-preview">(${probeData.label || 'N/A'})</em> 
                    <em class="probe-measurement-preview">(${probeData.measurement || 'N/A'})</em>
                </h3>
                <img src="svg/delete.svg" class="nav-icon btn-delete-integrator-probe" data-probe-key="${probeKey}" alt="Supprimer" title="Supprimer cet Intégrateur">
            </div>
            <div class="collapsible-content ${isOpen ? 'open' : ''}">
                <form data-probe-key="${probeKey}">
                    <div class="probe-fields">
                        <div class="form-row">
                            ${generateIntegratorProbeField(probeKey, 'label', probeData.label, 'text', 'Label affiché')}
                            ${measurementSelectHTML}
                        </div>
                        <div class="form-row">
                            ${generateIntegratorProbeField(probeKey, 'comment', probeData.comment, 'text', 'Commentaire')}
                        </div>
                        <div class="settings-field">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <label for="integrator-probe-${probeKey}-fnModel">Fonction du modèle</label>
                                <button type="button" class="btn-help btn-show-integrator-help">Aide</button>
                            </div>
                            <textarea id="integrator-probe-${probeKey}-fnModel" name="${probeKey}.fnModel" placeholder="Fonction du modèle" rows="30">${fnModelValue}</textarea>
                        </div>
                        <div class="form-row">
                            ${generateIntegratorProbeField(probeKey, 'scriptJS', (probeData.scriptJS || []).join(','), 'text', 'Scripts JS (séparés par une virgule)')}
                            ${generateIntegratorProbeField(probeKey, 'period', probeData.period, 'number', 'Période (secondes)')}
                        </div>
                        <input type="hidden" name="${probeKey}.sensorDb" value="${probeData.sensorDb || probeKey}">
                    </div>
                    <div class="settings-actions">
                        <button type="submit">
                            <img src="svg/access-control.svg" title="authentification requise!" class="access-control-icon">Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function generateIntegratorMeasurementSelect(probeKey, selectedMeasurement) {
    if (Object.keys(integratorUnitCategories).length === 0) {
        console.error("integratorUnitCategories is not populated. Make sure unit settings are fetched.");
        return `
            <div class="settings-field">
                <label>Type de mesure</label>
                <input type="text" value="Erreur: Impossible de charger les types" disabled>
            </div>
        `;
    }

    let optionsHTML = `<option value="">-- Non défini --</option>`;
    for (const key in integratorUnitCategories) {
        if (integratorUnitCategories[key].title) { // N'afficher que les catégories avec un titre
            optionsHTML += `<option value="${key}" ${key === selectedMeasurement ? 'selected' : ''}>${integratorUnitCategories[key].title}</option>`;
        }
    }

    return `
        <div class="settings-field">
            <label for="integrator-probe-${probeKey}-measurement">Type de mesure</label>
            <select id="integrator-probe-${probeKey}-measurement" name="${probeKey}.measurement">
                ${optionsHTML}
            </select>
        </div>
    `;
}

function generateIntegratorProbeField(probeKey, fieldKey, value, type = 'text', label = '') {
    const inputId = `integrator-probe-${probeKey}-${fieldKey}`;
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

function showAddIntegratorProbeModal() {
    const modal = document.getElementById('add-integrator-probe-modal');
    modal.classList.add('show');
    document.getElementById('new-integrator-probe-key').focus();
    document.getElementById('cancel-integrator-probe-btn').onclick = hideAddIntegratorProbeModal;
    document.getElementById('add-integrator-probe-form').onsubmit = handleAddIntegratorProbe;
    window.addEventListener('click', outsideAddIntegratorProbeModalClickHandler);
    document.addEventListener('keydown', escapeAddIntegratorProbeModalKeyHandler);
}

function hideAddIntegratorProbeModal() {
    const modal = document.getElementById('add-integrator-probe-modal');
    modal.classList.remove('show');
    document.getElementById('add-integrator-probe-form').reset();
    const errorDiv = document.getElementById('integrator-probe-key-error');
    errorDiv.style.display = 'none';
}

function handleAddIntegratorProbe(event) {
    event.preventDefault();
    const keyInput = document.getElementById('new-integrator-probe-key');
    let probeKey = keyInput.value.trim();
    const errorDiv = document.getElementById('integrator-probe-key-error');

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
    if (currentIntegratorProbesSettings[probeKey]) {
        errorDiv.textContent = 'Cette clé de sonde existe déjà.';
        errorDiv.style.display = 'block';
        return;
    }
    
    errorDiv.style.display = 'none';

    const newProbeData = {
        label: "", comment: "", fnModel: "(data, lon=%longitude%, lat=%latitude% , alt=%altitude%) => {\n  return null;\n}",
        dataNeeded: [], currentMap: {}, scriptJS: [],
        period: 604800, sensorDb: probeKey
    };
    currentIntegratorProbesSettings[probeKey] = newProbeData;

    const list = document.getElementById('integrator-probes-list');
    list.insertAdjacentHTML('beforeend', createIntegratorProbeItemHTML(probeKey, newProbeData, true));
    
    const newGroup = list.lastElementChild;
    const newHeader = newGroup.querySelector('.settings-group-header');
    newHeader.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-integrator-probe')) return;
        const content = newHeader.nextElementSibling;
        content.classList.toggle('open');
        newHeader.classList.toggle('open');
    });
    newHeader.querySelector('.btn-delete-integrator-probe').addEventListener('click', handleDeleteIntegratorProbe);

    // Initialize code editor for the new textarea
    const textareaId = `integrator-probe-${probeKey}-fnModel`;
    if (document.getElementById(textareaId)) {
        createCodeEditor(textareaId, integratorJsCompletions);
    }

    hideAddIntegratorProbeModal();
    newGroup.scrollIntoView({ behavior: 'smooth' });
}

function handleDeleteIntegratorProbe(event) {
    const probeKey = event.target.dataset.probeKey;
    if (confirm(`Êtes-vous sûr de vouloir supprimer la sonde "${probeKey}" ? Cette action est irréversible.`)) {
        delete currentIntegratorProbesSettings[probeKey];
        document.querySelector(`.settings-group[data-probe-key="${probeKey}"]`).remove();
        saveAllIntegratorProbesSettings(currentIntegratorProbesSettings);
    }
}

function parseFnModel(fnModelStr) {
    const regex = /data\['([^']+)'\]/g;
    const matches = [...fnModelStr.matchAll(regex)];
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

async function handleIntegratorProbesFormSubmit(event) {
    event.preventDefault();
    if (event.target.tagName !== 'FORM') return;

    const form = event.target;
    const probeKey = form.dataset.probeKey;
    if (!probeKey) return;

    showGlobalStatus(`Enregistrement de ${probeKey}...`, 'loading');

    try {
        const formData = new FormData(form);
        const probeData = { ...currentIntegratorProbesSettings[probeKey] };

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

        const { dataNeeded, currentMap } = parseFnModel(probeData.fnModel);
        probeData.dataNeeded = dataNeeded;
        probeData.currentMap = currentMap;
        probeData.groupUsage = "Integrator";
        
        currentIntegratorProbesSettings[probeKey] = probeData;

        await saveAllIntegratorProbesSettings(currentIntegratorProbesSettings);

        const item = document.querySelector(`.settings-group[data-probe-key="${probeKey}"]`);
        if (item) {
            item.querySelector('.probe-label-preview').textContent = `(${probeData.label || 'N/A'})`;
            item.querySelector('.probe-measurement-preview').textContent = `(${probeData.measurement || 'N/A'})`;
        }
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}

async function saveAllIntegratorProbesSettings(settings) {
    showGlobalStatus('Enregistrement des Modeles Intégrateur...', 'loading');
    try {
        const response = await fetch('/api/integrator-probes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: settings })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
        }
        const result = await response.json();
        if (result.success === true) {
            currentIntegratorProbesSettings = settings;
            showGlobalStatus('Modeles Intégrateur enregistrées avec succès !', 'success');
        } else {
            throw new Error(result.message || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
    }
}