// js/miniVectors.js - to create small vector plots for the dashboard.
// Assumes that miniPlot.js is loaded first to use its caching functions.

/**
 * Creates a vector plot using D3.js.
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
    
    // Récupération du capteur de vitesse depuis metadata.measurement.speed
    const speedSensor = metadata.measurement.speed[0]; // ex: "speed:Wind"
    const unit = metadata.toUserUnit[speedSensor].userUnit;
    const fn = eval(metadata.toUserUnit[speedSensor].fnFromMetric);

    if (data.length === 0) {
        chartDiv.innerHTML = `<div class="error-message">No data!</div>`;
        return;
    }

    // Dimensions et marges
    const margin = {top: 16, right: 25, bottom: 17, left: 25};
    const width = chartDiv.clientWidth;
    const height = chartDiv.clientHeight || 100;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Préparation des données
    // Inversion des vecteurs (-Ux, -Vy) car Ux/Vy représentent la provenance du vent
    // Conversion de spd en userUnit
    const processedData = data.map(d => ({
        date: new Date(d.d),
        Ux: -(d.Ux || 0),  // Inversion pour afficher la direction
        Vy: -(d.Vy || 0),  // Inversion pour afficher la direction
        spd: fn(d.spd || 0), // Conversion en userUnit
        spdOriginal: d.spd || 0, // Garder la valeur originale pour le calcul de maxSpeed
        dir: d.dir || 0
    }));
    // Scales
    const xScale = d3.scaleTime()
        .domain(d3.extent(processedData, d => d.date))
        .range([0, innerWidth]);

    // Utiliser la projection Verticale Vy (*0.9 pour voir le ArrowHead) pour calculer le domaine Y
    const maxSpeed = d3.max(processedData, d => d.Vy) || 1;
    const minSpeed = d3.min(processedData, d => d.Vy) || -1;
    const yScale = d3.scaleLinear()
        .domain([minSpeed, maxSpeed])
        .range([innerHeight, 0]);

    // Coefficient pour proportionnalité des vecteurs
    const coef = (yScale.range()[0] - yScale.range()[1]) / (yScale.domain()[1] - yScale.domain()[0]);
console.log(coef, 'maxSpeed', maxSpeed);
    // X-Axis
    const xAxis = d3.axisBottom(xScale)
        .ticks(3)
        .tickFormat(d3.timeFormat("%d/%m"))
        .tickSize(4);

    try {
        // Clear previous content
        chartDiv.innerHTML = '';

        // Create SVG
        const svg = d3.select(chartDiv)
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Defs for arrow markers
        const defs = svg.append("defs");

        // Normal arrow
        defs.append("marker")
            .attr("id", `arrowhead-${id}`)
            .attr("refX", 2)
            .attr("refY", 0)
            .attr("viewBox", "-5 -5 12 10")
            .attr("markerUnits", "strokeWidth")
            .attr("markerWidth", 6)
            .attr("markerHeight", 12)
            .attr("orient", "auto")
            .append("polygon")
            .attr("stroke", "#3498db")
            .attr("fill", "#3498db")
            .attr("points", "0,0 -2.5,-2.5 5,0 -2.5,2.5");

        // Hover arrow
        defs.append("marker")
            .attr("id", `arrowheadHover-${id}`)
            .attr("refX", 2)
            .attr("refY", 0)
            .attr("viewBox", "-5 -5 12 10")
            .attr("markerUnits", "strokeWidth")
            .attr("markerWidth", 6)
            .attr("markerHeight", 12)
            .attr("orient", "auto")
            .append("polygon")
            .attr("stroke", "#e74c3c")
            .attr("fill", "#e74c3c")
            .attr("points", "0,0 -2.5,-2.5 5,0 -2.5,2.5");

        // Main group
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Ligne horizontale à y=0
        g.append("line")
            .attr("class", "zero-line")
            .attr("x1", 0)
            .attr("y1", yScale(0))
            .attr("x2", innerWidth)
            .attr("y2", yScale(0))
            .attr("stroke", "#000")
            .attr("stroke-width", 1);

        // X-Axis
        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${yScale(0)})`)
            .call(xAxis);

        // Text labels pour date (top-left) et valeurs (top-right)
        const dateText = g.append("text")
            .attr("class", "hover-date")
            .attr("x", 0)
            .attr("y", -5)
            .attr("text-anchor", "start")
            .attr("font-size", "10px")
            .attr("font-variant", "tabular-nums")
            .attr("fill", "#e74c3c")
            .style("opacity", 0);

        const valueText = g.append("text")
            .attr("class", "hover-value")
            .attr("x", innerWidth)
            .attr("y", -5)
            .attr("text-anchor", "end")
            .attr("font-size", "10px")
            .attr("font-variant", "tabular-nums")
            .attr("fill", "#e74c3c")
            .style("opacity", 0);

        // Arrow groups - filtrer sur spdOriginal car on doit comparer en m/s
        const arrows = g.selectAll(".arrow")
            .data(processedData.filter(d => d.spdOriginal > 0.01))
            .enter()
            .append("g")
            .attr("class", "arrow");

        // Invisible hit area (pour hover)
        arrows.append("line")
            .attr("class", "hair-hit")
            .attr("x1", d => xScale(d.date))
            .attr("y1", yScale(0))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy))
            .attr("stroke", "transparent")
            .attr("stroke-width", 5);

        // Visible arrow
        arrows.append("line")
            .attr("class", "hair")
            .attr("x1", d => xScale(d.date))
            .attr("y1", yScale(0))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy))
            .attr("stroke", "#3498db")
            .attr("stroke-width", 1)
            .attr("marker-end", `url(#arrowhead-${id})`);

        // Hover effects
        arrows
            .on("mouseover", function(event, d) {
                d3.select(this).select(".hair")
                    .attr("stroke", "#e74c3c")
                    .attr("stroke-width", 2)
                    .attr("marker-end", `url(#arrowheadHover-${id})`);
                
                const dateStr = d.date.toLocaleString('fr-FR', {
                    dateStyle: "medium",
                    timeStyle: "short"
                });
                
                dateText
                    .text(dateStr)
                    .transition()
                    .duration(100)
                    .style("opacity", 1);
                
                valueText
                    .text(`${d.spd} ${unit}\n${d.dir}°`)
                    .transition()
                    .duration(100)
                    .style("opacity", 1);
            })
            .on("mouseout", function() {
                d3.select(this).select(".hair")
                    .attr("stroke", "#3498db")
                    .attr("stroke-width", 1)
                    .attr("marker-end", `url(#arrowhead-${id})`);
                
                dateText
                    .transition()
                    .duration(1600)
                    .style("opacity", 0);
                
                valueText
                    .transition()
                    .duration(1600)
                    .style("opacity", 0);
            });

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