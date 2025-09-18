// Variables for dashboard section
const API_BASE_URL = 'http://probe2.lpz.ovh/query';
const STORAGE_KEY_ORDER = 'dashboardTileOrder';


let currentConditionsData = null;
let allConditions = []; // Stores all conditions without filter
let dbSensorList = null;
let previousValues = {};
let selectedTiles = new Set();

function loadScript(src) {
    return new Promise((resolve, reject) => {
        // If script already exists, resolve immediately
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const scriptElement = document.createElement('script');
        scriptElement.src = src;
        scriptElement.onload = () => {
            resolve();
        };
        scriptElement.onerror = (err) => {
            console.error(`Failed to load script: ${src}`, err);
            reject(new Error(`Failed to load script: ${src}`));
        };
        document.head.appendChild(scriptElement);
    });
}

function saveCustomOrder() {
    if (!selectedStation) return;
    const order = Object.fromEntries(allConditions.map(item => [item.key, item.customOrder]));
    console.log(`[DND] Saving custom order for station ${selectedStation.id}:`, order);
    localStorage.setItem(`${STORAGE_KEY_ORDER}_${selectedStation.id}`, JSON.stringify(order));
}

function loadCustomOrder() {
    if (!selectedStation) return {};
    const order = JSON.parse(localStorage.getItem(`${STORAGE_KEY_ORDER}_${selectedStation.id}`) || '{}');
    // console.log(`[DND] Loaded custom order for station ${selectedStation.id}:`, order);
    return order;
}

// --- Dashboard Section: Current Conditions ---

function mergeData(data) {
    if (data.data['SUN_calc']) { // remplace 2 tuiles par une seule
        if (data.data.sunrise && data.data.sunset) {
            const sunrise = data.data.sunrise;
            const fn1 = eval(sunrise.toUserUnit);
            const sunset = data.data.sunset;
            const fn2 = eval(sunset.toUserUnit);

            data.data['SUN_calc'].Value = fn1(sunrise.Value) + ' - ' + fn2(sunset.Value);
            delete data.data.sunrise;
            delete data.data.sunset;
        }
    }
    if (data.data['THSW_calc']) { // remplace 1 tuile
        data.data['THSW_calc'].Value = data.data['THSW'].Value;
        delete data.data['THSW'];
    }
    return data;
}

