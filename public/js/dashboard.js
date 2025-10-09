// Variables for dashboard section
const API_BASE_URL = '/query';
const STORAGE_KEY_STATE = 'dashboardTileState';


let currentConditionsData = null;
let allConditions = []; // Stores all conditions without filter
let dbSensorList = null;
let previousValues = {};
let selectedTiles = new Set();

function saveTileState() {
    if (!selectedStation) return;
    const state = Object.fromEntries(
        allConditions.map(item => [item.key, { order: item.order, hidden: !!item.hidden }])
    );
    // console.log(`Saving tile state for station ${selectedStation.id}:`, state);
    localStorage.setItem(`${STORAGE_KEY_STATE}_${selectedStation.id}`, JSON.stringify(state));
}

function loadTileState() {
    if (!selectedStation) return {};
    const state = JSON.parse(localStorage.getItem(`${STORAGE_KEY_STATE}_${selectedStation.id}`) || '{}');
    // console.log(`Loaded tile state for station ${selectedStation.id}:`, state);
    return state;
}

// --- Dashboard Section: Current Conditions ---

function mergeData(data) {
    if (data.data['SUN_V_calc']) { // remplace 2 tuiles par une seule
        if (data.data.sunrise && data.data.sunset) {
            const sunrise = data.data.sunrise;
            const fn1 = eval(sunrise.toUserUnit);
            const sunset = data.data.sunset;
            const fn2 = eval(sunset.toUserUnit);

            // 1. Parse times into Date objects (assuming UTC from 'Z')
            const sunriseDate = new Date(`1970-01-01T${sunrise.Value}`);
            const sunsetDate = new Date(`1970-01-01T${sunset.Value}`);

            // 2. Calculate the difference (daylight duration)
            const diffMs = sunsetDate.getTime() - sunriseDate.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const dayDuration = `${diffHours}h${diffMinutes.toString().padStart(2, '0')}m`;

            // 3. Calculate the average time (solar noon)
            const solarNoonMs = sunriseDate.getTime() + diffMs / 2;
            const solarNoonDate = new Date(solarNoonMs);
            // We use getUTCHours and getUTCMinutes because the original times were UTC.
            const solarNoonTime = `${solarNoonDate.getUTCHours().toString().padStart(2, '0')}:${solarNoonDate.getUTCMinutes().toString().padStart(2, '0')}`;

            // Update the tile: main value is day duration, 'more' field shows details.
            data.data['SUN_V_calc'].more = `▲ ${fn1(sunrise.Value)} ☀️ ${solarNoonTime} ▼ ${fn2(sunset.Value)} [${dayDuration}]`;

            delete data.data.sunrise;
            delete data.data.sunset;
        }
    }
    if (data.data['stormRain']) {
        if (data.data.dateStormRain){
            data.data.stormRain.more = data.data.dateStormRain?.Value.split('T')[0];
            delete data.data.dateStormRain;
        } else {
            delete data.data.stormRain;
        }
    }
    return data;
}

