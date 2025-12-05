
// Probe2\public\js\drawing\spiralPlot.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

// =======================================
//  Visualisation Spirale 3D (Time Helix)
//  Version: CONTROLS IN PARENT + ADAPTIVE LAYOUT (Compact Vert / Full Horiz)
// =======================================

/**
 * Charge et affiche le graphique spirale.
 * @param {HTMLElement} container - Le conteneur DOM.
 * @param {string} url - L'URL de base (contenant /Raw/).
 * @param {string|null} forcedMode - 'day' ou 'year' pour forcer un mode (via le bouton).
 */
async function loadSpiralePlot(container, url, forcedMode = null) {
    if (!container || !(container instanceof HTMLElement)) return;

    // 1. Loader centré et hauteur minimale temporaire
    container.style.position = "relative"; 
    container.style.minHeight = "200px"; 
    
    // Couleur unifiée rgb(26, 26, 26)
    container.innerHTML = `
        <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:rgb(26, 26, 26); z-index:100;">
            <div class="loader-spinner" style="width:20px; height:20px; border:2px solid #555; border-top:2px solid #fff; border-radius:50%; animation:spin 1s linear infinite;"></div>
        </div>`;

    try {
        // Nettoyage de l'instance précédente
        if (container._spiraleInstance) {
            container._spiraleInstance.destroy();
            delete container._spiraleInstance;
        }

        // Récupération rapide de la plage (Metadata)
        const rangeUrl = url.replace('/Raw/', '/Range/');
        const rangeResponse = await (window.fetchWithCache ? window.fetchWithCache(rangeUrl, 300000) : fetch(rangeUrl).then(r => r.json()));
        
        if (!rangeResponse || !rangeResponse.metadata) throw new Error("Métadonnées Range introuvables");
        
        const meta = rangeResponse.metadata;
        const dateFirst = new Date(meta.first);
        const dateLast = new Date(meta.last);
        const totalRangeDays = (dateLast - dateFirst) / (1000 * 60 * 60 * 24);

        // Détermination du mode et de la plage
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
        let stepCount = 1000;
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
        container.style.minHeight = ""; 
        
        const plot = new SpiralePlot(container, processedData, { 
            grouping: mode, 
            metadata: meta, 
            unit: meta.userUnit || '',
            originalUrl: url,
            originalMeta: meta
        });
        plot.draw();
        container._spiraleInstance = plot;

        // 2. Chargement automatique de la dernière période
        if (processedData.length > 0) {
            const lastPoint = processedData[processedData.length - 1];
            const lastKey = plot.getPeriodKeyForDate(lastPoint.date);
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
function isOccupying90Percent(element) {
    const el = typeof element === 'string' ? document.getElementById(element) : element;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return (r.width * r.height) >= (window.innerWidth * window.innerHeight * 0.9);
}

class SpiralePlot {
    constructor(container, data, options = {}) {
        this.container = container;
        this.data = data;
        this.options = options;
        this.grouping = options.grouping || 'day';
        
        this.resizeObserver = null;
        this.resizeTimer = null; // Timer pour le debounce
        this.updateDimensionsFromRect();
        
        this.svgWidth = 480; // Valeur de base, sera écrasée par draw()
        this.centerX = this.svgWidth / 2; 
        this.centerY = this.height / 2;

        this.beta = 0;
        this.alpha = -20 * (Math.PI / 180);
        
        this.updateRadii();
        
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
        this.sortedKeys = []; 
        this.globalStats = []; 
        this.bgDataForPlot = []; 
        
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
        this.computeGlobalStats();
        this.precompute3DCoordinates();
        
        this.initResizeObserver();
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.resizeTimer) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
        }
        if (this.playInterval) clearInterval(this.playInterval);
    }

    updateDimensionsFromRect() {
        this.rect = this.container.getBoundingClientRect();
        this.width = this.rect.width || 800;
        this.height = (this.rect.height > 50) ? this.rect.height : 350;
        
        // Calcul du positionnement basé sur le ratio
        this.ratio = Math.round((this.rect.width / this.rect.height) * 100) / 100;
        this.positionment = this.ratio > 2 ? 'Horizontal' : 'Vertical';
        console.log("Layout:", this.positionment, "Ratio:", this.ratio, "Dim:", this.width, "x", this.height);
    }

    updateRadii() {
        // Ces valeurs seront recalculées dynamiquement dans draw() en fonction de la taille réelle du SVG
        const minDim = Math.min(this.svgWidth, this.height);
        this.radiusMin = minDim * 0.05; 
        this.radiusMax = minDim * 0.45; 
        this.spiralHeight = this.height * 0.60;
    }

    initResizeObserver() {
        this.resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (this.resizeTimer) clearTimeout(this.resizeTimer);

                this.resizeTimer = setTimeout(() => {
                    const r = entry.contentRect;
                    const oldPos = this.positionment;
                    
                    // On ne redessine que si dimensions valides et changement
                    if (r.width > 50 && r.height > 50) {
                        this.updateDimensionsFromRect();
                        this.draw(); 
                        
                        // Restauration de l'état du panneau
                        if (this.currentPlayKey) {
                            const pointsInPeriod = this.data.filter(d => this.getPeriodKeyForDate(d.date) === this.currentPlayKey);
                            if (pointsInPeriod.length > 0) {
                                this.updateSidePanel(pointsInPeriod[0], this.currentPlayKey, false);
                                setTimeout(() => this.highlightPeriod(this.currentPlayKey), 50);
                            }
                        }
                    }
                }, 100);
            }
        });
        this.resizeObserver.observe(this.container);
    }

    updatePlotGeometry() {
        // Met à jour les échelles Z et Radius en fonction des nouvelles dimensions du SVG
        if (this.scales.z) {
            this.scales.z.range([-this.spiralHeight / 2, this.spiralHeight / 2]);
        }
        if (this.scales.radius) {
             const extentVal = this.scales.radius.domain();
             this.scales.radius.range([this.radiusMin, this.radiusMax]);
        }
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
        
        this.sortedKeys = Array.from(groups.keys()).sort();

        const counts = Array.from(groups.values()).map(g => g.length);
        const maxPoints = d3.max(counts) || 0; // Nombre max de points dans une période
        const threshold = maxPoints * 0.9; // Seuil à 90% du max pour filtrer les périodes complètes pour le calcul des échelles

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
            // NOTE: Ajout du signe négatif pour la rotation Sens Horaire
            if (this.grouping === 'day') {
                const start = new Date(date); start.setHours(0,0,0,0);
                return -((date - start) / 86400000) * 2 * Math.PI;
            } else {
                const start = new Date(date.getFullYear(), 0, 1);
                const dayOfYear = (date - start) / 86400000;
                return -(dayOfYear / 365.25) * 2 * Math.PI;
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

        const isHorizontal = this.positionment === 'Horizontal';
        
        // MODIF: Le conteneur doit être relatif pour que les boutons (absolus) se positionnent dedans
        container
            .style("position", "relative") 
            .style("display", "flex")
            .style("flex-direction", isHorizontal ? "row" : "column") 
            .style("width", "100%")
            .style("height", "100%")
            .style("overflow", "hidden")
            .style("align-items", "center")
            .style("justify-content", "center");

        let mainPanelSize;
        if (isHorizontal) {
            mainPanelSize = this.height;
        } else {
            const targetHeight = this.height * 0.60;
            mainPanelSize = Math.min(targetHeight, this.width);
        }

        // Création Main Panel
        this.wrapper = container.append("div")
            .attr("class", "spiralChart-main-panel")
            .style("position", "relative")
            .style("width", `${mainPanelSize}px`) 
            .style("height", `${mainPanelSize}px`) // Toujours carré pour la spirale
            .style("flex", "none")
            .style("overflow", "hidden")
            .style("background", "rgb(26, 26, 26)"); 

        // Mise à jour des props internes pour le dessin SVG
        this.svgWidth = mainPanelSize;
        this.height = mainPanelSize; 
        this.centerX = this.svgWidth / 2;
        this.centerY = this.height / 2;
        
        const minDim = mainPanelSize;
        this.radiusMin = minDim * 0.05; 
        this.radiusMax = minDim * 0.45; 
        this.spiralHeight = minDim * 0.60;
        this.updatePlotGeometry(); 

        // Création Side Panel
        this.sidePanel = container.append("div")
            .attr("class", "spiralChart-side-panel")
            .style("position", "relative")
            .style("border-left", isHorizontal ? "1px solid #333" : "none")
            .style("border-top", isHorizontal ? "none" : "1px solid #333")
            .style("background", "rgb(26, 26, 26)")
            .style("flex", isHorizontal ? "none" : "none") // On fixe manuellement les tailles maintenant
            .style("width", isHorizontal ? "auto" : "100%")
            // MODIF: En mode Horizontal, 80% de la hauteur du mainPanel
            .style("height", isHorizontal ? `${mainPanelSize * 0.8}px` : "auto") 
            .style("max-height", isHorizontal ? "" : `${mainPanelSize * 0.6}px`) 
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("justify-content", "center") 
            .html(`<div class="spiral-panel-content" style="width:100%; padding: 10px;"><div style="text-align:center; color:#555; font-family:sans-serif;">Cliquez sur une période</div></div>`);
            
        // Si mode horizontal, on donne un peu de flexibilité en largeur au sidePanel
        if (isHorizontal) {
             this.sidePanel.style("flex", "1");
        }

        this.svg = this.wrapper.append("svg")
            .attr("width", "100%").attr("height", "100%")
            .style("background", "transparent")
            .style("cursor", "auto")
            .on("click", () => {
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
            .attr("font-size", `${Math.max(12, mainPanelSize * 0.08)}px`) 
            .style("opacity", 0).text("");

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
                this.beta += e.dx * 0.008; 
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
        // MODIF: Sélection du container parent au lieu du wrapper
        const controlsContainer = this.wrapper;
        
        
        controlsContainer.selectAll(".spiral-controls").remove();
        controlsContainer.selectAll(".spiral-controls-left").remove();


        const iconMinimize = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
        const iconOriginal = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

        // MODIF: Attaché au container parent
        const rightC = controlsContainer.append("div")
            .attr("class", "spiral-controls")
            .style("position", "absolute")
            .style("top", "10px")
            .style("right", "10px")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "6px")
            .style("align-items", "flex-end")
            .style("z-index", "20"); // Augmenté pour être au dessus
        
        const isFullscreen = !!document.fullscreenElement;
        
        let extLink = "#";
        if (this.options.originalUrl && this.options.originalUrl.includes('/Raw/')) {
            try {
                const parts = this.options.originalUrl.split('/Raw/');
                if (parts.length >= 2) {
                    const st = parts[0].split('/').pop();
                    const sn = parts[1].split('/').shift();
                    extLink = `/spirale3DChart.html?station=${st}&sensor=${sn}`;
                }
            } catch(err) {}
        }

        const linkBtn = rightC.append("button")
            .attr("class", "spiral-btn")
            .attr("title", isFullscreen ? "Quitter plein écran" : "Agrandir")
            .html(isFullscreen ? iconMinimize : iconOriginal);
        
        linkBtn.on("click", (e) => {
            e.stopPropagation();
            if (isOccupying90Percent(this.container)) { 
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().then(() => {
                        const onFullScreenChange = () => {
                            if (!document.fullscreenElement) {
                                document.removeEventListener("fullscreenchange", onFullScreenChange);
                            }
                        };
                        document.addEventListener("fullscreenchange", onFullScreenChange);
                    }).catch(err => console.error(err));
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
            } else if (extLink !== "#") {
                window.open(extLink, '_blank');
            }
        });

        [{ l: "Dessus", a: -Math.PI/2, b: 0 }, { l: "Face", a: 0, b: 0 }, { l: "Iso", a: -Math.PI/6, b: Math.PI/4 }]
        .forEach(v => {
            rightC.append("button")
                .attr("class", "spiral-btn")
                .style("width", "100%") 
                .text(v.l)
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

        // MODIF: Attaché au container parent
        const leftC = controlsContainer.append("div")
            .attr("class", "spiral-controls-left")
            .style("position", "absolute")
            .style("top", "10px")
            .style("left", "10px")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "6px")
            .style("align-items", "flex-start")
            .style("z-index", "20"); // Augmenté pour être au dessus

        const colorBtn = leftC.append("button")
            .attr("class", "spiral-btn")
            .html(this.colorMode === 'mean' ? "<small>Amplitude</small> / Mean" : "Amplitude / <small>Mean</small>");
            
        colorBtn.on("click", (e) => {
            e.stopPropagation();
            this.colorMode = (this.colorMode === 'standard') ? 'mean' : 'standard';
            colorBtn.html(this.colorMode === 'mean' ? "<small>Amplitude</small> / Mean" : "Amplitude / <small>Mean</small>");
            this.updateView(false);
        });

        const toggleBtn = leftC.append("button")
            .attr("class", "spiral-btn")
            .style("font-weight", "bold")
            .html(this.grouping === 'year' ? "Year / <small>Day</small>" : "<small>Year</small> / Day");

        toggleBtn.on("click", (e) => {
            e.stopPropagation();
            const newMode = (this.grouping === 'year') ? 'day' : 'year';
            loadSpiralePlot(this.container, this.options.originalUrl, newMode);
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
            const th = -((i/steps)*Math.PI*2) - Math.PI/2;
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
        
        this.defs.selectAll("*").remove();

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

                if (that.colorMode !== 'mean') {
                    const centerProj = that.project(0, points[0].wy, 0);
                    const cx = centerProj[0];
                    const cy = centerProj[1];

                    const matrix = `translate(${cx}, ${cy}) scale(1, ${scaleY}) translate(${-cx}, ${-cy})`;

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
            btn.html(`<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>`).style("background", "#552222");
            this.playInterval = setInterval(() => this.stepAnimation(), 120); 
        } else {
            btn.html(`<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`).style("background", "");
            if (this.playInterval) clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    resetHighlights() {
        this.gSpiral.selectAll(".sp-vis-path")
            .attr("stroke-opacity", 0.9)
            .attr("stroke-width", 1);
    }

    stepAnimation() {
        const chartContainer = document.getElementById("mini-chart-container");
        if (!chartContainer || !chartContainer.isConnected) {
            if (this.playInterval) clearInterval(this.playInterval);
            this.isPlaying = false;
            if (this.sidePanel) {
                const btn = this.sidePanel.select("#btn-play-toggle");
                if(!btn.empty()) btn.html(`<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`).style("background", "");
            }
            return;
        }

        if (!this.sortedKeys || this.sortedKeys.length === 0) return;
        
        let idx = this.sortedKeys.indexOf(this.currentPlayKey);
        idx++;
        if (idx >= this.sortedKeys.length) idx = 0; 
        
        const nextKey = this.sortedKeys[idx];
        this.changePeriod(0, nextKey); 
    }

    // Helper pour navigation manuelle (Prev/Next) ou auto
    changePeriod(offset, directKey = null) {
        if (!this.sortedKeys || this.sortedKeys.length === 0) return;

        let nextKey = directKey;
        
        if (!nextKey) {
            let idx = this.sortedKeys.indexOf(this.currentPlayKey);
            if(idx === -1) idx = 0;

            idx += offset;
            if (idx >= this.sortedKeys.length) idx = 0; 
            if (idx < 0) idx = this.sortedKeys.length - 1;
            nextKey = this.sortedKeys[idx];
        }

        this.currentPlayKey = nextKey;
        this.highlightPeriod(this.currentPlayKey);

        const pointsInPeriod = this.data.filter(d => this.getPeriodKeyForDate(d.date) === this.currentPlayKey);
        if (pointsInPeriod.length > 0) {
            this.updateSidePanel(pointsInPeriod[0], this.currentPlayKey, true);
        }
    }

    highlightPeriod(key) {
        this.gSpiral.selectAll(".sp-vis-path")
            .attr("stroke-opacity", 0.15)
            .attr("stroke-width", 1);
        
        const targetGroup = this.gSpiral.selectAll(".period-group")
            .filter(d => d.key === key);
        
        targetGroup.select(".sp-vis-path")
            .attr("stroke-opacity", 1)
            .attr("stroke-width", 1.5);
        
        targetGroup.raise();
    }

    updateSidePanel(dataPoint, periodKey, isAnimating = false) {
        if (!this.sidePanel) return;
        
        this.currentPlayKey = periodKey; 
        
        if(!isAnimating && !this.isPlaying) {
             this.highlightPeriod(periodKey);
        }

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
            this.sidePanel.html(`<div class="spiral-panel-content" style="padding:10px;"></div>`);
            content = this.sidePanel.select(".spiral-panel-content");
        }
        
        // MODIF: Détection mode compact (Vertical) vs mode normal (Horizontal)
        const isCompact = (this.positionment !== 'Horizontal');
        const chartHeight = isCompact ? 140 : 200;

        if (content.select("#mini-chart-container").empty()) {
            
            // Layout HTML Adaptatif
            let infoHtml = '';
            if (isCompact) {
                // Version compacte (Vertical)
                 infoHtml = `
                    <div class="panel-info" style="margin-bottom: 5px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div id="panel-date-dyn" class="panel-date" style="font-size:1.1rem; margin-bottom:0;">${dateFmt(dataPoint.date)}</div>
                            ${getControlsHtml()}
                        </div>
                    </div>`;
            } else {
                // Version complète (Horizontal)
                infoHtml = `
                    <div class="panel-info" style="margin-bottom: 15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div id="panel-date-dyn" class="panel-date" style="font-size:1.2rem; margin-bottom:0;">${dateFmt(dataPoint.date)}</div>
                            ${getControlsHtml()}
                        </div>
                         <div style="font-size:11px; color:#666; margin-top:4px; text-transform:uppercase;">${pTitle}</div>
                    </div>`;
            }

            content.html(`
                ${infoHtml}
                <div id="mini-stats-header" style="margin-bottom:2px;"></div>
                <div id="mini-chart-container" style="width:100%; height:${chartHeight}px; position:relative;"></div>
                <div id="mini-chart-legend" style="padding-top:4px; border-top:1px solid #333; margin-top:2px;"></div>
            `);

            content.select("#btn-play-toggle").on("click", () => this.togglePlay());
            content.select("#btn-prev").on("click", () => {
                if(this.isPlaying) this.togglePlay();
                this.changePeriod(-1);
            });
            content.select("#btn-next").on("click", () => {
                if(this.isPlaying) this.togglePlay();
                this.changePeriod(1);
            });

        } else {
            content.select("#panel-date-dyn").text(dateFmt(dataPoint.date));
        }
        
        const playBtn = content.select("#btn-play-toggle");
        if(this.isPlaying) {
            playBtn.html(`<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>`).style("background", "#552222");
        } else {
            playBtn.html(`<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`).style("background", "");
        }

        const subset = this.data.filter(d => d.ts >= pStart.getTime() && d.ts <= pEnd.getTime());
        this.drawMiniChart(subset, dataPoint, chartHeight); // On passe la hauteur
    }

    computeProgressiveStats(limitDate) {
        const limitYear = limitDate.getFullYear();
        const historyData = this.data.filter(d => d.date.getFullYear() <= limitYear);

        let getKey;
        if (this.grouping === 'day') getKey = (d) => d.date.getHours() * 60 + d.date.getMinutes();
        else getKey = (d) => d.date.getMonth() * 100 + d.date.getDate();

        const timeGroups = d3.group(historyData, getKey);
        const progressiveStats = [];

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

    drawMiniChart(data, focusPoint, chartHeight) {
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
        
        const currentProgressiveStats = this.computeProgressiveStats(focusPoint.date);

        const mappedBgData = [];
        currentProgressiveStats.forEach(stat => {
             let newDate;
             if (this.grouping === 'day') {
                 const h = Math.floor(stat.key / 60);
                 const m = stat.key % 60;
                 newDate = new Date(yearRef, monthRef, dayRef, h, m);
             } else {
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

        const statMap = new Map();
        currentProgressiveStats.forEach(s => statMap.set(s.key, s));

        let highRecData = [];
        let lowRecData = [];
        
        highRecData = data.map(d => {
            let key;
            if (this.grouping === 'day') key = d.date.getHours() * 60 + d.date.getMinutes();
            else key = d.date.getMonth() * 100 + d.date.getDate();
            
            const stat = statMap.get(key);
            if (stat && d.val >= stat.max) return { date: d.date, val: d.val };
            return { date: d.date, val: null };
        });

        lowRecData = data.map(d => {
            let key;
            if (this.grouping === 'day') key = d.date.getHours() * 60 + d.date.getMinutes();
            else key = d.date.getMonth() * 100 + d.date.getDate();
            
            const stat = statMap.get(key);
            if (stat && d.val <= stat.min) return { date: d.date, val: d.val };
            return { date: d.date, val: null };
        });

        const yMin = Math.min(min, d3.min(mappedBgData, d => d.gMin));
        const yMax = Math.max(max, d3.max(mappedBgData, d => d.gMax));

        container.innerHTML = '';
        
        try {
            const chart = Plot.plot({
                width: container.clientWidth,
                height: (container.clientHeight) || chartHeight, // Use dynamic height
                marginLeft: 0, marginBottom: 20, marginRight: 40, marginTop: 10,
                style: { background: "transparent", color: "#aaa", fontSize: "10px" },
                x: { type: "time", tickFormat: this.grouping === 'day' ? "%H:%M" : "%b", grid: false },
                y: { 
                    axis: "right", grid: true, nice: true, label: null, tickFormat: d => d.toFixed(0),
                    domain: [yMin, yMax]
                },
                marks: [
                    Plot.areaY(mappedBgData, { x: "date", y1: "gMin", y2: "gMax", fill: "#333", fillOpacity: 0.2 }),
                    
                    Plot.lineY(mappedBgData, { x: "date", y: "gMin", stroke: "#00ffff", strokeOpacity: 0.3, strokeWidth: 1 }),
                    Plot.lineY(mappedBgData, { x: "date", y: "gMax", stroke: "#ff5555", strokeOpacity: 0.3, strokeWidth: 1 }),
                    Plot.lineY(mappedBgData, { x: "date", y: "gMean", stroke: "#ff55ff", strokeOpacity: 0.4, strokeWidth: 1 }),

                    Plot.link(mappedBgData, Plot.pointerX({
                        x1: "date", y1: "gMin", x2: "date", y2: "gMax", 
                        stroke: "#666", strokeDasharray: "2,3", strokeOpacity: 0.8
                    })),

                    Plot.dot(mappedBgData, Plot.pointerX({ x: "date", y: "gMax", fill: "#ff5555", r: 2 })),
                    Plot.dot(mappedBgData, Plot.pointerX({ x: "date", y: "gMean", fill: "#ff55ff", r: 2 })),
                    Plot.dot(mappedBgData, Plot.pointerX({ x: "date", y: "gMin", fill: "#00ffff", r: 2 })),
                    
                    Plot.lineY(data, { x: "date", y: "val", stroke: "#ccc", strokeOpacity: 0.8, strokeWidth: 1, id: "data-line" }),
                    Plot.dot(data, Plot.pointerX({x: "date", y: "val", stroke: "#ccc", r: 3, fill: "red" })),
                    
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
                    
                    Plot.text(mappedBgData, Plot.pointerX({
                        x: "date", y: "gMax", text: d => `${d.gMax.toFixed(1)} ${this.options.unit}`, 
                        dy: -10, className: "hover-value", fill: "#ff5555", textAnchor: "middle"
                    })),
                    Plot.text(mappedBgData, Plot.pointerX({
                        x: "date", y: "gMean", text: d => `${d.gMean.toFixed(1)} ${this.options.unit}`, 
                        dy: -5, fill: "#ff55ff", textAnchor: "end", dx: -5, className: "hover-value"
                    })),
                    Plot.text(mappedBgData, Plot.pointerX({
                        x: "date", y: "gMin", text: d => `${d.gMin.toFixed(1)} ${this.options.unit}`, 
                        dy: 10, fill: "#00ffff", textAnchor: "middle", className: "hover-value"
                    })),
                    
                    Plot.text(data, Plot.pointerX({
                        x: "date", y: "val", 
                        dy: 3, dx: 8, 
                        textAnchor: "start",
                        fontVariant: "tabular-nums",
                        fontSize: "11px",
                        fill: "#fff",
                        className: "hover-value",
                        strokeWidth: 2,
                        text: (d) => ` ${d.val} ${this.options.unit}`
                    })),

                    Plot.text(data, Plot.pointerX({
                        x: "date", 
                        frameAnchor: "bottom", 
                        dy: 15, 
                        fontVariant: "tabular-nums",
                        fontSize: "11px",
                        fill: "#aaa",
                        className: "hover-value",
                        text: (d) => `${d.date.toLocaleString('fr-FR',{'dateStyle':"medium",'timeStyle':"short"})}`
                    }))
                ]
            });
            container.appendChild(chart);
        } catch (e) { console.error("Erreur Plot:", e); }

        if (legendContainer) {
            legendContainer.innerHTML = `
                <div style="display:flex; justify-content:center; gap:15px; font-size:10px; color:#888; font-family:sans-serif;">
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#ccc; margin-right:4px;"></span> Selected Data</div>
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#ff55ff; opacity:0.6; margin-right:4px;"></span>Previous Mean</div>
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#ff5555; opacity:0.5; margin-right:4px;"></span>Previous Max</div>
                    <div style="display:flex; align-items:center;"><span style="display:inline-block; width:10px; height:2px; background:#00ffff; opacity:0.5; margin-right:4px;"></span>Previous Min</div>
                    <div style="display:flex; align-items:center; margin-left:10px;"><span style="display:inline-block; width:10px; height:4px; background:red; opacity:0.4; margin-right:4px;"></span> Record Zone</div>
                </div>
            `;
        }
    }
}

function getControlsHtml() {
    return `
    <div class="panel-controls" style="display:flex; gap:2px;">
        <button id="btn-prev" style="padding:4px; background:#333; color:#fff; border:1px solid #555; cursor:pointer; display:flex; align-items:center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <button id="btn-play-toggle" style="padding:4px 10px; background:#333; color:#fff; border:1px solid #555; cursor:pointer; display:flex; align-items:center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </button>
        <button id="btn-next" style="padding:4px; background:#333; color:#fff; border:1px solid #555; cursor:pointer; display:flex; align-items:center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
    </div>`;
}