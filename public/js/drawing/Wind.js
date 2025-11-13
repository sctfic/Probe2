// js/Wind.js - Graphique de vecteurs avec brush de zoom et Rose de vent

// =======================================
//  constuction de la Rose de vent
// =======================================

function createRosePlot(data, metadata, id) {
    const container = document.getElementById(id);
    if (!container) {
        console.error(`Container with id ${id} not found.`);
        return;
    }
    container.innerHTML = ''; // Clear previous content

    // Get speed conversion function and unit from metadata
    const speedSensorKey = metadata.measurement.speed?.[0]; // e.g., "speed:Wind"
    const speedUnit = speedSensorKey && metadata.toUserUnit[speedSensorKey]?.userUnit 
        ? metadata.toUserUnit[speedSensorKey].userUnit 
        : 'm/s';
    const speedConversionFn = speedSensorKey && metadata.toUserUnit[speedSensorKey]?.fnFromMetric 
        ? eval(metadata.toUserUnit[speedSensorKey].fnFromMetric) 
        : (v) => v;
    
    // Color scales
    const speedToColorScale = d3.scaleLinear()
        .domain([2, 10, 25, 100])
        .range(["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4"])
        .interpolate(d3.interpolateHsl);

    const probabilityToColorScale = d3.scaleLinear()
        .domain([0, 0.5, 0.8, 1])
        .range(["#AEC7E8", "#1F77B4", "#D62728", "#2C3539"])
        .interpolate(d3.interpolateHsl);

    function speedToColor(d) { return speedToColorScale(d.s); }
    function probabilityToColor(d) { return probabilityToColorScale(d.p); }

    // Utility functions
    function totalSpl(data) {
        return Object.values(data).reduce((sum, d) => sum + (d.Spl || 0), 0);
    }

    function arc(options) {
        return d3.arc()
            .startAngle(d => (d.d - options.width) * Math.PI / 180)
            .endAngle(d => (d.d + options.width) * Math.PI / 180)
            .innerRadius(options.from)
            .outerRadius(d => options.to(d));
    }

    function makeWindContainer(container, w, h, p) {
        return d3.select(container)
            .append("svg")
            .style("position", "relative")
            .attr("width", w + p)
            .attr("height", h + p)
            .append("g")
            .attr("transform", `translate(${(w + p) / 2}, ${(h + p) / 2})`);
    }

    function drawGrid(svg, ticks, scale) {
        svg.append("g")
            .attr("class", "axes")
            .selectAll("circle")
            .data(ticks)
            .enter().append("circle")
            .attr("r", scale);
    }

    function drawGridScale(svg, tickmarks, tickLabel, scale) {
        svg.append("g")
            .attr("class", "tickmarks")
            .selectAll("text")
            .data(tickmarks)
            .enter().append("text")
            .text(tickLabel)
            .attr("dy", "-3px")
            .attr("transform", d => `translate(0, ${-scale(d)})`);
    }

    function drawInfoText(svg, R, lines, align = 'end') {
        // Remove any existing info text to avoid overlap
        svg.select(".info-text").remove();

        const xPos = align === 'start' ? -R - 12 : R + 12;

        const textGroup = svg.append("g")
            .attr("class", "info-text")
            .attr("font-size", "11px")
            .attr("transform", `translate(${xPos}, ${-R-2})`)
            .attr("text-anchor", align);

        lines.forEach((line, i) => {
            textGroup.append("text")
                .attr("y", i * 11)
                .attr("fill", "#ccc")
                .text(line);
        });
    }

    function drawCalm(svg, radius, calmPercentage) {
        svg.append("circle")
            .attr("r", radius)
            .style("fill", "none")
            .style("stroke", "#fff")
            .style("stroke-width", "0.5px");

        const cw = svg.append("g").attr("class", "calmwind");
        
        cw.append("text")
            .attr("transform", "translate(0,-2)")
            .text(Math.round(calmPercentage * 100) + "%");
        
        cw.append("text")
            .attr("transform", "translate(0,12)")
            .text("calm");
    }

    function drawLevelGrid(svg, r) {
        const directions = ['NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW','N'];
        const label = svg.append("g")
            .attr("class", "labels")
            .selectAll("g")
            .data(d3.range(22.5, 361, 22.5))
            .enter().append("g")
            .attr("transform", d => `translate(0, ${-(r + 2)}) rotate(${d}, 0, ${r + 2})`);

        label.append("text")
            .data(directions)
            .attr("dy", "-2px")
            .text(d => d);
    }

    function plotProbabilityRose(data, container, R) {
        const winds = [];
        const t = totalSpl(data);
        const visWidth = R;
        const p = 22, r = visWidth, w = visWidth * 2, h = visWidth * 2;
        const ip = 28;

        const svg = makeWindContainer(container, w, h, p);

        let calm = 0;
        let maxProb = 0;
        for (const key in data) {
            if (key === 'Calm' || key === 'null') {
                calm = data[key].Spl;
            } else if (data[key].Dir !== null && data[key].Dir !== undefined) {
                const prob = t > 0 ? data[key].Spl / t : 0;
                if (prob > maxProb) maxProb = prob;
                winds.push({
                    d: data[key].Dir, p: prob,
                    s: speedConversionFn(data[key].Spd), m: speedConversionFn(data[key].Max)
                });
            }
        }

        const probabilityToRadiusScale = d3.scaleLinear().domain([0, maxProb]).range([ip, visWidth]).clamp(true);
        const tickStep = maxProb / 4;
        const ticks = d3.range(tickStep, tickStep * 4.001, tickStep);
        const tickmarks = d3.range(tickStep, tickStep * 3.001, tickStep);

        const windProbabilityArcOptions = {
            width: 10, from: ip - 2, to: d => probabilityToRadiusScale(d.p)
        };

        const arcGen = arc(windProbabilityArcOptions);
        const petals = svg.append("g").attr("class", "ProbabilityArc")
            .selectAll("path").data(winds).enter().append("path")
            .attr("d", arcGen).attr("class", "arcs").style("fill", speedToColor);

        drawGrid(svg, ticks, probabilityToRadiusScale);
        drawGridScale(svg, tickmarks, d => `${(d * 100).toFixed(0)} %`, probabilityToRadiusScale);
        drawCalm(svg, windProbabilityArcOptions.from, t > 0 ? calm / t : 0);
        drawLevelGrid(svg, r);
        // Zones invisibles pour le hover (20° par direction, de calm jusqu'à maxProb)
        const hoverArc = d3.arc()
            .startAngle(d => (d.d - 10) * Math.PI / 180)
            .endAngle(d => (d.d + 10) * Math.PI / 180)
            .innerRadius(ip - 2)
            .outerRadius(visWidth);

        const hoverZones = svg.append("g").attr("class", "hover-zones")
            .selectAll("path").data(winds).enter().append("path")
            .attr("d", hoverArc)
            .attr("class", "hover-zone")
            .style("fill", "transparent")
            .style("pointer-events", "all");

        hoverZones.on("mouseover", function(event, d) {
            // Mettre en valeur le pétale correspondant
            petals.filter(petal => petal.d === d.d)
                .transition()
                .duration(50)
                .style("fill-opacity", 0.9)
                .style("stroke-width", "2px")
                .style("stroke", "#ff6b6b");
            
            const infoLines = [`${(100 * d.p).toFixed(1)} %`, `${d.d}°`];
            drawInfoText(svg, r, infoLines);
        }).on("mouseout", function(event, d) {
            // Retirer la mise en valeur
            petals.filter(petal => petal.d === d.d)
                .transition()
                .duration(800)
                .style("fill-opacity", null)
                .style("stroke-width", null)
                .style("stroke", null);
            
            svg.select(".info-text").remove();
        });

    }

    function plotSpeedRose(data, container, R) {
        const winds = [];
        const t = totalSpl(data);
        const visWidth = R;
        const p = 22, r = visWidth, w = visWidth * 2, h = visWidth * 2;
        const ip = 28;

        const svg = makeWindContainer(container, w, h, p);
        
        let calm = 0;
        let maxSpdVal = 0;
        for (const key in data) {
            if (key === 'Calm' || key === 'null') {
                calm = data[key].Spl;
            } else if (data[key].Dir !== null && data[key].Dir !== undefined) {
                const maxSpeedUser = speedConversionFn(data[key].Max || 0);
                if (maxSpeedUser > maxSpdVal) maxSpdVal = maxSpeedUser;
                winds.push({
                    d: data[key].Dir, p: t > 0 ? data[key].Spl / t : 0,
                    s: speedConversionFn(data[key].Spd || 0), m: maxSpeedUser
                });
            }
        }

        const speedToRadiusScale = d3.scaleLinear().domain([0, maxSpdVal]).range([ip, visWidth]).clamp(true);
        const tickStep = maxSpdVal / 4;
        const ticks = d3.range(tickStep, tickStep * 4.001, tickStep);
        const tickmarks = d3.range(tickStep, tickStep * 3.001, tickStep);

        const windSpeedArcOptions = {
            width: 10, from: ip - 2, to: d => speedToRadiusScale(d.s)
        };

        // Pétales pour les rafales (gusts)
        const windGustArcOptions = {
            width: 9, from: ip - 2, to: d => speedToRadiusScale(d.m)
        };
        const gustArcGen = arc(windGustArcOptions);
        const gustPetals = svg.append("g").attr("class", "gustArc")
            .selectAll("path").data(winds).enter().append("path")
            .attr("d", gustArcGen)
            .attr("class", "arcs")
            .style("fill", d => d3.color(probabilityToColor(d)).darker(0.5))
            .style("fill-opacity", 0.4);

        const speedArcGen = arc(windSpeedArcOptions);
        const petals = svg.append("g").attr("class", "speedArc")
            .selectAll("path").data(winds).enter().append("path")
            .attr("d", speedArcGen)
            .attr("class", "arcs")
            .style("fill", probabilityToColor);

        drawGrid(svg, ticks, speedToRadiusScale);
        drawGridScale(svg, tickmarks, d => `${d.toFixed(1)} ${speedUnit}`, speedToRadiusScale);
        drawCalm(svg, windSpeedArcOptions.from, t > 0 ? calm / t : 0);
        drawLevelGrid(svg, r);
        // Zones invisibles pour le hover (20° par direction, de calm jusqu'à maxSpeed)
        const hoverArc = d3.arc()
            .startAngle(d => (d.d - 10) * Math.PI / 180)
            .endAngle(d => (d.d + 10) * Math.PI / 180)
            .innerRadius(ip - 2)
            .outerRadius(visWidth);

        const hoverZones = svg.append("g").attr("class", "hover-zones")
            .selectAll("path").data(winds).enter().append("path")
            .attr("d", hoverArc)
            .attr("class", "hover-zone")
            .style("fill", "transparent")
            .style("pointer-events", "all");

        hoverZones.on("mouseover", function(event, d) {
            // Mettre en valeur le pétale correspondant
            petals.filter(petal => petal.d === d.d)
                .transition()
                .duration(50)
                .style("fill-opacity", 0.9)
                .style("stroke-width", "2px")
                .style("stroke", "#ff6b6b");
            
            // Mettre en valeur le pétale de rafale correspondant
            gustPetals.filter(petal => petal.d === d.d)
                .transition()
                .duration(50)
                .style("fill-opacity", 0.7)
                .style("stroke", "#ff6b6b");
            
            const infoLines = [ `Rafale: ${d.m.toFixed(1)} ${speedUnit}`, `Moy: ${d.s.toFixed(1)} ${speedUnit}`,`${d.d}°`];
            drawInfoText(svg, r, infoLines);
        }).on("mouseout", function(event, d) {
            // Retirer la mise en valeur du pétale
            petals.filter(petal => petal.d === d.d)
                .transition()
                .duration(800)
                .style("fill-opacity", null)
                .style("stroke-width", null)
                .style("stroke", null);
            
            // Retirer la mise en valeur du pétale de rafale
            gustPetals.filter(petal => petal.d === d.d)
                .transition()
                .duration(800)
                .style("fill-opacity", 0.4)
                .style("stroke", null);
            svg.select(".info-text").remove();
        });

    }

    function convertApiData(apiData) {
        const result = {};
        for (const [dateStr, directions] of Object.entries(apiData)) {
            const converted = {};
            for (const [dir, values] of Object.entries(directions)) {
                if (dir === 'Calm' || dir === 'null') {
                    converted['Calm'] = {
                        Dir: null,
                        Spl: (values.wind?.c || 0) + (values.gust?.c || 0),
                        Spd: 0, Max: 0
                    };
                } else {
                    const dirMap = {
                        "N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5, "SE": 135, "SSE": 157.5,
                        "S": 180, "SSW": 202.5, "SW": 225, "WSW": 247.5, "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5
                    };
                    converted[dir] = {
                        Dir: dirMap[dir],
                        Spl: (values.wind?.c || 0) + (values.gust?.c || 0),
                        Spd: values.wind?.v || 0, Max: values.gust?.v || 0
                    };
                }
            }
            // Aggregate all data into a single structure
            for (const [dir, values] of Object.entries(converted)) {
                if (!result[dir]) {
                    result[dir] = { Dir: values.Dir, Spl: 0, Spd: 0, Max: 0, count: 0 };
                }
                result[dir].Spl += values.Spl;
                result[dir].Spd += values.Spd;
                result[dir].Max = Math.max(result[dir].Max, values.Max);
                result[dir].count++;
            }
        }

        // Average the speeds
        for (const dir in result) {
            if (result[dir].count > 0) {
                result[dir].Spd /= result[dir].count;
            }
        }
        return result;
    }

    const aggregatedData = convertApiData(data);

    const firstDate = new Date(metadata.first).toLocaleString('fr-FR', {dateStyle: "medium",timeStyle: "short",hour12: false});
    const lastDate = new Date(metadata.last).toLocaleString('fr-FR', {dateStyle: "medium",timeStyle: "short",hour12: false});

    // Create containers for the three charts
    container.innerHTML = `
        <div class="rose-container" id="prob-rose-container">
        </div>
        <div class="wind-period-display">
             <div id="first-date">${firstDate}</div>
             <div id="last-date">${lastDate}</div>
        </div>
        <div class="rose-container" id="speed-rose-container">
        </div>
    `;

    // Render the plots
    // container height
    const height = container.clientHeight / 2 -12;
    plotProbabilityRose(aggregatedData, '#prob-rose-container', height);
    plotSpeedRose(aggregatedData, '#speed-rose-container', height); 
}

