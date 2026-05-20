// Probe\public\js\drawing\Candles.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/
// Modified: OHLC Bar chart for Candle.html

let APIURL_BASE = '';

/**
 * Construit et gère tout le SVG de visualisation des bougies (OHLC)
 * @param {HTMLElement} container - L'élément DOM dans lequel créer le SVG
 * @param {string} stationName - Nom de la station
 * @param {Array<string>} sensorList - Liste des capteurs
 */
async function mainCandlePlots(container, stationName, sensorList, startDate = '', endDate = '') {
    try {
        const stepCount = Math.floor(window.innerWidth / 10); // 1 candle per 10 pixels

        let combinedDataMap = new Map();
        let combinedMetadata = {
            measurement: {},
            toUserUnit: {},
            intervalSeconds: null
        };

        for (const sensor of sensorList) {
            const url = `/query/${stationName}/Candle/${sensor}?startDate=${startDate}&endDate=${endDate}&stepCount=${stepCount}`;
            const apiResponse = await queryManager.query(url);

            if (apiResponse && apiResponse.success && apiResponse.data) {
                const meta = apiResponse.metadata;
                // Merge metadata
                const type = meta.measurement;
                if (!combinedMetadata.measurement[type]) combinedMetadata.measurement[type] = [];
                if (!combinedMetadata.measurement[type].includes(sensor)) {
                    combinedMetadata.measurement[type].push(sensor);
                }
                combinedMetadata.toUserUnit[sensor] = { userUnit: meta.userUnit };
                if (!combinedMetadata.intervalSeconds) combinedMetadata.intervalSeconds = meta.intervalSeconds;

                // Merge data
                apiResponse.data.forEach(d => {
                    const timeMs = new Date(d.d).getTime();
                    if (!combinedDataMap.has(timeMs)) {
                        combinedDataMap.set(timeMs, { datetime: new Date(d.d) });
                    }
                    const row = combinedDataMap.get(timeMs);
                    row[sensor] = {
                        Open: d.Open,
                        High: d.High,
                        Low: d.Low,
                        Close: d.Close,
                        Mean: d.Mean,
                        Count: d.Count
                    };
                });
            }
        }

        // Sort data
        const plotData = Array.from(combinedDataMap.values()).sort((a, b) => a.datetime - b.datetime);

        window.plotMetadata = combinedMetadata;

        const plot = new CandlePlot(container, plotData, combinedMetadata, stationName, sensorList);
        container.__current_plot_instance = plot;
        plot.create();

    } catch (error) {
        console.error('Erreur:', error);
    }
}

class CandlePlot {
    constructor(container, data, metadata, stationName, sensorList) {
        this.container = container;
        this.id = container.id || 'plot-' + Math.random().toString(36).substr(2, 9);
        this.data = data;
        this.originalData = [...data];
        this.metadata = metadata;
        this.stationName = stationName;
        this.sensorList = sensorList;

        this.margin = { top: 10, right: 40, bottom: 20, left: 40 };
        this.width = window.innerWidth;
        this.height = window.isMobile ? 200 : 300;
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        this.svg = null;
        this.g = null;
        this.xScale = null;
        this.yScales = {};
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        this.brush = null;
        this.isBrushing = false;

        this.initializeScales();
    }

    initializeScales() {
        this.xScale = d3.scaleTime()
            .domain(d3.extent(this.data, d => d.datetime))
            .range([0, this.innerWidth]);

        Object.entries(this.metadata.measurement).forEach(([groupName, sensors], index) => {
            const validSensors = sensors.filter(sensor => this.data.some(d => d[sensor] !== undefined));

            if (validSensors.length > 0) {
                // Find global min and max using Low and High
                let min = Infinity;
                let max = -Infinity;
                validSensors.forEach(sensor => {
                    this.data.forEach(d => {
                        if (d[sensor] !== undefined && d[sensor].Low !== null && d[sensor].High !== null) {
                            if (d[sensor].Low < min) min = d[sensor].Low;
                            if (d[sensor].High > max) max = d[sensor].High;
                        }
                    });
                });

                if (min !== Infinity && max !== -Infinity) {
                    const padding = (max - min) * 0.05;
                    this.yScales[groupName] = {
                        scale: d3.scaleLinear()
                            .domain([min - padding, max + padding])
                            .range([this.innerHeight, 0]),
                        sensors: validSensors,
                        orientation: (index + 1) >> 1 & 1 ? 'right' : 'left',
                        position: (index & 1) ? 'right' : 'left'
                    };
                }
            }
        });
    }

