// Configuration globale
// const CACHE_DURATION = 10000; // 10 secondes en millisecondes

// Cache pour stocker les promesses et les réponses
// const requestCache = new Map();

// Stocke l'état actuel (données, métadonnées, options) de chaque graphique affiché
// const plotStates = {};

// function formatIsoDate(date) {
//     return date.toISOString().split('T')[0];
// }

function transformDataForPlots(apiData, metadata) {
    // Transformer les données pour chaque capteur
    const transformedData = [];
    
    apiData.forEach(raw => {
        const date = new Date(raw.d);
        
        // Pour chaque capteur dans les métadonnées
        metadata.sensor.forEach(sensorKey => {
            if (raw[sensorKey] !== undefined && raw[sensorKey] !== null) {
                const convertFn = eval(metadata.toUserUnit[sensorKey].fnFromMetric);
                const convertedValue = convertFn(raw[sensorKey]);
                
                if (!isNaN(convertedValue)) {
                    transformedData.push({
                        Date: date,
                        Value: convertedValue,
                        Sensor: sensorKey,
                        Unit: metadata.toUserUnit[sensorKey].userUnit,
                        MeasurementType: sensorKey.split(':')[0] // température, rain, etc.
                    });
                }
            }
        });
    });
    
    return transformedData;
}

function createPlots(data, metadata, id, period) {
    if (typeof period !== 'number') {
        period = '0 day';
    } else if(period <= 24*3600) {
        period = '1 hour';
    } else if (period <= 24*3600*7) {
        period = '1 day';
    } else if (period <= 24*3600*31) {
        period = '1 day';
    } else if (period <= 24*3600*365) {
        period = '1 day';
    } else {
        period = '1 day';
    }

    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        console.error(`Div avec l'ID ${id} non trouvée`);
        return;
    }
    if (data.length === 0) {
        chartDiv.innerHTML = `<div class="error-message">No data!</div>`;
        return;
    }

    try {
        // Grouper les données par capteur
        const sensorGroups = d3.group(data, d => d.Sensor);
        
        // Créer les marques pour chaque capteur
        const marks = [];
        
        sensorGroups.forEach((sensorData, sensorKey) => {
            const measurementType = sensorKey.split(':')[0];
            const isRain = measurementType === 'rain';
            const curve = isRain ? "step" : "monotone-x";
            
            // Ligne principale pour ce capteur
            marks.push(
                Plot.lineY(sensorData, {
                    x: "Date", 
                    y: "Value", 
                    stroke: sensorKey,
                    curve: curve,
                    strokeWidth: 2
                })
            );
            
            // Différence avec période décalée
            marks.push(
                Plot.differenceY(sensorData, Plot.shiftX(`+${period}`, {
                    x: "Date",
                    y: "Value",
                    stroke: sensorKey,
                    positiveFill: "#FF6B6B",
                    negativeFill: "#98FB98",
                    fillOpacity: 0.3,
                    curve: curve,
                }))
            );
            
            // Point interactif
            marks.push(
                Plot.dot(sensorData, Plot.pointerX({
                    x: "Date", 
                    y: "Value", 
                    stroke: sensorKey,
                    r: 4
                }))
            );
            
            // Texte avec valeur
            marks.push(
                Plot.text(sensorData, Plot.pointerX({
                    px: "Date", 
                    py: "Value", 
                    dy: -16, 
                    dx: 30,
                    frameAnchor: "top-right",
                    fontVariant: "tabular-nums",
                    text: (d) => `${d.Value} ${d.Unit}`,
                    fill: sensorKey
                }))
            );
            
            // Texte avec date/heure
            marks.push(
                Plot.text(sensorData, Plot.pointerX({
                    px: "Date", 
                    py: "Value", 
                    dy: -32,
                    frameAnchor: "top-left",
                    fontVariant: "tabular-nums",
                    text: (d) => `${d.Date.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})} - ${d.Sensor}`,
                    fill: sensorKey
                }))
            );
        });

        // Calculer le domaine Y global pour tous les capteurs
        const allValues = data.map(d => d.Value);
        const yDomain = d3.extent(allValues);
        
        // Ajuster le domaine pour les données de pluie
        const hasRain = data.some(d => d.MeasurementType === 'rain');
        const finalYDomain = hasRain && yDomain[0] >= 0 ? [0, yDomain[1]] : yDomain;

        const plot = Plot.plot({
            width: chartDiv.clientWidth,
            height: chartDiv.clientHeight || 400, // Augmenter la hauteur pour plusieurs courbes
            marginLeft: 60,
            marginTop: 40,
            marginBottom: 40,
            marginRight: 60,
            x: {
                type: "time",
                tickFormat: "%d/%m %H:%M",
                label: "Date"
            },
            y: {
                label: "Valeurs", 
                type: "linear",
                axis: "left", 
                grid: true, 
                nice: true,
                domain: finalYDomain
            },
            color: {
                type: "categorical",
                scheme: "category10",
                legend: true
            },
            marks: marks
        });
        
        chartDiv.innerHTML = '';
        chartDiv.appendChild(plot);
        
    } catch (error) {
        console.error('Erreur lors de la création du graphique:', error);
        chartDiv.innerHTML = `<div class="error-message">Erreur lors de la création du graphique: ${error.message}</div>`;
    }
}