async function fetchCurrentConditions() {
    if (!selectedStation) {
        showConditionsStatus('Aucune station sélectionnée', 'error');
        return;
    }

    showConditionsStatus('Chargement des données météo...', 'loading');

    try {
        // Essayer de récupérer les données actuelles
        const currentPromise = fetch(`/api/station/${selectedStation.id}/current-conditions`, { cache: 'no-cache' })
            .catch(error => {
                console.warn('La requête pour les conditions actuelles a échoué.', error.message);
                return null; // Échec silencieux
            });
        
        // 1. Démarrer l'appel pour les données additionnelles
        const additionalPromise = fetch(`/api/station/${selectedStation.id}/additional-conditions`, { cache: 'no-cache' })
            .catch(e => {
                console.warn('La requête pour les conditions additionnelles a échoué.', e.message);
                return null; // Échec silencieux
            });



        // 2. Gérer les données additionnelles pendant que les données actuelles chargeaient
        const apiAdditional = await additionalPromise;
        let additionalData = null;
        const scriptPromises = [];
        if (apiAdditional && apiAdditional.ok) {
            additionalData = await apiAdditional.json();
            if (additionalData.success && additionalData.data) {
                Object.values(additionalData.data).forEach(item => {
                    if (item.js) {
                        item.js.forEach(script => {
                            // Collect promises for all scripts to be loaded
                            scriptPromises.push(loadScript(script));
                        });
                    }
                });
            }
        } else {
            console.warn('Aucune donnée additionnelle ne sera ajoutée.');
        }

        // 3. Traiter les données actuelles (ou de secours)
        const apiCurrent = await currentPromise;
        let data;
        if (apiCurrent && apiCurrent.ok) {
            data = await apiCurrent.json();
        } else {
            const errorStatus = apiCurrent ? ` (status: ${apiCurrent.status})` : '';
            throw new Error(`Erreur de chargement des données actuelles et de secours${errorStatus}.`);
        }

        // 4. Fusionner les données
        if (additionalData && additionalData.success && additionalData.data) {
            data.data = { ...data.data, ...additionalData.data };
        }
        // 5. Attendre que tous les scripts soient chargés
        await Promise.all(scriptPromises);

        // 6. Maintenant que les scripts sont chargés, on peut traiter les données qui en dépendent
        data = mergeData(data);

        if (data.data) {
            currentConditionsData = data.data;
            processAndDisplayConditions();
            showConditionsStatus('Données actualisées avec succès', 'success');
        } else {
            console.log(data.data);
            throw new Error(data.error || 'Format de données invalide');
        }

    } catch (error) {
        console.error('Erreur irrécupérable lors de la récupération des données:', error);
        showConditionsStatus(`Erreur: ${error.message}`, 'error');
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

    const customOrder = loadCustomOrder();
    let maxOrder = 0;

    // Convertir les données en tableau et exclure certains champs
    const excludeKeys = ['datagramme', 'timestamp'];
    allConditions = Object.entries(currentConditionsData)
        .filter(([key]) => !excludeKeys.includes(key))
        .map(([key, data]) => {
            // si data a une propriete fnCalc 
            const sensorInfo = data.fnCalc ? data : sensorMap[key] || {};
            const order = customOrder[key];
            if (order !== undefined && order > maxOrder) maxOrder = order;
            return {
                key,
                name: sensorInfo.label || data.label || {},
                value: data.Value,
                unit: data.Unit,
                userUnit: data.userUnit,
                fnToUserUnit: data.toUserUnit || '(_) => _',
                fnCalc: sensorInfo.fnCalc || null,
                dataNeeded: sensorInfo.dataNeeded || sensorInfo.sensorDb,
                measurement: sensorInfo.measurement || 'unknown',
                groupUsage: sensorInfo.groupUsage || '0',
                groupCustom: sensorInfo.groupCustom || '0',
                customOrder: order,
                period: sensorInfo.period || '7d',
                sensorDb: sensorInfo.sensorDb,
                comment: sensorInfo.comment,
                searchText: [sensorInfo.label, key, data.label, sensorInfo.comment, String(data.Value), data.unit, sensorInfo.sensorDb, sensorInfo.measurement].join(' ').toLowerCase()
            };
        });

    // Assign order to new items and ensure uniqueness
    let usedOrders = new Set(allConditions.map(item => item.customOrder).filter(o => o !== undefined));
    allConditions.forEach(item => {
        if (item.customOrder === undefined) {
            while (usedOrders.has(++maxOrder)) {}
            item.customOrder = maxOrder;
            usedOrders.add(item.customOrder);
        }
    });

    // console.log('[DND] Conditions with custom order before sort:', allConditions.map(i => ({key: i.key, order: i.customOrder})));
    console.log('allConditions', allConditions);
    // Afficher les conditions selon le groupement
    displayConditions();
    
    // Appliquer le filtre en cours
    applyCurrentFilter();
}

// Nouvelle fonction pour appliquer le filtre sans recharger
function applyCurrentFilter() {
    const filterText = document.getElementById('conditions-filter')?.value?.toLowerCase() || '';
    const tiles = document.querySelectorAll('.condition-tile');
    
    let visibleCount = 0;
    
    tiles.forEach(tile => {
        const conditionKey = tile.dataset.key;
        const condition = allConditions.find(c => c.key === conditionKey);
        
        if (!condition) return;
        
        const isVisible = filterText === '' || condition.searchText.includes(filterText);
        
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
    
    allConditions.sort((a, b) => (a.customOrder || 0) - (b.customOrder || 0));
    // console.log('[DND] Sorted conditions by customOrder:', allConditions.map(i => i.key));

    if (groupBy === 'none') {
        reorganizeConditionsList();
        initDragAndDrop();
    } else {
        reorganizeConditionsGrouped(groupBy);
        deinitDragAndDrop();
    }

    applyCurrentFilter();
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
    const fn = eval(item.fnToUserUnit || 'x => x');
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
        valueElement.innerHTML = `${fn(currentValue)} ${unitDisplay}`;
        
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
        items.sort((a, b) => (a.customOrder || 0) - (b.customOrder || 0));
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
        // console.log(item.key, item.fnToUserUnit);
        fn = eval(item.fnToUserUnit || 'x => x');
    } catch (error) {
        fn = x => {console.log(`erreur eval(${item.fnToUserUnit})`);};
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
                <div class="condition-content">
                    <div class="condition-info">
                        <div class="condition-name">${item.name}</div>
                        <div class="condition-value">${fn(displayValue)} ${unitDisplay}</div>
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
        unitDisplay = '';
    } else if (item.unit === 'dateStormRain' || item.unit === 'iso8601' || item.userUnit === 'cardinal'){
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
        <a href="Plots.html?station=${selectedStation.id}&sensors=${item.sensorDb}" class="tile-link" title="Voir le détail du capteur ${item.name}">
            <div class="condition-content">
                <div class="condition-info">
                    <div class="condition-name">${item.name}</div>
                    <div class="condition-value">
                        <span id="tuile_${item.key}_value">${fn(displayValue)}</span> ${unitDisplay}
                    </div>
                    ${metaInfo}
                </div>
                <div class="condition-chart">
                    ${chartContent}
                </div>
            </div>
        </a>
    </div>
    `;
}
function getStartDate (period){
let date;
    if (period === 'dateStormRain') {
        const str = currentConditionsData.dateStormRain?.Value;
        const stormDate = (str?.endsWith('T') ? str.slice(0, -1) : str)
        date = new Date((stormDate || Math.round((new Date()).getTime()/1000) - 60*60*24*7)*1000);
    } else {
        date = new Date((Math.round((new Date()).getTime()/1000) - period)*1000);
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
        loadVectorPlot(chartId, `${API_BASE_URL}/${selectedStation.id}/WindVectors/${sensorRef}?${count}&${start}`, item.period);
    } else if (item.sensorDb.startsWith('rose:')) {
        const sensorRef = item.sensorDb.substring('rose:'.length);
        // loadRosePlot(chartId, `${API_BASE_URL}/${selectedStation.id}/WindRose/${sensorRef}?${count}&${start}`, item.period);
    } else if (item.sensorDb == 'Calc') {
        loadData(chartId, `${API_BASE_URL}/${selectedStation.id}/Raws/${item.dataNeeded.join(',')}?${count}&${start}`, item.period, item);
    } else {
        loadData(chartId, `${API_BASE_URL}/${selectedStation.id}/Raw/${item.sensorDb}?${count}&${start}`, item.period);
    }
}

function showConditionsStatus(message, type) {
    const statusEl = document.getElementById('status-bar');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = message ? 'block' : 'none';

    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    }
}

let dragKey = null;
let draggedDOMElement = null;

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
    const targetTile = e.target.closest('.condition-tile');
    if (!targetTile || targetTile === draggedDOMElement) return;
    
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    targetTile.classList.add('drag-over');
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

    allConditions.forEach((item, index) => item.customOrder = index);
    // console.log('[DND] New order after drop:', allConditions.map(item => `${item.key}: ${item.customOrder}`));
    saveCustomOrder();

    // Reorder the DOM element directly instead of a full redraw
    targetTile.parentNode.insertBefore(draggedDOMElement, targetTile);
}

function initDragAndDrop() {
    const container = document.getElementById('conditions-container');
    if (!container) return;
    container.classList.add('sortable');
    container.querySelectorAll('.condition-tile').forEach(tile => tile.setAttribute('draggable', 'true'));
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('dragend', handleDragEnd);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
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
}

document.addEventListener('DOMContentLoaded', () => {
    const contextMenu = document.getElementById('custom-context-menu');
    const compareMenuItem = document.getElementById('compare-selected');
    const container = document.getElementById('conditions-container');

    if (!container || !contextMenu || !compareMenuItem) {
        console.warn("Dashboard interaction elements not found.");
        return;
    }

    const clearSelection = () => {
        document.querySelectorAll('.condition-tile.selected').forEach(t => t.classList.remove('selected'));
        selectedTiles.clear();
    };

    const hideContextMenu = () => {
        contextMenu.style.display = 'none';
    };

    const handleTileClick = (event) => {
        const tile = event.target.closest('.condition-tile');
        if (!tile) return;

        if (event.ctrlKey) {
            event.preventDefault(); // Prevent link navigation on Ctrl+click
            const key = tile.dataset.key;
            if (selectedTiles.has(key)) {
                selectedTiles.delete(key);
                tile.classList.remove('selected');
            } else {
                selectedTiles.add(key);
                tile.classList.add('selected');
            }
        } else {
            // On a normal click, if the tile is not selected, clear the previous selection.
            if (!tile.classList.contains('selected')) {
                clearSelection();
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

    container.addEventListener('click', handleTileClick);
    container.addEventListener('contextmenu', handleContextMenu);
    compareMenuItem.addEventListener('click', compareSelectedItems);

    window.addEventListener('click', () => hideContextMenu());
    document.addEventListener('keydown', (e) => e.key === 'Escape' && (clearSelection(), hideContextMenu()));
});