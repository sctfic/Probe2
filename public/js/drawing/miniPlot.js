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
    // console.log(period);
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
// console.log(data, metadata, id, period);

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
        // console.log(metadata, chartDiv.clientWidth, chartDiv.clientHeight);
        const plot = Plot.plot({
            width: chartDiv.clientWidth,
            height: chartDiv.clientHeight || 100,
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
                    ? [0, d3.max(data, d => d.Value)] 
                    : d3.extent(data, d => d.Value)
            },
            marks: [
                Plot.lineY(data, {
                    x: "Date", y: "Value", z: "series", stroke: "series",
                    curve: metadata.measurement === 'rain' ? "step" : "monotone-x"
                }),
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
