// Configuration globale
const CACHE_DURATION = 10000; // 10 secondes en millisecondes

// Cache pour stocker les promesses et les réponses
const requestCache = new Map();

function formatIsoDate(date) {
    return date.toISOString().split('T')[0];
}

function transformDataForPlot(apiData, metadata) {
    const fn = eval(metadata.toUserUnit);
    return apiData.map(item => ({
        Date: new Date(item.d),
        Value: fn(item.v)
    })).filter(item => !isNaN(item.Value) && item.Value !== null);
}

function createPlot(data, metadata, id, period) {
    // console.log(period);
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
    // console.log(period);

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
        const plot = Plot.plot({
            width: 286,
            height: 100,
            marginLeft: 0,
            marginTop: 16,
            marginBottom: 17,
            x: {
                type: "time",
                tickFormat: "%d/%m %H:%M"
            },
            y: {
                label: null, 
                type: "linear",
                axis: "right", 
                grid: true, 
                nice: true,
                domain: metadata.measurement === 'rain' 
                    ? [0, Math.max(...data.map(d => d.Value))] 
                    : [Math.min(...data.map(d => d.Value)), Math.max(...data.map(d => d.Value))]
            },
            marks: [
                // Plot.lineY(data, {
                //     x: "Date", 
                //     y: "Value", 
                //     stroke: "#4dc0e0", 
                //     curve: metadata.measurement === 'rain' ? "step" : "monotone-x"
                // }),
                Plot.differenceY(data, Plot.shiftX(`+${period}`, {
                    x: "Date",
                    y: "Value",
                    stroke: "#4dc0e0",
                    positiveFill : "#FF6B6B",
                    negativeFill : "#98FB98",
                    fillOpacity: 0.6,
                    curve: metadata.measurement === 'rain' ? "step" : "monotone-x",
                })),
                Plot.dot(data, Plot.pointerX({x: "Date", y: "Value", stroke: "red"})),
                Plot.text(data, Plot.pointerX({
                    px: "Date", py: "Value", dy: -16, dx: 30,
                    frameAnchor: "top-right",
                    fontVariant: "tabular-nums",
                    text: (d) => ` ${d.Value} ${metadata.userUnit}`
                })),
                Plot.text(data, Plot.pointerX({
                    px: "Date", py: "Value", dy: -16,
                    frameAnchor: "top-left",
                    fontVariant: "tabular-nums",
                    text: (d) => `${d.Date.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})} ` //.toString('yyyy-MM-dd')
                }))
            ]
        });
        
        chartDiv.innerHTML = '';
        chartDiv.appendChild(plot);
        
    } catch (error) {
        console.error('Erreur lors de la création du graphique:', error);
        chartDiv.innerHTML = `<div class="error-message">Erreur lors de la création du graphique: ${error.message}</div>`;
    }
}

/**
 * Nettoie les entrées expirées du cache
 */
function cleanCache() {
    const now = Date.now();
    for (const [url, cached] of requestCache.entries()) {
        // Ne nettoyer que les entrées résolues et expirées
        if (cached.status === 'resolved' && now - cached.timestamp > CACHE_DURATION) {
            requestCache.delete(url);
            // console.log(`Cache cleaned for: ${url}`);
        }
    }
}

/**
 * Effectue la requête fetch et gère le cache
 */
async function fetchWithCache(url) {
    const now = Date.now();
    const cached = requestCache.get(url);
    
    // Si on a une entrée en cache
    if (cached) {
        const age = now - cached.timestamp;
        
        // Si c'est une promesse en cours (pending), on la retourne
        if (cached.status === 'pending') {
            // console.log(`Request already pending for: ${url}`);
            return cached.promise;
        }
        
        // Si c'est une réponse valide et non expirée, on la retourne
        if (cached.status === 'resolved' && age < CACHE_DURATION) {
            // console.log(`Cache hit for: ${url} (age: ${Math.round(age/1000)}s)`);
            return Promise.resolve(cached.data);
        }
        
        // Si expirée, on la supprime
        if (cached.status === 'resolved' && age >= CACHE_DURATION) {
            requestCache.delete(url);
        }
    }
    
    // Créer une nouvelle promesse pour cette requête
    // console.log(`Starting new request for: ${url}`);
    
    const fetchPromise = fetch(url)
        .then(async response => {
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
            }
            
            const apiResponse = await response.json();
            
            if (!apiResponse.success) {
                throw new Error(apiResponse.message || 'Erreur inconnue de l\'API');
            }
            // Mettre à jour le cache avec la réponse résolue
            requestCache.set(url, {
                timestamp: Date.now(),
                status: 'resolved',
                data: apiResponse
            });
            
            // console.log(`Request completed and cached for: ${url}`);
            return apiResponse;
        })
        .catch(error => {
            // En cas d'erreur, supprimer l'entrée du cache
            requestCache.delete(url);
            throw error;
        });
    
    // Stocker immédiatement la promesse en cours
    requestCache.set(url, {
        timestamp: now,
        status: 'pending',
        promise: fetchPromise
    });
    
    return fetchPromise;
}

/**
 * Charge les données depuis l'API avec gestion du cache
 */
async function loadData(id, url, period) {
    const loadingText = document.getElementById('loadingText');
    try {
        // Nettoyer périodiquement le cache
        cleanCache();
        
        // Utiliser la fonction de fetch avec cache
        const apiResponse = await fetchWithCache(url);
        
        // Transformation et affichage
        const plotData = transformDataForPlot(apiResponse.data, apiResponse.metadata);
        createPlot(plotData, apiResponse.metadata, id, period);
        
    } catch (error) {
        // console.error('Erreur lors du chargement:', error);
        // console.error('URL:', url);
    }
}

// Optionnel : Nettoyer automatiquement le cache toutes les minutes
setInterval(cleanCache, 3000);