    createSVG() {
        const container = d3.select(this.container);
        container.selectAll("*").remove();

        this.svg = container.append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .style("position", "relative");

        this.g = this.svg.append("g")
            .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

        const defs = this.svg.append("defs");
        defs.append("clipPath")
            .attr("id", `clip-${this.id}`)
            .append("rect")
            .attr("width", this.innerWidth)
            .attr("height", this.innerHeight);
    }

    createNowLine() {
        const now = new Date();
        const domain = this.xScale.domain();
        this.g.select(".now-line").remove();

        if (now >= domain[0] && now <= domain[1]) {
            const nowX = this.xScale(now);
            this.g.append("line")
                .attr("class", "now-line")
                .attr("x1", nowX)
                .attr("x2", nowX)
                .attr("y1", 0)
                .attr("y2", this.innerHeight)
                .style("stroke", "#aaa")
                .style("stroke-width", "1")
                .style("stroke-dasharray", "5,5")
                .style("opacity", 0.6)
                .style("pointer-events", "none");
        }
    }

    create() {
        this.createSVG();
        this.createCandles();
        this.createAxes();
        this.createNowLine();
        this.createBrush();
        this.createTooltip();
        this.createControls();
    }

    createControls() {
        if (!this.stationName || !this.sensorList || this.sensorList.length === 0) return;

        const container = d3.select(this.container);
        const isFullscreenPage = !!document.getElementById('fs-btn');

        const controlDiv = container.append("div")
            .attr("class", "plot-controls")
            .style("position", "absolute")
            .style("top", "5px")
            .style("right", isFullscreenPage ? "50px" : "5px")
            .style("z-index", 100);

        const iconOriginal = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

        const linkBtn = controlDiv.append("button")
            .attr("class", "plot-btn")
            .attr("title", "Ouvrir la vue Bougies en plein écran")
            .style("background", "rgba(0, 0, 0, 0.6)")
            .style("border", "1px solid #444")
            .style("color", "#ccc")
            .style("padding", "3px 5px")
            .style("cursor", "pointer")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .html(iconOriginal)
            .on("mouseover", function () { d3.select(this).style("background", "#333").style("color", "#fff"); })
            .on("mouseout", function () { d3.select(this).style("background", "rgba(0, 0, 0, 0.6)").style("color", "#ccc"); });

        const url = `Candle.html?station=${this.stationName}&sensorList=${this.sensorList.join(',')}`;

        linkBtn.on("click", (e) => {
            e.stopPropagation();
            if (!isFullscreenPage) window.open(url, '_blank');
        });

        if (isFullscreenPage) controlDiv.style("display", "none");
    }

