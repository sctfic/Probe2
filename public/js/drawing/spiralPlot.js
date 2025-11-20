// js/drawing/spiralePlot.js
// =======================================
//  Visualisation Spirale 3D (Time Helix)
//  Version: UX Améliorée
// =======================================

async function loadSpiralePlot(container, url, grouping = 'day') {
    if (!container || !(container instanceof HTMLElement)) return;

    container.innerHTML = `
        <div style="display:flex; height:100%; justify-content:center; align-items:center; color:#888;">
            <div class="loader-spinner" style="width:20px; height:20px; border:2px solid #555; border-top:2px solid #fff; border-radius:50%; animation:spin 1s linear infinite;"></div>
        </div>
        <style>@keyframes spin {0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>`;

    try {
        const apiResponse = await (window.fetchWithCache ? window.fetchWithCache(url, 300000) : fetch(url).then(r => r.json()));
        if (!apiResponse || !apiResponse.data) throw new Error("Données API invalides");

        const metadata = apiResponse.metadata || {};
        const convertFn = getConversionFunction(metadata);
        
        const processedData = apiResponse.data.map(item => {
            const date = new Date(item.d);
            return {
                date: date,
                rawVal: item.v,
                val: convertFn(item.v),
                ts: date.getTime()
            };
        }).sort((a, b) => a.ts - b.ts);

        container.innerHTML = '';
        const plot = new SpiralePlot(container, processedData, { grouping, metadata, unit: metadata.userUnit || 'Unit' });
        plot.draw();
        container._spiraleInstance = plot;

    } catch (error) {
        console.error('[SpiralePlot]', error);
        container.innerHTML = `<div style="color:#ff5555; padding:20px;">Erreur: ${error.message}</div>`;
    }
}

function getConversionFunction(metadata) {
    if (metadata.toUserUnit && typeof metadata.toUserUnit === 'string') {
        try {
            let code = metadata.toUserUnit;
            if (code.includes('=>')) {
                const parts = code.split('=>');
                const body = parts[1].trim();
                return new Function(parts[0].replace(/[\(\)]/g, '').trim(), body.startsWith('{') ? body : `return ${body};`);
            }
        } catch (e) {}
    }
    return (v) => v;
}

class SpiralePlot {
    constructor(container, data, options = {}) {
        this.container = container;
        this.data = data;
        this.options = options;
        this.grouping = options.grouping || 'day';
        
        this.rect = this.container.getBoundingClientRect();
        this.width = this.rect.width || 800;
        this.height = this.rect.height || 600;
        
        this.svgWidth = this.width * 0.5;
        this.centerX = this.svgWidth / 2; 
        this.centerY = this.height / 2;

        this.beta = 0;
        this.alpha = -20 * (Math.PI / 180);
        
        const minDim = Math.min(this.svgWidth, this.height);
        this.radiusMin = minDim * 0.15;
        this.radiusMax = minDim * 0.40;
        this.spiralHeight = this.height * 0.65;
        
        this.svg = null;
        this.hoverText = null;
        this.sidePanel = null;
        this.scales = {};
        this.lastClickedPoint = null; // Stocke le point de focus
        
        this.initScales();
        this.precompute3DCoordinates();
    }

    initScales() {
        const extentVal = d3.extent(this.data, d => d.val);
        const padding = (extentVal[1] - extentVal[0]) * 0.1;
        
        this.scales.radius = d3.scaleLinear()
            .domain([extentVal[0] - padding, extentVal[1] + padding])
            .range([this.radiusMin, this.radiusMax]);

        this.scales.color = d3.scaleSequential(d3.interpolateTurbo).domain(extentVal);

        this.scales.z = d3.scaleTime()
            .domain(d3.extent(this.data, d => d.date))
            .range([this.spiralHeight / 2, -this.spiralHeight / 2]);
            
        this.getAngle = (date) => {
            if (this.grouping === 'day') {
                const start = new Date(date); start.setHours(0,0,0,0);
                return ((date - start) / 86400000) * 2 * Math.PI;
            } else {
                const start = new Date(date.getFullYear(), 0, 1);
                const dayOfYear = (date - start) / 86400000;
                return (dayOfYear / 365.25) * 2 * Math.PI;
            }
        };
    }