async function fetchCurrentConditions() {
    if (!selectedStation) {
        showGlobalStatus('Aucune station sélectionnée', 'error');
        return;
    }

    showGlobalStatus('Chargement des données météo...', 'loading');

    try {
        // Fetch current conditions, which now includes composite probes from the server.
        const response = await fetch(`/api/station/${selectedStation.id}/current-conditions`, { cache: 'no-cache' });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erreur de chargement des données actuelles (status: ${response.status}). ${errorText}`);
        }

        const data = await response.json();

        if (data.data) {
            // The server now provides all data, including calculated ones.
            // The mergeData function is still used for UI-specific formatting.
            mergeData(data);
            currentConditionsData = data.data;
            processAndDisplayConditions();
            showGlobalStatus(data.message || 'Données actualisées avec succès', data.success ? 'success' : 'warning');
        } else {
            throw new Error(data.error || 'Format de données invalide');
        }

    } catch (error) {
        console.error('Erreur irrécupérable lors de la récupération des données:', error);
        showGlobalStatus(`Erreur: ${error.message}`, 'error');
        const conditionsContainer = document.getElementById('conditions-container');
        if (conditionsContainer) conditionsContainer.innerHTML = '';
    }
}

function processAndDisplayConditions() {
    if (!currentConditionsData) return;

    // Initialiser les valeurs précédentes si c'est le premier chargement
    if (Object.keys(previousValues).length === 0) {
        initializePreviousValues();
    }

    const tileState = loadTileState();
    let maxOrder = 0;

    // Convertir les données en tableau et exclure certains champs
    const excludeKeys = ['datagramme', 'timestamp'];
    allConditions = Object.entries(currentConditionsData)
        .filter(([key]) => !excludeKeys.includes(key))
        .map(([key, data]) => {
            const sensorInfo = {...data, ...tileState[key] };
            if (sensorInfo.order !== undefined && sensorInfo.order > maxOrder) maxOrder = sensorInfo.order;
            return {
                name: sensorInfo.label || key,
                comment: sensorInfo.comment,
                key,
                measurement: sensorInfo.measurement || 'unknown',
                value: sensorInfo.Value,
                unit: sensorInfo.Unit,
                more: sensorInfo.more || '',
                userUnit: sensorInfo.userUnit,
                toUserUnit: sensorInfo.toUserUnit || '(_) => _',
                groupUsage: sensorInfo.groupUsage || null,
                groupCustom: sensorInfo.groupCustom || null,
                sensorDb: sensorInfo.sensorDb,
                period: sensorInfo.period || '7d',
                order: sensorInfo.order,
                hidden: !!sensorInfo.hidden,
                searchText: [sensorInfo.label, key, sensorInfo.comment, String(data.Value), data.unit, sensorInfo.sensorDb, sensorInfo.measurement].join(' ').toLowerCase()
            };
        });

    // Assign order to new items and ensure uniqueness
    let usedOrders = new Set(allConditions.map(item => item.order).filter(o => o !== undefined));
    allConditions.forEach(item => {
        if (item.order === undefined) {
            while (usedOrders.has(++maxOrder)) {}
            item.order = maxOrder;
            usedOrders.add(item.order);
        }
    });

    // console.log('[DND] Conditions with custom order before sort:', allConditions.map(i => ({key: i.key, order: i.order})));
    // Afficher les conditions selon le groupement
    displayConditions();
    
    // Appliquer le filtre en cours
    applyCurrentFilter();
}

// Nouvelle fonction pour appliquer le filtre sans recharger
function applyCurrentFilter() {
    const filterText = document.getElementById('conditions-filter')?.value?.toLowerCase() || '';
    const tiles = document.querySelectorAll('.condition-tile');
console.log(filterText);
    let visibleCount = 0;

    tiles.forEach(tile => {
        const conditionKey = tile.dataset.key;
        // console.log(conditionKey, allConditions);
        const condition = allConditions.find(c => c.key === conditionKey);

        if (!condition) return;

        const isVisible = !condition.hidden && (filterText === '' || condition.searchText.includes(filterText));

        if (isVisible) {
            tile.style.display = '';
            visibleCount++;
        } else {
            tile.style.display = 'none';
        }
    });

    // Mise à jour de la bare de stats
    updateConditionsStats(visibleCount);

    // Gestion des groupes vides
    updateGroupVisibility();
}

function updateViewAllButtonVisibility() {
    const viewAllBtn = document.getElementById('view-all-btn');
    if (!viewAllBtn) return;

    const filterText = document.getElementById('conditions-filter')?.value || '';
    const hasHiddenTiles = allConditions.some(c => c.hidden);

    // Le bouton est visible s'il y a un filtre ou si des tuiles sont cachées
    viewAllBtn.style.visibility = (filterText !== '' || hasHiddenTiles) ? 'visible' : 'hidden';
}

function updateGroupVisibility() {
    const groups = document.querySelectorAll('.unit-group');

    groups.forEach(group => {
        const visibleTiles = group.querySelectorAll('.condition-tile[style=""], .condition-tile:not([style*="display: none"])');
        const hasVisibleTiles = Array.from(group.querySelectorAll('.condition-tile')).some(tile =>
            tile.style.display !== 'none'
        );

        if (hasVisibleTiles) {
            group.style.display = '';
            // Mettre à jour le compteur du groupe
            const counter = group.querySelector('.unit-count');
            if (counter) {
                counter.textContent = visibleTiles.length;
            }
        } else {
            group.style.display = 'none';
        }
    });
}

function updateConditionsStats(visibleCount) {
    const statsEl = document.getElementById('conditions-stats-display');

    if (statsEl && currentConditionsData) {
        const totalCount = Object.keys(currentConditionsData).length;
        const visibleConditions = allConditions.filter((_, index) => {
            const tile = document.querySelector(`.condition-tile[data-key="${allConditions[index].key}"]`);
            return tile && tile.style.display !== 'none';
        });
        const unitsCount = new Set(visibleConditions.map(item => item.unit)).size;

        statsEl.innerHTML = `${visibleCount} / ${totalCount} mesures • ${unitsCount} types`;
        statsEl.style.display = 'block';
    }
}


function displayConditions() {
    const groupBy = document.getElementById('conditions-group')?.value || 'unit';

    allConditions.sort((a, b) => (a.order || 0) - (b.order || 0));

    if (groupBy === 'none') {
        reorganizeConditionsList();
        initDragAndDrop();
    } else {
        reorganizeConditionsGrouped(groupBy);
        deinitDragAndDrop();
    }

    applyCurrentFilter();
    updateViewAllButtonVisibility();
}

// Fonction pour détecter si le changement est majeur
function isMajorChange(oldValue, newValue, unit) {
    if (oldValue === undefined || oldValue === null) return false;

    const old = parseFloat(oldValue);
    const current = parseFloat(newValue);

    if (isNaN(old) || isNaN(current)) return false;

    const percentChange = Math.abs((current - old) / old) * 100;

    // Seuils pour considérer un changement comme majeur selon le type de mesure
    const majorThresholds = {
        'temperature': 2,     // 2°C
        'pressure': 1,        // 1%
        'humidity': 5,        // 5%
        'wind': 10,          // 10 km/h ou 10%
        'rain': 0.1,         // 0.1mm
        'default': 5         // 5% par défaut
    };

    // Déterminer le seuil selon l'unité
    let threshold = majorThresholds.default;
    if (unit && (unit.includes('°C') || unit.includes('°F'))) threshold = majorThresholds.temperature;
    else if (unit && (unit.includes('hPa') || unit.includes('mb'))) threshold = majorThresholds.pressure;
    else if (unit && unit.includes('%')) threshold = majorThresholds.humidity;
    else if (unit && (unit.includes('km/h') || unit.includes('m/s'))) threshold = majorThresholds.wind;
    else if (unit && unit.includes('mm')) threshold = majorThresholds.rain;

    return percentChange > threshold;
}

// Fonction modifiée pour mettre à jour une tuile existante avec animation
function updateExistingTile(tileElement, item) {
    const fn = eval(item.toUserUnit || 'x => x');
    const valueElement = tileElement.querySelector('.condition-value');

    if (valueElement) {
        // Récupérer l'ancienne valeur pour comparaison
        const previousValue = previousValues[item.key];
        const currentValue = item.value;

        // Vérifier si la valeur a changé
        const hasChanged = previousValue !== undefined && previousValue !== currentValue;
        const isMajor = hasChanged && isMajorChange(previousValue, currentValue, item.userUnit);

        let unitDisplay = item.userUnit ? `<span class="condition-unit">${item.userUnit}</span>` : '';

        // Cas spéciaux pour certains types de données
        if (['dateStormRain','ForecastClass','iso8601','cardinal'].includes(item.unit)) {
            unitDisplay = '';
        }

        // Mettre à jour le contenu
        valueElement.innerHTML = `
            <span id="tuile_${item.key}_value">${fn(currentValue)}</span>
            ${unitDisplay}
            <span id="tuile_${item.key}_more" class="smallText">${item.more?item.more:''}</span>`;
        // Appliquer l'animation si la valeur a changé
        if (hasChanged) {
            // Retirer les classes d'animation précédentes
            tileElement.classList.remove('value-changed', 'major-change');

            // Forcer un reflow pour s'assurer que les classes sont bien retirées
            tileElement.offsetHeight;

            // Ajouter la classe appropriée selon l'ampleur du changement
            if (isMajor) {
                tileElement.classList.add('major-change');
            } else {
                tileElement.classList.add('value-changed');
            }

            // Retirer la classe après l'animation pour permettre les futures animations
            setTimeout(() => {
                tileElement.classList.remove('value-changed', 'major-change');
            }, isMajor ? 800 : 600);
        }

        // Mettre à jour la valeur précédente
        previousValues[item.key] = currentValue;
    }

    // Mettre à jour les cas spéciaux avec animation si nécessaire
    if (item.key === 'ForecastNum') {
        const chartElement = tileElement.querySelector('.condition-chart');
        if (chartElement) {
            const weatherImages = item.value.split(' ');
            chartElement.innerHTML = `
                <div class="weather-forecast-container">
                    ${weatherImages.map(weather => ` 
                        <img src="img/${weather}.png"
                             alt="${weather}" 
                             class="weather-icon weather-${weather.toLowerCase()} ${item.value === weather ? 'active' : ''}"
                             style="z-index: ${weather === 'Cloud' ? 3 : weather === 'Rain' ? 4 : weather === 'Snow' ? 5 : 2}">
                    `).join('')}
                </div>
            `;
        }
    } else if (item.measurement === 'direction') {
        const chartElement = tileElement.querySelector('.condition-chart');
        if (chartElement) {
            const windDirection = parseFloat(item.value) || 135;
            const angleRad = (windDirection - 90) * Math.PI / 180;
            const radius = 64;
            const x = Math.cos(angleRad) * radius;
            const y = Math.sin(angleRad) * radius;

            chartElement.innerHTML = `
                <div class="wind-compass">
                    <img src="img/windRose.png" alt="Rose des vents" class="wind-rose">
                    <img src="img/windArrow.png" alt="Direction du vent" class="wind-arrow"
                        style="transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${windDirection}deg)">
                </div>
            `;
        }
        console.warn(item);
        if (item.userUnit === "cardinal" ) unitDisplay = '';
    }
}

// Fonction pour initialiser les valeurs précédentes lors du premier chargement
function initializePreviousValues() {
    if (currentConditionsData) {
        const excludeKeys = ['datagramme', 'timestamp'];
        Object.entries(currentConditionsData)
            .filter(([key]) => !excludeKeys.includes(key))
            .forEach(([key, data]) => {
                if (previousValues[key] === undefined) {
                    previousValues[key] = data.Value;
                }
            });
    }
}

function reorganizeConditionsGrouped(groupBy) {
    const conditionsContainer = document.getElementById('conditions-container');
    if (!conditionsContainer) return;

    if (allConditions.length === 0) {
        conditionsContainer.innerHTML = '<div class="conditions-grid"><div class="no-results">Aucune donnée ne correspond à votre recherche.</div></div>';
        return;
    }

    // Détacher les tuiles existantes du DOM pour les préserver
    const existingTiles = {};
    document.querySelectorAll('.condition-tile').forEach(tile => {
        const key = tile.dataset.key;
        if (key) {
            tile.remove();
            existingTiles[key] = tile;
        }
    });

    // Grouper selon le critère
    const groupedData = allConditions.reduce((groups, item) => {
        let groupKey;
        switch (groupBy) {
            case 'measurement':
                groupKey = item.measurement || 'Sans type';
                break;
            case 'groupUsage':
                groupKey = item.groupUsage;
                break;
            case 'groupCustom':
                groupKey = item.groupCustom;
                break;
            default:
                groupKey = item.sensorDb || 'Sans historique!';
                break;
        }
        
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(item);
        return groups;
    }, {});

    // Créer la nouvelle structure
    let newHTML = '';
    Object.entries(groupedData).sort((a, b) => a[0].localeCompare(b[0])).forEach(([groupName, items]) => {
        newHTML += `
            <div class="unit-group">
                <h3>
                    ${groupName}
                    <span class="unit-count">${items.length}</span>
                </h3>
                <div class="conditions-grid" data-group="${groupName}">
                </div>
            </div>
        `;
    });

    conditionsContainer.innerHTML = newHTML;

    // Réinsérer les tuiles dans les bons groupes
    Object.entries(groupedData).forEach(([groupName, items]) => {
        const groupGrid = conditionsContainer.querySelector(`[data-group="${groupName}"]`);
        items.sort((a, b) => (a.order || 0) - (b.order || 0));
        if (groupGrid) {
            items.forEach(item => {
                if (existingTiles[item.key]) {
                    updateExistingTile(existingTiles[item.key], item);
                    groupGrid.appendChild(existingTiles[item.key]);
                } else {
                    // Créer une nouvelle tuile
                    const tileElement = document.createElement('div');
                    tileElement.innerHTML = createConditionTileHTML(item);
                    groupGrid.appendChild(tileElement.firstElementChild);
                    setTimeout(() => loadChartForItem(item), 50);
                }
            });
        }
    });
}

function reorganizeConditionsList() {
    const conditionsContainer = document.getElementById('conditions-container');
    if (!conditionsContainer) return;

    if (allConditions.length === 0) {
        conditionsContainer.innerHTML = '<div class="conditions-grid"><div class="no-results">Aucune donnée ne correspond à votre recherche.</div></div>';
        return;
    }

    // Détacher les tuiles existantes du DOM pour les préserver
    const existingTiles = {};
    document.querySelectorAll('.condition-tile').forEach(tile => {
        const key = tile.dataset.key;
        if (key) {
            tile.remove();
            existingTiles[key] = tile;
        }
    });

    // Créer la nouvelle structure
    const newHTML = '<div class="conditions-grid" data-ungrouped="true"></div>';
    conditionsContainer.innerHTML = newHTML;

    const grid = conditionsContainer.querySelector('[data-ungrouped="true"]');

    // Réinsérer les tuiles
    allConditions.forEach(item => {
        if (existingTiles[item.key]) {
            updateExistingTile(existingTiles[item.key], item);
            grid.appendChild(existingTiles[item.key]); // existingTiles[item.key] is already a DOM element
        } else {
            // Créer une nouvelle tuile
            const tileElement = document.createElement('div');
            tileElement.innerHTML = createConditionTileHTML(item);
            grid.appendChild(tileElement.firstElementChild);
            setTimeout(() => loadChartForItem(item), 50);
        }
    });
}

function getBatteryImageAndClass(batteryValue) {

    const value = parseFloat(batteryValue);
    let level, className = '';
    if (value > 102) {
        level = 'missing';
        className= 'missing-battery';
    } else if (value >= 90) {
        level = 100;
    } else if (value >=70) {
        level = 80;
    } else if (value >= 50) {
        level = 60;
    } else if (value >= 30) {
        level = 40;
    } else if (value >= 10) {
        level = 20;
        className = 'low-battery';
    } else {
        level = 0;
        className = 'low-battery';
    }
    return { image: `batterie-${level}.png`, className };
}

function createConditionTileHTML(item) {
    const displayValue = item.value;
    const metaInfo = '';
    let unitDisplay = item.userUnit ? `<span class="condition-unit">${item.userUnit}</span>` : '';
    let fn;
    try {
        fn = eval(item.toUserUnit || 'x => x');
    } catch (error) {
        fn = x => { console.log(`erreur eval(${item.toUserUnit})`); };
        console.error('Erreur lors de l\'évaluation de la fonction de conversion:', error);
    }

    let chartContent = '';
    if (item.key === 'ForecastNum') {
        // Cas spécial pour ForecastIcon - afficher des images météo (pas de lien)
        const weatherImages = displayValue.split(' ');
        chartContent = `
            <div class="weather-forecast-container">
                ${weatherImages.map(weather => ` 
                    <img src="img/${weather}.png"
                         alt="${weather}" 
                         class="weather-icon weather-${weather.toLowerCase()} ${displayValue === weather ? 'active' : ''}"
                         style="z-index: ${weather === 'Cloud' ? 3 : weather === 'Rain' ? 4 : weather === 'Snow' ? 5 : 2}">
                `).join('')}
            </div>
        `;
        unitDisplay = '';
        return `
            <div class="condition-tile" data-key="${item.key}" draggable="false">
                <svg class="hide-tile-btn nav-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                </svg>
                <div class="condition-content">
                    <div class="condition-info">
                        <div class="condition-name">${item.name}</div>
                        <div class="condition-value">
                            <span id="tuile_${item.key}_value">${fn(displayValue)}</span>
                            ${unitDisplay}
                            <span id="tuile_${item.key}_more" class="smallText">${item.more?item.more:''}</span>
                        </div>
                        ${metaInfo}
                    </div>
                    <div class="condition-chart">${chartContent}</div>
                </div>
            </div>
        `;
    } else if (item.measurement === 'direction') {
        // Cas spécial pour afficher une flèche directionnelle 
        const windDirection = parseFloat(displayValue) || 135;
        // Calculer la position sur le cercle (rayon 100px)
        const angleRad = (windDirection - 90) * Math.PI / 180; // -90 pour que 0° soit en haut
        const radius = 64;
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;

        chartContent = `
            <div class="wind-compass">
                <img src="img/windRose.png" alt="Rose des vents" class="wind-rose">
                <img src="img/windArrow.png" alt="Direction du vent" class="wind-arrow"
                    style="transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${windDirection}deg)">
            </div>
        `;
        console.log(item);
        if (item.userUnit === "cardinal" ) unitDisplay = '';
    } else if (item.unit === 'dateStormRain' || item.unit === 'iso8601'){
        unitDisplay = '';
    } else if (item.key === 'batteryVoltage') {
        // Cas spécial pour la batterie avec niveau
        const batteryInfo = getBatteryImageAndClass(fn(displayValue));
        chartContent = `
            <div class="battery-container">
                <img src="img/${batteryInfo.image}"
                     alt="Niveau de batterie" 
                     class="battery-icon ${batteryInfo.className}">
            </div>
        `;
        // Pour la batterie, on peut garder l'unité si elle existe
    } else {
        chartContent = `<div id="chart_${item.key}" class="plot-container"></div>`;
    }

    return `
    <div class="condition-tile" id="tuile_${item.key}" data-key="${item.key}" draggable="false">
        <svg class="hide-tile-btn nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
        </svg>
        <div class="condition-content" title="Voir le détail du capteur ${item.name}">
            <div class="condition-info">
                <div class="condition-name">${item.name}</div>
                <div class="condition-value">
                    <span id="tuile_${item.key}_value">${fn(displayValue)}</span>
                    ${unitDisplay}
                    <span id="tuile_${item.key}_more" class="smallText">${item.more?item.more:''}</span>
                </div>
                ${metaInfo}
            </div>
            <div class="condition-chart">
                ${chartContent}
            </div>
        </div>
    </div>
    `;
}
function getStartDate (period){
    let date;
    if (period === 'dateStormRain') {
        const str = currentConditionsData.stormRain?.more;
        date = new Date((new Date(`${str}T00:00:00.000Z`)).getTime());
        console.log(str, date);
    } else {
        if(typeof period === 'string'){
            const P = eval(period.replace('w', '*24*60*60*7').replace('d', '*24*60*60').replace('h', '*60*60').replace('m', '*60'));
            date = new Date((Math.round((new Date()).getTime()/1000) - P)*1000);
        }else{
            date = new Date((Math.round((new Date()).getTime()/1000) - period)*1000);
        }
    }
    return date.toISOString().split('.')[0] + 'Z';
}


function loadAllCharts() {
    if (!selectedStation || !dbSensorList) return;
    allConditions.forEach(loadChartForItem);
    console.log(requestCache);
}

function loadChartForItem(item) {
    if (!item.sensorDb) return;
    const chartId = `chart_${item.key}`;
    const start = `startDate=${getStartDate(item.period)}`;
    const count = `stepCount=${item.measurement === 'rain' ? 24 : 246}`;

    if (item.sensorDb.startsWith('vector:')) {
        const sensorRef = item.sensorDb.substring('vector:'.length);
        // console.log(item.sensorDb, sensorRef, prefix);
        loadVectorPlot(chartId, `${API_BASE_URL}/${selectedStation.id}/WindVectors/${sensorRef}?${count}&${start}`, item.period);
    } else if (item.sensorDb.startsWith('rose:')) {
        const sensorRef = item.sensorDb.substring('rose:'.length);
        // loadRosePlot(chartId, `${API_BASE_URL}/${selectedStation.id}/WindRose/${sensorRef}?${count}&${start}`, item.period);
    } else {
        loadData(chartId, `${API_BASE_URL}/${selectedStation.id}/Raw/${item.sensorDb}?${count}&${start}`, item.period);
    }
}

let dragKey = null;
let draggedDOMElement = null;
let longPressTimer = null;
let isDraggingTouch = false;
let touchStartX, touchStartY;
let draggedElementRect;

function handleDragStart(e) {
    const tile = e.target.closest('.condition-tile');
    if (!tile) return;
    draggedDOMElement = tile; // Keep a direct reference to the DOM element
    dragKey = tile.dataset.key;
    e.dataTransfer.setData('text/plain', dragKey);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
        tile.classList.add('dragging');
    }, 0);
}

function handleDragEnd(e) {
    if (draggedDOMElement) {
        draggedDOMElement.classList.remove('dragging');
    }
    draggedDOMElement = null;
    dragKey = null;
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    
    // Cacher temporairement l'élément déplacé pour trouver ce qui est en dessous
    if (draggedDOMElement) draggedDOMElement.style.visibility = 'hidden';
    
    // Trouver l'élément sous le curseur
    const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
    
    // Rendre l'élément déplacé visible à nouveau
    if (draggedDOMElement) draggedDOMElement.style.visibility = '';

    const targetTile = elementUnder ? elementUnder.closest('.condition-tile') : null;

    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (targetTile && targetTile !== draggedDOMElement) {
        targetTile.classList.add('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    const targetTile = e.target.closest('.condition-tile');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    if (!targetTile || !draggedDOMElement || targetTile === draggedDOMElement) {
        return;
    }

    const targetKey = targetTile.dataset.key;

    const draggedItemIndex = allConditions.findIndex(c => c.key === dragKey);
    const targetItemIndex = allConditions.findIndex(c => c.key === targetKey);

    if (draggedItemIndex === -1 || targetItemIndex === -1) return; // Should not happen if dragKey is set

    const [draggedItem] = allConditions.splice(draggedItemIndex, 1);
    allConditions.splice(targetItemIndex, 0, draggedItem);

    allConditions.forEach((item, index) => item.order = index);
    saveTileState();

    // Reorder the DOM element directly instead of a full redraw
    targetTile.parentNode.insertBefore(draggedDOMElement, targetTile);
}

function handleTouchStart(e) {
    const tile = e.target.closest('.condition-tile');
    if (!tile || e.touches.length !== 1) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    draggedDOMElement = tile;

    longPressTimer = setTimeout(() => {
        isDraggingTouch = true;
        dragKey = tile.dataset.key;
        tile.classList.add('dragging');
        
        // Empêcher le défilement pendant le drag
        document.body.style.overflow = 'hidden';

        // Pour un positionnement correct lors du déplacement
        draggedElementRect = tile.getBoundingClientRect();
        
        // Haptique pour indiquer le début du drag
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

    }, 500); // 500ms pour un appui long
}

function handleTouchMove(e) {
    if (longPressTimer) {
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        // Annuler l'appui long si le doigt bouge trop
        if (Math.abs(touchX - touchStartX) > 10 || Math.abs(touchY - touchStartY) > 10) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    if (!isDraggingTouch || !draggedDOMElement) return;

    e.preventDefault(); // Empêche le scroll

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;

    // Déplacer l'élément visuellement
    const dx = touchX - touchStartX;
    const dy = touchY - touchStartY;
    draggedDOMElement.style.transform = `translate(${dx}px, ${dy}px)`;
    draggedDOMElement.style.zIndex = '1000';

    // Déterminer la cible du drop
    const targetElement = document.elementFromPoint(touchX, touchY);
    const targetTile = targetElement ? targetElement.closest('.condition-tile') : null;

    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    if (targetTile && targetTile !== draggedDOMElement) {
        targetTile.classList.add('drag-over');
    }
}

function handleTouchEnd(e) {
    clearTimeout(longPressTimer);
    longPressTimer = null;

    if (!isDraggingTouch || !draggedDOMElement) return;

    // Réactiver le scroll
    document.body.style.overflow = '';

    const touchX = e.changedTouches[0].clientX;
    const touchY = e.changedTouches[0].clientY;

    const targetElement = document.elementFromPoint(touchX, touchY);
    const targetTile = targetElement ? targetElement.closest('.condition-tile') : null;

    if (targetTile && targetTile !== draggedDOMElement) {
        const targetKey = targetTile.dataset.key;
        const draggedItemIndex = allConditions.findIndex(c => c.key === dragKey);
        const targetItemIndex = allConditions.findIndex(c => c.key === targetKey);

        if (draggedItemIndex !== -1 && targetItemIndex !== -1) {
            const [draggedItem] = allConditions.splice(draggedItemIndex, 1);
            allConditions.splice(targetItemIndex, 0, draggedItem);
            allConditions.forEach((item, index) => item.order = index);
            saveTileState();
            targetTile.parentNode.insertBefore(draggedDOMElement, targetTile);
        }
    }

    // Nettoyage
    draggedDOMElement.classList.remove('dragging');
    draggedDOMElement.style.transform = '';
    draggedDOMElement.style.zIndex = '';
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    isDraggingTouch = false;
    draggedDOMElement = null;
    dragKey = null;
}

function initDragAndDrop() {
    const container = document.getElementById('conditions-container');
    if (!container) return;
    console.log('initDragAndDrop');
    container.classList.add('sortable');
    container.querySelectorAll('.condition-tile').forEach(tile => tile.setAttribute('draggable', 'true'));
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('dragend', handleDragEnd);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    // Ajout des écouteurs pour le tactile
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);
    // Empêche le menu contextuel du navigateur d'apparaître lors d'un appui long sur mobile
    container.addEventListener('contextmenu', (e) => {consolee.preventDefault()});
}

function deinitDragAndDrop() {
    const container = document.getElementById('conditions-container');
    if (!container) return;
    container.classList.remove('sortable');
    container.querySelectorAll('.condition-tile').forEach(tile => tile.setAttribute('draggable', 'false'));
    container.removeEventListener('dragstart', handleDragStart);
    container.removeEventListener('dragend', handleDragEnd);
    container.removeEventListener('dragover', handleDragOver);
    container.removeEventListener('drop', handleDrop);
    // Retrait des écouteurs pour le tactile
    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchmove', handleTouchMove);
    container.removeEventListener('touchend', handleTouchEnd);
    container.removeEventListener('touchcancel', handleTouchEnd);
    container.removeEventListener('contextmenu', (e) => e.preventDefault());
}

function showDetailsFooter(keys) {
    const detailsFooter = document.querySelector('footer.footer');
    const contentContainer = document.getElementById('d3-chart-container');
    if (!detailsFooter || !contentContainer) return;

    const keysArray = Array.isArray(keys) ? keys : [keys];
    if (keysArray.length === 0) return;

    const items = keysArray.map(key => allConditions.find(c => c.key === key)).filter(Boolean);
    console.log(items)
    if (items.length === 0) return;

    // S'assurer que le footer n'est pas caché par l'animation initiale
    detailsFooter.classList.remove('hidden-animated');

    // Affiche le footer
    detailsFooter.classList.add('details-open');
    
    // Utilise le premier item pour les propriétés communes comme la période
    const firstItem = items[0];

    const sensorDbs = items.map(i => i.sensorDb).filter(Boolean);
    if (sensorDbs.length === 0) {
        contentContainer.innerHTML = `<div class="error-message">Aucun capteur avec historique dans la sélection.</div>`;
        return;
    }
    
    // Special case for wind rose
    if (items.some(i => i.measurement === 'direction' || i.sensorDb.startsWith('vector:') || i.sensorDb.startsWith('rose:'))) {
        let prefix = '';
        if (firstItem.key.includes('_')) {
            prefix = firstItem.key.split(':')[1].split('_')[0] + '_';
        }
        console.log('firstItem', firstItem.key, prefix);
        contentContainer.innerHTML = `
            <div class="wind-details-grid">
                <div class="wind-top-row" id="windRoses-container"></div>
                <div class="wind-bottom-row" id="vector-container"></div>
            </div>
        `;
        const start = getStartDate(firstItem.period);
        loadRosePlot('windRoses-container', `${API_BASE_URL}/${selectedStation.id}/WindRose?stepCount=24&startDate=${start}&prefix=${prefix}`);
        const vectorUrl = `/query/${selectedStation.id}/WindVectors/${firstItem.sensorDb.split(':')[1]}?stepCount=600&startDate=${start}`;
        loadVectorPlot('vector-container', vectorUrl);
        return;
    }

    const start = `startDate=${getStartDate('100d')}`;
    const count = `stepCount=500`;

    const chartId = `details_chart_`;
    contentContainer.innerHTML = `<div id="${chartId}" style="width: 100%; height: 100%;"></div>`;
    const sensorsQuery = sensorDbs.join(',');
    loadDatas(chartId, `${API_BASE_URL}/${selectedStation.id}/Raws/${sensorsQuery}?${count}&${start}`, firstItem.period);
    
}

function hideDetailsFooter() {
    const detailsFooter = document.querySelector('footer.footer');
    const contentContainer = document.getElementById('d3-chart-container');
    if (!detailsFooter || !contentContainer) return;

    // Fonction pour nettoyer le contenu
    const cleanup = () => {
        // contentContainer.innerHTML = '';
        detailsFooter.removeEventListener('transitionend', cleanup);
    }

    detailsFooter.addEventListener('transitionend', cleanup, { once: true });
    detailsFooter.classList.remove('details-open');
}

document.addEventListener('DOMContentLoaded', () => {
    const contextMenu = document.getElementById('custom-context-menu');
    const compareMenuItem = document.getElementById('compare-selected');
    const container = document.getElementById('conditions-container');
    const viewAllBtn = document.getElementById('view-all-btn');


    if (!container || !contextMenu || !compareMenuItem) {
        console.warn("Dashboard interaction elements not found.");
        return;
    }

    const clearSelection = () => {
        document.querySelectorAll('.condition-tile.selected').forEach(t => t.classList.remove('selected'));
        selectedTiles.clear();
        hideDetailsFooter();
    };

    const hideContextMenu = () => {
        contextMenu.style.display = 'none';
    };

    const handleTileClick = (event) => {
        const tile = event.target.closest('.condition-tile');
        const hideBtn = event.target.closest('.hide-tile-btn');

        if (hideBtn) {
            event.preventDefault();
            handleHideTile(tile.dataset.key);
            return;
        }

        if (!tile) return;

        if (event.ctrlKey) {
            event.preventDefault(); // Prevent link navigation on Ctrl+click
            const key = tile.dataset.key;
            if (selectedTiles.has(key)) {
                selectedTiles.delete(key);
                tile.classList.remove('selected');
                // Si la sélection est vide, on cache le footer, sinon on met à jour le graphique
                if (selectedTiles.size === 0) {
                    hideDetailsFooter();
                } else {
                    showDetailsFooter([...selectedTiles]);
                }
            } else {
                selectedTiles.add(key);
                tile.classList.add('selected');
                // Met à jour le graphique avec la nouvelle sélection
                showDetailsFooter([...selectedTiles]);
            }
        } else {
            console.log('selectedTiles', selectedTiles);
            const key = tile.dataset.key;
            console.log('key', key);
            const item = allConditions.find(c => c.key === key);
            console.log('item', item);
            if (item && item.sensorDb) {
                console.log(selectedTiles.size);
                if (tile.classList.contains('selected') && selectedTiles.size === 1) {
                    clearSelection();
                } else {
                    clearSelection();
                    selectedTiles.add(key);
                    tile.classList.add('selected');
                    showDetailsFooter(key);
                }
            }
        }
    };

    const handleContextMenu = (event) => {
        const tile = event.target.closest('.condition-tile');
        if (!tile || !tile.classList.contains('selected') || selectedTiles.size <= 1) {
            hideContextMenu();
            return;
        }

        event.preventDefault();
        contextMenu.style.display = 'block';
        
        const { clientX: mouseX, clientY: mouseY } = event;
        const { innerWidth, innerHeight } = window;
        const { offsetWidth: menuWidth, offsetHeight: menuHeight } = contextMenu;

        contextMenu.style.top = `${mouseY + menuHeight > innerHeight ? mouseY - menuHeight : mouseY}px`;
        contextMenu.style.left = `${mouseX + menuWidth > innerWidth ? mouseX - menuWidth : mouseX}px`;
    };

    const compareSelectedItems = () => {
        if (selectedTiles.size > 1) {
            const sensorsToCompare = [...selectedTiles]
                .map(key => allConditions.find(c => c.key === key)?.sensorDb)
                .filter(sensorDb => sensorDb) // Filter out null/undefined/empty
                .filter((value, index, self) => self.indexOf(value) === index); // Unique values

            if (sensorsToCompare.length > 0) {
                const url = `Plots.html?station=${selectedStation.id}&sensors=${sensorsToCompare.join(',')}`;
                window.open(url, '_blank');
            } else {
                alert("Aucun capteur avec historique à comparer parmi la sélection.");
            }
        }
        hideContextMenu();
    };

    function hideToTrash(element, trashIcon) {
        const elRect = element.getBoundingClientRect();
        const trashRect = trashIcon.getBoundingClientRect();
      
        // Centre la tuile sur l'icône pour un effet plus naturel
        const deltaX = (trashRect.left + trashRect.width / 2) - (elRect.left + elRect.width / 2);
        const deltaY = (trashRect.top + trashRect.height / 2) - (elRect.top + elRect.height / 2);
      
        return element.animate([
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${deltaX}px, ${deltaY}px) scale(0)`, opacity: 0 }
        ], {
          duration: 500, // Durée de l'animation
          easing: 'ease-in', // Accélération au début
          fill: 'forwards'
        });
    }

    async function handleHideTile(key) {
        const tile = document.querySelector(`.condition-tile[data-key="${key}"]`);
        const trashIcon = document.getElementById('view-all-btn');
        if (!tile || !trashIcon) return;

        trashIcon.style.visibility = 'visible'; // Assure que l'icône est visible pour le calcul
        const animation = hideToTrash(tile, trashIcon);
        await animation.finished; // Attend la fin de l'animation
        onHideAnimationEnd(key);
    }
    
    function onHideAnimationEnd(key) {
        const condition = allConditions.find(c => c.key === key);
        if (condition) {
            condition.hidden = true;
            saveTileState();
            updateViewAllButtonVisibility();
            applyCurrentFilter();
            
            // Annuler l'animation et nettoyer les styles pour que la tuile puisse se réafficher
            const tile = document.querySelector(`.condition-tile[data-key="${key}"]`);
            if (tile) {
                const animations = tile.getAnimations();
                animations.forEach(animation => animation.cancel());
            }
        }
    }

    function showAllTilesAndClearFilter() {
        document.getElementById('conditions-filter').value = '';
        allConditions.forEach(c => c.hidden = false);
        saveTileState();
        updateViewAllButtonVisibility();
        if (typeof updateDashboardURL === 'function') updateDashboardURL();
        applyCurrentFilter();
    }

    container.addEventListener('click', handleTileClick);
    container.addEventListener('contextmenu', handleContextMenu);
    compareMenuItem.addEventListener('click', compareSelectedItems);
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', showAllTilesAndClearFilter);
    }

    window.addEventListener('click', (event) => {
        // Cacher le menu contextuel si on clique ailleurs
        if (!contextMenu.contains(event.target)) {
            hideContextMenu();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearSelection();
            hideContextMenu();
        }
    });
});