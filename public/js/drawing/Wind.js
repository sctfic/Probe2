// Probe\public\js\drawing\Wind.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

// =======================================
//  Construction de la Rose de vent
// =======================================

function createRosePlot(data, metadata, id) {
    const container = document.getElementById(id);
    if (!container) {
        console.error(`Container with id ${id} not found.`);
        return;
    }
    container.innerHTML = '';

    const speedSensorKey = metadata.measurement.speed?.[0];
    const speedUnit = speedSensorKey && metadata.toUserUnit[speedSensorKey]?.userUnit
        ? metadata.toUserUnit[speedSensorKey].userUnit
        : 'm/s';
    const speedConversionFn = speedSensorKey && metadata.toUserUnit[speedSensorKey]?.fnFromMetric
        ? eval(metadata.toUserUnit[speedSensorKey].fnFromMetric)
        : (v) => v;

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
        svg.select(".info-text").remove();
        const xPos = align === 'start' ? -R - 12 : R + 12;
        const textGroup = svg.append("g")
            .attr("class", "info-text")
            .attr("font-size", "11px")
            .attr("transform", `translate(${xPos}, ${-R - 2})`)
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
        const directions = ['NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'];
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

        hoverZones.on("mouseover", function (event, d) {
            petals.filter(petal => petal.d === d.d)
                .transition()
                .duration(50)
                .style("fill-opacity", 0.9)
                .style("stroke-width", "2px")
                .style("stroke", "#ff6b6b");

            const infoLines = [`${(100 * d.p).toFixed(1)} %`, `${d.d}°`];
            drawInfoText(svg, r, infoLines);
        }).on("mouseout", function (event, d) {
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

        hoverZones.on("mouseover", function (event, d) {
            petals.filter(petal => petal.d === d.d)
                .transition()
                .duration(50)
                .style("fill-opacity", 0.9)
                .style("stroke-width", "2px")
                .style("stroke", "#ff6b6b");

            gustPetals.filter(petal => petal.d === d.d)
                .transition()
                .duration(50)
                .style("fill-opacity", 0.7)
                .style("stroke", "#ff6b6b");

            const infoLines = [`Rafale: ${d.m.toFixed(1)} ${speedUnit}`, `Moy: ${d.s.toFixed(1)} ${speedUnit}`, `${d.d}°`];
            drawInfoText(svg, r, infoLines);
        }).on("mouseout", function (event, d) {
            petals.filter(petal => petal.d === d.d)
                .transition()
                .duration(800)
                .style("fill-opacity", null)
                .style("stroke-width", null)
                .style("stroke", null);

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

        for (const dir in result) {
            if (result[dir].count > 0) {
                result[dir].Spd /= result[dir].count;
            }
        }
        return result;
    }

    const aggregatedData = convertApiData(data);

    const firstDate = new Date(metadata.first).toLocaleString('fr-FR', { dateStyle: "medium", timeStyle: "short", hour12: false });
    const lastDate = new Date(metadata.last).toLocaleString('fr-FR', { dateStyle: "medium", timeStyle: "short", hour12: false });

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

    const height = container.clientHeight / 2 - 12;
    plotProbabilityRose(aggregatedData, '#prob-rose-container', height);
    plotSpeedRose(aggregatedData, '#speed-rose-container', height);
}
// Build seulement les 2 diagrammes de rose des vents dans le container spécifié
async function loadRosePlot(id, url) {
    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        console.error(`Div with ID ${id} not found`);
        return;
    }

    // Vérification de la période - Ne pas charger si > 30 jours
    const msPerDay = 24 * 60 * 60 * 1000;
    const periodDays = (new Date(WIND.End) - new Date(WIND.Start)) / msPerDay;
    if (periodDays > 30) {
        chartDiv.innerHTML = `
        <div class="rose-container" id="prob-rose-container">
        </div>
        <div class="wind-period-display">
             <div id="first-date">${WIND.Start}</div>
             <div id="last-date">${WIND.End}</div>
             <br />
             <div class="error-message">Période trop longue (> 30 jours)<br></div>
             <small style="font-size: 9px;">Veuillez selectionner une periode</small>
        </div>
        <div class="rose-container" id="speed-rose-container">
        </div>`;
        return;
    }

    // Afficher le message de chargement avec animation
    chartDiv.innerHTML = `
        <div class="rose-container" id="prob-rose-container">
            <div style="border: 3px solid rgba(52, 152, 219, 0.2); border-top: 3px solid #3397d1; border-radius: 50%; width: 30px; height: 30px; animation: windSpinner 1s linear infinite; margin: 0 auto 10px;"></div>
            <div style="color: #ccc; font-size: 12px;">Chargement des données...</div>
        </div>
        <div class="wind-period-display">
             <div id="first-date">${WIND.Start}</div>
             <div id="last-date">${WIND.End}</div>
        </div>
        <div class="rose-container" id="speed-rose-container">
            <div style="border: 3px solid rgba(52, 152, 219, 0.2); border-top: 3px solid #3397d1; border-radius: 50%; width: 30px; height: 30px; animation: windSpinner 1s linear infinite; margin: 0 auto 10px;"></div>
            <div style="color: #ccc; font-size: 12px;">Chargement des données...</div>
        </div>`;

    // Injecter la keyframe d'animation si elle n'existe pas
    if (!document.getElementById('wind-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'wind-spinner-style';
        style.textContent = `
            @keyframes windSpinner {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    try {
        // Cache de 10 minutes pour les données des roses de vent
        const apiResponse = await queryManager.query(url + `&startDate=${WIND.Start}&endDate=${WIND.End}`, { cacheDuration: 10 * 60 * 1000 });
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
//  Construction du diagramme de vecteurs
// =======================================

function createVectorPlot(data, metadata, id, fullUse = false, url = '') {
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

    // Date courante pour séparation historique / prévision
    const now = new Date();
    // Limite de 14 jours pour le calcul d'opacité
    const futureLimit = 14 * 24 * 60 * 60 * 1000;

    // Dimensions
    const margin = { top: 16, right: 25, bottom: 17, left: 25 };
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

    let maxSpeed = d3.max(processedData, d => d.Vy) || 1;
    let minSpeed = d3.min(processedData, d => d.Vy) || -1;

    // Forcer l'inclusion de 0 dans le domaine pour l'axe X visible
    if (minSpeed > 0) minSpeed = 0;
    if (maxSpeed < 0) maxSpeed = 0;

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

    // Marqueur Historique (Bleu)
    defs.append("marker")
        .attr("id", `arrowhead-${id}`)
        .attr("refX", 2).attr("refY", 0)
        .attr("viewBox", "-5 -5 12 10")
        .attr("markerUnits", "strokeWidth")
        .attr("markerWidth", 6).attr("markerHeight", 12)
        .attr("orient", "auto")
        .append("polygon")
        .attr("stroke", "#3397d1").attr("fill", "#3397d1")
        .attr("points", "0,0 -2.5,-2.5 5,0 -2.5,2.5");

    // Marqueur Forecast (Violet)
    defs.append("marker")
        .attr("id", `arrowheadForecast-${id}`)
        .attr("refX", 2).attr("refY", 0)
        .attr("viewBox", "-5 -5 12 10")
        .attr("markerUnits", "strokeWidth")
        .attr("markerWidth", 6).attr("markerHeight", 12)
        .attr("orient", "auto")
        .append("polygon")
        .attr("stroke", "#9b59b6").attr("fill", "#9b59b6")
        .attr("points", "0,0 -2.5,-2.5 5,0 -2.5,2.5");

    // Marqueur Hover (Rouge)
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

    // Axe X
    const xAxis = d3.axisBottom(xScale)
        .ticks(3).tickFormat(d3.timeFormat("%d/%m")).tickSize(4);

    const xAxisGroup = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${yScale(0)})`)
        .call(xAxis);

    // Labels hover
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
    let brush, brushGroup, brushDurationLabel;

    // Créer le brush seulement si fullUse est true
    if (fullUse) {
        // Label de durée
        brushDurationLabel = g.append("text")
            .attr("class", "brush-duration-label")
            .attr("x", innerWidth / 2).attr("y", -5)
            .attr("text-anchor", "middle")
            .style("font-size", "9px")
            .style("display", "none");

        // Brush group
        brush = d3.brushX()
            .extent([[0, 0], [innerWidth, innerHeight]])
            .on("start", brushStarted)
            .on("brush", brushBrushed)
            .on("end", brushEnded);

        brushGroup = g.append("g")
            .attr("class", "brush")
            .call(brush);

        // Double-clic pour reset
        brushGroup.select(".overlay")
            .on("dblclick", (event) => {
                event.stopPropagation();
                resetZoom();
            });
    }

    // Gestionnaires du brush (définis seulement si fullUse est true)
    function brushStarted() {
        if (!fullUse) return;
        isBrushing = true;
        brushDurationLabel.style("display", null);
        dateText.style("opacity", 0);
        valueText.style("opacity", 0);
    }

    function brushBrushed(event) {
        if (!fullUse || !event.selection) return;
        const [mouseX] = d3.pointer(event, event.sourceEvent.currentTarget);
        const [x0, x1] = event.selection;
        const startDate = xScale.invert(x0);
        const endDate = xScale.invert(x1);
        const duration = endDate - startDate;
        const days = duration / (1000 * 60 * 60 * 24);

        brushDurationLabel
            .text(`${days.toFixed(1)} Days`)
            .attr("x", mouseX)
            .style("fill", duration < 60 * 60 * 1000 ? "#888" : "#e74c3c") // 1h minimum
            .style("font-weight", duration < 60 * 60 * 1000 ? "normal" : "bold");
    }

    async function brushEnded(event) {
        if (!fullUse) return;

        brushDurationLabel.style("display", "none");

        if (!event.selection) {
            isBrushing = false;
            return;
        }

        const [x0, x1] = event.selection;
        const startDate = xScale.invert(x0);
        const endDate = xScale.invert(x1);
        const duration = endDate - startDate;

        brushGroup.call(brush.move, null);
        isBrushing = false;

        // Validation durée minimale (1h)
        const minDuration = 60 * 60 * 1000;
        if (duration < minDuration) return;

        // Mettre à jour les variables globales
        WIND.Start = startDate.toISOString().split('.')[0] + 'Z';
        WIND.End = endDate.toISOString().split('.')[0] + 'Z';

        // Filtrer les données pour le zoom visuel immédiat
        const filteredData = processedData.filter(d =>
            d.date >= startDate && d.date <= endDate
        );

        if (filteredData.length === 0) return;

        // Mettre à jour les domaines
        xScale.domain([startDate, endDate]);

        let newMaxSpeed = d3.max(filteredData, d => d.Vy) || 1;
        let newMinSpeed = d3.min(filteredData, d => d.Vy) || -1;

        // Forcer l'inclusion de 0 dans le domaine lors du zoom/brush
        if (newMinSpeed > 0) newMinSpeed = 0;
        if (newMaxSpeed < 0) newMaxSpeed = 0;

        yScale.domain([newMinSpeed, newMaxSpeed]);
        coef = (yScale.range()[0] - yScale.range()[1]) / (yScale.domain()[1] - yScale.domain()[0]);

        // Transitions
        xAxisGroup.transition().duration(750)
            .attr("transform", `translate(0,${yScale(0)})`) // S'assurer que l'axe suit le 0
            .call(d3.axisBottom(xScale).ticks(3).tickFormat(d3.timeFormat("%d/%m")).tickSize(4));

        arrows.select(".hair").transition().duration(750)
            .attr("x1", d => xScale(d.date))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy));

        arrows.select(".hair-hit").transition().duration(750)
            .attr("x1", d => xScale(d.date))
            .attr("x2", d => xScale(d.date) + d.Ux * coef)
            .attr("y2", d => yScale(d.Vy));

        // Recharger les données depuis l'API et reconstruire les visualisations
        try {
            const sensor = metadata.measurement.speed[0];
            const prefix = sensor.includes('_') ? sensor.split(':')[1].split('_')[0] + '_' : '';

            const vectorBaseUrl = url.split('?')[0];
            const vectorUrl = `${vectorBaseUrl}?stepCount=1000&startDate=${WIND.Start}&endDate=${WIND.End}`;

            // Cache de 30 secondes pour les données vecteur lors du brush
            const vectorData = await queryManager.query(vectorUrl, { cacheDuration: 30 * 1000 });

            if (vectorData.success) {
                createVectorPlot(vectorData.data, vectorData.metadata, id, fullUse, url);

                const roseBaseUrl = url.split('/WindVectors')[0];
                const roseUrl = `${roseBaseUrl}/WindRose?prefix=${prefix}`;
                loadRosePlot('windRoses-container', roseUrl);
            }
        } catch (error) {
            console.error('Erreur lors du rechargement des données:', error);
        }
    }

    function resetZoom() {
        if (!fullUse) return;

        // Recharger complètement les visualisations avec les paramètres d'origine
        if (WIND.Container && WIND.Url && WIND.Sensor && WIND.Period) {
            loadWindPlots(WIND.Container, WIND.Url, WIND.Sensor, WIND.Period);
        } else {
            // Fallback si les paramètres ne sont pas disponibles
            console.warn('Paramètres de rechargement non disponibles');
        }
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
        .attr("stroke", d => d.date > now ? "#9b59b6" : "#3397d1") // Violet pour le futur
        .attr("stroke-width", 1)
        .attr("marker-end", d => d.date > now ? `url(#arrowheadForecast-${id})` : `url(#arrowhead-${id})`)
        .style("opacity", d => {
            if (d.date <= now) return 1;
            // Opacité linéaire de 0.8 à 0.4 sur 14 jours
            const diff = d.date - now;
            let op = 0.8 - (diff / futureLimit) * 0.4;
            return Math.max(0.4, op);
        });

    // Hover effects (TOUJOURS ACTIFS, seulement désactivés si isBrushing)
    arrows
        .on("mouseover", function (event, d) {
            if (isBrushing) return; // Seul le brush désactive les hovers

            d3.select(this).select(".hair")
                .attr("stroke", "#e74c3c")
                .attr("stroke-width", 2)
                .attr("marker-end", `url(#arrowheadHover-${id})`);

            // Date sur 2 lignes
            const dateStr = d.date.toLocaleString('fr-FR', {
                dateStyle: "medium",
                timeStyle: "short"
            });
            const dateParts = dateStr.split(', ');

            dateText.selectAll('tspan').remove();
            dateText.append('tspan').attr('x', 0).attr('dy', 0).text(dateParts[0]);
            dateText.append('tspan').attr('x', 0).attr('dy', '1.2em').text(dateParts[1] || '');
            dateText.transition().duration(100).style("opacity", 1);

            // Valeurs sur 2 lignes
            valueText.selectAll('tspan').remove();
            valueText.append('tspan').attr('x', innerWidth).attr('dy', 0).attr('text-anchor', 'end').text(`${d.spd} ${unit}`);
            valueText.append('tspan').attr('x', innerWidth).attr('dy', '1.2em').attr('text-anchor', 'end').text(`${d.dir}°`);
            valueText.transition().duration(100).style("opacity", 1);
        })
        .on("mouseout", function (event, d) {
            if (isBrushing) return;

            // Rétablissement de la couleur selon l'historique ou le forecast
            const isForecast = d.date > now;

            d3.select(this).select(".hair")
                .attr("stroke", isForecast ? "#9b59b6" : "#3397d1")
                .attr("stroke-width", 1)
                .attr("marker-end", isForecast ? `url(#arrowheadForecast-${id})` : `url(#arrowhead-${id})`);

            dateText.transition().duration(1600).style("opacity", 0);
            valueText.transition().duration(1600).style("opacity", 0);
        });
}

// Build seulement le diagramme de vecteurs dans le container spécifié
async function loadVectorPlot(id, url, fullUse = false) {
    const chartDiv = document.getElementById(id);
    if (!chartDiv) {
        console.error(`Div with ID ${id} not found`);
        return;
    }

    try {
        // Cache de 30 secondes pour les données vectorielles
        const apiResponse = await queryManager.query(url, { cacheDuration: 30 * 1000 });
        if (apiResponse.success && Object.keys(apiResponse.data).length > 0) {
            createVectorPlot(apiResponse.data, apiResponse.metadata, id, fullUse, url);
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
    End: null,
    Container: null,
    Url: null,
    Sensor: null,
    Period: null
};

// build les diagrammes de vent (roses + vecteurs) dans le container spécifié
async function loadWindPlots(windContainer, url, sensor, period = '3y') {
    // Stocker les paramètres pour rechargement ultérieur
    WIND.Container = windContainer;
    WIND.Url = url;
    WIND.Sensor = sensor;
    WIND.Period = period;

    const now = new Date();
    WIND.End = new Date(now.setDate(now.getDate() + 1));
    WIND.End = WIND.End.setHours(0, 0, 0, 0)
    WIND.End = new Date(WIND.End).toISOString().split('.')[0] + 'Z'
    WIND.Start = getStartDate(period);


    let prefix = '';
    if (sensor.includes('_')) {
        prefix = sensor.split(':')[1].split('_')[0] + '_';
    }

    windContainer.innerHTML = `
        <div class="wind-details-grid">
            <div class="wind-top-row" id="windRoses-container">
            </div>
            <div class="wind-bottom-row" id="vector-container"></div>
        </div>
    `;

    const roseUrl = `${url}/WindRose?prefix=${prefix}`;
    loadRosePlot('windRoses-container', roseUrl);

    const vectorUrl = `${url}/WindVectors/${sensor.split(':')[1]}?stepCount=1000&startDate=${WIND.Start}`;
    loadVectorPlot('vector-container', vectorUrl, true); // fullUse = true en dur
}