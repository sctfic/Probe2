// miniPlot.js
// Stocke l'état actuel (données, métadonnées, options) de chaque graphique affiché
const plotStates = {};

function formatIsoDate(date) {
    return date.toISOString().split('T')[0];
}

function transformDataForPlot(apiData, metadata) {
    const convert = eval(metadata.toUserUnit);
    return apiData.map(raw => ({
        Date: new Date(raw.d),
        Value: convert(raw.v)
    })).filter(item => !isNaN(item.Value) && item.Value !== null);
}

function createPlot(data, metadata, id, period) {
    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        return;
    }
    if (data.length === 0) {
        chartDiv.innerHTML = `<div class="error-message">No data!</div>`;
        return;
    }
    if (typeof period !== 'number') { // gere le decalage
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
    const now = new Date();
    const forecastColor = "#9b59b6"; // Couleur violette pour le forecast
    // Création d'un ID unique pour le gradient afin d'éviter les conflits si plusieurs graphes sont affichés
    const gradientId = `forecast-gradient-${id}-${Math.floor(Math.random() * 1000000)}`;

    // 1. Séparation des données : Passé vs Futur
    const pastData = data.filter(d => d.Date <= now);
    
    // Pour le futur, on récupère les données > now
    let futureData = data.filter(d => d.Date > now);
    
    // Pour assurer la continuité graphique sans coupure, on ajoute le dernier point du passé au début du futur
    if (pastData.length > 0 && futureData.length > 0) {
        futureData = [pastData[pastData.length - 1], ...futureData];
    }

    // 2. Calcul des paramètres du gradient (Stops)
    let gradientStops = "";
    if (futureData.length > 1) {
        const minTime = futureData[0].Date.getTime();
        const maxTime = futureData[futureData.length - 1].Date.getTime();
        const duration = maxTime - minTime;
        const fadeDuration = 14 * 24 * 3600 * 1000; // 14 jours en ms

        // Point de départ (Now) : Opacité 1
        gradientStops += `<stop offset="0%" stop-color="${forecastColor}" stop-opacity=".8" />`;

        if (duration > 0) {
            const ratio = fadeDuration / duration; // Proportion des 14 jours par rapport à la durée affichée du forecast

            if (ratio >= 1) {
                // Si la durée affichée est inférieure à 14 jours, l'opacité finale est interpolée
                const endOpacity = 0.8 - (duration / fadeDuration) * (0.8 - 0.3);
                gradientStops += `<stop offset="100%" stop-color="${forecastColor}" stop-opacity="${endOpacity.toFixed(2)}" />`;
            } else {
                // Si la durée affichée dépasse 14 jours
                const pct = (ratio * 100).toFixed(1);
                gradientStops += `<stop offset="${pct}%" stop-color="${forecastColor}" stop-opacity="0.3" />`;
                gradientStops += `<stop offset="100%" stop-color="${forecastColor}" stop-opacity="0.3" />`;
            }
        } else {
            gradientStops += `<stop offset="100%" stop-color="${forecastColor}" stop-opacity="1" />`;
        }
    }

    try {
        // console.log( chartDiv, chartDiv.clientWidth, chartDiv.clientHeight, chartDiv.getBoundingClientRect());
        const plot = Plot.plot({
            width: chartDiv.clientWidth || 240, // permet de generer le chart hors écran
            height: chartDiv.clientHeight || 100, // permet de generer le chart hors écran
            marginLeft: 0,
            marginTop: 16,
            marginBottom: 17,
            x: {
                type: "time",
                tickFormat: "%d/%m %H:%M",
                // FIX: On force le domaine X à correspondre exactement aux données (Past + Future)
                // Cela empêche le graphique de s'étendre pour inclure le shift (qui poussait futureData à droite)
                domain: d3.extent(data, d => d.Date)
            },
            y: {
                label: null, 
                type: "linear",
                axis: "right", 
                grid: true, 
                nice: true,
                domain: metadata.measurement === 'rain' 
                    ? [0, d3.max(data, d => d.Value)] 
                    : d3.extent(data, d => d.Value)
            },
            marks: [
                // --- DIFFERENCE (Passé) ---
                // Utilise les couleurs standard (Bleu / Rouge / Vert)
                // Note: lineY retiré car differenceY gère le stroke
                Plot.differenceY(pastData, Plot.shiftX(`+${period}`, {
                        x: "Date",
                        y: "Value",
                        stroke: "#3397d1", // Ou "series" si disponible, ici gardé fixe ou paramétrable
                        positiveFill : "#FF6B6B",
                        negativeFill : "#0dec0d",
                        fillOpacity: 0.4,
                        curve: metadata.measurement === 'rain' ? "step" : "monotone-x",
                    }
                )),
                
                // --- DIFFERENCE (Futur) ---
                // Utilise le Gradient violet pour le trait (Stroke) ET le remplissage (Fill)
                Plot.differenceY(futureData, Plot.shiftX(`+${period}`, {
                        x: "Date",
                        y: "Value",
                        // Application du gradient sur le trait
                        stroke: futureData.length > 1 ? `url(#${gradientId})` : forecastColor,
                        positiveFill : "#FF6B6B",
                        negativeFill : "#0dec0d",
                        fillOpacity: 0.2,
                        // Application du gradient sur le remplissage (remplace pos/neg)
                        fill: futureData.length > 1 ? `url(#${gradientId})` : forecastColor, 
                        curve: metadata.measurement === 'rain' ? "step" : "monotone-x",
                    }
                )),

                // --- INTERACTION & TEXTE ---
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

        // 3. Injection manuelle du gradient dans le SVG généré
        if (futureData.length > 1) {
            const svg = plot.tagName.toLowerCase() === "svg" ? plot : plot.querySelector("svg");
            
            if (svg) {
                const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
                const linearGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
                
                linearGradient.setAttribute("id", gradientId);
                linearGradient.setAttribute("gradientUnits", "objectBoundingBox"); 
                linearGradient.setAttribute("x1", "0%");
                linearGradient.setAttribute("y1", "0%");
                linearGradient.setAttribute("x2", "100%");
                linearGradient.setAttribute("y2", "0%");
                
                linearGradient.innerHTML = gradientStops;
                
                defs.appendChild(linearGradient);
                svg.prepend(defs);
            }
        }
        
        chartDiv.innerHTML = '';
        chartDiv.appendChild(plot);
        
    } catch (error) {
        console.error('Erreur lors de la création du graphique:', error);
        chartDiv.innerHTML = `<div class="error-message">Erreur lors de la création du graphique: ${error.message}</div>`;
    }
}

async function loadData(id, url, period, item = null) {
    const loadingText = document.getElementById('loadingText');
    try {
        // Utiliser la fonction de fetch avec cache
        const apiResponse = await fetchWithCache(url);
        // Transformation et affichage
        const plotData = transformDataForPlot(apiResponse.data, apiResponse.metadata);
        // console.log(apiResponse.metadata.sensor);
        createPlot(plotData, apiResponse.metadata, id, period);
    } catch (error) {
        // console.error('Erreur lors du chargement:', error);
        // console.error('URL:', url);
    }
}