async function loadRosePlot(id, url) {
    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        console.error(`Div with ID ${id} not found`);
        return;
    }

    try {
        const apiResponse = await fetchWithCache(url+'&startDate='+WIND.Start+'&endDate='+WIND.End);
        if (apiResponse.success && Object.keys(apiResponse.data).length > 0) {
            createRosePlot(apiResponse.data, apiResponse.metadata, id);
        } else {
            chartDiv.innerHTML = `<div class="error-message">Aucune donnée de vent disponible.</div>`;
        }
    } catch (error) {
        console.error('Error loading wind rose data:', error);
        chartDiv.innerHTML = `<div class="error-message">Erreur de chargement.</div>`;
    }
}


// =======================================
//  constuction du diagramme de vecteurs
// =======================================


function createVectorPlot(data, metadata, id) {
    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        console.error(`Div with ID ${id} not found`);
        return;
    }
    
    const speedSensor = metadata.measurement.speed[0];
    const unit = metadata.toUserUnit[speedSensor].userUnit;
    const fn = eval(metadata.toUserUnit[speedSensor].fnFromMetric);

    if (data.length === 0) {
        chartDiv.innerHTML = `<div class="error-message">No data!</div>`;
        return;
    }

    // Dimensions
    const margin = {top: 16, right: 25, bottom: 17, left: 25};
    const width = chartDiv.clientWidth;
    const height = chartDiv.clientHeight || 100;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Préparation des données
    const processedData = data.map(d => ({
        date: new Date(d.d),
        Ux: -(d.Ux || 0),
        Vy: -(d.Vy || 0),
        spd: fn(d.spd || 0),
        spdOriginal: d.spd || 0,
        dir: d.dir || 0
    }));

    // Scales
    const xScale = d3.scaleTime()
        .domain(d3.extent(processedData, d => d.date))
        .range([0, innerWidth]);

    const maxSpeed = d3.max(processedData, d => d.Vy) || 1;
    const minSpeed = d3.min(processedData, d => d.Vy) || -1;
    const yScale = d3.scaleLinear()
        .domain([minSpeed, maxSpeed])
        .range([innerHeight, 0]);

    // Coefficient de proportionalité
    let coef = (yScale.range()[0] - yScale.range()[1]) / (yScale.domain()[1] - yScale.domain()[0]);

    // SVG
    chartDiv.innerHTML = '';
    const svg = d3.select(chartDiv)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Defs with markers
    const defs = svg.append("defs");
    defs.append("marker")
        .attr("id", `arrowhead-${id}`)
        .attr("refX", 2).attr("refY", 0)
        .attr("viewBox", "-5 -5 12 10")
        .attr("markerUnits", "strokeWidth")
        .attr("markerWidth", 6).attr("markerHeight", 12)
        .attr("orient", "auto")
        .append("polygon")
        .attr("stroke", "#3498db").attr("fill", "#3498db")
        .attr("points", "0,0 -2.5,-2.5 5,0 -2.5,2.5");

    defs.append("marker")
        .attr("id", `arrowheadHover-${id}`)
        .attr("refX", 2).attr("refY", 0)
        .attr("viewBox", "-5 -5 12 10")
        .attr("markerUnits", "strokeWidth")
        .attr("markerWidth", 6).attr("markerHeight", 12)
        .attr("orient", "auto")
        .append("polygon")
        .attr("stroke", "#e74c3c").attr("fill", "#e74c3c")
        .attr("points", "0,0 -2.5,-2.5 5,0 -2.5,2.5");

    // Main group
    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Ligne zéro
    g.append("line")
        .attr("class", "zero-line")
        .attr("x1", 0).attr("x2", innerWidth)
        .attr("y1", yScale(0)).attr("y2", yScale(0))
        .attr("stroke", "#000").attr("stroke-width", 1);

    // Axe X
    const xAxis = d3.axisBottom(xScale)
        .ticks(3).tickFormat(d3.timeFormat("%d/%m")).tickSize(4);
    
    const xAxisGroup = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${yScale(0)})`)
        .call(xAxis);

    // Labels hover (existants)
    const dateText = g.append("text")
        .attr("class", "hover-date")
        .attr("x", 0).attr("y", -5)
        .attr("text-anchor", "start")
        .attr("font-size", "10px")
        .attr("font-variant", "tabular-nums")
        .attr("fill", "#e74c3c")
        .style("opacity", 0);

    const valueText = g.append("text")
        .attr("class", "hover-value")
        .attr("x", innerWidth).attr("y", -5)
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("font-variant", "tabular-nums")
        .attr("fill", "#e74c3c")
        .style("opacity", 0);

    // État du brush
    let isBrushing = false;

    // Brush - Label de durée uniquement
    const brushDurationLabel = g.append("text")
        .attr("class", "brush-duration-label")
        .attr("x", innerWidth / 2).attr("y", -5)
        .attr("text-anchor", "middle")
        .style("font-size", "9px")
        .style("display", "none");

    // Brush group
    const brush = d3.brushX()
        .extent([[0, 0], [innerWidth, innerHeight]])
        .on("start", brushStarted)
        .on("brush", brushBrushed)
        .on("end", brushEnded);

    const brushGroup = g.append("g")
        .attr("class", "brush")
        .call(brush);

    // Double-clic pour reset
    brushGroup.select(".overlay")
        .on("dblclick", (event) => {
            event.stopPropagation();
            resetZoom();
        });

    // Gestionnaires du brush
    function brushStarted() {
        isBrushing = true;
        brushDurationLabel.style("display", null);
        // Masquer les labels de hover pendant le brush
        dateText.style("opacity", 0);
        valueText.style("opacity", 0);
    }

    function brushBrushed(event) {
        if (!event.selection) return;
        const [mouseX] = d3.pointer(event, event.sourceEvent.currentTarget);
        const [x0, x1] = event.selection;
        const startDate = xScale.invert(x0);
        const endDate = xScale.invert(x1);
        const duration = endDate - startDate;
        const days = duration / (1000 * 60 * 60 * 24);
        
        brushDurationLabel
            .text(`${days.toFixed(1)} Days`)
            .attr("x", mouseX)
            .style("fill", duration < 12 * 60 * 60 * 1000 ? "#888" : "#e74c3c")
            .style("font-weight", duration < 12 * 60 * 60 * 1000 ? "normal" : "bold");
    }

    function brushEnded(event) {
        brushDurationLabel.style("display", "none");
        
        if (!event.selection) {
            isBrushing = false;
            return;
        }
        
        const [x0, x1] = event.selection;
        const startDate = xScale.invert(x0);
        const endDate = xScale.invert(x1);
        const duration = endDate - startDate;
        
        // Annuler la sélection visuelle
        brushGroup.call(brush.move, null);
        isBrushing = false;
        
        // Validation durée minimale (12h)
        const minDuration = 12 * 60 * 60 * 1000;
        if (duration < minDuration) return;
        
        // Filtrer les données sur la plage
        const filteredData = processedData.filter(d => 
            d.date >= startDate && d.date <= endDate
        );
        
        if (filteredData.length === 0) return;
        
        // Mettre à jour le domaine X
        xScale.domain([startDate, endDate]);
        
        // Recalculer le domaine Y sur les données filtrées
        const newMaxSpeed = d3.max(filteredData, d => d.Vy) || 1;
        const newMinSpeed = d3.min(filteredData, d => d.Vy) || -1;
        yScale.domain([newMinSpeed, newMaxSpeed]);
        
        // Recalculer le coefficient de proportionalité
        coef = (yScale.range()[0] - yScale.range()[1]) / (yScale.domain()[1] - yScale.domain()[0]);
        
        // Mettre à jour l'axe X avec transition
        xAxisGroup
            .transition()
            .duration(750)
            .call(d3.axisBottom(xScale).ticks(3).tickFormat(d3.timeFormat("%d/%m")).tickSize(4));
        
        // Mettre à jour la ligne zéro
        g.select(".zero-line")
            .transition()
            .duration(750)
            .attr("y1", yScale(0))
            .attr("y2", yScale(0));
        
        // Mettre à jour les flèches
        arrows.select(".hair")
            .transition()
            .duration(750)
            .attr("x1", d => xScale(d.date))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy));

        arrows.select(".hair-hit")
            .transition()
            .duration(750)
            .attr("x1", d => xScale(d.date))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy));
    }

    function resetZoom() {
        // Restaurer domaines originaux
        xScale.domain(d3.extent(processedData, d => d.date));
        const originalMaxSpeed = d3.max(processedData, d => d.Vy) || 1;
        const originalMinSpeed = d3.min(processedData, d => d.Vy) || -1;
        yScale.domain([originalMinSpeed, originalMaxSpeed]);
        
        coef = (yScale.range()[0] - yScale.range()[1]) / (yScale.domain()[1] - yScale.domain()[0]);
        
        // Mettre à jour l'axe X
        xAxisGroup
            .transition()
            .duration(750)
            .call(d3.axisBottom(xScale).ticks(3).tickFormat(d3.timeFormat("%d/%m")).tickSize(4));
        
        // Mettre à jour la ligne zéro
        g.select(".zero-line")
            .transition()
            .duration(750)
            .attr("y1", yScale(0))
            .attr("y2", yScale(0));
        
        // Mettre à jour les flèches
        arrows.select(".hair")
            .transition()
            .duration(750)
            .attr("x1", d => xScale(d.date))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy));

        arrows.select(".hair-hit")
            .transition()
            .duration(750)
            .attr("x1", d => xScale(d.date))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy));
    }

    // Flèches (filtrées sur spdOriginal > 0.01)
    const arrows = g.selectAll(".arrow")
        .data(processedData.filter(d => d.spdOriginal > 0.01))
        .enter().append("g")
        .attr("class", "arrow");

    // Zone de hit invisible
    arrows.append("line")
        .attr("class", "hair-hit")
        .attr("x1", d => xScale(d.date))
        .attr("y1", yScale(0))
        .attr("x2", d => xScale(d.date) + d.Ux * coef)
        .attr("y2", d => yScale(d.Vy))
        .attr("stroke", "transparent")
        .attr("stroke-width", 5);

    // Flèches visibles
    arrows.append("line")
        .attr("class", "hair")
        .attr("x1", d => xScale(d.date))
        .attr("y1", yScale(0))
        .attr("x2", d => xScale(d.date) + d.Ux * coef)
        .attr("y2", d => yScale(d.Vy))
        .attr("stroke", "#3498db")
        .attr("stroke-width", 1)
        .attr("marker-end", `url(#arrowhead-${id})`);

    // Hover effects (désactivés pendant le brush)
    arrows
        .on("mouseover", function(event, d) {
            if (isBrushing) return;
            
            d3.select(this).select(".hair")
                .attr("stroke", "#e74c3c")
                .attr("stroke-width", 2)
                .attr("marker-end", `url(#arrowheadHover-${id})`);
            
            const dateStr = d.date.toLocaleString('fr-FR', {
                dateStyle: "medium",
                timeStyle: "short"
            });
            
            dateText.text(dateStr)
                .transition().duration(100)
                .style("opacity", 1);
            
            valueText.text(`${d.spd} ${unit} • ${d.dir}°`)
                .transition().duration(100)
                .style("opacity", 1);
        })
        .on("mouseout", function() {
            if (isBrushing) return;
            
            d3.select(this).select(".hair")
                .attr("stroke", "#3498db")
                .attr("stroke-width", 1)
                .attr("marker-end", `url(#arrowhead-${id})`);
            
            dateText.transition().duration(1600).style("opacity", 0);
            valueText.transition().duration(1600).style("opacity", 0);
        });
}

