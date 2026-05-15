// Probe\public\js\drawing\miniPlot.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

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

function renderPlot(id) {
    const state = plotStates[id];
    if (!state) return;

    const { data, metadata, period } = state;
    const chartDiv = document.getElementById(id);
    if (!chartDiv) return;

    // Calcul de la taille des labels Y pour ajuster la marge
    const extent = d3.extent(data, d => d.Value);
    const yLabelSize = (Math.abs(extent[0]) > 1 && Math.abs(extent[1]) > 1) ?
        d3.max(extent, d => Math.round(d).toString().length + 1) * 7 + 8 :
        d3.max(extent, d => Math.round(d, 1).toString().length + 1) * 7 + 8;

    const width = chartDiv.clientWidth || 240;
    const height = chartDiv.clientHeight || 100;

    const now = new Date();
    const forecastColor = "var(--futuristic-magenta)";
    const gradientId = `forecast-gradient-${id}-${Math.floor(Math.random() * 1000000)}`;

    const pastData = data.filter(d => d.Date <= now);
    let futureData = data.filter(d => d.Date > now);

    if (pastData.length > 0 && futureData.length > 0) {
        futureData = [pastData[pastData.length - 1], ...futureData];
    }

    let gradientStops = "";
    if (futureData.length > 1) {
        const minTime = futureData[0].Date.getTime();
        const maxTime = futureData[futureData.length - 1].Date.getTime();
        const duration = maxTime - minTime;
        const fadeDuration = 14 * 24 * 3600 * 1000;

        gradientStops += `<stop offset="0%" stop-color="${forecastColor}" stop-opacity=".8" />`;

        if (duration > 0) {
            const ratio = fadeDuration / duration;
            if (ratio >= 1) {
                const endOpacity = 0.8 - (duration / fadeDuration) * (0.8 - 0.3);
                gradientStops += `<stop offset="100%" stop-color="${forecastColor}" stop-opacity="${endOpacity.toFixed(2)}" />`;
            } else {
                const pct = (ratio * 100).toFixed(1);
                gradientStops += `<stop offset="${pct}%" stop-color="${forecastColor}" stop-opacity="0.3" />`;
                gradientStops += `<stop offset="100%" stop-color="${forecastColor}" stop-opacity="0.3" />`;
            }
        } else {
            gradientStops += `<stop offset="100%" stop-color="${forecastColor}" stop-opacity="1" />`;
        }
    }

    try {
        const plot = Plot.plot({
            width: width - yLabelSize - 2,
            height: height - 17 - 16,
            marginLeft: 2,
            marginRight: yLabelSize,
            marginTop: 16,
            marginBottom: 17,
            x: {
                type: "time",
                tickFormat: "%d/%m %H:%M",
                tickSize: 2,
                domain: d3.extent(data, d => d.Date)
            },
            y: {
                label: null,
                type: "linear",
                axis: "right",
                grid: true,
                nice: true,
                tickSize: 2,
                domain: metadata.measurement === 'rain'
                    ? [0, d3.max(data, d => d.Value)]
                    : extent
            },
            marks: [
                Plot.differenceY(pastData, Plot.shiftX(`+${period}`, {
                    x: "Date",
                    y: "Value",
                    stroke: "var(--futuristic-cyan)",
                    positiveFill: "var(--futuristic-magenta-shadow)",
                    negativeFill: "var(--futuristic-cyan-shadow)",
                    fillOpacity: 0.4,
                    curve: metadata.measurement === 'rain' ? "step" : "monotone-x",
                })),
                Plot.differenceY(futureData, Plot.shiftX(`+${period}`, {
                    x: "Date",
                    y: "Value",
                    stroke: futureData.length > 1 ? `url(#${gradientId})` : forecastColor,
                    positiveFill: "var(--futuristic-magenta-shadow)",
                    negativeFill: "var(--futuristic-cyan-shadow)",
                    fillOpacity: 0.2,
                    fill: futureData.length > 1 ? `url(#${gradientId})` : forecastColor,
                    curve: metadata.measurement === 'rain' ? "step" : "monotone-x",
                })),
                Plot.dot(data, Plot.pointerX({ x: "Date", y: "Value", stroke: "red" })),
                Plot.text(data, Plot.pointerX({
                    px: "Date", py: "Value", dy: -16, dx: (yLabelSize - 4),
                    frameAnchor: "top-right",
                    fontVariant: "tabular-nums",
                    fontSize: 9,
                    text: (d) => ` ${d.Value} ${metadata.userUnit}`
                })),
                Plot.text(data, Plot.pointerX({
                    px: "Date", py: "Value", dy: -16,
                    frameAnchor: "top-left",
                    fontVariant: "tabular-nums",
                    fontSize: 9,
                    text: (d) => `${d.Date.toLocaleString('fr-FR', { 'dateStyle': "medium", 'timeStyle': "short" })} `
                }))
            ]
        });

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

        // S'assurer que le SVG remplit le conteneur
        const svgElement = chartDiv.querySelector('svg');
        if (svgElement) {
            svgElement.style.width = '100%';
            svgElement.style.height = '100%';
            svgElement.style.display = 'block';
        }

    } catch (error) {
        console.error('Erreur lors de la création du graphique:', error);
        chartDiv.innerHTML = `<div class="error-message">Erreur: ${error.message}</div>`;
    }
}

function createPlot(data, metadata, id, period) {
    if (typeof period !== 'number') {
        period = '0 day';
    } else if (period < 86400) {
        period = '1 hour';
    } else {
        period = '1 day';
    }

    const chartDiv = document.getElementById(id);
    if (!chartDiv) return;

    // Sauvegarde de l'état pour redessin
    plotStates[id] = { data, metadata, period };

    // Initialisation du ResizeObserver si pas déjà fait
    if (!chartDiv._resizeObserver) {
        chartDiv._resizeObserver = new ResizeObserver(entries => {
            // Utiliser requestAnimationFrame pour éviter les erreurs "ResizeObserver loop limit exceeded"
            requestAnimationFrame(() => {
                if (document.getElementById(id)) {
                    renderPlot(id);
                }
            });
        });
        chartDiv._resizeObserver.observe(chartDiv);
    }

    renderPlot(id);
}

async function loadData(id, url, period, item = null) {
    const loadingText = document.getElementById('loadingText');
    try {
        // Utiliser la fonction de fetch avec cache
        const apiResponse = await queryManager.query(url);
        // Transformation et affichage
        const plotData = transformDataForPlot(apiResponse.data, apiResponse.metadata);
        // console.log(apiResponse.metadata.sensor);
        createPlot(plotData, apiResponse.metadata, id, period);
    } catch (error) {
        // console.error('Erreur lors du chargement:', error);
        // console.error('URL:', url);
    }
}