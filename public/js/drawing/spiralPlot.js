// js/drawing/spiralePlot.js
// =======================================
//  Visualisation Spirale 3D (Time Helix)
//  Version: RADIAL GRADIENT 3D PLANAR + AUTO-LOAD LAST + CENTERED LOADER
// =======================================

/**
 * Charge et affiche le graphique spirale.
 * @param {HTMLElement} container - Le conteneur DOM.
 * @param {string} url - L'URL de base (contenant /Raw/).
 * @param {string|null} forcedMode - 'day' ou 'year' pour forcer un mode (via le bouton).
 */
async function loadSpiralePlot(container, url, forcedMode = null) {
    if (!container || !(container instanceof HTMLElement)) return;

    // 1. Loader centré (Position absolute pour centrage parfait)
    container.style.position = "relative"; // Ensure container is a positioning context
    container.innerHTML = `
        <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#151515; z-index:100;">
            <div class="loader-spinner" style="width:20px; height:20px; border:2px solid #555; border-top:2px solid #fff; border-radius:50%; animation:spin 1s linear infinite;"></div>
        </div>
        <style>@keyframes spin {0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>`;

    try {
        // Récupération rapide de la plage (Metadata) via /Range/
        const rangeUrl = url.replace('/Raw/', '/Range/');
        const rangeResponse = await (window.fetchWithCache ? window.fetchWithCache(rangeUrl, 300000) : fetch(rangeUrl).then(r => r.json()));
        
        if (!rangeResponse || !rangeResponse.metadata) throw new Error("Métadonnées Range introuvables");
        
        const meta = rangeResponse.metadata;
        const dateFirst = new Date(meta.first);
        const dateLast = new Date(meta.last);
        const totalRangeDays = (dateLast - dateFirst) / (1000 * 60 * 60 * 24);

        // Détermination du mode et de la plage à charger
        let mode = 'day';
        let fetchStartDate = dateFirst;
        let daysToLoad = totalRangeDays;

        if (forcedMode === 'day') {
            mode = 'day';
            const last180 = new Date(dateLast);
            last180.setDate(last180.getDate() - 180);
            fetchStartDate = (last180 > dateFirst) ? last180 : dateFirst;
            daysToLoad = (dateLast - fetchStartDate) / (1000 * 60 * 60 * 24);
        } 
        else if (forcedMode === 'year') {
            mode = 'year';
            fetchStartDate = dateFirst;
            daysToLoad = totalRangeDays;
        } 
        else {
            if (totalRangeDays > 181) {
                mode = 'year';
                fetchStartDate = dateFirst;
            } else {
                mode = 'day';
                fetchStartDate = dateFirst;
            }
        }

        // Calcul du stepCount
        let stepCount = 0;
        if (daysToLoad > 3600) {
            stepCount = Math.ceil(daysToLoad);
            if (forcedMode === null) mode = 'year'; 
        } 
        else if (daysToLoad > 181) {
            stepCount = Math.ceil(daysToLoad * 4);
            if (forcedMode === null) mode = 'year';
        } 
        else if (daysToLoad <= 32) {
            stepCount = Math.ceil(daysToLoad * 288);
            if (forcedMode === null) mode = 'day';
        } 
        else {
            stepCount = Math.ceil(daysToLoad * 144);
            if (forcedMode === null) mode = 'day';
        }

        // Appel API Data
        const separator = url.includes('?') ? '&' : '?';
        const dataUrl = `${url}${separator}startDate=${fetchStartDate.toISOString()}&stepCount=${stepCount}`;

        const apiResponse = await (window.fetchWithCache ? window.fetchWithCache(dataUrl, 300000) : fetch(dataUrl).then(r => r.json()));
        if (!apiResponse || !apiResponse.data) throw new Error("Données API invalides");

        const convertFn = getConversionFunction(meta);
        
        const processedData = apiResponse.data.map(item => {
            const date = new Date(item.d);
            return {
                date: date,
                rawVal: item.v,
                val: convertFn(item.v),
                ts: date.getTime()
            };
        }).sort((a, b) => a.ts - b.ts);

        // Initialisation du Plot
        container.innerHTML = '';
        const plot = new SpiralePlot(container, processedData, { 
            grouping: mode, 
            metadata: meta, 
            unit: meta.userUnit || 'Unit',
            originalUrl: url,
            originalMeta: meta
        });
        plot.draw();
        container._spiraleInstance = plot;

        // 2. Chargement automatique de la dernière période
        if (processedData.length > 0) {
            const lastPoint = processedData[processedData.length - 1];
            const lastKey = plot.getPeriodKeyForDate(lastPoint.date);
            // On déclenche l'affichage du side panel pour le dernier point
            plot.updateSidePanel(lastPoint, lastKey);
        }

    } catch (error) {
        console.error('[SpiralePlot]', error);
        container.innerHTML = `<div style="color:#ff5555; padding:20px; display:flex; height:100%; align-items:center; justify-content:center;">Erreur: ${error.message}</div>`;
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
        
        this.svgWidth = 480;
        this.centerX = this.svgWidth / 2; 
        this.centerY = this.height / 2;

        this.beta = 0;
        this.alpha = -20 * (Math.PI / 180);
        
        const minDim = Math.min(this.svgWidth, this.height);
        this.radiusMin = minDim * 0.15;
        this.radiusMax = minDim * 0.40;
        this.spiralHeight = this.height * 0.65;
        
        this.wrapper = null; 
        this.sidePanel = null;
        this.svg = null;
        this.defs = null;
        this.hoverText = null;
        
        // Tooltip SVG Group
        this.gTooltip = null;
        this.tooltipBg = null;
        this.tooltipText = null;
        
        this.scales = {};
        
        this.periodMeans = new Map();
        this.globalStats = []; 
        
        this.colorMode = (this.grouping === 'year') ? 'mean' : 'standard';

        this.isDragging = false;
        this.gAxes = null;
        this.gLabels = null;
        this.gSpiral = null;
        
        this.initScales();
        this.computeGlobalStats();
        this.precompute3DCoordinates();
    }

    getPeriodKeyForDate(date) {
        if (this.grouping === 'day') {
            const Y = date.getFullYear();
            const M = String(date.getMonth() + 1).padStart(2, '0');
            const D = String(date.getDate()).padStart(2, '0');
            return `${Y}-${M}-${D}`;
        } else {
            return date.getFullYear().toString();
        }
    }

    initScales() {
        const groups = d3.group(this.data, d => this.getPeriodKeyForDate(d.date));
        
        const counts = Array.from(groups.values()).map(g => g.length);
        const maxPoints = d3.max(counts) || 0;
        const threshold = maxPoints * 0.9;

        let validValues = [];
        let validMeans = [];

        this.periodMeans = new Map();

        for (const [key, points] of groups) {
            const mean = d3.mean(points, d => d.val);
            this.periodMeans.set(key, mean);

            if (points.length >= threshold) {
                validMeans.push(mean);
                for (const p of points) {
                    validValues.push(p.val);
                }
            }
        }

        if (validValues.length === 0) {
            validValues = this.data.map(d => d.val);
            validMeans = Array.from(this.periodMeans.values());
        }

        const extentVal = d3.extent(validValues);
        const extentMean = d3.extent(validMeans);

        const padding = (extentVal[1] - extentVal[0]) * 0.1;
        
        this.scales.radius = d3.scaleLinear()
            .domain([extentVal[0] - padding, extentVal[1] + padding])
            .range([this.radiusMin, this.radiusMax]);

        this.scales.color = d3.scaleSequential(d3.interpolateTurbo).domain(extentVal);
        this.scales.colorMean = d3.scaleSequential(t => d3.interpolateRdBu(1 - t)).domain(extentMean);

        this.scales.z = d3.scaleTime()
            .domain(d3.extent(this.data, d => d.date))
            .range([-this.spiralHeight / 2, this.spiralHeight / 2]); 
            
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

    computeGlobalStats() {
        let getKey;
        if (this.grouping === 'day') {
            getKey = (d) => d.date.getHours() * 60 + d.date.getMinutes();
        } else {
            getKey = (d) => d.date.getMonth() * 100 + d.date.getDate();
        }

        const timeGroups = d3.group(this.data, getKey);
        this.globalStats = [];

        for (const [timeKey, points] of timeGroups) {
            this.globalStats.push({
                key: timeKey,
                min: d3.min(points, d => d.val),
                max: d3.max(points, d => d.val),
                mean: d3.mean(points, d => d.val)
            });
        }
        
        this.globalStats.sort((a, b) => a.key - b.key);
    }

    precompute3DCoordinates() {
        this.points3D = this.data.map(d => {
            const angle = this.getAngle(d.date);
            const r = this.scales.radius(d.val);
            const y = this.scales.z(d.date);
            
            const periodKey = this.getPeriodKeyForDate(d.date);
            const meanVal = this.periodMeans.get(periodKey);

            return {
                original: d,
                periodKey: periodKey,
                meanVal: meanVal,
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

    draw() {
        const container = d3.select(this.container);
        container.selectAll("*").remove(); 

        container
            .style("display", "flex")
            .style("flex-direction", "row") 
            .style("width", "100%")
            .style("height", "100%")
            .style("overflow", "hidden");

        this.wrapper = container.append("div")
            .attr("class", "relative-wrapper")
            .style("position", "relative")
            .style("width", "480px") 
            .style("flex", "none")
            .style("height", "100%")
            .style("overflow", "hidden");

        this.sidePanel = container.append("div")
            .attr("class", "spiral-side-panel")
            .style("position", "relative") 
            .style("top", "auto").style("right", "auto").style("bottom", "auto")
            .style("flex", "1")
            .style("height", "100%")
            .style("border-left", "1px solid #333")
            .style("background", "#1a1a1a")
            .html(`<div class="spiral-panel-content"><div style="text-align:center; color:#555; font-family:sans-serif;">Cliquez sur une période</div></div>`);

        this.svg = this.wrapper.append("svg")
            .attr("width", "100%").attr("height", "100%")
            .style("background", "#151515")
            .style("cursor", "auto");

        this.defs = this.svg.append("defs");

        this.gAxes = this.svg.append("g");
        this.gLabels = this.svg.append("g");
        this.gSpiral = this.svg.append("g");
        
        this.initSvgTooltip();

        this.hoverText = this.gLabels.append("text")
            .attr("class", "svg-hover-date")
            .attr("x", this.centerX).attr("y", this.height * 0.15)
            .attr("font-size", "3rem").style("opacity", 0).text("");

        this.gLabels.append("text")
            .attr("x", 10).attr("y", this.height - 10)
            .attr("fill", "#555").style("font-family", "sans-serif").style("font-size", "10px")
            .text(`Spirale 3D • ${this.options.unit}`);

        this.createControls();
        this.updateView(false);

        const drag = d3.drag()
            .on("start", () => {
                this.isDragging = true;
                this.svg.style("cursor", "grabbing");
                this.hideTooltip();
                this.hoverText.style("opacity", 0);
            })
            .on("drag", (e) => {
                this.beta -= e.dx * 0.008;
                this.alpha = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.alpha - e.dy * 0.008));
                this.updateView(true);
            })
            .on("end", () => {
                this.isDragging = false;
                this.svg.style("cursor", "auto");
                this.updateView(false);
            });
        this.svg.call(drag);
    }

    initSvgTooltip() {
        this.gTooltip = this.svg.append("g")
            .attr("class", "svg-tooltip")
            .style("pointer-events", "none")
            .style("opacity", 0);

        this.tooltipBg = this.gTooltip.append("rect")
            .attr("fill", "rgba(0, 0, 0, 0.85)")
            .attr("stroke", "#444")
            .attr("rx", 4)
            .attr("ry", 4);

        this.tooltipText = this.gTooltip.append("text")
            .attr("fill", "#fff")
            .attr("font-family", "sans-serif")
            .attr("font-size", "12px");
    }

    createControls() {
        this.wrapper.selectAll(".spiral-controls").remove();
        this.wrapper.selectAll(".spiral-controls-left").remove();

        // 1. Contrôles Droite (Vue + Mode)
        const c = this.wrapper.append("div").attr("class", "spiral-controls");
        
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
                            this.updateView(false);
                        });
                });
        });

        c.append("div").style("width", "1px").style("background", "#444").style("margin", "0 8px");

        const toggleBtn = c.append("button")
            .attr("class", "spiral-btn")
            .style("font-weight", "bold")
            .text(this.grouping === 'year' ? "Mode: Année" : "Mode: Jour");

        toggleBtn.on("click", (e) => {
            e.stopPropagation();
            const newMode = (this.grouping === 'year') ? 'day' : 'year';
            loadSpiralePlot(this.container, this.options.originalUrl, newMode);
        });

        // 2. Contrôles Gauche (Toggle Heatmap)
        const leftC = this.wrapper.append("div")
            .attr("class", "spiral-controls-left")
            .style("position", "absolute")
            .style("top", "10px")
            .style("left", "10px")
            .style("z-index", "10");

        const colorBtn = leftC.append("button")
            .attr("class", "spiral-btn")
            .text(this.colorMode === 'mean' ? "Couleur: Moyenne" : "Couleur: Détail");
            
        colorBtn.on("click", (e) => {
            e.stopPropagation();
            this.colorMode = (this.colorMode === 'standard') ? 'mean' : 'standard';
            colorBtn.text(this.colorMode === 'mean' ? "Couleur: Moyenne" : "Couleur: Détail");
            this.updateView(false);
        });
    }

    drawAxes() {
        this.gAxes.selectAll("*").remove();
        this.gLabels.selectAll(".lbl-dyn").remove();
        
        const ringY = -this.spiralHeight / 2;

        this.scales.radius.ticks(3).forEach(val => {
            const r = this.scales.radius(val);
            let path = "";
            for(let i=0; i<=64; i++) {
                const t = (i/64)*Math.PI*2;
                const p = this.project(r*Math.cos(t), ringY, r*Math.sin(t));
                path += (i===0?"M":"L")+p[0]+","+p[1];
            }
            this.gAxes.append("path").attr("d", path).attr("class", "grid-ring");
            const pl = this.project(r, ringY, 0);
            this.gLabels.append("text").attr("class", "axis-label lbl-dyn")
                .attr("x", pl[0]).attr("y", pl[1]).text(val);
        });

        const steps = 12;
        for(let i=0; i<steps; i++) {
            const th = (i/steps)*Math.PI*2 - Math.PI/2;
            const r = this.radiusMax;
            const p1 = this.project(0, ringY, 0);
            const p2 = this.project(r*Math.cos(th), ringY, r*Math.sin(th));
            this.gAxes.append("line").attr("class", "axis-line")
                .attr("x1", p1[0]).attr("y1", p1[1]).attr("x2", p2[0]).attr("y2", p2[1]);
            
            const pTxtProj = this.project((r+10)*Math.cos(th), ringY, (r+10)*Math.sin(th));
            let label;
            if (this.grouping === 'day') {
                label = `${i*2}h`;
            } else {
                label = d3.timeFormat("%b")(new Date(2024, i, 1));
            }
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
        
        const pt = this.project(0, -this.spiralHeight/2, 0);
        const pb = this.project(0, this.spiralHeight/2, 0);
        this.gAxes.append("line").attr("x1", pt[0]).attr("y1", pt[1]).attr("x2", pb[0]).attr("y2", pb[1]).style("stroke", "#555");
    }

    /**
     * Mise à jour de la vue.
     * @param {boolean} isDragging - Si true, on ne dessine pas les 'ghost paths' (zones de clic).
     */
    updateView(isDragging = false) {
        this.drawAxes();
        
        // --- 1. CONFIGURATION DU GRADIENT RADIAL UNIQUE AVEC PROJECTION 3D ---
        this.defs.selectAll("*").remove();

        const globalGradId = "spiral-global-radial";
        
        // Calcul du facteur d'écrasement vertical basé sur l'angle alpha (tilt)
        // alpha = -90 (-PI/2) => vue de dessus (cercle parfait) => sin = -1 => scale = 1
        // alpha = 0 => vue de face (plat) => sin = 0 => scale = 0
        const scaleY = Math.max(0.01, Math.abs(Math.sin(this.alpha)));
        
        // Construction de la matrice de transformation pour aplatir le dégradé selon la perspective
        // On translate au centre, on scale, on re-translate
        const matrix = `translate(${this.centerX}, ${this.centerY}) scale(1, ${scaleY}) translate(${-this.centerX}, ${-this.centerY})`;

        const radialGradient = this.defs.append("radialGradient")
            .attr("id", globalGradId)
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("cx", this.centerX)
            .attr("cy", this.centerY)
            .attr("r", this.radiusMax)
            .attr("fx", this.centerX)
            .attr("fy", this.centerY)
            .attr("gradientTransform", matrix); // Application de la transformation 3D simulée

        const stopCount = 20;
        for (let i = 0; i <= stopCount; i++) {
            const offset = i / stopCount;
            const currentRadius = offset * this.radiusMax;
            
            let color;
            if (currentRadius < this.radiusMin) {
                const minVal = this.scales.radius.domain()[0];
                color = this.scales.color(minVal);
            } else {
                const val = this.scales.radius.invert(currentRadius);
                color = this.scales.color(val);
            }

            radialGradient.append("stop")
                .attr("offset", `${offset * 100}%`)
                .attr("stop-color", color);
        }

        const groupsData = [];
        const groupedPoints = d3.group(this.points3D, d => d.periodKey);
        const that = this;

        for (const [key, points] of groupedPoints) {
            let pathD = "";
            let lastX = null, lastY = null;
            const values = points.map(p => p.original.val);
            
            const meanVal = points[0].meanVal;
            const meanColor = this.scales.colorMean(meanVal);

            const stats = {
                title: this.grouping === 'day' ? d3.timeFormat("%d %B %Y")(points[0].original.date) : key,
                min: d3.min(values),
                max: d3.max(values),
                mean: meanVal,
                std: d3.deviation(values) || 0
            };

            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const proj = this.project(p.wx, p.wy, p.wz);

                if (proj[1] < -50 || proj[1] > this.height + 50) {
                    lastX = null; 
                    continue;
                }
                
                if (lastX === null || (i > 0 && (proj[0] !== lastX || proj[1] !== lastY))) {
                     if (pathD === "") pathD = `M${proj[0]},${proj[1]}`;
                     else pathD += `L${proj[0]},${proj[1]}`;
                }
                lastX = proj[0]; lastY = proj[1];
            }
            
            if (pathD !== "") {
                let strokeRef = meanColor;

                if (that.colorMode !== 'mean') {
                    strokeRef = `url(#${globalGradId})`;
                }

                groupsData.push({ 
                    key: key, 
                    pathD: pathD, 
                    refPoint: points[0].original,
                    stroke: strokeRef,
                    stats: stats 
                });
            }
        }

        const groups = this.gSpiral.selectAll(".period-group").data(groupsData, d => d.key);
        groups.exit().remove();
        
        const groupsEnter = groups.enter().append("g")
            .attr("class", "period-group");

        groupsEnter.merge(groups)
            .on("mouseover", function(e, d) {
                if (that.isDragging) return;

                that.gSpiral.selectAll(".sp-vis-path")
                    .attr("stroke-opacity", 0.2)
                    .attr("stroke-width", 1);
                
                const current = d3.select(this);
                current.select(".sp-vis-path")
                    .attr("stroke-opacity", 1)
                    .attr("stroke-width", 2);
                
                current.raise(); 
                that.gTooltip.raise(); 
                
                that.updateHoverText(d.refPoint);
                that.showTooltip(e, d.stats);
            })
            .on("mouseout", function(e, d) {
                if (that.isDragging) return;

                that.gSpiral.selectAll(".sp-vis-path")
                    .attr("stroke-opacity", 0.9)
                    .attr("stroke-width", 1)
                    .attr("stroke", d => d.stroke); 
                
                that.hideHoverText();
                that.hideTooltip();
            })
            .on("click", (e, d) => {
                this.handleClick(e, { d: d.refPoint, periodKey: d.key });
            });

        groupsEnter.merge(groups).each(function(d) {
            const g = d3.select(this);
            
            if (!isDragging) {
                g.selectAll(".sp-ghost-path")
                    .data([d])
                    .join("path")
                    .attr("class", "sp-ghost-path")
                    .attr("d", d.pathD)
                    .attr("stroke", "transparent")
                    .attr("stroke-width", 4) 
                    .attr("fill", "none");
            } else {
                g.selectAll(".sp-ghost-path").remove();
            }

            g.selectAll(".sp-vis-path")
                .data([d])
                .join("path")
                .attr("class", "sp-vis-path")
                .attr("d", d.pathD)
                .attr("stroke", d.stroke)
                .attr("stroke-width", 1)
                .attr("fill", "none")
                .attr("stroke-opacity", 0.9);
        });
    }

    showTooltip(e, stats) {
        if (!this.gTooltip) return;

        const coords = d3.pointer(e, this.svg.node());
        let x = coords[0] + 15;
        let y = coords[1] + 15;

        this.tooltipText.selectAll("*").remove();

        const line1 = this.tooltipText.append("tspan")
            .attr("x", 10).attr("dy", "1.2em")
            .style("font-weight", "bold")
            .text(stats.title);

        const line2 = this.tooltipText.append("tspan")
            .attr("x", 10).attr("dy", "1.4em")
            .text(`Max: ${stats.max.toFixed(1)}  |  Moy: ${stats.mean.toFixed(1)}`);
        
        const line3 = this.tooltipText.append("tspan")
            .attr("x", 10).attr("dy", "1.4em")
            .text(`Min: ${stats.min.toFixed(1)}  |  σ: ${stats.std.toFixed(2)}`);

        const bbox = this.tooltipText.node().getBBox();
        const padding = 8;
        
        this.tooltipBg
            .attr("width", bbox.width + padding * 2)
            .attr("height", bbox.height + padding * 2);
        
        this.gTooltip
            .attr("transform", `translate(${x}, ${y})`)
            .transition().duration(50)
            .style("opacity", 1);
    }

    hideTooltip() {
        if (this.gTooltip) {
            this.gTooltip.transition().duration(100).style("opacity", 0);
        }
    }

    updateHoverText(dataPoint) {
        let text = this.grouping === 'day' ? d3.timeFormat("%d %b")(new Date(dataPoint.date)) : dataPoint.date.getFullYear();
        this.hoverText.text(text).transition().duration(50).style("opacity", 1);
    }

    hideHoverText() {
        this.hoverText.transition().duration(200).style("opacity", 0);
    }

    handleClick(e, d) {
        if (this.isDragging) return;
        this.lastClickedPoint = d.d;
        this.updateSidePanel(d.d, d.periodKey);
    }

    updateSidePanel(dataPoint, periodKey) {
        if (!this.sidePanel) return;
        
        const dateFmt = d3.timeFormat("%d %B %Y");
        const unit = this.options.unit;
        
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

        const mean = d3.mean(data, d => d.val);
        const min = d3.min(data, d => d.val);
        const max = d3.max(data, d => d.val);
        const std = d3.deviation(data, d => d.val);
        
        const bgData = [];
        
        const yearRef = focusPoint.date.getFullYear();
        const monthRef = focusPoint.date.getMonth();
        const dayRef = focusPoint.date.getDate();

        this.globalStats.forEach(stat => {
            let projectedDate;
            if (this.grouping === 'day') {
                const h = Math.floor(stat.key / 60);
                const m = stat.key % 60;
                projectedDate = new Date(yearRef, monthRef, dayRef, h, m);
            } else {
                const m = Math.floor(stat.key / 100);
                const d = stat.key % 100;
                projectedDate = new Date(yearRef, m, d);
            }
            bgData.push({
                date: projectedDate,
                gMin: stat.min,
                gMax: stat.max,
                gMean: stat.mean
            });
        });

        const statHtml = `
            <div style="display:flex; justify-content:space-between; font-size:13px; color:#999; margin-bottom:6px; font-family:sans-serif; border-bottom:1px solid #333; padding-bottom:4px;">
                <span>Min: <b style="color:#ccc">${min.toFixed(1)}</b></span>
                <span>Moy: <b style="color:${this.scales.colorMean(mean)}">${mean.toFixed(1)}</b></span>
                <span>Max: <b style="color:#ccc">${max.toFixed(1)}</b></span>
                <span>σ: <b style="color:#888">${std ? std.toFixed(1) : '-'}</b></span>
            </div>`;
        
        const plotWrapper = document.createElement("div");
        container.innerHTML = statHtml;
        container.appendChild(plotWrapper);
        
        const margin = { top: 10, right: 40, bottom: 20, left: 0 };
        
        const yMin = Math.min(min, d3.min(bgData, d => d.gMin));
        const yMax = Math.max(max, d3.max(bgData, d => d.gMax));
        
        try {
            const chart = Plot.plot({
                width: container.clientWidth,
                height: (container.clientHeight - 25) || 175, 
                marginLeft: margin.left, marginBottom: margin.bottom, marginRight: margin.right, marginTop: margin.top,
                style: { background: "transparent", color: "#aaa", fontSize: "10px" },
                x: { type: "time", tickFormat: this.grouping === 'day' ? "%H:%M" : "%b", grid: false },
                y: { 
                    axis: "right", grid: true, nice: true, label: null, tickFormat: d => d.toFixed(0),
                    domain: [yMin, yMax]
                },
                marks: [
                    // --- COUCHES DE FOND (Statistiques Globales) ---
                    Plot.lineY(bgData, { x: "date", y: "gMin", stroke: "#00ffff", strokeOpacity: 0.3, strokeWidth: 1, id: "min-line" }),
                    Plot.lineY(bgData, { x: "date", y: "gMax", stroke: "#ff5555", strokeOpacity: 0.3, strokeWidth: 1, id: "max-line" }),
                    // Plot.lineY(bgData, { x: "date", y: "gMean", stroke: "#ffffff", strokeOpacity: 0.3, strokeWidth: 1.5, strokeDasharray: "4,4", id: "mean-line-hidden" }), // Optionnel: garder en fond léger si besoin, sinon supprimer

                    // --- COUCHE PRINCIPALE ---
                    // Plot.ruleY([mean], { stroke: this.scales.colorMean(mean), strokeDasharray: "3,3", strokeOpacity: 0.7 , id: "mean-rule" }),
                    Plot.lineY(data, { x: "date", y: "val", stroke: "#ccc", strokeOpacity: 0.7, strokeWidth: 1 , id: "data-line" }),
                    
                    // --- MEAN LINE DESSUS (Déplacé) ---
                    Plot.lineY(bgData, { x: "date", y: "gMean", stroke: "#ff55ff", strokeOpacity: 0.3, strokeWidth: 1, id: "mean-line" }),

                    Plot.dot(data, Plot.pointerX({x: "date", y: "val", stroke: "red", r: 4})),
                    
                    Plot.text(data, Plot.pointerX({
                        px: "date", py: "val", dy: -8, dx: -10,
                        frameAnchor: "top-right",
                        fontVariant: "tabular-nums",
                        fontSize: "11px",
                        fill: "#aaa",
                        text: (d) => ` ${d.val} ${this.options.unit}`
                    })),
                    Plot.text(data, Plot.pointerX({
                        px: "date", py: "val", dy: -8,
                        frameAnchor: "top-left",
                        fontVariant: "tabular-nums",
                        fontSize: "11px",
                        fill: "#aaa",
                        text: (d) => `${d.date.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})} `
                    }))
                ]
            });
            // ajoute une legende sous le plot pour mean-line, max-line, min-line


            plotWrapper.appendChild(chart);
        } catch (e) { console.error("Erreur Plot:", e); }
    }
}