async function loadVectorPlot(id, url, fullUse=false) {
    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        console.error(`Div with ID ${id} not found`);
        return;
    }

    try {
        const apiResponse = await fetchWithCache(url);
        if (apiResponse.success && Object.keys(apiResponse.data).length > 0) {
            createVectorPlot(apiResponse.data, apiResponse.metadata, id);
        } else {
            chartDiv.innerHTML = `<div class="error-message">Aucune donnée de vent disponible.</div>`;
        }
    } catch (error) {
        console.error('Error loading vector data:', error);
        chartDiv.innerHTML = `<div class="error-message">Loading error</div>`;
    }
}

const WIND = {
    Start: null,
    End: null
};
async function loadWindPlots(windContainer, url, sensor, period='7d') {
        WIND.Start = getStartDate(period);
        WIND.End = new Date().toISOString().split('.')[0] + 'Z';
        let prefix = '';
        if (sensor.includes('_')) {
            prefix = sensor.split(':')[1].split('_')[0] + '_';
        }
        windContainer.innerHTML = `
            <div class="wind-details-grid">
                <div class="wind-top-row" id="windRoses-container"></div>
                <div class="wind-bottom-row" id="vector-container"></div>
            </div>
        `;
        // global windStart and windEnd, pour transmettre l'intervale du brush entre rose et vecteur
        const roseUrl = `${url}/WindRose?prefix=${prefix}`; // prefix peut être vide ou 'open-meteo_'
        loadRosePlot('windRoses-container', roseUrl);
        const vectorUrl = `${url}/WindVectors/${sensor.split(':')[1]}?stepCount=600&startDate=${WIND.Start}&endDate=${WIND.End}`;
        loadVectorPlot('vector-container', vectorUrl, true);
}