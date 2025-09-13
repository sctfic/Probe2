
// js/miniVectors.js - to create small vector plots for the dashboard.
// Assumes that miniPlot.js is loaded first to use its caching functions.

/**
 * Creates a vector plot using Observable Plot.
 * @param {object} data - The API response data.
 * @param {object} metadata - The metadata from the API response.
 * @param {string} id - The ID of the div container for the chart.
 */
function createVectorPlot(data, metadata, id) {
    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        console.error(`Div with ID ${id} not found`);
        return;
    }
    const unit = metadata.toUserUnit['speed:Gust'].userUnit;
    const fn = eval(metadata.toUserUnit['speed:Gust'].fnFromMetric);


    if (data.length === 0) {
        chartDiv.innerHTML = `<div class="error-message">No data!</div>`;
        return;
    }

    const maxSpeed = d3.max(data, d => d.spd) || 1;
    
    // Scale vector length to fit in the small chart
    const lengthScale = (100 / 1.5) / maxSpeed;

    try {
        const plot = Plot.plot({
            width: 286,
            height: 120,
            marginLeft: 0,
            marginTop: 16,
            marginBottom: 17,
            x: {
                type: "time",
                tickFormat: "%d/%m",
                ticks: 3
            },
            y: {
                domain: [-maxSpeed*0.8, maxSpeed*0.8],
                axis: null
            },
            marks: [
                Plot.ruleY([0], { strokeWidth: 1}),

                // Vecteurs de vent (flèches)
                Plot.vector(data.filter(d => d.spd > 0.01), {
                    anchor: "start",
                    x: 'd',
                    y: 0,
                    rotate: "dir",
                    length: d=>d.spd,
                    scale: lengthScale,
                    shape: "arrow",
                    stroke: '#3498db',
                    r: 1,
                    strokeWidth: 1
                }),
                // Vecteurs de vent (flèches)
                Plot.vector(data.filter(d => d.spd > 0.01), Plot.pointerX({
                    anchor: "start",
                    x: 'd',
                    y: 0,
                    rotate: "dir",
                    length: d=>d.spd,
                    scale: lengthScale,
                    shape: "arrow",
                    stroke: '#e74c3c',
                    r: 1,
                    strokeWidth: 2
                })),
                // Plot.crosshair(allData, {x: "date", y: "speed"}),
                // Pointers au survol
                Plot.text(data, Plot.pointerX({
                    px: "d", py: "spd", dy: -16,
                    frameAnchor: "top-right",
                    fontVariant: "tabular-nums",
                    text: (d) => ` ${fn(d.spd)} ${unit}\n${d.dir}°`
                })),
                
                Plot.text(data, Plot.pointerX({
                    px: "d", py: "spd", dy: -16,
                    frameAnchor: "top-left",
                    fontVariant: "tabular-nums",
                    text: (d) => `${d.d.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})} ` //.toString('yyyy-MM-dd')
                }))
            ]
        });
        
        chartDiv.innerHTML = '';
        chartDiv.appendChild(plot);
        
    } catch (error) {
        console.error('Error creating vector plot:', error);
        chartDiv.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

/**
 * Loads vector data from the API and creates a plot.
 * @param {string} id - The ID of the div container for the chart.
 * @param {string} url - The API URL to fetch data from.
 */
async function loadVectorPlot(id, url) {
    try {
        // fetchWithCache is assumed to be available from miniPlot.js
        cleanCache();
        const apiResponse = await fetchWithCache(url);
        createVectorPlot(apiResponse.data, apiResponse.metadata, id);
    } catch (error) {
        console.error('Error loading vector data:', error);
        const chartDiv = document.getElementById(id);
        if (chartDiv) {
            chartDiv.innerHTML = `<div class="error-message">Loading error</div>`;
        }
    }
}