// js/drawing/spiralePlot.js
// =======================================
//  Visualisation Spirale 3D (Time Helix)
//  Version: DYNAMIC GRADIENT CENTER + AUTO-STOP ANIMATION + AUTO-LOAD LAST
//  Update: PROGRESSIVE STATS (HISTORY ONLY) + ALL RECORDS BLINKING
// =======================================

/**
 * Charge et affiche le graphique spirale.
 * @param {HTMLElement} container - Le conteneur DOM.
 * @param {string} url - L'URL de base (contenant /Raw/).
 * @param {string|null} forcedMode - 'day' ou 'year' pour forcer un mode (via le bouton).
 */
async function loadSpiralePlot(container, url, forcedMode = null) {
    if (!container || !(container instanceof HTMLElement)) return;

    // 1. Loader centré (Plus de CSS injecté ici, géré par votre fichier CSS externe)
    container.style.position = "relative"; 
    container.innerHTML = `
        <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#151515; z-index:100;">
            <div class="loader-spinner" style="width:20px; height:20px; border:2px solid #555; border-top:2px solid #fff; border-radius:50%; animation:spin 1s linear infinite;"></div>
        </div>`;

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
        this.sortedKeys = []; // Pour l'animation
        this.globalStats = []; // Stats "totales" pour la 3D
        this.bgDataForPlot = []; // Cache temporaire
        
        this.colorMode = (this.grouping === 'year') ? 'mean' : 'standard';

        this.isDragging = false;
        
        // Playback state
        this.isPlaying = false;
        this.playInterval = null;
        this.currentPlayKey = null;

        this.gAxes = null;
        this.gLabels = null;
        this.gSpiral = null;
        
        this.initScales();
        this.computeGlobalStats(); // Stats initiales pour la 3D
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
        
        // Store keys sorted for playback
        this.sortedKeys = Array.from(groups.keys()).sort();

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
        // Cette fonction calcule les stats sur TOUT le dataset (pour la structure 3D)
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
            .attr("class", "spiralChart-main-panel")
            .style("position", "relative")
            .style("width", "480px") 
            .style("flex", "none")
            .style("height", "100%")
            .style("overflow", "hidden");

        this.sidePanel = container.append("div")
            .attr("class", "spiralChart-side-panel")
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
            .style("cursor", "auto")
            .on("click", () => {
                // Arrêt de l'animation si on clique n'importe où sur le fond
                if (this.isPlaying) this.togglePlay();
            });

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

    updateView(isDragging = false) {
        this.drawAxes();
        
        // --- 1. CONFIGURATION DES GRADIENTS ---
        this.defs.selectAll("*").remove();

        // Calcul de l'écrasement global pour la 3D (perspective)
        const scaleY = Math.max(0.01, Math.abs(Math.sin(this.alpha)));
        
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

                // --- CREATION DU GRADIENT SPECIFIQUE AVEC POSITION AJUSTÉE ---
                if (that.colorMode !== 'mean') {
                    // Calcul du centre projeté pour CETTE spirale (dépend du temps / hauteur 'wy')
                    // Le centre de la spirale en 3D est à (0, wy, 0)
                    const centerProj = that.project(0, points[0].wy, 0);
                    const cx = centerProj[0];
                    const cy = centerProj[1];

                    // Matrice de transformation locale : on déplace au centre calculé, on applique le scaleY, on revient
                    const matrix = `translate(${cx}, ${cy}) scale(1, ${scaleY}) translate(${-cx}, ${-cy})`;

                    // ID unique basé sur la clé de période
                    const gradId = "grad-" + key.replace(/[^a-zA-Z0-9]/g, '-');
                    strokeRef = `url(#${gradId})`;

                    const radialGradient = that.defs.append("radialGradient")
                        .attr("id", gradId)
                        .attr("gradientUnits", "userSpaceOnUse")
                        .attr("cx", cx)
                        .attr("cy", cy)
                        .attr("r", that.radiusMax)
                        .attr("fx", cx)
                        .attr("fy", cy)
                        .attr("gradientTransform", matrix);

                    const stopCount = 20;
                    for (let i = 0; i <= stopCount; i++) {
                        const offset = i / stopCount;
                        const currentRadius = offset * that.radiusMax;
                        
                        let color;
                        if (currentRadius < that.radiusMin) {
                            const minVal = that.scales.radius.domain()[0];
                            color = that.scales.color(minVal);
                        } else {
                            const val = that.scales.radius.invert(currentRadius);
                            color = that.scales.color(val);
                        }

                        radialGradient.append("stop")
                            .attr("offset", `${offset * 100}%`)
                            .attr("stop-color", color);
                    }
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
                if (that.isDragging || that.isPlaying) return; 

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
                if (that.isDragging || that.isPlaying) return;

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
            .text(`Max: ${stats.max.toFixed(1)}${this.options.unit}  |  Moy: ${stats.mean.toFixed(1)}${this.options.unit}`);
        
        const line3 = this.tooltipText.append("tspan")
            .attr("x", 10).attr("dy", "1.4em")
            .text(`Min: ${stats.min.toFixed(1)}${this.options.unit}  |  σ: ${stats.std.toFixed(2)}${this.options.unit}`);
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
        if(this.isPlaying) this.togglePlay();
        
        this.lastClickedPoint = d.d;
        this.updateSidePanel(d.d, d.periodKey);
    }

    // --- Playback Logic ---
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        const btn = this.sidePanel.select("#btn-play-toggle");
        
        if (this.isPlaying) {
            btn.text("⏹ Stop").style("background", "#552222");
            this.playInterval = setInterval(() => this.stepAnimation(), 120); 
        } else {
            btn.text("▶ Play").style("background", "");
            if (this.playInterval) clearInterval(this.playInterval);
            this.playInterval = null;
            this.resetHighlights(); // Reset visual state on stop
        }
    }

    resetHighlights() {
        // Remet l'état initial des paths
        this.gSpiral.selectAll(".sp-vis-path")
            .attr("stroke-opacity", 0.9)
            .attr("stroke-width", 1);
    }

    stepAnimation() {
        // Sécurité : si le mini-chart n'est plus dans le DOM, on arrête tout
        const chartContainer = document.getElementById("mini-chart-container");
        if (!chartContainer || !chartContainer.isConnected) {
            if (this.playInterval) clearInterval(this.playInterval);
            this.isPlaying = false;
            if (this.sidePanel) {
                // Reset bouton si le panel existe encore (peu probable si container absent mais possible)
                const btn = this.sidePanel.select("#btn-play-toggle");
                if(!btn.empty()) btn.text("▶ Play").style("background", "");
            }
            return;
        }

        if (!this.sortedKeys || this.sortedKeys.length === 0) return;
        
        let idx = this.sortedKeys.indexOf(this.currentPlayKey);
        idx++;
        if (idx >= this.sortedKeys.length) idx = 0; // Loop
        
        this.currentPlayKey = this.sortedKeys[idx];

        // --- Visual Highlight Logic (Comme le survol) ---
        // 1. On atténue tout
        this.gSpiral.selectAll(".sp-vis-path")
            .attr("stroke-opacity", 0.15)
            .attr("stroke-width", 1);
        
        // 2. On sélectionne le groupe correspondant à la clé courante
        const targetGroup = this.gSpiral.selectAll(".period-group")
            .filter(d => d.key === this.currentPlayKey);
        
        // 3. On met en évidence le path
        targetGroup.select(".sp-vis-path")
            .attr("stroke-opacity", 1)
            .attr("stroke-width", 1.5);
        
        // 4. On le met au premier plan (Z-Index)
        targetGroup.raise();
        
        // --- Mise à jour panel latéral ---
        const pointsInPeriod = this.data.filter(d => this.getPeriodKeyForDate(d.date) === this.currentPlayKey);
        if (pointsInPeriod.length > 0) {
            this.updateSidePanel(pointsInPeriod[0], this.currentPlayKey, true);
        }
    }

    updateSidePanel(dataPoint, periodKey, isAnimating = false) {
        if (!this.sidePanel) return;
        
        this.currentPlayKey = periodKey; 

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

        if (!isAnimating || content.select("#mini-chart-container").empty()) {
            content.html(`
                <div class="panel-info">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div id="panel-date-dyn" class="panel-date">${dateFmt(dataPoint.date)}</div>
                        <button id="btn-play-toggle" style="font-size:11px; padding:2px 6px; background:#333; color:#fff; border:1px solid #555; cursor:pointer;">▶ Play</button>
                    </div>
                    <div style="font-size:11px; color:#666; margin-bottom:10px; text-transform:uppercase;">${pTitle}</div>
                </div>
                <div id="mini-stats-header"></div>
                <div id="mini-chart-container" style="width:100%; height:200px; position:relative;"></div>
                <div id="mini-chart-legend" style="padding-top:10px; border-top:1px solid #333; margin-top:5px;"></div>
            `);

            content.select("#btn-play-toggle").on("click", () => this.togglePlay());
        } else {
            content.select("#panel-date-dyn").text(dateFmt(dataPoint.date));
        }
        
        if(this.isPlaying) {
            content.select("#btn-play-toggle").text("⏹ Stop").style("background", "#552222");
        } else {
            content.select("#btn-play-toggle").text("▶ Play").style("background", "");
        }

        const subset = this.data.filter(d => d.ts >= pStart.getTime() && d.ts <= pEnd.getTime());
        this.drawMiniChart(subset, dataPoint);
    }

    // NOUVELLE FONCTION : Recalcule les stats globales en excluant le futur
    computeProgressiveStats(limitDate) {
        // On filtre pour ne garder que l'historique (jusqu'à l'année/jour sélectionné inclus)
        const limitYear = limitDate.getFullYear();
        
        // Filtre : toutes les données dont l'année est <= à l'année affichée
        // (Cela fonctionne pour comparer des années entières. Pour le mode "day" comparant des cycles, c'est aussi pertinent)
        const historyData = this.data.filter(d => d.date.getFullYear() <= limitYear);

        let getKey;
        if (this.grouping === 'day') getKey = (d) => d.date.getHours() * 60 + d.date.getMinutes();
        else getKey = (d) => d.date.getMonth() * 100 + d.date.getDate();

        const timeGroups = d3.group(historyData, getKey);
        const progressiveStats = [];

        // On recalcule Min/Max/Moy sur cet historique partiel
        for (const [timeKey, points] of timeGroups) {
            progressiveStats.push({
                key: timeKey,
                min: d3.min(points, d => d.val),
                max: d3.max(points, d => d.val),
                mean: d3.mean(points, d => d.val)
            });
        }
        progressiveStats.sort((a, b) => a.key - b.key);
        return progressiveStats;
    }

    drawMiniChart(data, focusPoint) {
        const container = document.getElementById("mini-chart-container");
        const statsContainer = document.getElementById("mini-stats-header");
        const legendContainer = document.getElementById("mini-chart-legend");

        if (!container || !statsContainer) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="color:#444">Pas de données</div>';
            return;
        }

        const mean = d3.mean(data, d => d.val);
        const min = d3.min(data, d => d.val);
        const max = d3.max(data, d => d.val);
        const std = d3.deviation(data, d => d.val);

        statsContainer.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:13px; color:#999; margin-bottom:6px; font-family:sans-serif; padding-bottom:4px;">
                <span>Min: <b style="color:#ccc">${min.toFixed(1)}${this.options.unit}</b></span>
                <span>Moy: <b style="color:${this.scales.colorMean(mean)}">${mean.toFixed(1)}${this.options.unit}</b></span>
                <span>Max: <b style="color:#ccc">${max.toFixed(1)}${this.options.unit}</b></span>
                <span>σ: <b style="color:#888">${std ? std.toFixed(1) : '-'}${this.options.unit}</b></span>
            </div>`;

        const yearRef = focusPoint.date.getFullYear();
        const monthRef = focusPoint.date.getMonth();
        const dayRef = focusPoint.date.getDate();
        
        // --- LOGIC: PROGRESSIVE GLOBAL STATS ---
        // On calcule les stats globales uniquement avec les données <= année courante
        const currentProgressiveStats = this.computeProgressiveStats(focusPoint.date);

        // Mapping des stats progressives sur la période temporelle visualisée
        const mappedBgData = [];
        // On projette ces stats sur l'année/jour visualisé pour l'affichage
        currentProgressiveStats.forEach(stat => {
             let newDate;
             if (this.grouping === 'day') {
                 // Reconstruire l'heure à partir de la clé (minutes)
                 const h = Math.floor(stat.key / 60);
                 const m = stat.key % 60;
                 newDate = new Date(yearRef, monthRef, dayRef, h, m);
             } else {
                 // Reconstruire la date à partir de la clé (MMDD)
                 const m = Math.floor(stat.key / 100);
                 const d = stat.key % 100;
                 newDate = new Date(yearRef, m, d);
             }
             mappedBgData.push({
                 date: newDate,
                 gMin: stat.min,
                 gMax: stat.max,
                 gMean: stat.mean,
                 key: stat.key
             });
        });

        // --- Logic: Détection des Records (TOUTES SÉRIES) ---
        // Un record est détecté si la valeur actuelle touche les bornes historiques (progressiveStats)
        const statMap = new Map();
        currentProgressiveStats.forEach(s => statMap.set(s.key, s));

        // Préparation des données pour les segments de records (avec null pour les ruptures)
        let highRecData = [];
        let lowRecData = [];
        
        highRecData = data.map(d => {
            let key;
            if (this.grouping === 'day') key = d.date.getHours() * 60 + d.date.getMinutes();
            else key = d.date.getMonth() * 100 + d.date.getDate();
            
            const stat = statMap.get(key);
            // Si la valeur est >= au Max historique connu à ce moment là
            if (stat && d.val >= stat.max) return { date: d.date, val: d.val };
            return { date: d.date, val: null };
        });

        lowRecData = data.map(d => {
            let key;
            if (this.grouping === 'day') key = d.date.getHours() * 60 + d.date.getMinutes();
            else key = d.date.getMonth() * 100 + d.date.getDate();
            
            const stat = statMap.get(key);
            // Si la valeur est <= au Min historique connu à ce moment là
            if (stat && d.val <= stat.min) return { date: d.date, val: d.val };
            return { date: d.date, val: null };
        });
        // --------------------------------------------------------

        const yMin = Math.min(min, d3.min(mappedBgData, d => d.gMin));
        const yMax = Math.max(max, d3.max(mappedBgData, d => d.gMax));

        container.innerHTML = '';
        
        try {
            const chart = Plot.plot({
                width: container.clientWidth,
                height: (container.clientHeight) || 200, 
                marginLeft: 0, marginBottom: 20, marginRight: 40, marginTop: 10,
                style: { background: "transparent", color: "#aaa", fontSize: "10px" },
                x: { type: "time", tickFormat: this.grouping === 'day' ? "%H:%M" : "%b", grid: false },
                y: { 
                    axis: "right", grid: true, nice: true, label: null, tickFormat: d => d.toFixed(0),
                    domain: [yMin, yMax]
                },
                marks: [
                    // --- Arrière-plan (Range global HISTORIQUE) ---
                    Plot.areaY(mappedBgData, { x: "date", y1: "gMin", y2: "gMax", fill: "#333", fillOpacity: 0.2 }),
                    
                    // Lignes globales HISTORIQUES
                    Plot.lineY(mappedBgData, { x: "date", y: "gMin", stroke: "#00ffff", strokeOpacity: 0.3, strokeWidth: 1 }),
                    Plot.lineY(mappedBgData, { x: "date", y: "gMax", stroke: "#ff5555", strokeOpacity: 0.3, strokeWidth: 1 }),
                    Plot.lineY(mappedBgData, { x: "date", y: "gMean", stroke: "#ff55ff", strokeOpacity: 0.4, strokeWidth: 1 }),
                    
                    // --- Textes simplifiés au survol pour les lignes globales ---
                    Plot.text(mappedBgData, Plot.pointerX({
                        x: "date", y: "gMax", text: d => `${d.gMax.toFixed(1)} ${this.options.unit}`, 
                        dy: -10, fill: "#ff5555", textAnchor: "middle"
                    })),
                    Plot.text(mappedBgData, Plot.pointerX({
                        x: "date", y: "gMean", text: d => `${d.gMean.toFixed(1)} ${this.options.unit}`, 
                        dy: -5, fill: "#ff55ff", textAnchor: "end", dx: -5
                    })),
                    Plot.text(mappedBgData, Plot.pointerX({
                        x: "date", y: "gMin", text: d => `${d.gMin.toFixed(1)} ${this.options.unit}`, 
                        dy: 10, fill: "#00ffff", textAnchor: "middle"
                    })),

                    // --- Segment vertical interactif ---
                    Plot.link(mappedBgData, Plot.pointerX({
                        x1: "date", y1: "gMin", x2: "date", y2: "gMax", 
                        stroke: "#666", strokeDasharray: "2,3", strokeOpacity: 0.8
                    })),
                    
                    // --- Data courante ---
                    Plot.lineY(data, { x: "date", y: "val", stroke: "#ccc", strokeOpacity: 0.8, strokeWidth: 1, id: "data-line" }),
                    
                    Plot.dot(data, Plot.pointerX({x: "date", y: "val", stroke: "red", r: 4})),
                    
                    // --- HIGHLIGHT RECORDS (Path clignotant via classe CSS) ---
                    Plot.lineY(highRecData, { 
                        x: "date", y: "val", 
                        stroke: "red", strokeWidth: 5, strokeLinecap: "round",
                        className: "blink-record" 
                    }),
                    Plot.lineY(lowRecData, { 
                        x: "date", y: "val", 
                        stroke: "cyan", strokeWidth: 5, strokeLinecap: "round",
                        className: "blink-record"
                    }),

                    // --- Textes Data courante ---
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
            container.appendChild(chart);
        } catch (e) { console.error("Erreur Plot:", e); }

        if (legendContainer) {
            legendContainer.innerHTML = `
                <div style="display:flex; justify-content:center; gap:15px; font-size:10px; color:#888; font-family:sans-serif;">
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#ccc; margin-right:4px;"></span> Selected Data</div>
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#ff55ff; opacity:0.6; margin-right:4px;"></span> Moyenne Glob.</div>
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#ff5555; opacity:0.5; margin-right:4px;"></span> Max Glob.</div>
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#00ffff; opacity:0.5; margin-right:4px;"></span> Min Glob.</div>
                    <div style="display:flex; align-items:center; margin-left:10px;"><span style="display:inline-block; width:10px; height:4px; background:red; opacity:0.4; margin-right:4px;"></span> Record Zone</div>
                </div>
            `;
        }
    }
}