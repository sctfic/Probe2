// public/js/windRose.js

/**
 * Renders an animated wind rose visualization in a specified container.
 * @param {string} containerId - The ID of the DOM element to render the chart in.
 * @param {string} stationId - The ID of the station to fetch data for.
 */
async function renderWindRose(containerId, stationId, startDate) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id ${containerId} not found.`);
        return;
    }

    container.innerHTML = '<div class="loading">Chargement de la rose des vents...</div>';

    const API_URL = `/query/${stationId}/WindRose?stepCount=24&startDate=${startDate}`;
    const INTERVAL_MS = 2000;

    let allData = [];
    let currentIndex = 0;
    let intervalId = null;
    let isPaused = false;
    let globalScales = {
        maxProbability: 0,
        maxSpeed: 0
    };

    const SpeedFactor = 3.6; // m/s to km/h

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

    function maxSpl(data) {
        return Math.max(...Object.values(data).map(d => d.Spl || 0));
    }

    function maxSpd(data) {
        return Math.max(...Object.values(data).map(d => (d.Max || 0) * SpeedFactor));
    }

    function calculateGlobalScales(allData) {
        let maxProb = 0;
        let maxSpdVal = 0;

        allData.forEach(item => {
            const t = totalSpl(item.data);
            if (t > 0) {
                const spl = maxSpl(item.data);
                const prob = spl / t;
                if (prob > maxProb) maxProb = prob;
            }
            const spd = maxSpd(item.data);
            if (spd > maxSpdVal) maxSpdVal = spd;
        });

        globalScales.maxProbability = maxProb;
        globalScales.maxSpeed = maxSpdVal;
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
            .style("float", "left")
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

    function drawCalm(svg, radius, calmPercentage) {
        svg.append("circle")
            .attr("r", radius)
            .style("fill", "#fff")
            .style("stroke", "#000")
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

    function plotProbabilityRose(data, container, R, animate = true) {
        const winds = [], zero = [];
        const t = totalSpl(data);
        const visWidth = R;
        const p = 22, r = visWidth, w = visWidth * 2, h = visWidth * 2;
        const ip = 28;

        const existingSvg = d3.select(container).select("svg");
        let svg;
        
        if (existingSvg.empty()) {
            svg = makeWindContainer(container, w, h, p);
        } else {
            svg = existingSvg.select("g");
            svg.selectAll(".ProbabilityArc").remove();
        }

        let calm = 0;
        for (const key in data) {
            if (key === 'Calm' || key === 'null') {
                calm = data[key].Spl;
            } else if (data[key].Dir !== null && data[key].Dir !== undefined) {
                zero.push({d: data[key].Dir, p: 0, s: 0, m: 0});
                winds.push({
                    d: data[key].Dir,
                    p: t > 0 ? data[key].Spl / t : 0,
                    s: data[key].Spd * SpeedFactor,
                    m: data[key].Max * SpeedFactor
                });
            }
        }

        const SplScale = globalScales.maxProbability;
        let probabilityToRadiusScale, ticks, tickmarks;
        
        if (SplScale > 0.14) {
            probabilityToRadiusScale = d3.scaleLinear().domain([0, SplScale]).range([ip, visWidth]).clamp(true);
            const tickStep = SplScale / 4;
            ticks = d3.range(tickStep, tickStep * 4.001, tickStep);
            tickmarks = d3.range(tickStep, tickStep * 3.001, tickStep);
        } else {
            probabilityToRadiusScale = d3.scaleLinear().domain([0, 0.15]).range([ip, visWidth]).clamp(true);
            ticks = d3.range(0.05, 0.151, 0.05);
            tickmarks = d3.range(0.05, 0.101, 0.05);
        }

        const windProbabilityArcOptions = {
            width: 10,
            from: ip - 2,
            to: d => probabilityToRadiusScale(d.p)
        };

        if (existingSvg.empty()) {
            drawGrid(svg, ticks, probabilityToRadiusScale);
            drawGridScale(svg, tickmarks, d => `${(d * 100).toFixed(0)} %`, probabilityToRadiusScale);
            drawCalm(svg, windProbabilityArcOptions.from, t > 0 ? calm / t : 0);
            drawLevelGrid(svg, r);
        } else {
            svg.select(".calmwind text").text(Math.round((t > 0 ? calm / t : 0) * 100) + "%");
        }

        const arcGen = arc(windProbabilityArcOptions);
        const probabilityArc = svg.append("g").attr("class", "ProbabilityArc");

        probabilityArc.selectAll("path")
            .data(winds, d => d.d)
            .enter().append("path")
            .attr("d", d => arcGen({...d, p: 0, s: 0, m: 0}))
            .attr("class", "arcs")
            .style("fill", speedToColor)
            .append("title");

        const allPaths = svg.select(".ProbabilityArc").selectAll("path");
        
        if (animate) {
            allPaths.transition().duration(500).attr("d", arcGen).style("fill", speedToColor);
        } else {
            allPaths.attr("d", arcGen).style("fill", speedToColor);
        }

        allPaths.select("title")
            .text(d => `${d.d}° \n${(100 * d.p).toFixed(1)} % \n${d.s.toFixed(1)} km/h\nMaxi : ${d.m.toFixed(1)} km/h`);
    }

    function plotSpeedRose(data, container, R, animate = true) {
        const winds = [], zero = [];
        const t = totalSpl(data);
        const visWidth = R;
        const p = 22, r = visWidth, w = visWidth * 2, h = visWidth * 2;
        const ip = 28;

        const existingSvg = d3.select(container).select("svg");
        let svg;
        
        if (existingSvg.empty()) {
            svg = makeWindContainer(container, w, h, p);
        } else {
            svg = existingSvg.select("g");
            svg.selectAll(".speedArcMax").remove();
            svg.selectAll(".speedArc").remove();
        }

        let calm = 0;
        for (const key in data) {
            if (key === 'Calm' || key === 'null') {
                calm = data[key].Spl;
            } else if (data[key].Dir !== null && data[key].Dir !== undefined) {
                zero.push({d: data[key].Dir, p: 0, s: 0, m: 0});
                winds.push({
                    d: data[key].Dir,
                    p: t > 0 ? data[key].Spl / t : 0,
                    s: data[key].Spd * SpeedFactor,
                    m: data[key].Max * SpeedFactor
                });
            }
        }

        const SpdScale = globalScales.maxSpeed;
        let speedToRadiusScale, ticks, tickmarks;
        
        if (SpdScale > 6) {
            speedToRadiusScale = d3.scaleLinear().domain([0, SpdScale]).range([ip, visWidth]).clamp(true);
            const tickStep = SpdScale / 4;
            ticks = d3.range(tickStep, tickStep * 4.001, tickStep);
            tickmarks = d3.range(tickStep, tickStep * 3.001, tickStep);
        } else {
            speedToRadiusScale = d3.scaleLinear().domain([0, 6]).range([ip, visWidth]).clamp(true);
            ticks = d3.range(2, 6.01, 2);
            tickmarks = d3.range(2, 4.01, 2);
        }

        const windSpeedArcOptions = {
            width: 10,
            from: ip - 2,
            to: d => speedToRadiusScale(d.s)
        };

        if (existingSvg.empty()) {
            drawGrid(svg, ticks, speedToRadiusScale);
            drawGridScale(svg, tickmarks, d => `${d.toFixed(1)} km/h`, speedToRadiusScale);
            drawCalm(svg, windSpeedArcOptions.from, t > 0 ? calm / t : 0);
            drawLevelGrid(svg, r);
        } else {
            svg.select(".calmwind text").text(Math.round((t > 0 ? calm / t : 0) * 100) + "%");
        }

        const speedArcMax = svg.append("g").attr("class", "speedArcMax");

        function createChevron(d) {
            const angle = d.d * Math.PI / 180;
            const r = speedToRadiusScale(d.m);
            const width = 8;
            const widthRad = width * Math.PI / 180;
            const chevronHeight = 5;
            
            const x1 = r * Math.sin(angle - widthRad);
            const y1 = -r * Math.cos(angle - widthRad);
            const x2 = (r - chevronHeight) * Math.sin(angle);
            const y2 = -(r - chevronHeight) * Math.cos(angle);
            const x3 = r * Math.sin(angle + widthRad);
            const y3 = -r * Math.cos(angle + widthRad);
            
            return `M ${x1},${y1} L ${x2},${y2} L ${x3},${y3}`;
        }

        const chevrons = speedArcMax.selectAll("path").data(winds, d => d.d);

        const chevronEnter = chevrons.enter().append("path")
            .attr("class", "arcs_max")
            .style("fill", "none")
            .style("stroke", "#222")
            .style("stroke-width", "2px")
            .style("stroke-linecap", "round")
            .style("stroke-linejoin", "round")
            .attr("d", createChevron);

        if (animate) {
            speedArcMax.selectAll("path")
                .transition()
                .duration(500)
                .attrTween("d", function(d) {
                    const previous = d3.select(this).datum() || {m: 0};
                    const interpolateM = d3.interpolate(previous.m, d.m);
                    return function(t) {
                        return createChevron({...d, m: interpolateM(t)});
                    };
                });
        } else {
            chevronEnter.attr("d", createChevron);
        }

        const speedArcGen = arc(windSpeedArcOptions);
        const speedArc = svg.append("g").attr("class", "speedArc");

        speedArc.selectAll("path")
            .data(winds, d => d.d)
            .enter().append("path")
            .attr("d", d => speedArcGen({...d, s: 0}))
            .attr("class", "arcs")
            .style("fill", probabilityToColor)
            .append("title");

        const allPaths = svg.select(".speedArc").selectAll("path");
        
        if (animate) {
            allPaths.transition().duration(500).attr("d", speedArcGen).style("fill", probabilityToColor);
        } else {
            allPaths.attr("d", speedArcGen).style("fill", probabilityToColor);
        }

        allPaths.select("title")
            .text(d => `${d.d}° \n${(100 * d.p).toFixed(1)} % \n${d.s.toFixed(1)} km/h\nMaxi : ${d.m.toFixed(1)} km/h`);
    }

    function convertApiData(apiData) {
        const result = [];
        for (const [dateStr, directions] of Object.entries(apiData)) {
            const converted = {};
            for (const [dir, values] of Object.entries(directions)) {
                if (dir === 'Calm' || dir === 'null') {
                    converted['Calm'] = {
                        Dir: null,
                        Spl: (values.wind?.c || 0) + (values.gust?.c || 0),
                        Spd: 0,
                        Max: 0
                    };
                } else {
                    const dirMap = {
                        "N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5,
                        "E": 90, "ESE": 112.5, "SE": 135, "SSE": 157.5,
                        "S": 180, "SSW": 202.5, "SW": 225, "WSW": 247.5,
                        "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5
                    };
                    converted[dir] = {
                        Dir: dirMap[dir],
                        Spl: (values.wind?.c || 0) + (values.gust?.c || 0),
                        Spd: values.wind?.v || 0,
                        Max: values.gust?.v || 0
                    };
                }
            }
            result.push({ date: dateStr, data: converted });
        }
        return result;
    }

    function displayCurrentData() {
        if (allData.length === 0) return;

        const current = allData[currentIndex];
        const isFirstRender = currentIndex === 0 && d3.select('#windrose').select("svg").empty();
        
        document.getElementById('currentDate').textContent = `📅 ${new Date(current.date).toLocaleString('fr-FR')}`;
        
        plotProbabilityRose(current.data, '#windrose', 120, !isFirstRender);
        plotSpeedRose(current.data, '#windspeed', 120, !isFirstRender);

        if (!isPaused) {
            const progressBar = document.getElementById('progressBar');
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
            setTimeout(() => {
                progressBar.style.transition = `width ${INTERVAL_MS}ms linear`;
                progressBar.style.width = '100%';
            }, 50);
        }
    }

    function nextData() {
        if (isPaused) return;
        currentIndex = (currentIndex + 1) % allData.length;
        displayCurrentData();
    }

    function startAutoScroll() {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(nextData, INTERVAL_MS);
    }

    function stopAutoScroll() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        const progressBar = document.getElementById('progressBar');
        if(progressBar) progressBar.style.width = '0%';
    }

    function togglePause() {
        isPaused = !isPaused;
        const btn = document.getElementById('pauseBtn');
        if (isPaused) {
            btn.textContent = '▶️ Lecture';
            btn.classList.add('paused');
            stopAutoScroll();
        } else {
            btn.textContent = '⏸️ Pause';
            btn.classList.remove('paused');
            startAutoScroll();
        }
    }

    async function loadData() {
        try {
            const response = await fetch(API_URL);
            const json = await response.json();
            
            if (json.success && json.data) {
                allData = convertApiData(json.data);
                if (allData.length === 0) {
                     container.innerHTML = '<div class="error-message">Aucune donnée de vent disponible pour cette période.</div>';
                     return;
                }
                calculateGlobalScales(allData);
                currentIndex = 0;

                // Setup HTML structure
                container.innerHTML = `
                    <div class="header">
                        <div class="current-date" id="currentDate">Chargement...</div>
                        <div class="controls">
                            <button class="pause-btn" id="pauseBtn">⏸️ Pause</button>
                            <div class="progress-bar">
                                <div class="progress-fill" id="progressBar"></div>
                            </div>
                        </div>
                    </div>
                    <div id="Details" class="windrose-details-grid">
                        <div class="rose-container" id="probabilityContainer">
                            <div class="rose-title">Rose de Probabilité</div>
                            <div id="windrose"></div>
                        </div>
                        <div class="rose-container" id="speedContainer">
                            <div class="rose-title">Rose de Vitesse</div>
                            <div id="windspeed"></div>
                        </div>
                    </div>
                `;

                // Add event listeners
                document.getElementById('pauseBtn').onclick = togglePause;
                ['probabilityContainer', 'speedContainer'].forEach(id => {
                    const el = document.getElementById(id);
                    el.addEventListener('mouseenter', () => !isPaused && stopAutoScroll());
                    el.addEventListener('mouseleave', () => !isPaused && startAutoScroll());
                });

                displayCurrentData();
                startAutoScroll();
            } else {
                container.innerHTML = `<div class="error-message">❌ Erreur: ${json.error || 'données invalides'}</div>`;
            }
        } catch (error) {
            console.error('Erreur de chargement:', error);
            container.innerHTML = '<div class="error-message">❌ Erreur de chargement des données de la rose des vents.</div>';
        }
    }

    loadData();
}
// public/js/windRose.js

/**
 * Renders an animated wind rose visualization in a specified container.
 * @param {string} containerId - The ID of the DOM element to render the chart in.
 * @param {string} stationId - The ID of the station to fetch data for.
 */
async function renderWindRose(containerId, stationId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id ${containerId} not found.`);
        return;
    }

    container.innerHTML = '<div class="loading">Chargement de la rose des vents...</div>';

    const API_URL = `/query/${stationId}/WindRose?stepCount=12`;
    const INTERVAL_MS = 2000;

    let allData = [];
    let currentIndex = 0;
    let intervalId = null;
    let isPaused = false;
    let globalScales = {
        maxProbability: 0,
        maxSpeed: 0
    };

    const SpeedFactor = 3.6; // m/s to km/h

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

    function maxSpl(data) {
        return Math.max(...Object.values(data).map(d => d.Spl || 0));
    }

    function maxSpd(data) {
        return Math.max(...Object.values(data).map(d => (d.Max || 0) * SpeedFactor));
    }

    function calculateGlobalScales(allData) {
        let maxProb = 0;
        let maxSpdVal = 0;

        allData.forEach(item => {
            const t = totalSpl(item.data);
            if (t > 0) {
                const spl = maxSpl(item.data);
                const prob = spl / t;
                if (prob > maxProb) maxProb = prob;
            }
            const spd = maxSpd(item.data);
            if (spd > maxSpdVal) maxSpdVal = spd;
        });

        globalScales.maxProbability = maxProb;
        globalScales.maxSpeed = maxSpdVal;
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
            .style("float", "left")
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

    function drawCalm(svg, radius, calmPercentage) {
        svg.append("circle")
            .attr("r", radius)
            .style("fill", "#fff")
            .style("stroke", "#000")
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

    function plotProbabilityRose(data, container, R, animate = true) {
        const winds = [], zero = [];
        const t = totalSpl(data);
        const visWidth = R;
        const p = 22, r = visWidth, w = visWidth * 2, h = visWidth * 2;
        const ip = 28;

        const existingSvg = d3.select(container).select("svg");
        let svg;
        
        if (existingSvg.empty()) {
            svg = makeWindContainer(container, w, h, p);
        } else {
            svg = existingSvg.select("g");
            svg.selectAll(".ProbabilityArc").remove();
        }

        let calm = 0;
        for (const key in data) {
            if (key === 'Calm' || key === 'null') {
                calm = data[key].Spl;
            } else if (data[key].Dir !== null && data[key].Dir !== undefined) {
                zero.push({d: data[key].Dir, p: 0, s: 0, m: 0});
                winds.push({
                    d: data[key].Dir,
                    p: t > 0 ? data[key].Spl / t : 0,
                    s: data[key].Spd * SpeedFactor,
                    m: data[key].Max * SpeedFactor
                });
            }
        }

        const SplScale = globalScales.maxProbability;
        let probabilityToRadiusScale, ticks, tickmarks;
        
        if (SplScale > 0.14) {
            probabilityToRadiusScale = d3.scaleLinear().domain([0, SplScale]).range([ip, visWidth]).clamp(true);
            const tickStep = SplScale / 4;
            ticks = d3.range(tickStep, tickStep * 4.001, tickStep);
            tickmarks = d3.range(tickStep, tickStep * 3.001, tickStep);
        } else {
            probabilityToRadiusScale = d3.scaleLinear().domain([0, 0.15]).range([ip, visWidth]).clamp(true);
            ticks = d3.range(0.05, 0.151, 0.05);
            tickmarks = d3.range(0.05, 0.101, 0.05);
        }

        const windProbabilityArcOptions = {
            width: 10,
            from: ip - 2,
            to: d => probabilityToRadiusScale(d.p)
        };

        if (existingSvg.empty()) {
            drawGrid(svg, ticks, probabilityToRadiusScale);
            drawGridScale(svg, tickmarks, d => `${(d * 100).toFixed(0)} %`, probabilityToRadiusScale);
            drawCalm(svg, windProbabilityArcOptions.from, t > 0 ? calm / t : 0);
            drawLevelGrid(svg, r);
        } else {
            svg.select(".calmwind text").text(Math.round((t > 0 ? calm / t : 0) * 100) + "%");
        }

        const arcGen = arc(windProbabilityArcOptions);
        const probabilityArc = svg.append("g").attr("class", "ProbabilityArc");

        probabilityArc.selectAll("path")
            .data(winds, d => d.d)
            .enter().append("path")
            .attr("d", d => arcGen({...d, p: 0, s: 0, m: 0}))
            .attr("class", "arcs")
            .style("fill", speedToColor)
            .append("title");

        const allPaths = svg.select(".ProbabilityArc").selectAll("path");
        
        if (animate) {
            allPaths.transition().duration(500).attr("d", arcGen).style("fill", speedToColor);
        } else {
            allPaths.attr("d", arcGen).style("fill", speedToColor);
        }

        allPaths.select("title")
            .text(d => `${d.d}° \n${(100 * d.p).toFixed(1)} % \n${d.s.toFixed(1)} km/h\nMaxi : ${d.m.toFixed(1)} km/h`);
    }

    function plotSpeedRose(data, container, R, animate = true) {
        const winds = [], zero = [];
        const t = totalSpl(data);
        const visWidth = R;
        const p = 22, r = visWidth, w = visWidth * 2, h = visWidth * 2;
        const ip = 28;

        const existingSvg = d3.select(container).select("svg");
        let svg;
        
        if (existingSvg.empty()) {
            svg = makeWindContainer(container, w, h, p);
        } else {
            svg = existingSvg.select("g");
            svg.selectAll(".speedArcMax").remove();
            svg.selectAll(".speedArc").remove();
        }

        let calm = 0;
        for (const key in data) {
            if (key === 'Calm' || key === 'null') {
                calm = data[key].Spl;
            } else if (data[key].Dir !== null && data[key].Dir !== undefined) {
                zero.push({d: data[key].Dir, p: 0, s: 0, m: 0});
                winds.push({
                    d: data[key].Dir,
                    p: t > 0 ? data[key].Spl / t : 0,
                    s: data[key].Spd * SpeedFactor,
                    m: data[key].Max * SpeedFactor
                });
            }
        }

        const SpdScale = globalScales.maxSpeed;
        let speedToRadiusScale, ticks, tickmarks;
        
        if (SpdScale > 6) {
            speedToRadiusScale = d3.scaleLinear().domain([0, SpdScale]).range([ip, visWidth]).clamp(true);
            const tickStep = SpdScale / 4;
            ticks = d3.range(tickStep, tickStep * 4.001, tickStep);
            tickmarks = d3.range(tickStep, tickStep * 3.001, tickStep);
        } else {
            speedToRadiusScale = d3.scaleLinear().domain([0, 6]).range([ip, visWidth]).clamp(true);
            ticks = d3.range(2, 6.01, 2);
            tickmarks = d3.range(2, 4.01, 2);
        }

        const windSpeedArcOptions = {
            width: 10,
            from: ip - 2,
            to: d => speedToRadiusScale(d.s)
        };

        if (existingSvg.empty()) {
            drawGrid(svg, ticks, speedToRadiusScale);
            drawGridScale(svg, tickmarks, d => `${d.toFixed(1)} km/h`, speedToRadiusScale);
            drawCalm(svg, windSpeedArcOptions.from, t > 0 ? calm / t : 0);
            drawLevelGrid(svg, r);
        } else {
            svg.select(".calmwind text").text(Math.round((t > 0 ? calm / t : 0) * 100) + "%");
        }

        const speedArcMax = svg.append("g").attr("class", "speedArcMax");

        function createChevron(d) {
            const angle = d.d * Math.PI / 180;
            const r = speedToRadiusScale(d.m);
            const width = 8;
            const widthRad = width * Math.PI / 180;
            const chevronHeight = 5;
            
            const x1 = r * Math.sin(angle - widthRad);
            const y1 = -r * Math.cos(angle - widthRad);
            const x2 = (r - chevronHeight) * Math.sin(angle);
            const y2 = -(r - chevronHeight) * Math.cos(angle);
            const x3 = r * Math.sin(angle + widthRad);
            const y3 = -r * Math.cos(angle + widthRad);
            
            return `M ${x1},${y1} L ${x2},${y2} L ${x3},${y3}`;
        }

        const chevrons = speedArcMax.selectAll("path").data(winds, d => d.d);

        const chevronEnter = chevrons.enter().append("path")
            .attr("class", "arcs_max")
            .style("fill", "none")
            .style("stroke", "#222")
            .style("stroke-width", "2px")
            .style("stroke-linecap", "round")
            .style("stroke-linejoin", "round")
            .attr("d", createChevron);

        if (animate) {
            speedArcMax.selectAll("path")
                .transition()
                .duration(500)
                .attrTween("d", function(d) {
                    const previous = d3.select(this).datum() || {m: 0};
                    const interpolateM = d3.interpolate(previous.m, d.m);
                    return function(t) {
                        return createChevron({...d, m: interpolateM(t)});
                    };
                });
        } else {
            chevronEnter.attr("d", createChevron);
        }

        const speedArcGen = arc(windSpeedArcOptions);
        const speedArc = svg.append("g").attr("class", "speedArc");

        speedArc.selectAll("path")
            .data(winds, d => d.d)
            .enter().append("path")
            .attr("d", d => speedArcGen({...d, s: 0}))
            .attr("class", "arcs")
            .style("fill", probabilityToColor)
            .append("title");

        const allPaths = svg.select(".speedArc").selectAll("path");
        
        if (animate) {
            allPaths.transition().duration(500).attr("d", speedArcGen).style("fill", probabilityToColor);
        } else {
            allPaths.attr("d", speedArcGen).style("fill", probabilityToColor);
        }

        allPaths.select("title")
            .text(d => `${d.d}° \n${(100 * d.p).toFixed(1)} % \n${d.s.toFixed(1)} km/h\nMaxi : ${d.m.toFixed(1)} km/h`);
    }

    function convertApiData(apiData) {
        const result = [];
        for (const [dateStr, directions] of Object.entries(apiData)) {
            const converted = {};
            for (const [dir, values] of Object.entries(directions)) {
                if (dir === 'Calm' || dir === 'null') {
                    converted['Calm'] = {
                        Dir: null,
                        Spl: (values.wind?.c || 0) + (values.gust?.c || 0),
                        Spd: 0,
                        Max: 0
                    };
                } else {
                    const dirMap = {
                        "N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5,
                        "E": 90, "ESE": 112.5, "SE": 135, "SSE": 157.5,
                        "S": 180, "SSW": 202.5, "SW": 225, "WSW": 247.5,
                        "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5
                    };
                    converted[dir] = {
                        Dir: dirMap[dir],
                        Spl: (values.wind?.c || 0) + (values.gust?.c || 0),
                        Spd: values.wind?.v || 0,
                        Max: values.gust?.v || 0
                    };
                }
            }
            result.push({ date: dateStr, data: converted });
        }
        return result;
    }

    function displayCurrentData() {
        if (allData.length === 0) return;

        const current = allData[currentIndex];
        const isFirstRender = currentIndex === 0 && d3.select('#windrose').select("svg").empty();
        
        document.getElementById('currentDate').textContent = `📅 ${new Date(current.date).toLocaleString('fr-FR')}`;
        
        plotProbabilityRose(current.data, '#windrose', 120, !isFirstRender);
        plotSpeedRose(current.data, '#windspeed', 120, !isFirstRender);

        if (!isPaused) {
            const progressBar = document.getElementById('progressBar');
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
            setTimeout(() => {
                progressBar.style.transition = `width ${INTERVAL_MS}ms linear`;
                progressBar.style.width = '100%';
            }, 50);
        }
    }

    function nextData() {
        if (isPaused) return;
        currentIndex = (currentIndex + 1) % allData.length;
        displayCurrentData();
    }

    function startAutoScroll() {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(nextData, INTERVAL_MS);
    }

    function stopAutoScroll() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        const progressBar = document.getElementById('progressBar');
        if(progressBar) progressBar.style.width = '0%';
    }

    function togglePause() {
        isPaused = !isPaused;
        const btn = document.getElementById('pauseBtn');
        if (isPaused) {
            btn.textContent = '▶️ Lecture';
            btn.classList.add('paused');
            stopAutoScroll();
        } else {
            btn.textContent = '⏸️ Pause';
            btn.classList.remove('paused');
            startAutoScroll();
        }
    }

    async function loadData() {
        try {
            const response = await fetch(API_URL);
            const json = await response.json();
            
            if (json.success && json.data) {
                allData = convertApiData(json.data);
                if (allData.length === 0) {
                     container.innerHTML = '<div class="error-message">Aucune donnée de vent disponible pour cette période.</div>';
                     return;
                }
                calculateGlobalScales(allData);
                currentIndex = 0;

                // Setup HTML structure
                container.innerHTML = `
                    <div class="header">
                        <div class="current-date" id="currentDate">Chargement...</div>
                        <div class="controls">
                            <button class="pause-btn" id="pauseBtn">⏸️ Pause</button>
                            <div class="progress-bar">
                                <div class="progress-fill" id="progressBar"></div>
                            </div>
                        </div>
                    </div>
                    <div id="Details" class="windrose-details-grid">
                        <div class="rose-container" id="probabilityContainer">
                            <div class="rose-title">Rose de Probabilité</div>
                            <div id="windrose"></div>
                        </div>
                        <div class="rose-container" id="vectorContainer">
                            <div class="rose-title">Vecteurs du vent</div>
                            <div id="windvectors" class="plot-container"></div>
                        </div>
                        <div class="rose-container" id="speedContainer">
                            <div class="rose-title">Rose de Vitesse</div>
                            <div id="windspeed"></div>
                        </div>
                    </div>
                `;

                // Add event listeners
                document.getElementById('pauseBtn').onclick = togglePause;
                ['probabilityContainer', 'vectorContainer', 'speedContainer'].forEach(id => {
                    const el = document.getElementById(id);
                    el.addEventListener('mouseenter', () => !isPaused && stopAutoScroll());
                    el.addEventListener('mouseleave', () => !isPaused && startAutoScroll());
                });

                displayCurrentData();
                startAutoScroll();

                // Load the vector plot
                const vectorUrl = `/query/${stationId}/WindVectors?stepCount=100`;
                loadVectorPlot('windvectors', vectorUrl);
            } else {
                container.innerHTML = `<div class="error-message">❌ Erreur: ${json.error || 'données invalides'}</div>`;
            }
        } catch (error) {
            console.error('Erreur de chargement:', error);
            container.innerHTML = '<div class="error-message">❌ Erreur de chargement des données de la rose des vents.</div>';
        }
    }

    loadData();
}