    createAxes() {
        this.g.append("g")
            .attr("class", "axis axis-x")
            .attr("transform", `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale).tickSize(2));

        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            const sensor = this.metadata.measurement[groupName][0];
            const unit = this.metadata.toUserUnit[sensor].userUnit;
            const isLeft = scaleInfo.position === 'left';

            const axis = scaleInfo.orientation === 'left'
                ? d3.axisLeft(scaleInfo.scale).tickSize(2)
                : d3.axisRight(scaleInfo.scale).tickSize(3);

            const transform = isLeft ? `translate(0,0)` : `translate(${this.innerWidth},0)`;

            this.g.append("g")
                .attr("class", `axis axis-y axis-${groupName}`)
                .attr("transform", transform)
                .call(axis);

            const labelX = (isLeft ? 0 : this.innerWidth) + (scaleInfo.orientation === 'left' ? -20 : 20);

            this.g.append("text")
                .attr("class", `axis-label axis-label-${groupName}`)
                .attr("transform", `translate(${labelX},-2)`)
                .style("text-anchor", "middle")
                .style("font-size", "10px")
                .style("font-weight", "bold")
                .text(unit);
        });
    }

    createCandles(withTransition = true) {
        let linesGroup = this.g.select(".lines-group");
        if (linesGroup.empty()) {
            linesGroup = this.g.append("g")
                .attr("class", "lines-group")
                .attr(`clip-path`, `url(#clip-${this.id})`);
        } else {
            linesGroup.selectAll("*").remove();
        }

        const tickWidth = Math.max(2, (this.innerWidth / this.data.length) * 0.4); // Left/Right stick width

        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            const activeSensors = this.metadata.measurement[groupName] || [];
            scaleInfo.sensors.filter(s => activeSensors.includes(s)).forEach(sensor => {
                const filteredData = this.data.filter(d => d[sensor] !== undefined && d[sensor].Low !== null);
                if (filteredData.length === 0) return;

                const sensorId = sensor.replace(":", "_");
                const color = this.colorScale(sensorId);

                const candleGroup = linesGroup.append("g")
                    .attr("class", `candle-group candle-group-${sensorId}`)
                    .style("stroke-width", 1.5)
                    .style("fill", "none");

                // Add the average line generator (dashed line, hidden by default)
                const meanLineGen = d3.line()
                    .x(d => this.xScale(d.datetime))
                    .y(d => scaleInfo.scale(d[sensor].Mean))
                    .defined(d => d[sensor] !== undefined && d[sensor].Mean !== null && !isNaN(d[sensor].Mean))
                    .curve(d3.curveCatmullRom.alpha(0.35));

                candleGroup.append("path")
                    .datum(filteredData)
                    .attr("class", "mean-line")
                    .attr("d", meanLineGen)
                    .style("stroke", color)
                    .style("fill", "none")
                    .style("stroke-width", "1.5px")
                    .style("display", "none"); // Hidden by default, Candle.html toggles display: block

                const candles = candleGroup.selectAll(".ohlc-bar")
                    .data(filteredData)
                    .enter()
                    .append("g")
                    .attr("class", "ohlc-bar");

                // Upper wick (High to Max of Open/Close) - 1.5px thickness, sensor color
                candles.append("line")
                    .attr("class", "wick-upper")
                    .attr("x1", d => this.xScale(d.datetime))
                    .attr("x2", d => this.xScale(d.datetime))
                    .attr("y1", d => scaleInfo.scale(d[sensor].High))
                    .attr("y2", d => scaleInfo.scale(Math.max(d[sensor].Open, d[sensor].Close)))
                    .style("stroke", color)
                    .style("stroke-width", 1.5);

                // Lower wick (Min of Open/Close to Low) - 1.5px thickness, sensor color
                candles.append("line")
                    .attr("class", "wick-lower")
                    .attr("x1", d => this.xScale(d.datetime))
                    .attr("x2", d => this.xScale(d.datetime))
                    .attr("y1", d => scaleInfo.scale(Math.min(d[sensor].Open, d[sensor].Close)))
                    .attr("y2", d => scaleInfo.scale(d[sensor].Low))
                    .style("stroke", color)
                    .style("stroke-width", 1.5);

                // Body (Max of Open/Close to Min of Open/Close) - 3px thickness, sensor color
                candles.append("line")
                    .attr("class", "candle-body")
                    .attr("x1", d => this.xScale(d.datetime))
                    .attr("x2", d => this.xScale(d.datetime))
                    .attr("y1", d => scaleInfo.scale(Math.max(d[sensor].Open, d[sensor].Close)))
                    .attr("y2", d => scaleInfo.scale(Math.min(d[sensor].Open, d[sensor].Close)))
                    .style("stroke", color)
                    .style("stroke-width", 3);

                // Left stick (Open) - Green if Close >= Open, Red if Close < Open
                candles.append("line")
                    .attr("class", "tick-open")
                    .attr("x1", d => this.xScale(d.datetime) - tickWidth)
                    .attr("x2", d => this.xScale(d.datetime))
                    .attr("y1", d => scaleInfo.scale(d[sensor].Open))
                    .attr("y2", d => scaleInfo.scale(d[sensor].Open))
                    .style("stroke", d => d[sensor].Close >= d[sensor].Open ? "#26a69a" : "#ef5350")
                    .style("stroke-width", 1.5);

                // Right stick (Close) - Green if Close >= Open, Red if Close < Open
                candles.append("line")
                    .attr("class", "tick-close")
                    .attr("x1", d => this.xScale(d.datetime))
                    .attr("x2", d => this.xScale(d.datetime) + tickWidth)
                    .attr("y1", d => scaleInfo.scale(d[sensor].Close))
                    .attr("y2", d => scaleInfo.scale(d[sensor].Close))
                    .style("stroke", d => d[sensor].Close >= d[sensor].Open ? "#26a69a" : "#ef5350")
                    .style("stroke-width", 1.5);

                if (withTransition) {
                    candleGroup.style("opacity", 0)
                        .transition()
                        .duration(750)
                        .style("opacity", 1);
                }
            });
        });

