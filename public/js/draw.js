// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const stepCount = 5000;
    const stationId = urlParams.get('station');
    const sensorKey = urlParams.get('sensor');
    const titleElement = document.getElementById('chart-title');
    const statusBar = document.getElementById('status-bar');

    let meta;
    let chartRawData = null;
    let data = null;
    let chartRawMetadata = null;

    if (!stationId || !sensorKey) {
        titleElement.textContent = 'Erreur : Paramètres manquants';
        showStatus('Station ID ou capteur manquant dans l\'URL.', 'error');
        return;
    }

    const sensorInfo = sensorMap[sensorKey] || { label: sensorKey.replace('_calc', '') };
    titleElement.textContent = `${sensorInfo.label} dans le contexte ${stationId}`;

    if (sensorKey.endsWith('_calc')) {
        loadCalcData();
    } else {
        loadChartData();
    }

    // Initialisation du 3ème graphique (D3)
    renderD3Chart(stationId);

    function toISOStringWithoutMs(date) {
        return date.toISOString().split('.')[0] + "Z";
    }

    function showStatus(message, type) {
        statusBar.textContent = message;
        statusBar.className = `status-message status-${type}`;
        statusBar.style.display = 'block';
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    async function loadCalcData() {
        try {
            showStatus('Chargement des données calculées...', 'loading');

            // 1. Get metadata for the calculated sensor and station config
            const [metaResponse, stationResponse] = await Promise.all([
                fetch(`/api/composite-conditions/${sensorKey}`),
                fetch(`/api/station/${stationId}`)
            ]);

            if (!metaResponse.ok) throw new Error('Erreur de chargement des métadonnées du capteur calculé.');
            if (!stationResponse.ok) throw new Error('Erreur de chargement de la configuration de la station.');
            
            const metaPayload = await metaResponse.json();
            if (!metaPayload.success) throw new Error(metaPayload.error || 'Format de métadonnées invalide.');
            const meta = metaPayload.data[sensorKey];

            const stationPayload = await stationResponse.json();
            if (!stationPayload.success) throw new Error(stationPayload.error || 'Format de configuration invalide.');
            const stationConfig = stationPayload.settings;

            // 2. Dynamically load required JS files
            if (meta.js && meta.js.length > 0) {
                await Promise.all(meta.js.map(loadScript));
            }

            // 3. Fetch raw data for needed sensors
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 derniers jours
            const rawUrl = `/query/${stationId}/Raws/${meta.dataNeeded.join(',')}?startDate=${toISOStringWithoutMs(startDate)}&endDate=${toISOStringWithoutMs(endDate)}&stepCount=500`;
            
            const rawResponse = await fetch(rawUrl);
            if (!rawResponse.ok) throw new Error('Erreur de chargement des données brutes nécessaires.');
            const rawData = await rawResponse.json();
            if (!rawData.success) throw new Error(rawData.error || 'Format de données brutes invalide.');
            
            // 4. Calculate the new data series
            const fn = eval(meta.fn);
            const toUserUnit = meta.toUserUnit ? eval(meta.toUserUnit) : v => v;
            const lon = stationConfig.longitude.lastReadValue;
            const lat = stationConfig.latitude.lastReadValue;

            const calculatedData = rawData.data.map(row => {
                let value = fn.length === 1 ? fn(row) : fn(row.d, lon, lat);
                if (typeof value === 'object' && value !== null) value = value.altitude * 180 / Math.PI;
                return {d: row.d, v: toUserUnit(value)};
            }).filter(d => d.v !== null && !isNaN(d.v));

            // 5. Prepare metadata for charts
            const chartMetadata = {unit: meta.Unit, userUnit: meta.userUnit, toUserUnit: meta.toUserUnit};

            // 6. Render charts
            document.getElementById('candle-chart-container').innerHTML = '<div class="no-data">Graphique en chandeliers non disponible pour les données calculées.</div>';
            renderLineChart(calculatedData, chartMetadata);
            showStatus('Graphiques chargés.', 'success');
            setTimeout(() => statusBar.style.display = 'none', 3000);
        } catch (error) {
            console.error('Erreur de chargement des données calculées:', error);
            showStatus(`Erreur: ${error.message}`, 'error');
        }
    }
    
    async function loadChartData() {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 derniers jours
        const rawUrl = `/query/${stationId}/Raw/${sensorKey}?startDate=${toISOStringWithoutMs(startDate)}&endDate=${toISOStringWithoutMs(endDate)}&stepCount=${stepCount}`;

        try {
            showStatus('Chargement des données...', 'loading');
            const [rawResponse] = await Promise.all([
                fetch(rawUrl)
            ]);

            if (!rawResponse.ok) {
                console.log(rawResponse);
                throw new Error('Erreur lors de la récupération des données des graphiques.');
            }

            const rawData = await rawResponse.json();

            if (rawData.success) {
                chartRawData = rawData.data;
                chartRawMetadata = rawData.metadata;
                // parse toute les value v converti avec rawData.metadata.toUserUnit
                const fn = eval(rawData.metadata.toUserUnit);
                data = chartRawData.map(row => ({d: new Date(row.d), v: fn(row.v)}));
                renderMinMaxChart(data, chartRawMetadata);
                renderLineChart(data, rawData.metadata);
            } else {
                document.getElementById('candle-chart-container').innerHTML = `<div class="no-data">Erreur de chargement des données: ${rawData.error || ''}</div>`;
            }

            showStatus('Graphiques chargés.', 'success');
            setTimeout(() => statusBar.style.display = 'none', 3000);
        } catch (error) {
            console.error('Erreur de chargement:', error);
            showStatus(`Erreur: ${error.message}`, 'error');
        }
    }

    function renderMinMaxChart(data, metadata) {
        const chartContainer = document.getElementById('candle-chart-container');
        if (!data || data.length === 0) {
            chartContainer.innerHTML = '<div class="no-data">Aucune donnée disponible pour ce graphique.</div>';
            return;
        }
        const kSlider = document.getElementById('k-slider');
        
        const k = kSlider.value * stepCount / 10 / 100;
        const plot = Plot.plot({
            width: chartContainer.clientWidth,
            height: 400,
            x: { type: "time", label: "Date" },
            y: { label: `${sensorInfo.label} (${metadata.userUnit})`, grid: true },
            marks: [
                Plot.lineY(data, {x: "d", y: "v", strokeOpacity: 0.3}),
                Plot.lineY(data, Plot.windowY({k, reduce: "min"}, {x: "d", y: "v", stroke: "blue"})),
                Plot.lineY(data, Plot.windowY({k, reduce: "max"}, {x: "d", y: "v", stroke: "red"})),
                Plot.lineY(data, Plot.windowY({k, reduce: "mean"}, {x: "d", y: "v"})),
                Plot.dot(data, Plot.pointerX( Plot.windowY({k, reduce: "mean"}, {x: "d", y: "v"}))),
                Plot.text(data, Plot.pointerX({
                    px: "d", py: "v", dy: -16, dx: -20,
                    frameAnchor: "top-right",
                    fontVariant: "tabular-nums",
                    text: (d) => `${d.d.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})}  ${d.v} ${metadata.userUnit}`
                }))
            ]
        });

        chartContainer.innerHTML = '';
        chartContainer.appendChild(plot);
    }

    function renderLineChart(data, metadata) {
        const chartContainer = document.getElementById('raw-chart-container');
         if (!data || data.length === 0) {
            chartContainer.innerHTML = '<div class="no-data">Aucune donnée disponible pour ce graphique.</div>';
            return;
        }
        const period = document.getElementById('period-slider').value;
        const plot = Plot.plot({
            width: chartContainer.clientWidth,
            height: 400,
            x: { type: "time", label: "Date" },
            y: { label: `${sensorInfo.label} (${metadata.userUnit})`, grid: true },
            marks: [
                Plot.differenceY(data, Plot.shiftX(`+${period} day`, {
                    x: "d",
                    y: "v",
                    stroke: "#4dc0e0",
                    positiveFill : "#FF6B6B",
                    negativeFill : "#98FB98",
                    fillOpacity: 0.6,
                    // curve: metadata.measurement === 'rain' ? "step" : "monotone-x",
                })),
                Plot.dot(data, Plot.pointerX({x: "d", y: "v", stroke: "red"})),
                Plot.text(data, Plot.pointerX({
                    px: "d", py: "v", dy: -16, dx: -20,
                    frameAnchor: "top-right",
                    fontVariant: "tabular-nums",
                    text: (d) => `delta [${period} day] / ${d.d.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})} - ${d.v} ${metadata.userUnit}`
                }))
            ]
        });
        chartContainer.innerHTML = '';
        chartContainer.appendChild(plot);
    }

    function initializeFullscreenButton() {
        const fullscreenBtn = document.getElementById('fullscreenToggleBtn');
        if (!fullscreenBtn) return;

        function updateButtonAppearance() {
            if (!fullscreenBtn) return; 
            if (document.fullscreenElement) {
                fullscreenBtn.src = 'img/Reduce.png';
                fullscreenBtn.title = "Quitter le mode plein écran (Esc)";
            } else {
                fullscreenBtn.src = 'img/Expand.png';
                fullscreenBtn.title = "Passer en mode plein écran (F11)";
            }
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    showStatus(`Mode plein écran non supporté ou refusé.`, 'warning');
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', updateButtonAppearance);
        updateButtonAppearance(); 
    }
    initializeFullscreenButton();

    function initializeToggleD3ChartButton() {
        const toggleBtn = document.getElementById('toggleD3ChartBtn');
        const chartContainer = document.getElementById('d3-chart-container');

        if (!toggleBtn || !chartContainer) return;

        toggleBtn.addEventListener('click', () => {
            const isHidden = chartContainer.classList.contains('hidden');
            if (isHidden) {
                chartContainer.classList.remove('hidden');
                toggleBtn.src = 'img/Reduce.png';
                toggleBtn.alt = 'Réduire';
                toggleBtn.title = 'Masquer le graphique';
            } else {
                chartContainer.classList.add('hidden');
                toggleBtn.src = 'img/Expand.png';
                toggleBtn.alt = 'Agrandir';
                toggleBtn.title = 'Afficher le graphique';
            }
        });
    }
    initializeToggleD3ChartButton();

    const kSlider = document.getElementById('k-slider');
    if (kSlider) {
        kSlider.addEventListener('input', () => {
            if (data) {
                renderMinMaxChart(data, chartRawMetadata);
            }
        });
    }
    
    const periodSlider = document.getElementById('period-slider');
    if (periodSlider) {
        periodSlider.addEventListener('input', () => {
            if (data) {
                renderLineChart(data, chartRawMetadata);
            }
        });
    }
});

