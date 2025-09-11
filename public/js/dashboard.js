// Variables for dashboard section
let currentConditionsData = null;
let allConditions = []; // Stores all conditions without filter
let dbSensorList = null;
let previousValues = {};

// --- Dashboard Section: Current Conditions ---

function mergeData(data) {
    if (data.data['SUN.calc']) {

        if (data.data.sunrise && data.data.sunset) {
            console.log(data.data.sunrise, data.data.sunset)
            const sunrise = data.data.sunrise;
            const fn1 = eval(sunrise.toUserUnit);
            const sunset = data.data.sunset;
            const fn2 = eval(sunset.toUserUnit);

            data.data['SUN.calc'].Value = fn1(sunrise.Value) + ' - ' + fn2(sunset.Value);
            delete data.data.sunrise;
            delete data.data.sunset;
        }
    }
    if (data.data['THSW.calc']) {
        data.data['THSW.calc'].Value = data.data['THSW'].Value;
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

    let data;
    try {
        try {
            // Create an array of promises for each API call
            const promises = [
                fetch(`/api/station/${selectedStation.id}/current-conditions`, { cache: 'no-cache' }),
                fetch(`/api/station/${selectedStation.id}/additional-conditions`, { cache: 'no-cache' }),
                fetch(`/query/${selectedStation.id}`)
            ];

            // Use Promise.all to wait for all three promises to resolve
            const [apiCurrent, apiAdditional, apiSensor] = await Promise.all(
                promises.map(p => p.catch(e => {
                    console.warn('Une des requêtes a échoué. Chargement des données de secours.', e.message);
                    // Return a rejected promise or a specific value to handle the error gracefully within Promise.all
                    return null;
                }))
            );

            // Handle the first response (current-conditions)
            if (apiCurrent && apiCurrent.ok) {
                data = await apiCurrent.json();
                console.log('data', data);
            } else {
                console.warn('La requête pour les conditions actuelles a échoué. Chargement des données de secours.');
                const mockResponse = await fetch(`/mock/station/current-conditions.json`);
                if (mockResponse.ok) {
                    data = await mockResponse.json();
                } else {
                    console.error('Erreur lors du chargement des données de secours.');
                }
            }

            // Handle the second response (add-conditions)
            if (apiAdditional && apiAdditional.ok) {
                const additionalData = await apiAdditional.json();
                console.log('additionalData', additionalData.data);
                data.data = { ...data.data, ...additionalData.data }; // Merge data
            } else {
                console.warn('La requête pour les conditions additionnelles a échoué. Aucune donnée additionnelle ne sera ajoutée.');
            }

            // Handle the third response (query)
            if (apiSensor && apiSensor.ok) {
                dbSensorList = await apiSensor.json();
                console.log('dbSensorList', dbSensorList);
            } else {
                console.error('Erreur de récupération des _field');
            }
        } catch (error) {
            console.error('Erreur irrécupérable lors de la récupération des données:', error);
            // Handle global error if something unexpected happens
        }
        data = mergeData(data);

        if (data.success && data.data) {
            currentConditionsData = data.data;
            processAndDisplayConditions();
            showConditionsStatus('Données actualisées avec succès', 'success');
        } else {
            throw new Error('Format de données invalide');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showConditionsStatus(`Erreur: ${error.message}`, 'error');
        const conditionsList = document.getElementById('conditions-list');
        if (conditionsList) conditionsList.innerHTML = '';
    }
}

function processAndDisplayConditions() {
    if (!currentConditionsData) return;

    // Initialiser les valeurs précédentes si c'est le premier chargement
    if (Object.keys(previousValues).length === 0) {
        initializePreviousValues();
    }

    // Convertir les données en tableau et exclure certains champs
    const excludeKeys = ['datagramme', 'timestamp'];
    allConditions = Object.entries(currentConditionsData)
        .filter(([key]) => !excludeKeys.includes(key))
        .map(([key, data]) => {
            const sensorInfo = sensorMap[key] || {};
            return {
                key,
                name: sensorInfo.label || data.label,
                unit: data.Unit,
                value: data.Value,
                fnToUserUnit: data.toUserUnit,
                userUnit: data.userUnit,
                measurement: sensorInfo.measurement || 'unknown',
                groupUsage: sensorInfo.groupUsage || '0',
                groupCustom: sensorInfo.groupCustom || 0,
                period: sensorInfo.period || '3d',
                sensorDb: sensorInfo.sensorDb || key,
                searchText: [sensorInfo.label, key, data.label, String(data.Value), data.unit, sensorInfo.sensorDb, sensorInfo.measurement].join(' ').toLowerCase()
            };
        });

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
    
    if (groupBy === 'none') {
        reorganizeConditionsList();
    } else {
        reorganizeConditionsGrouped(groupBy);
    }
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
                    // Charger le graphique pour cette nouvelle tuile
                    setTimeout(() => {
                        if (item.sensorDb) {
                            const chartId = `chart_${item.key}`;
                            const param = `stepCount=${item.measurement === 'rain' ? 24 : 246}&startDate=${getStartDate(item.period)}`;
                            loadData(chartId, `${API_BASE_URL}/${selectedStation.id}/Raw/${item.sensorDb}?${param}`, item.period);
                        }
                    }, 50);
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
            grid.appendChild(existingTiles[item.key]);
        } else {
            // Créer une nouvelle tuile
            const tileElement = document.createElement('div');
            tileElement.innerHTML = createConditionTileHTML(item);
            grid.appendChild(tileElement.firstElementChild);
            // Charger le graphique pour cette nouvelle tuile
            setTimeout(() => {
                if (item.sensorDb) {
                    const chartId = `chart_${item.key}`;
                    const param = `stepCount=${item.measurement === 'rain' ? 24 : 246}&startDate=${getStartDate(item.period)}`;
                    loadData(chartId, `${API_BASE_URL}/${selectedStation.id}/Raw/${item.sensorDb}?${param}`, item.period);
                }
            }, 50);
        }
    });
}

function getBatteryImageAndClass(batteryValue) {
   
    const value = parseFloat(batteryValue);
    console.log('batteryValue', batteryValue);
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
    console.log(`Niveau de batterie: ${level} (${className})`);
    return { image: `batterie-${level}.png`, className };
}

function createConditionTileHTML(item) {
    let displayValue = item.value;
    let metaInfo = '';
    let unitDisplay = item.userUnit ? `<span class="condition-unit">${item.userUnit}</span>` : '';
    const fn = eval(item.fnToUserUnit || 'x => x');
    
    let chartContent = '';
    if (item.key === 'ForecastNum') {
        console.log(displayValue);
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
            <div class="condition-tile" data-key="${item.key}">
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
    <div class="condition-tile" data-key="${item.key}">
        <a href="draw.html?station=${selectedStation.id}&sensor=${item.sensorDb}" class="tile-link" title="Voir le détail du capteur ${item.name}">
            <div class="condition-content">
                <div class="condition-info">
                    <div class="condition-name">${item.name}</div>
                    <div class="condition-value">
                        ${fn(displayValue)} ${unitDisplay}
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

    allConditions.forEach(item => {
        if (item.sensorDb) {
            const chartId = `chart_${item.key}`;
            const param = `stepCount=${item.measurement === 'rain' ? 24 : 246}&startDate=${getStartDate(item.period)}`;
            loadData(chartId, `${API_BASE_URL}/${selectedStation.id}/Raw/${item.sensorDb}?${param}`, item.period);
        }
    });
    console.log(requestCache);
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