        if (typeof this.onUpdate === 'function' && !withTransition) {
            this.onUpdate();
        }
    }

    createBrush() {
        this.brush = d3.brushX()
            .extent([[0, 0], [this.innerWidth, this.innerHeight]])
            .on("start", () => this.brushStarted())
            .on("brush", (event) => this.brushBrushed(event))
            .on("end", (event) => this.brushEnded(event));

        const brushGroup = this.g.append("g")
            .attr("class", "brush")
            .call(this.brush);

        this.brushStartLabel = brushGroup.append("text")
            .attr("class", "brush-label brush-start-label")
            .attr("text-anchor", "end")
            .style("display", "none");

        this.brushEndLabel = brushGroup.append("text")
            .attr("class", "brush-label brush-end-label")
            .attr("text-anchor", "start")
            .style("display", "none");

        this.brushDurationLabel = this.g.append("text")
            .attr("class", "brush-duration-label")
            .attr("x", this.innerWidth / 2)
            .attr("y", -2)
            .attr("text-anchor", "middle")
            .style("font-size", "9px")
            .style("display", "none");

        brushGroup.select(".overlay").on("dblclick", (event) => {
            event.stopPropagation();
            this.resetZoom();
        });
    }

    brushStarted() {
        this.isBrushing = true;
        this.g.select(".focus").style("display", "none");
        this.brushStartLabel.style("display", null);
        this.brushEndLabel.style("display", null);
        this.brushDurationLabel.style("display", null);
    }

    brushBrushed(event) {
        if (!event.selection) return;
        const [mouseX] = d3.pointer(event, event.sourceEvent.currentTarget);
        const [x0, x1] = event.selection;
        const startDate = this.xScale.invert(x0);
        const endDate = this.xScale.invert(x1);
        const duration = endDate - startDate;
        const days = duration / (1000 * 60 * 60 * 24);

        this.brushDurationLabel
            .text(`${days.toFixed(1)} Days`)
            .attr("x", mouseX - 5)
            .style("fill", duration < 12 * 60 * 60 * 1000 ? "#888" : "#eee")
            .style("font-weight", duration < 12 * 60 * 60 * 1000 ? "normal" : "bold");
    }

    brushEnded(event) {
        this.brushDurationLabel.style("display", "none");
        if (!event.selection) {
            this.isBrushing = false;
            this.brushStartLabel.style("display", "none");
            this.brushEndLabel.style("display", "none");
            return;
        }

        const [x0, x1] = event.selection;
        const startDate = this.xScale.invert(x0);
        const endDate = this.xScale.invert(x1);
        const duration = endDate - startDate;

        this.g.select(".brush").call(this.brush.move, null);
        this.brushStartLabel.style("display", "none");
        this.brushEndLabel.style("display", "none");
        this.isBrushing = false;

        const minDuration = 12 * 60 * 60 * 1000;
        if (duration < minDuration) {
            return;
        }

        const filteredData = this.data.filter(d =>
            d.datetime >= startDate && d.datetime <= endDate
        );

        if (filteredData.length === 0) {
            return;
        }

        // 1. Perform local zoom animation immediately (very smooth)
        this.xScale.domain([startDate, endDate]);
        this.updateYDomains(filteredData);
        this.updateAxes();
        this.createNowLine();
        this.updateCandles();

        // 2. Fetch new high resolution data after transition (API call like in Plots.js)
        setTimeout(() => {
            const durationMargin = duration * 0.2; // 20% margin
            const adjustedStartDate = new Date(startDate.getTime() - durationMargin);
            const adjustedEndDate = new Date(endDate.getTime() + durationMargin);

            const formatDateAPI = d3.timeFormat("%Y-%m-%dT%H:%M:00Z");
            const apiStartDate = formatDateAPI(adjustedStartDate);
            const apiEndDate = formatDateAPI(adjustedEndDate);

            // Keep window date globals in sync in case other code uses them
            window.currentStartDate = apiStartDate;
            window.currentEndDate = apiEndDate;

            const stepCount = Math.floor(window.innerWidth / 10);

            const promises = this.sensorList.map(sensor => {
                const url = `/query/${this.stationName}/Candle/${sensor}?startDate=${apiStartDate}&endDate=${apiEndDate}&stepCount=${stepCount}`;
                return queryManager.query(url).then(res => ({ sensor, res }));
            });

            Promise.all(promises)
                .then(results => {
                    let combinedDataMap = new Map();
                    let combinedMetadata = {
                        measurement: {},
                        toUserUnit: {},
                        intervalSeconds: null
                    };

                    results.forEach(({ sensor, res }) => {
                        if (res && res.success && res.data) {
                            const meta = res.metadata;
                            const type = meta.measurement;
                            if (!combinedMetadata.measurement[type]) combinedMetadata.measurement[type] = [];
                            if (!combinedMetadata.measurement[type].includes(sensor)) {
                                combinedMetadata.measurement[type].push(sensor);
                            }
                            combinedMetadata.toUserUnit[sensor] = { userUnit: meta.userUnit };
                            if (!combinedMetadata.intervalSeconds) combinedMetadata.intervalSeconds = meta.intervalSeconds;

                            res.data.forEach(d => {
                                const timeMs = new Date(d.d).getTime();
                                if (!combinedDataMap.has(timeMs)) {
                                    combinedDataMap.set(timeMs, { datetime: new Date(d.d) });
                                }
                                const row = combinedDataMap.get(timeMs);
                                row[sensor] = {
                                    Open: d.Open,
                                    High: d.High,
                                    Low: d.Low,
                                    Close: d.Close,
                                    Mean: d.Mean,
                                    Count: d.Count
                                };
                            });
                        }
                    });

                    const newData = Array.from(combinedDataMap.values()).sort((a, b) => a.datetime - b.datetime);
                    if (newData.length > 0) {
                        this.data = newData;
                        this.metadata = combinedMetadata;
                        window.plotMetadata = combinedMetadata;

                        // Recalculate Y domains with the new zoomed-in high-resolution data
                        this.updateYDomains(this.data);
                        this.updateAxes();
                        this.createNowLine();

                        setTimeout(() => this.updateCandles(false), 1000);
                    }
                })
                .catch(error => {
                    console.error('Erreur API:', error);
                });
        }, 800);
    }

    resetZoom() {
        this.data = [...this.originalData];
        this.initializeScales();
        this.updateAxes();
        this.createNowLine();
        this.updateCandles(false);

        if (typeof window.set1YearRange === 'function') {
            window.set1YearRange();
        }
        if (typeof window.drawChart === 'function') {
            window.drawChart();
        }
    }

    updateYDomains(filteredData) {
        Object.entries(this.metadata.measurement).forEach(([groupName, sensors]) => {
            const validSensors = sensors.filter(sensor =>
                filteredData.some(d => d[sensor] !== undefined && d[sensor].Low !== null && d[sensor].High !== null)
            );

            if (validSensors.length > 0) {
                let min = Infinity;
                let max = -Infinity;
                validSensors.forEach(sensor => {
                    filteredData.forEach(d => {
                        if (d[sensor] !== undefined && d[sensor].Low !== null && d[sensor].High !== null) {
                            if (d[sensor].Low < min) min = d[sensor].Low;
                            if (d[sensor].High > max) max = d[sensor].High;
                        }
                    });
                });

                if (min !== Infinity && max !== -Infinity) {
                    const padding = (max - min) * 0.05;
                    if (this.yScales[groupName]) {
                        this.yScales[groupName].scale.domain([min - padding, max + padding]);
                        this.yScales[groupName].sensors = validSensors;
                    }
                }
            }
        });
    }

    updateAxes() {
        // Axe X
        this.g.select(".axis-x")
            .transition()
            .duration(750)
            .call(d3.axisBottom(this.xScale).tickSize(2));

        // Axes Y
        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            const axis = scaleInfo.orientation === 'left'
                ? d3.axisLeft(scaleInfo.scale).tickSize(2)
                : d3.axisRight(scaleInfo.scale).tickSize(3);

            this.g.select(`.axis-${groupName}`)
                .transition()
                .duration(750)
                .call(axis);
        });
    }

    updateCandles(withTransition = true) {
        this.createCandles(withTransition);
    }

    createTooltip() {
        const focus = this.g.append("g")
            .attr("class", "focus")
            .style("display", "none");

        focus.append("line")
            .attr("class", "focus-line")
            .attr("y1", 0)
            .attr("y2", this.innerHeight)
            .style("stroke", "#666")
            .style("stroke-width", "1px")
            .style("stroke-dasharray", "3,3");

        const tooltipGroup = focus.append("g").attr("class", "tooltip-group");

        this.g.select(".brush .overlay")
            .on("mouseover", () => focus.style("display", null))
            .on("mouseout", () => focus.style("display", "none"))
            .on("mousemove", (event) => this.mousemove(event, focus, tooltipGroup));
    }

    mousemove(event, focus, tooltipGroup) {
        if (this.isBrushing || !this.data || this.data.length === 0) return;

        const x0 = this.xScale.invert(d3.pointer(event)[0]);
        const bisectDate = d3.bisector(d => d.datetime).left;
        const i = bisectDate(this.data, x0, 1);

        if (i >= this.data.length) return;
        const d0 = this.data[i - 1];
        const d1 = this.data[i];
        let d = d0;
        if (d1 && x0 - d0.datetime > d1.datetime - x0) {
            d = d1;
        }

        const focusX = this.xScale(d.datetime);
        focus.select(".focus-line").attr("transform", `translate(${focusX},0)`);

        tooltipGroup.selectAll("*").remove();

        const activeSensors = [];
        Object.entries(this.metadata.measurement).forEach(([group, sensors]) => {
            sensors.forEach(s => {
                if (d[s] !== undefined) activeSensors.push({ sensor: s, data: d[s] });
            });
        });

        let tooltipWidth = 140;
        let tooltipHeight = 25 + activeSensors.length * 55;

        let tX = focusX + 15;
        let tY = d3.pointer(event)[1] - tooltipHeight / 2;

        if (tX + tooltipWidth > this.innerWidth) tX = focusX - tooltipWidth - 15;
        if (tY < 0) tY = 0;
        if (tY + tooltipHeight > this.innerHeight) tY = this.innerHeight - tooltipHeight;

        tooltipGroup.attr("transform", `translate(${tX},${tY})`);

        tooltipGroup.append("rect")
            .attr("width", tooltipWidth)
            .attr("height", tooltipHeight)
            .attr("rx", 5)
            .attr("ry", 5)
            .style("fill", "rgba(0, 0, 0, 0.8)")
            .style("stroke", "#444");

        tooltipGroup.append("text")
            .attr("x", 10)
            .attr("y", 20)
            .style("fill", "#ccc")
            .style("font-size", "11px")
            .text(d3.timeFormat("%Y-%m-%d %H:%M")(d.datetime));

        let yOffset = 40;
        activeSensors.forEach(item => {
            const color = this.colorScale(item.sensor.replace(":", "_"));
            const unit = this.metadata.toUserUnit[item.sensor].userUnit;

            tooltipGroup.append("text")
                .attr("x", 10)
                .attr("y", yOffset)
                .style("fill", color)
                .style("font-weight", "bold")
                .style("font-size", "11px")
                .text(`${item.sensor}`);

            tooltipGroup.append("text")
                .attr("x", 10)
                .attr("y", yOffset + 14)
                .style("fill", "#fff")
                .style("font-size", "10px")
                .text(`O:${item.data.Open} H:${item.data.High}`);

            tooltipGroup.append("text")
                .attr("x", 10)
                .attr("y", yOffset + 28)
                .style("fill", "#fff")
                .style("font-size", "10px")
                .text(`L:${item.data.Low} C:${item.data.Close}`);

            yOffset += 55;
        });
    }
}