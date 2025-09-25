let currentProbesSettings = {};
let unitCategories = {};

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
        // --- Fetch units settings first for the measurement dropdown ---
        try {
            const unitsResponse = await fetch('/api/settings');
            if (unitsResponse.ok) {
                const unitsData = await unitsResponse.json();
                if (unitsData.success) {
                    unitCategories = unitsData.settings;
                }
            }
        } catch (e) {
            console.warn("Impossible de charger les catégories d'unités pour les sondes composites.", e);
        }

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
            <h1>Sondes Composite</h1>
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

    container.querySelectorAll('.settings-group-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-delete-probe')) return;
            const content = header.nextElementSibling;
            content.classList.toggle('open');
            header.classList.toggle('open');
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
    const measurementSelectHTML = generateMeasurementSelect(probeKey, probeData.measurement);
    return `
        <div class="settings-group" data-probe-key="${probeKey}">
            <div class="settings-group-header ${isOpen ? 'open' : ''}">
                <h3>
                    <span class="toggle-icon">▶</span>
                    Sonde : ${probeKey} <em class="probe-label-preview">(${probeData.label || 'N/A'})</em> 
                    <em class="probe-measurement-preview">(${probeData.measurement || 'N/A'})</em>
                </h3>
                <button type="button" class="btn-delete-probe" data-probe-key="${probeKey}" title="Supprimer ce Composite">×</button>
            </div>
            <div class="collapsible-content ${isOpen ? 'open' : ''}">
                <form data-probe-key="${probeKey}">
                    <div class="probe-fields">
                        <div class="form-row">
                            ${generateProbeField(probeKey, 'label', probeData.label, 'text', 'Label affiché')}
                            ${measurementSelectHTML}
                        </div>
                        <div class="form-row">
                            ${generateProbeField(probeKey, 'comment', probeData.comment, 'text', 'Commentaire')}
                        </div>
                        <div class="settings-field">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <label for="probe-${probeKey}-fnCalc">Fonction de calcul</label>
                                <button type="button" class="btn-help btn-show-help">Aide</button>
                            </div>
                            <textarea id="probe-${probeKey}-fnCalc" name="${probeKey}.fnCalc" placeholder="Fonction de calcul" rows="30">${fnCalcValue}</textarea>
                        </div>
                        <div class="form-row">
                            ${generateProbeField(probeKey, 'scriptJS', (probeData.scriptJS || []).join(','), 'text', 'Scripts JS (séparés par une virgule)')}
                            ${generateProbeField(probeKey, 'period', probeData.period, 'number', 'Période (secondes)')}
                        </div>
                        <input type="hidden" name="${probeKey}.sensorDb" value="${probeData.sensorDb || probeKey}">
                    </div>
                    <div class="settings-actions">
                        <button type="submit">
                            <svg class="access-control-icon" viewBox="0 0 512 512" fill="currentColor" style="display: none;"><g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"><path d="M1519 4824 c-367 -66 -665 -341 -770 -709 -22 -76 -23 -101 -27 -461 l-3 -380 -69 -12 c-38 -6 -95 -24 -127 -39 -81 -38 -175 -133 -216 -220 l-32 -68 -3 -960 c-3 -1074 -6 -1029 68 -1143 66 -103 178 -179 299 -202 34 -6 414 -10 1048 -10 l995 0 50 -40 c56 -44 115 -65 159 -55 16 4 59 22 95 41 133 69 224 29 268 -117 23 -77 44 -107 94 -136 46 -27 50 -28 207 -28 148 0 164 2 208 24 55 27 80 60 103 141 42 146 136 185 271 114 80 -43 146 -49 203 -19 48 24 231 211 253 257 27 57 22 112 -17 187 -33 63 -39 92 -37 155 2 48 64 100 151 126 85 25 132 66 150 128 13 49 13 297 -1 347 -17 60 -74 111 -148 131 -79 22 -139 73 -151 127 -10 46 1 91 41 166 35 65 38 125 9 182 -27 51 -204 229 -252 252 -57 27 -119 22 -191 -15 -51 -27 -73 -33 -124 -33 -57 0 -65 3 -98 35 -26 25 -42 54 -57 104 -26 85 -72 141 -132 158 -22 6 -102 12 -176 12 -74 0 -154 -6 -176 -12 -53 -15 -109 -76 -124 -134 -6 -24 -16 -55 -21 -69 -13 -33 -66 -84 -96 -94 l-23 -6 0 150 c0 82 -5 174 -11 203 -38 181 -189 327 -373 359 l-66 11 0 287 c0 157 -5 333 -10 391 -15 155 -56 284 -130 409 -208 349 -616 537 -1011 465z m339 -140 c314 -64 557 -295 645 -613 19 -69 21 -109 25 -438 l4 -363 -166 0 -166 0 0 319 c0 175 -5 343 -10 372 -14 75 -69 185 -121 243 -56 64 -146 121 -227 146 -80 25 -215 27 -293 4 -181 -53 -329 -219 -358 -404 -6 -36 -11 -203 -11 -372 l0 -308 -160 0 -160 0 -2 298 c-3 377 -2 410 23 505 79 309 353 565 660 616 88 14 234 12 317 -5z m2 -492 c87 -43 146 -108 179 -196 20 -54 21 -76 21 -391 l0 -335 -370 0 -371 0 3 343 3 342 28 61 c91 197 312 274 507 176z m910 -1079 c65 -21 142 -89 178 -157 25 -48 27 -61 30 -208 2 -87 0 -158 -5 -158 -4 1 -19 7 -33 15 -34 19 -114 19 -156 -1 -45 -22 -205 -179 -244 -240 -42 -67 -41 -117 6 -208 43 -82 49 -143 19 -194 -20 -32 -77 -66 -167 -97 -55 -19 -102 -68 -117 -122 -14 -49 -14 -287 0 -336 17 -64 67 -109 149 -135 85 -28 136 -69 150 -123 13 -47 6 -76 -36 -160 -40 -77 -44 -137 -14 -187 11 -18 20 -35 20 -37 0 -3 -431 -4 -957 -3 l-958 3 -57 28 c-63 31 -114 84 -150 156 l-23 46 -3 929 c-3 1038 -6 992 67 1084 44 55 91 88 154 108 33 10 253 13 1068 13 936 1 1031 0 1079 -16z m943 -404 c8 -7 21 -39 30 -70 62 -205 248 -282 444 -183 55 28 75 33 90 26 22 -12 182 -172 195 -196 8 -13 1 -35 -27 -90 -99 -195 -20 -384 185 -442 85 -25 85 -25 85 -179 0 -154 0 -153 -85 -180 -134 -42 -216 -134 -227 -255 -6 -67 16 -156 53 -213 17 -25 23 -45 18 -59 -9 -28 -189 -208 -208 -208 -9 0 -42 14 -74 30 -78 40 -151 53 -219 41 -68 -13 -99 -30 -149 -83 -48 -50 -66 -81 -88 -160 -20 -68 -20 -68 -182 -68 -143 0 -152 4 -177 91 -35 117 -117 197 -222 219 -77 16 -181 -6 -248 -52 -41 -29 -67 -18 -155 70 -121 119 -119 114 -75 201 50 101 57 194 21 272 -42 89 -118 149 -225 178 -64 17 -68 26 -68 177 0 153 0 153 85 178 207 59 283 237 187 440 l-37 78 19 26 c20 27 151 157 184 181 15 12 27 9 90 -23 202 -102 374 -27 451 196 26 76 31 78 199 74 87 -1 121 -6 130 -17z"></path><path d="M1568 2601 c-157 -52 -263 -174 -290 -333 -19 -119 20 -253 100 -340 l41 -44 3 -209 3 -210 29 -53 c87 -156 285 -190 419 -72 78 69 90 112 95 344 l4 198 49 64 c105 139 118 325 32 472 -37 63 -137 148 -202 173 -80 30 -208 35 -283 10z m252 -146 c97 -50 154 -144 154 -255 0 -81 -25 -137 -94 -208 l-50 -51 0 -211 c0 -233 -6 -261 -58 -299 -37 -26 -111 -28 -152 -5 -56 34 -60 52 -60 284 0 116 -4 219 -9 228 -5 9 -32 40 -60 69 -150 155 -81 412 127 469 61 17 144 9 202 -21z"></path><path d="M3470 2284 c-204 -40 -353 -126 -469 -271 -187 -236 -202 -574 -36 -828 197 -301 594 -407 918 -244 183 93 316 263 368 469 27 108 23 267 -11 375 -71 229 -257 409 -490 475 -73 20 -229 34 -280 24z m271 -161 c264 -91 432 -362 391 -630 -12 -75 -80 -243 -99 -243 -4 0 -24 28 -43 61 -63 110 -195 206 -310 224 -25 4 -54 11 -65 16 -18 7 -18 8 5 8 62 2 153 76 194 159 62 122 -1 295 -131 358 -172 85 -373 -23 -399 -213 -8 -63 14 -144 56 -201 32 -45 121 -102 159 -102 39 0 19 -9 -45 -21 -135 -25 -278 -129 -336 -246 -29 -59 -30 -58 -71 22 -62 124 -79 288 -43 410 59 200 224 362 419 411 74 19 246 12 318 -13z m-106 -173 c59 -37 84 -130 49 -189 -57 -96 -202 -93 -249 6 -61 127 81 257 200 183z m97 -573 c72 -35 140 -110 168 -184 11 -31 19 -61 17 -67 -7 -18 -128 -85 -187 -104 -39 -12 -89 -17 -170 -17 -81 0 -131 5 -170 17 -59 19 -180 86 -187 104 -8 21 37 121 74 163 77 91 155 122 298 118 86 -2 108 -6 157 -30z"></path></g></svg>Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function generateMeasurementSelect(probeKey, selectedMeasurement) {
    if (Object.keys(unitCategories).length === 0) {
        console.error("unitCategories is not populated. Make sure unit settings are fetched.");
        return `
            <div class="settings-field">
                <label>Type de mesure</label>
                <input type="text" value="Erreur: Impossible de charger les types" disabled>
            </div>
        `;
    }

    let optionsHTML = `<option value="">-- Non défini --</option>`;
    for (const key in unitCategories) {
        if (unitCategories[key].title) { // N'afficher que les catégories avec un titre
            optionsHTML += `<option value="${key}" ${key === selectedMeasurement ? 'selected' : ''}>${unitCategories[key].title}</option>`;
        }
    }

    return `
        <div class="settings-field">
            <label for="probe-${probeKey}-measurement">Type de mesure</label>
            <select id="probe-${probeKey}-measurement" name="${probeKey}.measurement">
                ${optionsHTML}
            </select>
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
    
    const newGroup = list.lastElementChild;
    const newHeader = newGroup.querySelector('.settings-group-header');
    newHeader.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-probe')) return;
        const content = newHeader.nextElementSibling;
        content.classList.toggle('open');
        newHeader.classList.toggle('open');
    });
    newHeader.querySelector('.btn-delete-probe').addEventListener('click', handleDeleteProbe);

    // Initialize code editor for the new textarea
    const textareaId = `probe-${probeKey}-fnCalc`;
    if (document.getElementById(textareaId)) {
        createCodeEditor(textareaId, jsCompletions);
    }

    hideAddProbeModal();
    newGroup.scrollIntoView({ behavior: 'smooth' });
}

function handleDeleteProbe(event) {
    const probeKey = event.target.dataset.probeKey;
    if (confirm(`Êtes-vous sûr de vouloir supprimer la sonde "${probeKey}" ? Cette action est irréversible.`)) {
        delete currentProbesSettings[probeKey];
        document.querySelector(`.settings-group[data-probe-key="${probeKey}"]`).remove();
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