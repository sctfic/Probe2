// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

let currentIntegratorProbesSettings = {};
let integratorUnitCategories = {};

// Enregistrement du langage JSON pour highlight.js s'il n'est pas présent
if (window.hljs && !hljs.getLanguage('json')) {
    hljs.registerLanguage('json', function(hljs) {
        return {
            name: 'JSON',
            contains: [
                {
                    className: 'attr',
                    begin: /"(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:)/,
                    relevance: 1.01
                },
                {
                    className: 'string',
                    begin: /"/, end: /"/,
                    contains: [hljs.BACKSLASH_ESCAPE],
                    relevance: 0
                },
                hljs.C_NUMBER_MODE,
                {
                    className: 'literal',
                    begin: /\b(true|false|null)\b/
                },
                {
                    className: 'punctuation',
                    match: /[{}[\],:]/,
                    relevance: 0
                }
            ]
        };
    });
}

const PERIOD_OPTIONS = [
    { label: '5 minutes', value: 300 },
    { label: '30 minutes', value: 1800 },
    { label: '1 heure', value: 3600 },
    { label: '6 heures', value: 21600 },
    { label: '12 heures', value: 43200 },
    { label: '1 jour', value: 86400 },
    { label: '1 semaine', value: 604800 },
    { label: '2 semaines', value: 1209600 },
    { label: '1 mois', value: 2592000 }
];

let integratorJsCompletions = [
    'function () {\\n|\\n}', '(x)=>{|}', 'const  = ;', 'let  = ;', 'var  = ;',
    'if (|) {}', 'else if (|) {}', 'else {|}', 'for (i = 0; i < 10; i++) {|}', 'while (i < 10) {|}', 'do {|}', 'switch (i) {\\ncase 1: break;\\ndefault: \\n}', 'case :', 'break;', 'continue;', 'return;',
    'return', 'try {|}\\ncatch {}\\nfinally {}', 'try {|}', 'catch {|}', 'finally {|}', 'throw', 'class', 'extends', 'import', 'export', 'default', 'async', 'await',
    'console.log();', 'console.error();', 'console.warn();', 'console.info();', 'console.table();',
    'document.getElementById();', 'document.querySelector();', 'document.querySelectorAll();', 'document.createElement();',
    'addEventListener();', 'removeEventListener();', 'preventDefault();', 'stopPropagation();',
    'setTimeout();', 'setInterval();', 'clearTimeout();', 'clearInterval();',
    'JSON.stringify();', 'JSON.parse();', 'Object.keys();', 'Object.values();', 'Object.entries();', 'Array.isArray();',
    'fetch();', 'Promise();', 'try {}\\ncatch {}\\nfinally {}', 'resolve () {}', 'reject () {}',
    'alert();', 'prompt();', 'confirm();',
    'localStorage();', 'sessionStorage();', 'getItem();', 'setItem();', 'removeItem();',
    'Math.random();', 'Math.floor();', 'Math.ceil();', 'Math.round();', 'Math.max();', 'Math.min();',
    'Stats.nextPeak(data,field)', 'Stats.nextTrough(data,field)', 'Stats.nextEpisode(data,field)', 'Stats.ExtremeEpisodeDetector(data,field)',
    'Stats.current(data, "measurement:sensor")', 'Stats.mean(data, "measurement:sensor", scope)', 'Stats.min(data, "measurement:sensor", scope)', 'Stats.max(data, "measurement:sensor", scope)',
    'Stats.sum(data, "measurement:sensor", scope)', 'Stats.first(data, "measurement:sensor", scope)', 'Stats.last(data, "measurement:sensor", scope)',
    'Stats.trend(data, "measurement:sensor", scope)', 'Stats.movingAverage(data, "measurement:sensor", window, scope)',
    'Stats.linearSlope(data, "measurement:sensor", scope)', 'Stats.cagr(data, "measurement:sensor", scope)', 'Stats.mannKendall(data, "measurement:sensor", scope)',
    'Stats.split(data)',
    "'past'", "'future'", "'all'"
];