    precompute3DCoordinates() {
        this.points3D = this.data.map(d => {
            const angle = this.getAngle(d.date);
            const r = this.scales.radius(d.val);
            const y = this.scales.z(d.date);
            let periodKey = this.grouping === 'day' ? d.date.toISOString().split('T')[0] : d.date.getFullYear().toString();

            return {
                original: d,
                periodKey: periodKey,
                wx: r * Math.cos(angle - Math.PI/2),
                wz: r * Math.sin(angle - Math.PI/2),
                wy: y 
            };
        });
    }

    project(x, y, z) {
        const cosB = Math.cos(this.beta);
        const sinB = Math.sin(this.beta);
        const x1 = x * cosB - z * sinB;
        const z1 = z * cosB + x * sinB;

        const cosA = Math.cos(this.alpha);
        const sinA = Math.sin(this.alpha);
        const y2 = y * cosA - z1 * sinA;
        return [this.centerX + x1, this.centerY - y2];
    }

    injectStyles() {
        const id = 'spiral-styles-v7';
        if (document.getElementById(id)) return;
        
        d3.select("head").append("style").attr("id", id).text(`
            .spiral-side-panel {
                position: absolute; top: 0; right: 0; bottom: 0; width: 50%;
                background: #1a1a1a;
                border-left: 1px solid #333;
                padding-left: 10px; /* Modifié: padding-left seulement */
                display: flex; flex-direction: column; justify-content: center;
                pointer-events: none; overflow: hidden;
            }
            .spiral-side-panel figure, .spiral-side-panel svg, .mini-chart-interaction { pointer-events: auto !important; }
            .spiral-panel-content { opacity: 1; transition: opacity 0.3s; z-index: 2; position: relative; padding: 20px; }
            
            .panel-date { font-size: 1.2rem; color: #ddd; font-family: sans-serif; margin-bottom: 5px; }
            .panel-val { font-size: 2.2rem; font-weight: 300; color: #fff; font-family: sans-serif; margin-bottom: 20px; }
            
            .spiral-controls {
                position: absolute; top: 10px; right: 10px;
                display: flex; gap: 6px; z-index: 10; pointer-events: auto;
                padding-right: 20px; /* Modifié */
            }
            .spiral-btn {
                background: rgba(40,40,40,0.8); border: 1px solid #555; color: #eee;
                padding: 5px 10px; font-size: 11px; border-radius: 4px; cursor: pointer;
                font-family: sans-serif; transition: background 0.2s;
            }
            .spiral-btn:hover { background: #666; }

            .svg-hover-date {
                font-family: 'Segoe UI', sans-serif; font-weight: 900;
                fill: rgba(255, 255, 255, 0.15); pointer-events: none; text-anchor: middle;
            }
            .axis-label { font-family: sans-serif; font-size: 10px; fill: #666; pointer-events: none; }
            .grid-ring { fill: none; stroke: #444; stroke-width: 1; opacity: 0.2; pointer-events: none; }
            .axis-line { stroke: #444; stroke-width: 1; stroke-dasharray: 3,3; opacity: 0.3; pointer-events: none; }
            
            .sp-line { cursor: pointer; } /* Curseur pointer sur les lignes */
            .mini-chart-hover-dot { pointer-events: none; }
        `);
    }

