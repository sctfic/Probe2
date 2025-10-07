// public/js/drawing/miniRose.js

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

    function drawInfoText(svg, R, lines) {
        // Remove any existing info text to avoid overlap
        svg.select(".info-text").remove();

        const textGroup = svg.append("g")
            .attr("class", "info-text")
            .attr("font-size", "11px")
            .attr("transform", `translate(${R+12}, ${-R-2})`)
            .attr("text-anchor", "end");

        lines.forEach((line, i) => {
            textGroup.append("text") // Use text instead of tspan for easier line breaks
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

        petals.on("mouseover", function(event, d) {
            const infoLines = [`${(100 * d.p).toFixed(1)} %`, `${d.d}°`];
            drawInfoText(svg, r, infoLines);
        }).on("mouseout", function() {
            svg.select(".info-text").remove();
        });

        drawGrid(svg, ticks, probabilityToRadiusScale);
        drawGridScale(svg, tickmarks, d => `${(d * 100).toFixed(0)} %`, probabilityToRadiusScale);
        drawCalm(svg, windProbabilityArcOptions.from, t > 0 ? calm / t : 0);
        drawLevelGrid(svg, r);
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

        function createChevron(d) {
            const angle = d.d * Math.PI / 180;
            const r = speedToRadiusScale(d.m);
            const width = 1; // Largeur de la base de la flèche en degrés
            const widthRad = width * Math.PI / 180;
            const chevronHeight = 6; // Hauteur de la pointe de la flèche

            const x1 = r * Math.sin(angle - widthRad);
            const y1 = -r * Math.cos(angle - widthRad);
            const x2 = (r - chevronHeight) * Math.sin(angle);
            const y2 = -(r - chevronHeight) * Math.cos(angle);
            const x3 = r * Math.sin(angle + widthRad);
            const y3 = -r * Math.cos(angle + widthRad);
            
            // M = Move to tip, L = Line to one wing, A = Arc for the back, Z = Close path
            return `M${x2},${y2} L${x1},${y1} A${r},${r} 0 0 0 ${x3},${y3} Z`;
        }

        svg.append("g").attr("class", "speedArcMax")
            .selectAll("path").data(winds).enter().append("path")
            .attr("class", "arcs_max").attr("d", createChevron);

        const speedArcGen = arc(windSpeedArcOptions);
        const petals = svg.append("g").attr("class", "speedArc")
            .selectAll("path").data(winds).enter().append("path")
            .attr("d", speedArcGen).attr("class", "arcs").style("fill", probabilityToColor);

        petals.on("mouseover", function(event, d) {
            const infoLines = [ `Rafale: ${d.m.toFixed(1)} ${speedUnit}`, `Moy: ${d.s.toFixed(1)} ${speedUnit}`,`${d.d}°`];
            drawInfoText(svg, r, infoLines);
        }).on("mouseout", function() {
            svg.select(".info-text").remove();
        });

        drawGrid(svg, ticks, speedToRadiusScale);
        drawGridScale(svg, tickmarks, d => `${d.toFixed(1)} ${speedUnit}`, speedToRadiusScale);
        drawCalm(svg, windSpeedArcOptions.from, t > 0 ? calm / t : 0);
        drawLevelGrid(svg, r);
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
        <div class="rose-period-display">
             <div>${firstDate}</div>
             <div>${lastDate}</div>
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
    chartDiv.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        cleanCache();
        const apiResponse = await fetchWithCache(url);
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