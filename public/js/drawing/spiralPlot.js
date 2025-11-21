// js/drawing/spiralePlot.js
// =======================================
//  Visualisation Spirale 3D (Time Helix)
//  Version: AXE INVERSÉ + TOGGLE HEATMAP + FILTRE ÉCHELLE 90% + STATS MINICHART
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

        // Logique de forçage par le bouton ou auto-détection
        if (forcedMode === 'day') {
            mode = 'day';
            // Mode jour forcé : on prend les 180 derniers jours max
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

        // 3. Calcul du stepCount (Résolution)
        let stepCount = 0;
        
        if (daysToLoad > 3600) {
            // > 3600j : Mode year, 1 point par jour
            stepCount = Math.ceil(daysToLoad) ;
            if (forcedMode === null) mode = 'year'; 
        } 
        else if (daysToLoad > 181) {
            // > 180j : Mode year, 4 points par jour
            stepCount = Math.ceil(daysToLoad * 4);
            if (forcedMode === null) mode = 'year';
        } 
        else if (daysToLoad <= 32) {
            // <= 32j : Mode day, 288 points par jour (5 min)
            stepCount = Math.ceil(daysToLoad * 288);
            if (forcedMode === null) mode = 'day';
        } 
        else {
            // <= 180j (et > 32j) : Mode day, 24 points par jour (1 heure)
            stepCount = Math.ceil(daysToLoad * 24);
            if (forcedMode === null) mode = 'day';
        }

        // 4. Appel API Data avec les paramètres calculés
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
        
        this.periodMeans = new Map();
        
        // LOGIQUE COULEUR PAR DÉFAUT
        // Si on est en mode Year, on active 'mean' par défaut pour lisser les tendances
        this.colorMode = (this.grouping === 'year') ? 'mean' : 'standard';

        // Drag optimization state
        this.isDragging = false;
        this.gAxes = null;
        this.gLabels = null;
        this.gSpiral = null;
        
        this.initScales();
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
        // Regroupement par période pour analyse
        const groups = d3.group(this.data, d => this.getPeriodKeyForDate(d.date));
        
        // 1. Identifier le "100%" de données (le max de points dans une période)
        const counts = Array.from(groups.values()).map(g => g.length);
        const maxPoints = d3.max(counts) || 0;
        const threshold = maxPoints * 0.9; // Seuil de 90%

        // 2. Collecter les valeurs UNIQUEMENT pour les périodes "complètes"
        let validValues = [];
        let validMeans = [];

        this.periodMeans = new Map();

        for (const [key, points] of groups) {
            // On stocke la moyenne pour TOUTES les périodes (pour l'affichage)
            const mean = d3.mean(points, d => d.val);
            this.periodMeans.set(key, mean);

            // Pour l'échelle, on ne garde que si la période est assez complète
            if (points.length >= threshold) {
                validMeans.push(mean);
                for (const p of points) {
                    validValues.push(p.val);
                }
            }
        }

        // Fallback de sécurité : si aucune période ne passe le filtre
        if (validValues.length === 0) {
            validValues = this.data.map(d => d.val);
            validMeans = Array.from(this.periodMeans.values());
        }

        // 3. Calcul des extents sur les données filtrées
        const extentVal = d3.extent(validValues);
        const extentMean = d3.extent(validMeans);

        const padding = (extentVal[1] - extentVal[0]) * 0.1;
        
        this.scales.radius = d3.scaleLinear()
            .domain([extentVal[0] - padding, extentVal[1] + padding])
            .range([this.radiusMin, this.radiusMax]);

        // Couleur Standard : Turbo (Multicolore)
        this.scales.color = d3.scaleSequential(d3.interpolateTurbo).domain(extentVal);

        // Couleur Moyenne : RdBu inversé (Bleu = bas, Rouge = haut)
        this.scales.colorMean = d3.scaleSequential(t => d3.interpolateRdBu(1 - t)).domain(extentMean);

        // Axe Z (Dates)
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
        container.style("position", "relative").style("overflow", "hidden");

        container.selectAll("svg").remove();
        this.svg = container.append("svg")
            .attr("width", "50%").attr("height", "100%")
            .style("background", "#151515")
            .style("cursor", "auto");

        this.gAxes = this.svg.append("g");
        this.gLabels = this.svg.append("g");
        this.gSpiral = this.svg.append("g");
        
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
            .on("start", () => {
                this.isDragging = true;
                this.svg.style("cursor", "grabbing");
                this.gSpiral.selectAll(".period-group").classed("hover-active", false);
                this.hoverText.style("opacity", 0);
            })
            .on("drag", (e) => {
                this.beta -= e.dx * 0.008;
                this.alpha = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.alpha - e.dy * 0.008));
                this.updateViewDrag();
            })
            .on("end", () => {
                this.isDragging = false;
                this.svg.style("cursor", "auto");
                this.updateView();
            });
        this.svg.call(drag);
    }

    createControls() {
        d3.select(this.container).selectAll(".spiral-controls").remove();
        d3.select(this.container).selectAll(".spiral-controls-left").remove();

        // 1. Contrôles Droite (Vue + Mode)
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
        const leftC = d3.select(this.container).append("div")
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

    updateViewDrag() {
        this.drawAxes();
        this.gSpiral.selectAll(".period-group").remove(); 
        this.gSpiral.selectAll(".sp-path").remove();

        const groups = d3.group(this.points3D, d => d.periodKey);
        const pathsData = [];

        for (const [key, points] of groups) {
            if (points.length < 2) continue;
            
            let color;
            if (this.colorMode === 'mean') {
                color = this.scales.colorMean(points[0].meanVal);
            } else {
                const avgVal = d3.mean(points, d => d.original.val);
                color = this.scales.color(avgVal);
            }

            let dStr = "";
            let valid = false;
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const proj = this.project(p.wx, p.wy, p.wz);
                if (proj[1] < -50 || proj[1] > this.height + 50) continue;

                if (dStr === "") dStr = `M${proj[0]},${proj[1]}`;
                else dStr += `L${proj[0]},${proj[1]}`;
                valid = true;
            }

            if (valid) {
                pathsData.push({ key, d: dStr, c: color });
            }
        }

        const paths = this.gSpiral.selectAll(".sp-path").data(pathsData, d => d.key);
        paths.exit().remove();
        paths.enter().append("path").attr("class", "sp-path")
            .merge(paths)
            .attr("d", d => d.d)
            .attr("stroke", d => d.c)
            .attr("stroke-width", 1.5)
            .attr("stroke-opacity", 0.6);
    }

    updateView() {
        if (this.isDragging) {
            this.updateViewDrag();
            return;
        }

        this.drawAxes();
        this.gSpiral.selectAll(".sp-path").remove();

        const groupsData = [];
        const groupedPoints = d3.group(this.points3D, d => d.periodKey);

        for (const [key, points] of groupedPoints) {
            const segs = [];
            let pathD = "";
            let lastX = null, lastY = null;

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i+1];
                const pr1 = this.project(p1.wx, p1.wy, p1.wz);
                const pr2 = this.project(p2.wx, p2.wy, p2.wz);

                if(Math.max(pr1[1], pr2[1]) < -50 || Math.min(pr1[1], pr2[1]) > this.height+50) {
                    lastX = null;
                    continue;
                }
                
                let segColor;
                if (this.colorMode === 'mean') {
                    segColor = this.scales.colorMean(p1.meanVal);
                } else {
                    segColor = this.scales.color(p1.original.val);
                }

                segs.push({
                    x1: pr1[0], y1: pr1[1], x2: pr2[0], y2: pr2[1],
                    c: segColor
                });

                if (lastX === null || pr1[0] !== lastX || pr1[1] !== lastY) {
                    pathD += `M${pr1[0]},${pr1[1]}`;
                }
                pathD += `L${pr2[0]},${pr2[1]}`;
                lastX = pr2[0]; lastY = pr2[1];
            }
            
            if (segs.length > 0) {
                groupsData.push({ key: key, segments: segs, pathD: pathD, refPoint: points[0].original });
            }
        }

        const groups = this.gSpiral.selectAll(".period-group").data(groupsData, d => d.key);
        groups.exit().remove();
        
        const groupsEnter = groups.enter().append("g")
            .attr("class", "period-group");

        groupsEnter.merge(groups)
            .on("mouseover", (e, d) => {
                d3.selectAll(".period-group.hover-active").classed("hover-active", false);
                d3.select(e.currentTarget).classed("hover-active", true).raise();
                this.updateHoverText(d.refPoint);
            })
            .on("mouseout", (e, d) => {
                d3.select(e.currentTarget).classed("hover-active", false);
                this.hideHoverText();
            })
            .on("click", (e, d) => {
                this.handleClick(e, { d: d.refPoint, periodKey: d.key });
            });

        groupsEnter.merge(groups).each(function(d) {
            const g = d3.select(this);
            // Ghost Path (5px)
            g.selectAll(".sp-ghost-path")
                .data([d])
                .join("path")
                .attr("class", "sp-ghost-path")
                .attr("d", d.pathD);

            // Visible Lines (1px)
            g.selectAll(".sp-line")
                .data(d.segments)
                .join("line")
                .attr("class", "sp-line")
                .attr("x1", s => s.x1).attr("y1", s => s.y1)
                .attr("x2", s => s.x2).attr("y2", s => s.y2)
                .attr("stroke", s => s.c)
                .attr("stroke-width", 1)
                .attr("stroke-opacity", 0.8);
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

        // CALCULS STATISTIQUES
        const mean = d3.mean(data, d => d.val);
        const min = d3.min(data, d => d.val);
        const max = d3.max(data, d => d.val);
        
        // Injection du header de stats (HTML pour lisibilité)
        const statHtml = `
            <div style="display:flex; justify-content:space-between; font-size:14px; color:#999; margin-bottom:4px; font-family:sans-serif; border-bottom:1px solid #333; padding-bottom:4px;">
                <span>Min: <b style="color:#ccc">${min.toFixed(1)} ${this.options.unit}</b></span>
                <span>Moy: <b style="color:${this.scales.colorMean(mean)}">${mean.toFixed(1)} ${this.options.unit}</b></span>
                <span>Max: <b style="color:#ccc">${max.toFixed(1)} ${this.options.unit}</b></span>
            </div>`;
        
        // Création d'un div wrapper pour le Plot
        const plotWrapper = document.createElement("div");
        container.innerHTML = statHtml;
        container.appendChild(plotWrapper);
        
        const margin = { top: 10, right: 40, bottom: 20, left: 0 };
        
        try {
            const chart = Plot.plot({
                width: container.clientWidth,
                height: (container.clientHeight - 25) || 175, // Ajustement hauteur pour stats
                marginLeft: margin.left, marginBottom: margin.bottom, marginRight: margin.right, marginTop: margin.top,
                style: { background: "transparent", color: "#aaa", fontSize: "10px" },
                x: { type: "time", tickFormat: this.grouping === 'day' ? "%H:%M" : "%b", grid: false },
                y: { 
                    axis: "right", grid: true, nice: true, label: null, tickFormat: d => d.toFixed(0),
                    domain: [min, max]
                },
                marks: [
                    // Ligne Moyenne (Pointillés)
                    Plot.ruleY([mean], { stroke: this.scales.colorMean(mean), strokeDasharray: "3,3", strokeOpacity: 0.7 }),
                    
                    // Données principales
                    Plot.lineY(data, { x: "date", y: "val", stroke: "#888", strokeWidth: 1.5, curve: "monotone-x" }),
                    
                    // Point focus
                    Plot.dot(data, Plot.pointerX({x: "date", y: "val", stroke: "red"})),
                    
                    // Tooltips dynamiques
                    Plot.text(data, Plot.pointerX({
                        px: "date", py: "val", dy: -10, dx: -10,
                        frameAnchor: "top-right",
                        fontVariant: "tabular-nums",
                        fontSize: "12px",
                        text: (d) => ` ${d.val} ${this.options.unit}`
                    })),
                    Plot.text(data, Plot.pointerX({
                        px: "date", py: "val", dy: -10,
                        frameAnchor: "top-left",
                        fontVariant: "tabular-nums",
                        fontSize: "12px",
                        text: (d) => `${d.date.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})} `
                    }))
                ]
            });
            plotWrapper.appendChild(chart);
        } catch (e) { console.error("Erreur Plot:", e); }
    }
}