    draw() {
        const container = d3.select(this.container);
        container.style("position", "relative").style("overflow", "hidden");
        this.injectStyles();

        container.selectAll("svg").remove();
        this.svg = container.append("svg")
            .attr("width", "50%").attr("height", "100%")
            .style("background", "#151515")
            .style("cursor", "auto"); // Curseur par défaut/auto, change uniquement au drag

        this.gAxes = this.svg.append("g");
        this.gLabels = this.svg.append("g"); // Labels derrière
        this.gSpiral = this.svg.append("g"); // Lignes devant
        
        this.hoverText = this.gLabels.append("text")
            .attr("class", "svg-hover-date")
            .attr("x", this.centerX).attr("y", this.height * 0.15)
            .attr("font-size", "3rem").style("opacity", 0).text("");

        this.gLabels.append("text")
            .attr("x", 10).attr("y", this.height - 10)
            .attr("fill", "#555").style("font-family", "sans-serif").style("font-size", "10px")
            .text(`Spirale 3D • ${this.options.unit}`);

        container.selectAll(".spiral-side-panel").remove();
        this.sidePanel = container.append("div")
            .attr("class", "spiral-side-panel")
            .html(`<div class="spiral-panel-content"><div style="text-align:center; color:#555; font-family:sans-serif;">Cliquez sur une période</div></div>`);

        this.createControls();
        this.updateView();

        const drag = d3.drag()
            .on("start", () => this.svg.style("cursor", "grabbing"))
            .on("drag", (e) => {
                this.beta -= e.dx * 0.008;
                this.alpha = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.alpha - e.dy * 0.008));
                this.updateView();
            })
            .on("end", () => this.svg.style("cursor", "auto")); // Retour au curseur par défaut
        this.svg.call(drag);
    }

    createControls() {
        d3.select(this.container).selectAll(".spiral-controls").remove();
        const c = d3.select(this.container).append("div").attr("class", "spiral-controls");
        
        [{ l: "Dessus", a: -Math.PI/2, b: 0 }, { l: "Face", a: 0, b: 0 }, { l: "Iso", a: -Math.PI/6, b: Math.PI/4 }]
        .forEach(v => {
            c.append("button").attr("class", "spiral-btn").text(v.l)
                .on("click", (e) => {
                    e.stopPropagation();
                    const d = { a: this.alpha, b: this.beta };
                    d3.select(d).transition().duration(800).ease(d3.easeCubicOut)
                        .tween("r", () => t => {
                            this.alpha = d3.interpolate(this.alpha, v.a)(t);
                            this.beta = d3.interpolate(this.beta, v.b)(t);
                            this.updateView();
                        });
                });
        });
    }

    drawAxes() {
        this.gAxes.selectAll("*").remove();
        this.gLabels.selectAll(".lbl-dyn").remove();
        const botY = this.scales.z.range()[1];
        
        this.scales.radius.ticks(3).forEach(val => {
            const r = this.scales.radius(val);
            let path = "";
            for(let i=0; i<=64; i++) {
                const t = (i/64)*Math.PI*2;
                const p = this.project(r*Math.cos(t), botY, r*Math.sin(t));
                path += (i===0?"M":"L")+p[0]+","+p[1];
            }
            this.gAxes.append("path").attr("d", path).attr("class", "grid-ring");
            const pl = this.project(r, botY, 0);
            this.gLabels.append("text").attr("class", "axis-label lbl-dyn")
                .attr("x", pl[0]).attr("y", pl[1]).text(val);
        });

        const steps = 12;
        for(let i=0; i<steps; i++) {
            const th = (i/steps)*Math.PI*2 - Math.PI/2;
            const r = this.radiusMax;
            const p1 = this.project(0, botY, 0);
            const p2 = this.project(r*Math.cos(th), botY, r*Math.sin(th));
            this.gAxes.append("line").attr("class", "axis-line")
                .attr("x1", p1[0]).attr("y1", p1[1]).attr("x2", p2[0]).attr("y2", p2[1]);
            
            const pTxtProj = this.project((r+10)*Math.cos(th), botY, (r+10)*Math.sin(th));
            let label = this.grouping === 'day' ? `${i*2}h` : d3.timeFormat("%b")(new Date(2024, i, 1));
            this.gLabels.append("text").attr("class", "axis-label lbl-dyn")
                .attr("x", pTxtProj[0]).attr("y", pTxtProj[1]).attr("text-anchor", "middle").text(label);
        }

        this.scales.z.ticks(8).forEach(d => {
            const yw = this.scales.z(d);
            const pc = this.project(0, yw, 0);
            if(pc[1]<0 || pc[1]>this.height) return;
            this.gAxes.append("line").attr("class", "axis-line").attr("x1", 40).attr("y1", pc[1]).attr("x2", pc[0]).attr("y2", pc[1]).style("opacity", 0.1);
            this.gLabels.append("text").attr("class", "axis-label lbl-dyn").attr("x", 10).attr("y", pc[1]+3).text(d3.timeFormat(this.grouping==='day'?"%d %b":"%Y")(d));
        });
        
        const pt = this.project(0, this.scales.z.range()[0], 0);
        const pb = this.project(0, botY, 0);
        this.gAxes.append("line").attr("x1", pt[0]).attr("y1", pt[1]).attr("x2", pb[0]).attr("y2", pb[1]).style("stroke", "#555");
    }

    updateView() {
        this.drawAxes();
        const segs = [];
        for(let i=0; i<this.points3D.length-1; i++) {
            const p1 = this.points3D[i]; const p2 = this.points3D[i+1];
            const pr1 = this.project(p1.wx, p1.wy, p1.wz); const pr2 = this.project(p2.wx, p2.wy, p2.wz);
            if(Math.max(pr1[1], pr2[1]) < -50 || Math.min(pr1[1], pr2[1]) > this.height+50) continue;
            segs.push({ id: i, x1: pr1[0], y1: pr1[1], x2: pr2[0], y2: pr2[1], d: p1.original, periodKey: p1.periodKey, c: this.scales.color(p1.original.val) });
        }

        const lines = this.gSpiral.selectAll(".sp-line").data(segs, d=>d.id);
        lines.exit().remove();
        lines.enter().append("line").attr("class", "sp-line")
            .merge(lines)
            .attr("x1", d=>d.x1).attr("y1", d=>d.y1).attr("x2", d=>d.x2).attr("y2", d=>d.y2)
            .attr("stroke", d=>d.c).attr("stroke-width", 1).attr("stroke-opacity", 0.8).attr("stroke-linecap", "round")
            .on("mouseover", (e, d) => this.handleOver(e, d))
            .on("mouseout", (e, d) => this.handleOut(e, d))
            .on("click", (e, d) => this.handleClick(e, d));
    }

    handleOver(e, d) {
        // Le curseur est géré par la classe .sp-line
        this.gSpiral.selectAll(".sp-line").filter(seg => seg.periodKey === d.periodKey)
            .attr("stroke-width", 3).style("stroke-opacity", 1).style("filter", "brightness(1.5)");
        
        let text = this.grouping === 'day' ? d3.timeFormat("%d %b")(new Date(d.d.date)) : d.d.date.getFullYear();
        this.hoverText.text(text).transition().duration(100).style("opacity", 1);
    }

    handleOut(e, d) {
        this.gSpiral.selectAll(".sp-line").attr("stroke-width", 1).style("stroke-opacity", 0.8).style("filter", "none");
        this.hoverText.transition().duration(200).style("opacity", 0);
    }

    handleClick(e, d) {
        this.lastClickedPoint = d.d; // Sauvegarde le point de focus
        this.updateSidePanel(d.d, d.periodKey);
    }

    updateSidePanel(dataPoint, periodKey) {
        if (!this.sidePanel) return;
        
        const dateFmt = d3.timeFormat("%d %B %Y");
        const unit = this.options.unit;
        const color = this.scales.color(dataPoint.val);

        const tDate = new Date(dataPoint.date);
        let pStart, pEnd, pTitle;
        if (this.grouping === 'day') {
            pStart = new Date(tDate); pStart.setHours(0,0,0,0);
            pEnd = new Date(tDate); pEnd.setHours(23,59,59,999);
            pTitle = "Journée complète";
        } else {
            pStart = new Date(tDate.getFullYear(), 0, 1);
            pEnd = new Date(tDate.getFullYear(), 11, 31);
            pTitle = `Année ${tDate.getFullYear()}`;
        }

        let content = this.sidePanel.select(".spiral-panel-content");
        if (content.empty()) {
            this.sidePanel.html(`<div class="spiral-panel-content"></div>`);
            content = this.sidePanel.select(".spiral-panel-content");
        }

        content.html(`
            <div class="panel-info">
                <div id="panel-date-dyn" class="panel-date">${dateFmt(dataPoint.date)}</div>
                <div class="panel-val" style="color:${color}">
                    <span id="panel-val-dyn">${dataPoint.val.toFixed(1)}</span> <span style="font-size:0.5em; color:#888">${unit}</span>
                </div>
                <div style="font-size:11px; color:#666; margin-bottom:10px; text-transform:uppercase;">${pTitle}</div>
            </div>
            <div id="mini-chart-container" style="width:100%; height:200px; margin-top:10px; position:relative;"></div>
        `);

        const subset = this.data.filter(d => d.ts >= pStart.getTime() && d.ts <= pEnd.getTime());
        this.drawMiniChart(subset, dataPoint);
    }

    drawMiniChart(data, focusPoint) {
        const container = document.getElementById("mini-chart-container");
        if (!container) return;
        container.innerHTML = '';

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="color:#444">Pas de données</div>';
            return;
        }

        // --- Définition des échelles D3 pour l'interactivité (doivent correspondre à Plot) ---
        const margin = { top: 16, right: 40, bottom: 20, left: 0 }; // Estimation des marges Plot
        const chartWidth = container.clientWidth - margin.right - margin.left;
        const chartHeight = (container.clientHeight || 200) - margin.top - margin.bottom;

        const xDomain = d3.extent(data, d => d.date);
        const yDomain = d3.extent(data, d => d.val);
        const yPadding = (yDomain[1] - yDomain[0]) * 0.1;
        yDomain[0] -= yPadding;
        yDomain[1] += yPadding;

        const xScale = d3.scaleTime().domain(xDomain).range([0, chartWidth]); 
        const yScale = d3.scaleLinear().domain(yDomain).range([chartHeight, 0]);
        const marksOffset = {x: margin.left, y: margin.top};

        // --- Rendu Plot ---
        try {
            const chart = Plot.plot({
                width: container.clientWidth,
                height: container.clientHeight || 200,
                marginLeft: margin.left, marginBottom: margin.bottom, marginRight: margin.right, marginTop: margin.top,
                style: { background: "transparent", color: "#aaa", fontSize: "10px" },
                x: { type: "time", tickFormat: this.grouping === 'day' ? "%H:%M" : "%b", grid: false },
                y: { axis: "right", grid: true, nice: true, label: null, tickFormat: d => d.toFixed(0) },
                marks: [
                    Plot.lineY(data, { x: "date", y: "val", stroke: this.scales.color(d3.mean(data, d=>d.val)), strokeWidth: 1.5, curve: "monotone-x" }),
                    Plot.areaY(data, { x: "date", y: "val", fillOpacity: 0.1, fill: this.scales.color(d3.mean(data, d=>d.val)), curve: "monotone-x" }),
                    Plot.dot([focusPoint], { x: "date", y: "val", fill: "red", stroke: "white", strokeWidth: 2, r: 4 })
                ]
            });
            container.appendChild(chart);
            
            // --- D3 Interaction Layer ---
            const chartSvg = d3.select(chart);

            // 1. Hover Dot
            const hoverDot = chartSvg.append("circle")
                .attr("r", 4)
                .attr("fill", "yellow") 
                .attr("stroke", "black")
                .attr("stroke-width", 1)
                .attr("opacity", 0)
                .attr("class", "mini-chart-hover-dot");

            // 2. Overlay pour le tracking souris
            const overlay = d3.select(container).append("div")
                .attr("class", "mini-chart-interaction")
                .style("position", "absolute").style("top", "0").style("left", "0")
                .style("width", "100%").style("height", "100%")
                .style("cursor", "default"); // Modifié: retire le crosshair

            const dateFmtLong = d3.timeFormat("%d %B %Y %H:%M");
            const dateFmtShort = d3.timeFormat("%d %B %Y");

            overlay.on("mousemove", (e) => {
                const [mx] = d3.pointer(e);
                const dateHover = xScale.invert(mx - marksOffset.x); // mx est absolu, on retire la translation X des marks
                
                // Trouver le point le plus proche
                const idx = d3.bisector(d => d.date).left(data, dateHover, 1);
                const d0 = data[idx - 1]; const d1 = data[idx];
                const d = d1 && d0 ? (dateHover - d0.date > d1.date - dateHover ? d1 : d0) : (d0 || d1);
                
                if(d) {
                    // Update Textes DOM
                    d3.select("#panel-val-dyn").text(d.val.toFixed(1));
                    d3.select("#panel-date-dyn").text(dateFmtLong(d.date));
                    
                    // Update Hover Dot position
                    const px = xScale(d.date);
                    const py = yScale(d.val);
                    
                    hoverDot
                        .attr("cx", px + marksOffset.x)
                        .attr("cy", py + marksOffset.y)
                        .attr("fill", this.scales.color(d.val))
                        .attr("opacity", 1);
                }
            }).on("mouseleave", () => {
                // Reset aux valeurs du point cliqué (focusPoint)
                if (this.lastClickedPoint) {
                    d3.select("#panel-val-dyn").text(this.lastClickedPoint.val.toFixed(1));
                    d3.select("#panel-date-dyn").text(dateFmtShort(this.lastClickedPoint.date));
                }
                hoverDot.attr("opacity", 0);
            });

        } catch (e) { console.error("Erreur Plot:", e); }
    }
}