const INTEGRATOR_HELP_CONTENT_HTML = `
<div style="font-size: 0.85em; line-height: 1.3;">
    <p>La fonction reçoit l'ensemble du dataset en une seule fois et doit retourner une valeur numérique ou un objet structuré.</p>
    
    <h4>Formats de retour supportés</h4>
    <ul>
        <li><strong>Numérique</strong> : Retourne un simple nombre (arrondi à 1 décimale).</li>
        <li><strong>Vecteur</strong> : Si type <code>vector</code>, objet <code>{ Ux, Vy, Value? }</code>.</li>
        <li><strong>Multi-mesures</strong> : Si type <code>None</code>, objet avec clés <code>Meas:sensor</code>.</li>
    </ul>

    <h4>Détails des paramètres Stats</h4>
    <ul>
        <li><code>field</code> : Chaîne identifiant le capteur (ex: <code>'temperature:outTemp'</code>).</li>
        <li><code>window</code> : Nombre de points pour la moyenne mobile (défaut: 5).</li>
        <li><code>scope</code> : <code>'past'</code> (passé), <code>'future'</code> (prévisions), <code>'all'</code> (total).</li>
    </ul>

    <h4>Outils statistiques (Stats)</h4>
    <ul>
        <li><code>Stats.current(data, field)</code> : Valeur au point "now".</li>
        <li><code>Stats.mean(data, field, scope)</code>, <code>Stats.min()</code>, <code>Stats.max()</code>, <code>Stats.sum()</code></li>
        <li><code>Stats.first(data, field, scope)</code>, <code>Stats.last(data, field, scope)</code></li>
        <li><code>Stats.trend(data, field, scope)</code> : Différence last - first sur le scope.</li>
        <li><code>Stats.movingAverage(data, field, window, scope)</code> : Moyenne mobile.</li>
        <li><code>Stats.linearSlope(data, field, scope)</code> : Pente de régression linéaire.</li>
        <li><code>Stats.cagr(data, field, scope)</code> : Taux de croissance composé annuel.</li>
        <li><code>Stats.mannKendall(data, field, scope)</code> : Test de tendance monotone.</li>
        <li><code>Stats.split(data)</code> : Retourne <code>{ past: [], future: [] }</code>.</li>
        <li><code>Stats.ExtremeEpisodeDetector(data, field)</code> : Détecteur d'épisodes météo favorables (cherche simultanément les pics et les creux).</li>
        <li><code>Stats.nextPeak(data, field)</code> : Prochain pic favorable (valeurs hautes) à venir (dont le temps de fin n'est pas dépassé).</li>
        <li><code>Stats.nextTrough(data, field)</code> : Prochain creux favorable (valeurs basses) à venir (dont le temps de fin n'est pas dépassé).</li>
        <li><code>Stats.nextEpisode(data, field)</code> : Prochain épisode favorable (pic ou creux) à venir (dont le temps de fin n'est pas dépassé).</li>
    </ul>

    <h4>Exemple</h4>
    <pre style="margin: 5px 0;"><code>// Moyenne passée
Stats.mean(data, 'temperature:outTemp', 'past')</code></pre>

    <h4>Raccourcis</h4>
    <p style="margin: 0;"><code>Ctrl+S</code>: Enregistrer, <code>Tab</code>: Auto-complétion, <code>Ctrl+/</code>: Commenter, <code>Esc</code>: Fermer.</p>
</div>
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
            const unitsData = await queryManager.query('/api/settings');
            if (unitsData.success) {
                integratorUnitCategories = unitsData.settings;
            }
        } catch (e) {
            console.warn("Impossible de charger les catégories d'unités pour les Modeles Intégrateur.", e);
        }

        // --- Fetch sensors for autocompletion ---
        if (selectedStation) {
            try {
                const metadataPayload = await queryManager.query(`/query/${selectedStation.id}`);
                if (metadataPayload.success && metadataPayload.metadata.sensor) {
                    window.integratorAvailableSensors = metadataPayload.metadata.sensor;
                    const sensorCompletions = metadataPayload.metadata.sensor.map(s => `'${s}'`);
                    const newCompletions = [...sensorCompletions, 'data.d'];
                    integratorJsCompletions.push(...newCompletions.filter(c => !integratorJsCompletions.includes(c)));
                }
            } catch (e) {
                console.warn("Impossible de récupérer la liste des capteurs pour l'autocomplétion.", e);
            }
        }
        // --- End fetch sensors ---

        const data = await queryManager.query('/api/integrator-probes');
        if (data.success && data.settings) {
            currentIntegratorProbesSettings = data.settings;
            displayIntegratorProbesList(data.settings);
            showGlobalStatus('Modeles Intégrateur chargés avec succès', 'success');
        } else {
            throw new Error('Format de données invalide pour les Modeles Intégrateur');
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

    // Use event delegation for help and run buttons for better performance and simplicity
    container.addEventListener('click', function (event) {
        if (event.target.matches('.btn-show-integrator-help')) {
            showIntegratorHelpModal();
        }
        if (event.target.matches('.btn-run-integrator')) {
            handleRunIntegrator(event);
        }
        if (event.target.matches('.integrator-tab-btn')) {
            const btn = event.target;
            const probeKey = btn.dataset.probeKey;
            const tab = btn.dataset.tab;
            
            const tabContainer = btn.closest('.settings-field');
            tabContainer.querySelectorAll('.integrator-tab-btn').forEach(b => {
                b.classList.toggle('active', b === btn);
                if (b === btn) {
                    b.style.background = '#222';
                    b.style.color = '#ccc';
                } else {
                    b.style.background = '#111';
                    b.style.color = '#888';
                }
            });

            const outputEl = document.getElementById(`integrator-probe-${probeKey}-output`);
            const logsEl = document.getElementById(`integrator-probe-${probeKey}-logs`);
            
            if (tab === 'result') {
                outputEl.style.display = 'block';
                logsEl.style.display = 'none';
            } else {
                outputEl.style.display = 'none';
                logsEl.style.display = 'block';
            }
        }
    });
    container.addEventListener('submit', handleIntegratorProbesFormSubmit);
}

/**
 * Generates a period select dropdown (contextPeriod or drawingPeriod).
 */
function generatePeriodSelect(probeKey, fieldKey, selectedValue, label) {
    const inputId = `integrator-probe-${probeKey}-${fieldKey}`;
    const numValue = Number(selectedValue);
    let optionsHTML = '';
    PERIOD_OPTIONS.forEach(opt => {
        optionsHTML += `<option value="${opt.value}" ${opt.value === numValue ? 'selected' : ''}>${opt.label}</option>`;
    });
    return `
        <div class="settings-field">
            <label for="${inputId}">${label}</label>
            <select id="${inputId}" name="${probeKey}.${fieldKey}">
                ${optionsHTML}
            </select>
        </div>
    `;
}

/**
 * Creates the HTML for a single probe item in the list.
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
                    <em class="probe-measurement-preview">(${probeData.measurement || 'None'})</em>
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
                        <div class="settings-field-container" style="display: flex; gap: 15px; flex-wrap: wrap;">
                            <div class="settings-field" style="flex: 1; min-width: 300px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                    <label for="integrator-probe-${probeKey}-fnModel">Fonction du modèle</label>
                                    <button type="button" class="btn-help btn-show-integrator-help">Aide</button>
                                </div>
                                <textarea id="integrator-probe-${probeKey}-fnModel" name="${probeKey}.fnModel" placeholder="Fonction du modèle" rows="30">${fnModelValue}</textarea>
                            </div>
                            <div class="settings-field" style="flex: 1; min-width: 300px; display: flex; flex-direction: column;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                    <div class="integrator-tabs" style="display: flex; gap: 5px;">
                                        <button type="button" class="integrator-tab-btn active" data-tab="result" data-probe-key="${probeKey}" style="padding: 4px 12px; font-size: 0.85em; cursor: pointer; border: 1px solid #444; background: #222; color: #ccc; border-bottom: none; border-top-left-radius: 4px; border-top-right-radius: 4px;">Résultats</button>
                                        <button type="button" class="integrator-tab-btn" data-tab="logs" data-probe-key="${probeKey}" style="padding: 4px 12px; font-size: 0.85em; cursor: pointer; border: 1px solid #444; background: #111; color: #888; border-bottom: none; border-top-left-radius: 4px; border-top-right-radius: 4px;">Logs</button>
                                    </div>
                                    <button type="button" class="btn-primary btn-run-integrator" data-probe-key="${probeKey}" style="height: 35px;width: 70px;padding: 4px 12px; font-size: 0.85em; cursor: pointer;">▶ Run</button>
                                </div>
                                <div class="integrator-tab-contents" style="position: relative; flex: 1; min-height: 460px;">
                                    <pre id="integrator-probe-${probeKey}-output" class="hljs" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #23241f; color: #f8f8f2; border-radius: 4px; overflow: auto; margin: 0; font-family: monospace; font-size: 0.85em; border: 1px solid #333; white-space: pre-wrap; word-break: break-all; padding: 10px; box-sizing: border-box;"></pre>
                                    <pre id="integrator-probe-${probeKey}-logs" class="hljs" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #23241f; color: #f8f8f2; border-radius: 4px; overflow: auto; margin: 0; font-family: monospace; font-size: 0.85em; border: 1px solid #333; white-space: pre-wrap; word-break: break-all; padding: 10px; box-sizing: border-box; display: none;"></pre>
                                </div>
                            </div>
                        </div>
                        <div class="form-row">
                            ${generateIntegratorProbeField(probeKey, 'scriptJS', (probeData.scriptJS || []).join(','), 'text', 'Scripts JS (séparés par une virgule)')}
                        </div>
                        <div class="form-row">
                            ${generatePeriodSelect(probeKey, 'contextPeriod', probeData.contextPeriod || 86400, 'Période de contexte de calcul')}
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
        return `
            <div class="settings-field">
                <label>Type de mesure</label>
                <input type="text" value="Erreur: Impossible de charger les types" disabled>
            </div>
        `;
    }

    let optionsHTML = `<option value="None" ${(!selectedMeasurement || selectedMeasurement === 'None') ? 'selected' : ''}>None</option>`;
    for (const key in integratorUnitCategories) {
        if (integratorUnitCategories[key].title) {
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

async function showAddIntegratorProbeModal() {
    if (typeof checkAuthStatus === 'function') {
        await checkAuthStatus();
    }
    if (!isAuthenticated) {
        showLoginModal();
        return;
    }
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
    // Valider les caractères et ajouter "_trend" si manquant.
    const baseKey = probeKey.endsWith('_trend') ? probeKey.slice(0, -6) : probeKey;
    if (!/^[a-zA-Z0-9_]+$/.test(baseKey) || !baseKey) {
        errorDiv.textContent = 'La clé doit être alphanumérique et peut contenir des underscores.';
        errorDiv.style.display = 'block';
        return;
    }
    probeKey = baseKey + '_trend';
    if (currentIntegratorProbesSettings[probeKey]) {
        errorDiv.textContent = 'Cette clé de sonde existe déjà.';
        errorDiv.style.display = 'block';
        return;
    }

    errorDiv.style.display = 'none';

    const newProbeData = {
        label: "", comment: "", fnModel: "(data, lon=%longitude%, lat=%latitude% , alt=%altitude%) => {\n  return null;\n}",
        dataNeeded: [], currentMap: {}, scriptJS: [],
        contextPeriod: 86400, drawingPeriod: 604800,
        measurement: "None",
        sensorDb: `None:${probeKey}`
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

async function handleDeleteIntegratorProbe(event) {
    if (typeof checkAuthStatus === 'function') {
        await checkAuthStatus();
    }
    if (!isAuthenticated) {
        showLoginModal();
        return;
    }
    const probeKey = event.target.dataset.probeKey;
    if (confirm(`Êtes-vous sûr de vouloir supprimer la sonde "${probeKey}" ? Cette action est irréversible.`)) {
        delete currentIntegratorProbesSettings[probeKey];
        document.querySelector(`.settings-group[data-probe-key="${probeKey}"]`).remove();
        saveAllIntegratorProbesSettings(currentIntegratorProbesSettings);
    }
}

function parseFnModel(fnModelStr) {
    // commance par ' contient alphaNumerique _  puis : puis alphaNumerique _  et se termine par '
    const regex = /(\'([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+)\'|\"([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+)\"|\`([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+)\`)/g;

    const matches = [...fnModelStr.matchAll(regex)];
    const dataNeededRaw = [...new Set(matches.map(m => m[1].slice(1, -1)))]; //on retire le 1er et dernier caractere des strings

    // les dataNeeded doivent etre exister dans metadataPayload.metadata.sensor
    let dataNeeded = dataNeededRaw;
    if (window.integratorAvailableSensors) {
        dataNeeded = dataNeededRaw.filter(s => window.integratorAvailableSensors.includes(s));
    }

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
    await submitIntegratorForm(event.target);
}

async function submitIntegratorForm(form) {
    const probeKey = form.dataset.probeKey;
    if (!probeKey) return false;

    showGlobalStatus(`Enregistrement de ${probeKey}...`, 'loading');

    try {
        const formData = new FormData(form);
        const probeData = { ...currentIntegratorProbesSettings[probeKey] };
        for (const [key, value] of formData.entries()) {
            const [probeKey, fieldKey] = key.split('.');
            if (fieldKey === 'scriptJS') {
                probeData[fieldKey] = value.split(',').map(s => s.trim()).filter(s => s);
            } else if (fieldKey === 'contextPeriod' || fieldKey === 'drawingPeriod') {
                probeData[fieldKey] = Number(value);
            } else {
                probeData[fieldKey] = value;
            }
        }

        // Set measurement default if empty
        if (!probeData.measurement) {
            probeData.measurement = 'None';
        }

        const { dataNeeded, currentMap } = parseFnModel(probeData.fnModel);
        probeData.dataNeeded = dataNeeded;
        probeData.currentMap = currentMap;
        // Force sensorDb format: measurement:probeKey
        probeData.sensorDb = `${probeData.measurement}:${probeKey}`;
        probeData.groupCustom = "IntegratorNew";
        probeData.groupUsage = "Composites";
        console.log('probeData', probeData);
        currentIntegratorProbesSettings[probeKey] = probeData;

        await saveAllIntegratorProbesSettings(currentIntegratorProbesSettings);

        const item = document.querySelector(`.settings-group[data-probe-key="${probeKey}"]`);
        if (item) {
            item.querySelector('.probe-label-preview').textContent = `(${probeData.label || 'N/A'})`;
            item.querySelector('.probe-measurement-preview').textContent = `(${probeData.measurement || 'None'})`;
        }
        return true;
    } catch (error) {
        console.error('Erreur:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
        return false;
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
        throw error;
    }
}

async function handleRunIntegrator(event) {
    const button = event.target;
    const probeKey = button.dataset.probeKey;
    if (!probeKey || !selectedStation) return;

    const form = button.closest('form');
    if (!form) return;

    const outputEl = document.getElementById(`integrator-probe-${probeKey}-output`);
    const logsEl = document.getElementById(`integrator-probe-${probeKey}-logs`);
    if (!outputEl) return;

    // Bloquer le bouton Run
    button.disabled = true;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<div class="spinner" style="display: inline-block; margin-right: 8px; vertical-align: middle; width: 10px; height: 10px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite;"></div>Saving...';

    outputEl.textContent = "Sauvegarde du modèle en cours...";
    if (logsEl) logsEl.textContent = "Sauvegarde du modèle en cours...";

    // Simuler le clic pour le flash couleur sur le bouton Enregistrer
    const submitBtn = form.querySelector('.settings-actions button[type="submit"]');
    if (submitBtn) {
        window.lastClickedButton = submitBtn;
    }

    const saveSuccess = await submitIntegratorForm(form);
    if (!saveSuccess) {
        outputEl.textContent = "Erreur lors de la sauvegarde automatique. Calcul annulé.";
        if (logsEl) logsEl.textContent = "Erreur lors de la sauvegarde automatique. Calcul annulé.";
        button.disabled = false;
        button.innerHTML = originalHTML;
        return;
    }

    outputEl.textContent = "Sauvegarde réussie. Calcul du modèle en cours...";
    if (logsEl) logsEl.textContent = "Sauvegarde réussie. Calcul du modèle en cours...";
    button.innerHTML = '<div class="spinner" style="display: inline-block; margin-right: 8px; vertical-align: middle; width: 10px; height: 10px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite;"></div>Running...';

    try {
        const response = await fetch(`/api/station/${selectedStation.id}/integrator/build/${probeKey}`);
        const result = await response.json();
        
        let logs = [];
        let cleanResult = { ...result };
        
        if (result && Array.isArray(result.results)) {
            const probeResult = result.results.find(r => r.probe === probeKey);
            if (probeResult && Array.isArray(probeResult.logs)) {
                logs = probeResult.logs;
            }
            cleanResult.results = result.results.map(r => {
                const { logs, ...rest } = r;
                return rest;
            });
        }

        // Affichage des résultats
        if (cleanResult && typeof cleanResult === 'object') {
            const jsonString = JSON.stringify(cleanResult, null, 2);
            try {
                outputEl.innerHTML = hljs.highlight(jsonString, { language: 'json' }).value;
            } catch (e) {
                try {
                    outputEl.innerHTML = hljs.highlightAuto(jsonString).value;
                } catch (err) {
                    outputEl.textContent = jsonString;
                }
            }
        } else {
            outputEl.textContent = String(cleanResult);
        }

        // Affichage des logs
        if (logsEl) {
            if (logs.length === 0) {
                logsEl.innerHTML = '<span style="color: #888; font-style: italic;">Aucun log généré pour ce modèle.</span>';
            } else {
                let logsHTML = '';
                logs.forEach(log => {
                    const date = new Date(log.timestamp);
                    const timeStr = !isNaN(date.getTime()) 
                        ? date.toTimeString().split(' ')[0] + '.' + String(date.getMilliseconds()).padStart(3, '0')
                        : '00:00:00.000';
                    
                    const levelStr = String(log.level).toUpperCase();
                    
                    let levelColor = '#888';
                    let textColor = '#f8f8f2';
                    if (log.level === 'error') {
                        levelColor = '#ff5555';
                        textColor = '#ff5555';
                    } else if (log.level === 'warn') {
                        levelColor = '#ffb86c';
                        textColor = '#ffb86c';
                    } else if (log.level === 'log') {
                        levelColor = '#50fa7b';
                        textColor = '#f8f8f2';
                    }
                    
                    const formattedArgs = log.args.map(arg => {
                        if (arg !== null && typeof arg === 'object') {
                            return JSON.stringify(arg, null, 2);
                        }
                        return String(arg);
                    }).join(' ');

                    logsHTML += `<div style="margin-bottom: 8px; line-height: 1.4; border-left: 3px solid ${levelColor}; padding-left: 8px;">` +
                                `<span style="color: #888;">[${timeStr}]</span> ` +
                                `<span style="color: ${levelColor}; font-weight: bold;">[${levelStr}]</span> ` +
                                `<span style="color: ${textColor}; white-space: pre-wrap;">${formattedArgs}</span>` +
                                `</div>`;
                });
                logsEl.innerHTML = logsHTML;
            }
        }
    } catch (error) {
        console.error("Erreur lors de l'exécution du modèle:", error);
        outputEl.textContent = `Erreur: ${error.message}`;
        if (logsEl) logsEl.textContent = `Erreur: ${error.message}`;
    } finally {
        button.disabled = false;
        button.innerHTML = originalHTML;
    }
}