// function cleanCache() {
//     const now = Date.now();
//     for (const [url, cached] of requestCache.entries()) {
//         // Ne nettoyer que les entrées résolues et expirées
//         if (cached.status === 'resolved' && now - cached.timestamp > CACHE_DURATION) {
//             requestCache.delete(url);
//             // console.log(`Cache cleaned for: ${url}`);
//         }
//     }
// }

// async function fetchWithCache(url) {
//     const now = Date.now();
//     const cached = requestCache.get(url);
    
//     // Si on a une entrée en cache
//     if (cached) {
//         const age = now - cached.timestamp;
        
//         // Si c'est une promesse en cours (pending), on la retourne
//         if (cached.status === 'pending') {
//             // console.log(`Request already pending for: ${url}`);
//             return cached.promise;
//         }
        
//         // Si c'est une réponse valide et non expirée, on la retourne
//         if (cached.status === 'resolved' && age < CACHE_DURATION) {
//             // console.log(`Cache hit for: ${url} (age: ${Math.round(age/1000)}s)`);
//             return Promise.resolve(cached.data);
//         }
        
//         // Si expirée, on la supprime
//         if (cached.status === 'resolved' && age >= CACHE_DURATION) {
//             requestCache.delete(url);
//         }
//     }
    
//     // Créer une nouvelle promesse pour cette requête
//     // console.log(`Starting new request for: ${url}`);
    
//     const fetchPromise = fetch(url)
//         .then(async response => {
//             if (!response.ok) {
//                 throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
//             }
            
//             const apiResponse = await response.json();
            
//             if (!apiResponse.success) {
//                 throw new Error(apiResponse.message || 'Erreur inconnue de l\'API');
//             }
//             // Mettre à jour le cache avec la réponse résolue
//             requestCache.set(url, {
//                 timestamp: Date.now(),
//                 status: 'resolved',
//                 data: apiResponse
//             });
            
//             // console.log(`Request completed and cached for: ${url}`);
//             return apiResponse;
//         })
//         .catch(error => {
//             // En cas d'erreur, supprimer l'entrée du cache
//             requestCache.delete(url);
//             throw error;
//         });
    
//     // Stocker immédiatement la promesse en cours
//     requestCache.set(url, {
//         timestamp: now,
//         status: 'pending',
//         promise: fetchPromise
//     });
    
//     return fetchPromise;
// }

async function loadDatas(id, url, period, item = null) {
    const loadingText = document.getElementById('loadingText');
    try {
        // Nettoyer périodiquement le cache
        cleanCache();
        
        // Utiliser la fonction de fetch avec cache
        const apiResponse = await fetchWithCache(url);
        // Transformation et affichage
        const plotData = transformDataForPlots(apiResponse.data, apiResponse.metadata);
        // console.log(apiResponse.metadata.sensor);
        createPlots(plotData, apiResponse.metadata, id, period);
    } catch (error) {
        // console.error('Erreur lors du chargement:', error);
        // console.error('URL:', url);
    }
}
// Optionnel : Nettoyer automatiquement le cache toutes les 60 seconde
setInterval(cleanCache, 60 * 1000);