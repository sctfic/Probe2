// js/drawing/spiralePlot.js
// =======================================
//  Visualisation Spirale 3D (Time Helix)
//  Version: SINGLE SMART GRADIENT + CLICK FIX + RESPONSIVE
// =======================================

/**
 * Charge et affiche le graphique spirale.
 * @param {HTMLElement} container - Le conteneur DOM.
 * @param {string} url - L'URL de base (contenant /Raw/).
 * @param {string|null} forcedMode - 'day' ou 'year' pour forcer un mode (via le bouton).
 */
async function loadSpiralePlot(container, url, forcedMode = null) {
    if (!container || !(container instanceof HTMLElement)) return;

    // Affichage du loader
    container.innerHTML = `
        <div style="display:flex; height:100%; justify-content:center; align-items:center; color:#888;">
            <div class="loader-spinner" style="width:20px; height:20px; border:2px solid #555; border-top:2px solid #fff; border-radius:50%; animation:spin 1s linear infinite;"></div>
        </div>
        <style>@keyframes spin {0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>`;

    try {
        // 1. Récupération rapide de la plage (Metadata) via /Range/
        const rangeUrl = url.replace('/Raw/', '/Range/');
        const rangeResponse = await (window.fetchWithCache ? window.fetchWithCache(rangeUrl, 300000) : fetch(rangeUrl).then(r => r.json()));
        
        if (!rangeResponse || !rangeResponse.metadata) throw new Error("Métadonnées Range introuvables");
        
        const meta = rangeResponse.metadata;
        const dateFirst = new Date(meta.first);
        const dateLast = new Date(meta.last);
        const totalRangeDays = (dateLast - dateFirst) / (1000 * 60 * 60 * 24);

        // 2. Détermination du mode et de la plage à charger
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

        // 3. Calcul du stepCount
        let stepCount = 0;
        
        if (daysToLoad > 3600) {
            stepCount = Math.ceil(daysToLoad) ;
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

        // 4. Appel API Data
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

        // 5. Initialisation du Plot
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
        this.centerX = 0; // Sera recalculé
        this.centerY = 0; // Sera recalculé

        this.beta = 0;
        this.alpha = -20 * (Math.PI / 180);
        
        const minDim = Math.min(this.width, this.height); // Basé sur le conteneur complet
        this.radiusMin = minDim * 0.15;
        this.radiusMax = minDim * 0.40;
        this.spiralHeight = this.height * 0.65;
        
        this.wrapper = null; 
        this.sidePanel = null; 
        this.svg = null;
        this.defs = null; 
        this.hoverText = null;
        
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

        // --- RESPONSIVE FLEX LAYOUT ---
        container
            .style("display", "flex")
            .style("flex-wrap", "wrap")         
            .style("gap", "1rem")               
            .style("justify-content", "center") 
            .style("width", "100%")
            .style("height", "100%")
            .style("padding", "0.5rem")
            .style("box-sizing", "border-box")
            .style("overflow-y", "auto");      

        // 1. WRAPPER
        this.wrapper = container.append("div")
            .attr("class", "relative-wrapper")
            .style("position", "relative")
            .style("flex", "1")                 
            .style("min-width", "480px")        
            .style("min-height", "400px")       
            .style("background", "#151515")
            .style("border-radius", "8px")
            .style("overflow", "hidden");

        // 2. SIDE PANEL
        this.sidePanel = container.append("div")
            .attr("class", "spiral-side-panel")
            .style("position", "relative") 
            .style("flex", "1")                 
            .style("min-width", "480px")        
            .style("min-height", "300px")
            .style("background", "#1a1a1a")
            .style("border-radius", "8px")
            .style("border", "1px solid #333")
            .html(`<div class="spiral-panel-content"><div style="text-align:center; color:#555; font-family:sans-serif;">Cliquez sur une période</div></div>`);

        // 3. SVG
        this.svg = this.wrapper.append("svg")
            .attr("width", "100%").attr("height", "100%")
            .style("background", "transparent")
            .style("cursor", "auto");

        this.defs = this.svg.append("defs");

        this.gAxes = this.svg.append("g");
        this.gLabels = this.svg.append("g");
        this.gSpiral = this.svg.append("g");
        
        this.hoverText = this.gLabels.append("text")
            .attr("class", "svg-hover-date")
            .attr("x", this.centerX)
            .attr("y", this.height * 0.15)
            .attr("text-anchor", "start") 
            .attr("font-size", "3rem")
            .style("opacity", 0)
            .text("");

        this.gLabels.append("text")
            .attr("x", 10).attr("y", this.height - 10)
            .attr("fill", "#555").style("font-family", "sans-serif").style("font-size", "10px")
            .text(`Spirale 3D • ${this.options.unit}`);

        this.createControls();
        this.updateView();

        const drag = d3.drag()
            .on("start", () => {
                this.isDragging = true;
                this.svg.style("cursor", "grabbing");
                this.gSpiral.selectAll(".sp-period-path").style("opacity", 1);
                this.hoverText.style("opacity", 0);
            })
            .on("drag", (e) => {
                this.beta -= e.dx * 0.008;
                this.alpha = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.alpha - e.dy * 0.008));
                this.updateView();
            })
            .on("end", () => {
                this.isDragging = false;
                this.svg.style("cursor", "auto");
                this.updateView();
            });
        this.svg.call(drag);
    }

    createControls() {
        this.wrapper.selectAll(".spiral-controls").remove();
        this.wrapper.selectAll(".spiral-controls-left").remove();

        // Contrôles Droite
        const c = this.wrapper.append("div").attr("class", "spiral-controls").style("pointer-events", "auto");
        
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

        // Contrôles Gauche
        const leftC = this.wrapper.append("div")
            .attr("class", "spiral-controls-left")
            .style("pointer-events", "auto");

        const colorBtn = leftC.append("button")
            .attr("class", "spiral-btn")
            .text(this.colorMode === 'mean' ? "Couleur: Moyenne" : "Couleur: Détail");
            
        colorBtn.on("click", (e) => {
            e.stopPropagation();
            this.colorMode = (this.colorMode === 'standard') ? 'mean' : 'standard';
            colorBtn.text(this.colorMode === 'mean' ? "Couleur: Moyenne" : "Couleur: Détail");
            this.updateView();
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
     * Mise à jour complète de la vue.
     * Utilise UN SEUL gradient vertical pour optimiser les performances.
     */
    updateView() {
        this.drawAxes();
        this.gSpiral.selectAll(".sp-period-path").remove();
        
        this.defs.selectAll("*").remove();

        // 1. Création du GRADIENT GLOBAL (Vertical Smart Heatmap)
        // On calcule la couleur moyenne pour chaque "tranche" de hauteur (temps)
        const zRange = this.scales.z.range(); // [minY, maxY]
        const zDomain = this.scales.z.domain();
        
        const gradId = "global-spiral-gradient";
        const gradient = this.defs.append("linearGradient")
            .attr("id", gradId)
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("x1", 0).attr("y1", zRange[0])
            .attr("x2", 0).attr("y2", zRange[1]);

        // On échantillonne le temps en 20 étapes pour définir le gradient
        const stopsCount = 20;
        const timeStep = (zDomain[1] - zDomain[0]) / stopsCount;
        
        // Pré-calculer les moyennes par tranche de temps pour le gradient
        // (C'est une approximation rapide pour avoir un beau dégradé vertical)
        for (let i = 0; i <= stopsCount; i++) {
            const t = new Date(zDomain[0].getTime() + i * timeStep);
            const y = this.scales.z(t);
            const offset = ((y - zRange[0]) / (zRange[1] - zRange[0])) * 100;
            
            // Trouver une valeur représentative (moyenne locale)
            // On cherche la période correspondante
            const key = this.getPeriodKeyForDate(t);
            const meanVal = this.periodMeans.get(key); 
            
            // Si pas de données exactes, on interpolate ou prend une valeur par défaut
            const color = (meanVal !== undefined) ? this.scales.color(meanVal) : "#555";
            
            gradient.append("stop")
                .attr("offset", `${offset}%`)
                .attr("stop-color", color);
        }

        const groupsData = [];
        const groupedPoints = d3.group(this.points3D, d => d.periodKey);
        const that = this;

        for (const [key, points] of groupedPoints) {
            let pathD = "";
            let lastX = null, lastY = null;
            
            const meanColor = this.scales.colorMean(points[0].meanVal);

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
                // Mode "Moyenne" = Couleur unie
                // Mode "Standard/Détail" = Gradient Global Vertical (très performant)
                const strokeRef = (that.colorMode === 'mean') ? meanColor : `url(#${gradId})`;

                groupsData.push({ 
                    key: key, 
                    pathD: pathD, 
                    refPoint: points[0].original,
                    stroke: strokeRef
                });
            }
        }

        const paths = this.gSpiral.selectAll(".sp-period-path").data(groupsData, d => d.key);
        paths.exit().remove();

        paths.enter().append("path")
            .attr("class", "sp-period-path")
            .merge(paths)
            .attr("d", d => d.pathD)
            .attr("stroke", d => d.stroke)
            .attr("stroke-width", 3)  // Épaisseur 3px pour faciliter le clic
            .attr("stroke-opacity", 0.9)
            .attr("fill", "none")
            .style("cursor", "pointer")
            .style("pointer-events", "stroke") // Crucial pour le clic sur path
            .on("mouseover", (e, d) => {
                if (this.isDragging) return;
                this.gSpiral.selectAll(".sp-period-path").transition().duration(100).style("opacity", 0.2);
                d3.select(e.currentTarget).transition().duration(100).style("opacity", 1).raise();
                this.updateHoverText(d.refPoint);
            })
            .on("mouseout", (e, d) => {
                if (this.isDragging) return;
                this.gSpiral.selectAll(".sp-period-path").transition().duration(200).style("opacity", 1);
                this.hideHoverText();
            })
            .on("click", (e, d) => {
                e.stopPropagation(); // Empêche propagation vers le drag du parent
                if (this.isDragging) return;
                this.handleClick(e, { d: d.refPoint, periodKey: d.key });
            });
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
        content.style("opacity", 0).html(""); // Vider et cacher

        // Utiliser une transition pour la fluidité
        content.transition().duration(300).style("opacity", 1);

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
                    Plot.lineY(bgData, { x: "date", y: "gMin", stroke: "#00ffff", strokeOpacity: 0.2, strokeWidth: 1 }),
                    Plot.lineY(bgData, { x: "date", y: "gMax", stroke: "#ff5555", strokeOpacity: 0.2, strokeWidth: 1 }),
                    Plot.lineY(bgData, { x: "date", y: "gMean", stroke: "#ffffff", strokeOpacity: 0.3, strokeWidth: 1.5, strokeDasharray: "4,4" }),

                    Plot.ruleY([mean], { stroke: this.scales.colorMean(mean), strokeDasharray: "3,3", strokeOpacity: 0.7 }),
                    Plot.lineY(data, { x: "date", y: "val", stroke: "#ccc", strokeWidth: 2, curve: "monotone-x" }),
                    Plot.dot(data, Plot.pointerX({x: "date", y: "val", stroke: "red", r: 4})),
                    
                    Plot.text(data, Plot.pointerX({
                        px: "date", py: "val", dy: -10, dx: -10,
                        frameAnchor: "top-right",
                        fontVariant: "tabular-nums",
                        fontSize: "12px",
                        fill: "white",
                        text: (d) => ` ${d.val} ${this.options.unit}`
                    })),
                    Plot.text(data, Plot.pointerX({
                        px: "date", py: "val", dy: -10,
                        frameAnchor: "top-left",
                        fontVariant: "tabular-nums",
                        fontSize: "12px",
                        fill: "#aaa",
                        text: (d) => `${d.date.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})} `
                    }))
                ]
            });
            plotWrapper.appendChild(chart);
        } catch (e) { console.error("Erreur Plot:", e); }
    }
}