function renderD3Chart(stationId) {
    // Configuration globale
    const d3ChartContainer = document.getElementById('d3-chart-container');
    if (!d3ChartContainer) return;

    const margin = { top: 20, right: 80, bottom: 40, left: 80 };
    const width = d3ChartContainer.clientWidth;
    const height = 500;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Variables pour le graphique D3
    let svg, xScale, yScales = {}, currentData = null, metadata = null;
    let colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    let zoomTransform = d3.zoomIdentity;
    let overlay;

    function showD3Status(message, type = 'loading') {
        const statusDiv = document.getElementById('d3-status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
    }

    function hideD3Status() {
        document.getElementById('d3-status').style.display = 'none';
    }

    async function loadData() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {
            sensors: urlParams.get('sensor'),
            stationId: urlParams.get('station'),
            stepCount: '5000',
            endDate: new Date(),
            startDate: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000) // 7 derniers jours
        };
        
        const { sensors, stepCount, startDate, endDate } = params;
        
        if (!sensors) {
            showD3Status('Veuillez spécifier au moins un capteur.', 'error');
            return;
        }

        showD3Status('Chargement des données...');
        
        try {
            const toISOStringWithoutMs = (date) => date.toISOString().split('.')[0] + "Z";
            let url = `/query/${stationId}/Raws/${sensors}?stepCount=${stepCount}`;
            
            if (startDate) url += `&startDate=${encodeURIComponent(toISOStringWithoutMs(startDate))}`;
            if (endDate) url += `&endDate=${encodeURIComponent(toISOStringWithoutMs(endDate))}`;
            
            console.log('Fetching for D3 chart:', url);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message || 'Erreur lors du chargement des données');

            currentData = data.data;
            metadata = data.metadata;
            
            processData();
            createChart();
            
            showD3Status(`${currentData.length} points de données chargés avec succès`, 'success');
            setTimeout(hideD3Status, 3000);
            
        } catch (error) {
            console.error('Erreur D3 chart:', error);
            showD3Status(`Erreur: ${error.message}`, 'error');
        }
    }

    function processData() {
        Object.keys(metadata.toUserUnit).forEach(
            key => metadata.toUserUnit[key].fnFromMetric = eval(metadata.toUserUnit[key].fnFromMetric)
        );
        
        currentData.forEach(d => {
            d.datetime = new Date(d.d);
            Object.keys(d).forEach(key => {
                if (key !== 'd' && key !== 'datetime' && d[key] !== null) {
                    d[key] = metadata.toUserUnit[key].fnFromMetric(d[key]);
                }
            });
        });
        currentData.sort((a, b) => a.datetime - b.datetime);
    }

    function createChart() {
        d3.select("#d3-chart").selectAll("*").remove();

        svg = d3.select("#d3-chart").append("svg").attr("width", width).attr("height", height);

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        svg.append("defs").append("clipPath").attr("id", "clip").append("rect").attr("width", innerWidth).attr("height", innerHeight);

        xScale = d3.scaleTime().domain(d3.extent(currentData, d => d.datetime)).range([0, innerWidth]);

        const measurementGroups = metadata.measurement;
        const groupKeys = Object.keys(measurementGroups);
        
        yScales = {};
        
        groupKeys.forEach((groupName, index) => {
            const sensors = measurementGroups[groupName];
            const validSensors = sensors.filter(sensor => currentData.some(d => d[sensor] !== null && d[sensor] !== undefined));
            
            if (validSensors.length > 0) {
                const allValues = [];
                validSensors.forEach(sensor => {
                    currentData.forEach(d => {
                        if (d[sensor] !== null && d[sensor] !== undefined) allValues.push(d[sensor]);
                    });
                });
                
                if (allValues.length > 0) {
                    const extent = d3.extent(allValues);
                    const padding = (extent[1] - extent[0]) * 0.05;
                    
                    yScales[groupName] = {
                        scale: d3.scaleLinear().domain([extent[0] - padding, extent[1] + padding]).range([innerHeight, 0]),
                        sensors: validSensors,
                        orientation: (index+1 >> 1) & 1 ?'right':'left',
                        position: (index & 1) ? 'right':'left',
                        index: Math.floor(index / 2)
                    };
                }
            }
        });

        createAxes(g);
        createLines(g);
        createLegend(g);
        addInteraction(g);
        addZoom();
    }

    function createAxes(g) {
        g.append("g").attr("class", "axis axis-x").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(xScale).tickSize(2));

        Object.entries(yScales).forEach(([groupName, scaleInfo]) => {
            const sensor = metadata.measurement[groupName][0];
            const unit = metadata.toUserUnit[sensor].userUnit;
            const orientation = scaleInfo.orientation === 'left';
            const position = scaleInfo.position === 'left';
            
            const axis = orientation ? d3.axisLeft(scaleInfo.scale).tickSize(2) : d3.axisRight(scaleInfo.scale).tickSize(3);
            const transform = position ? `translate(0,0)` : `translate(${innerWidth},0)`;

            g.append("g").attr("class", `axis axis-y axis-${groupName}`).attr("transform", transform).call(axis);
            
            const labelX = (position ? 0 : innerWidth) + (orientation ? -20 : 20);
            g.append("text").attr("class", "axis-label").attr("transform", `translate(${labelX},5)`).style("text-anchor", "middle").style("font-size", "10px").style("font-weight", "bold").text(unit);
        });
    }

    function createLines(g) {
        const linesGroup = g.append("g").attr("clip-path", "url(#clip)");
        Object.entries(yScales).forEach(([groupName, scaleInfo]) => {
            scaleInfo.sensors.forEach(sensor => {
                const line = d3.line()
                    .x(d => xScale(d.datetime))
                    .y(d => scaleInfo.scale(d[sensor]))
                    .defined(d => d[sensor] !== null && d[sensor] !== undefined)
                    .curve(sensor.startsWith('rain:') ? d3.curveStep : d3.curveBasis);

                linesGroup.append("path").datum(currentData).attr("class", `line line-${sensor.replace(":", "_")}`).attr("d", line).style("stroke", colorScale(sensor.replace(":", "_"))).style("opacity", 0).transition().duration(500).style("opacity", 1);
            });
        });
    }

    function createLegend(g) {
        const legend = g.append("g").attr("class", "legend").attr("transform", `translate(${innerWidth - 150}, 20)`);
        let yOffset = 0;
        Object.entries(yScales).forEach(([groupName, scaleInfo]) => {
            legend.append("text").attr("x", 0).attr("y", yOffset).style("font-weight", "bold").style("font-size", "11px").text(groupName);
            yOffset += 15;
            scaleInfo.sensors.forEach(sensor => {
                const item = legend.append("g").attr("transform", `translate(10, ${yOffset})`);
                item.append("line").attr("x1", 0).attr("x2", 15).attr("y1", 0).attr("y2", 0).style("stroke", colorScale(sensor.replace(":", "_"))).style("stroke-width", 2);
                item.append("text").attr("x", 20).attr("y", 0).attr("dy", "0.35em").style("font-size", "10px").text(sensor);
                yOffset += 12;
            });
            yOffset += 5;
        });
    }

    function updateTooltip(event) {
        const currentXScale = zoomTransform.rescaleX(xScale);
        const bisect = d3.bisector(d => d.datetime).left;
        const x0 = currentXScale.invert(d3.pointer(event)[0]);
        const i = bisect(currentData, x0, 1);
        const d = currentData[i];
        const focus = svg.select(".focus");
        const tooltip = focus.select(".tooltip");
        const dotsGroup = focus.select(".dots");
        if (d) {
            focus.style("display", null);
            focus.attr("transform", `translate(${currentXScale(d.datetime)},0)`);
            tooltip.selectAll("*").remove();
            dotsGroup.selectAll("*").remove();
            tooltip.append("text").attr("x", -58).attr("y", -5).style("font-size", "11px").style("font-weight", "bold").text(d3.timeFormat("%Y-%m-%d %H:%M")(d.datetime));
            let yPos = 10;
            Object.entries(yScales).forEach(([groupName, scaleInfo]) => {
                scaleInfo.sensors.forEach(sensor => {
                    if (d[sensor] !== null && d[sensor] !== undefined) {
                        dotsGroup.append("circle").attr("cx", 0).attr("cy", scaleInfo.scale(d[sensor])).attr("r", 3).attr("stroke", colorScale(sensor.replace(":", "_"))).attr("stroke-width", 1).attr("fill", "none").style("pointer-events", "none");
                        tooltip.append("text").attr("x", 5).attr("y", yPos).style("font-size", "10px").style("fill", colorScale(sensor.replace(":", "_"))).text(`${d[sensor]} ${metadata.toUserUnit[sensor].userUnit}`);
                        tooltip.append("text").attr("x", -5).attr("y", yPos).attr("text-anchor", "end").style("font-size", "10px").style("fill", colorScale(sensor.replace(":", "_"))).text(`${sensor}`);
                        yPos += 12;
                    }
                });
            });
        } else {
             focus.style("display", "none");
        }
    }

    function addInteraction(g) {
        const focus = g.append("g").attr("class", "focus").style("display", "none");
        focus.append("line").attr("class", "focus-line").attr("y1", 0).attr("y2", innerHeight).style("stroke", "#666").style("stroke-dasharray", "3,3");
        focus.append("g").attr("class", "tooltip");
        focus.append("g").attr("class", "dots");
        overlay = g.append("rect").attr("class", "overlay").attr("width", innerWidth).attr("height", innerHeight).on("mouseover", () => focus.style("display", null)).on("mouseout", () => focus.style("display", "none")).on("mousemove", updateTooltip);
    }

    function addZoom() {
        const zoom = d3.zoom().scaleExtent([1, 50]).extent([[0, 0], [innerWidth, innerHeight]]).on("zoom", function(event) {
            zoomTransform = event.transform;
            const newXScale = zoomTransform.rescaleX(xScale);
            svg.select(".axis-x").call(d3.axisBottom(newXScale));
            Object.entries(yScales).forEach(([groupName, scaleInfo]) => {
                scaleInfo.sensors.forEach(sensor => {
                    const line = d3.line().x(d => newXScale(d.datetime)).y(d => scaleInfo.scale(d[sensor])).defined(d => d[sensor] !== null && d[sensor] !== undefined).curve(sensor.startsWith('rain:') ? d3.curveStep : d3.curveBasis);
                    svg.select(`.line-${sensor.replace(":", "_")}`).attr("d", line);
                });
            });
            const pointer = d3.pointer(event, overlay.node());
            if (pointer) {
                updateTooltip({ clientX: pointer[0], clientY: pointer[1] });
            }
        });
        svg.call(zoom);
    }

    loadData();
}