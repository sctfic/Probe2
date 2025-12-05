// Probe2\public\js\drawing\Plots.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

let APIURL = '';

/**
 * Construit et gère tout le SVG de visualisation
 * @param {HTMLElement} container - L'élément DOM dans lequel créer le SVG
 * @param {HTMLElement} container - L'élément DOM dans lequel créer le SVG
 * @param {string} url - URL API initiale (longue période)
 */
async function mainPlots(container, url, startDate='', endDate='', stepCount=1000) {
async function mainPlots(container, url, startDate='', endDate='', stepCount=1000) {
    try {
        APIURL = url.split('?')[0];
        const apiResponse = await fetchWithCache(APIURL+`?startDate=${startDate}&endDate=${endDate}&stepCount=${stepCount}`, 300000);
        
        // Stocker métadonnées globalement pour les tooltips
        window.plotMetadata = apiResponse.metadata;
        
        // Traiter les données
        const plotData = processData(apiResponse.data, apiResponse.metadata);
        
        // EXTRACTION : /query/{station}/Raw/{sensorList}
        const urlParts = APIURL.split('/');
        const stationName = urlParts[urlParts.length - 3];
        const sensorList = urlParts[urlParts.length - 1]; // Dans le cas du Plots, c'est une liste séparée par des virgules
        
        // Créer l'instance de visualisation
        const plot = new TimeSeriesPlot(container, plotData, apiResponse.metadata, stationName, sensorList);
        
        // Stocker l'instance dans le conteneur pour le 'resize' dans plotsChart.html
        container.__current_plot_instance = plot; 

        // Construire le graphique
        plot.create();
        
    } catch (error) {
        console.error('Erreur:', error);
        console.error('URL:', url);
    }
}

// Classe principale pour gérer la visualisation
class TimeSeriesPlot {
    /**
     * @param {HTMLElement} container - L'élément DOM conteneur
     * @param {Array} data - Les données traitées
     * @param {Object} metadata - Les métadonnées
     * @param {string} stationName - Nom de la station
     * @param {string} sensorList - Liste des capteurs
     */
    constructor(container, data, metadata, stationName, sensorList) {
        this.container = container;
        // Générer un ID unique pour les définitions SVG (clip-path) si le conteneur n'a pas d'ID
        this.id = container.id || 'plot-' + Math.random().toString(36).substr(2, 9);
        this.data = data;
        this.metadata = metadata;
        
        // Informations d'URL pour le bouton "Agrandir"
        this.stationName = stationName;
        // Pour le lien vers la spirale, nous ne prenons que le premier capteur
        this.sensorList = sensorList; // On utilise la liste complète
        
        this.margin = { top: 10, right: 40, bottom: 20, left: 40 };
        this.width = window.innerWidth;
        this.height = 300;
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;
        
        this.svg = null;
        this.g = null;
        this.xScale = null;
        this.yScales = {};
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        this.brush = null;
        this.isBrushing = false;
        this.legendVisible = true;
        this.originalData = [...data]; // Pour reset
        
        this.initializeScales();
    }
    
    // Initialiser les échelles
    initializeScales() {
        this.xScale = d3.scaleTime()
            .domain(d3.extent(this.data, d => d.datetime))
            .range([0, this.innerWidth]);
        
        // Créer une échelle Y par groupe de mesure
        Object.entries(this.metadata.measurement).forEach(([groupName, sensors], index) => {
            const validSensors = sensors.filter(sensor => 
                this.data.some(d => d[sensor] !== null)
            );
            
            if (validSensors.length > 0) {
                const allValues = validSensors.flatMap(sensor => 
                    this.data.filter(d => d[sensor] !== null).map(d => d[sensor])
                );
                
                if (allValues.length > 0) {
                    const extent = d3.extent(allValues);
                    const padding = (extent[1] - extent[0]) * 0.05;
                    
                    this.yScales[groupName] = {
                        scale: d3.scaleLinear()
                            .domain([extent[0] - padding, extent[1] + padding])
                            .range([this.innerHeight, 0]),
                        sensors: validSensors,
                        orientation: (index + 1) >> 1 & 1 ? 'right' : 'left',
                        position: (index & 1) ? 'right' : 'left'
                    };
                }
            }
        });
    }
    
    // Créer la structure SVG de base
    createSVG() {
        // Sélection directe de l'élément DOM passé en paramètre
        const container = d3.select(this.container);
        container.selectAll("*").remove();
        
        this.svg = container
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .style("position", "relative"); // Ajouté pour positionner le bouton "Agrandir" en absolute
        
        this.g = this.svg.append("g")
            .attr("transform", `translate(${this.margin.left},${this.margin.top})`);
        
        // Clip path pour les lignes (utilise l'ID généré/récupéré)
        // Clip path pour les lignes (utilise l'ID généré/récupéré)
        this.svg.append("defs").append("clipPath")
            .attr("id", `clip-${this.id}`)
            .append("rect")
            .attr("width", this.innerWidth)
            .attr("height", this.innerHeight);
    }
    
    // Créer tous les éléments du graphique
    create() {
        this.createSVG();
        this.createLines();
        this.createAxes();
        this.createBrush();
        this.createTooltip();
        this.createLegend();
        this.createControls(); 
    }
    
    // NOUVEAU : Créer les contrôles (bouton Agrandir)
    createControls() {
        if (!this.stationName || !this.sensorList) return;

        // Création du bouton dans un conteneur HTML sur l'élément SVG
        const container = d3.select(this.container);
        
        // Vérifie si le bouton Fullscreen existe déjà (ce qui est le cas dans plotsChart.html)
        const isFullscreenPage = !!document.getElementById('fs-btn'); 

        const controlDiv = container.append("div")
            .attr("class", "plot-controls")
            .style("position", "absolute")
            .style("top", "5px")
            .style("right", isFullscreenPage ? "50px" : "5px") // Décalé si le bouton FS est présent
            .style("z-index", 100);

        // Icône "Original" (même que dans spiralPlot.js)
        const iconOriginal = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

        const linkBtn = controlDiv.append("button")
            .attr("class", "plot-btn")
            .attr("title", "Ouvrir la vue Série Temporelle en plein écran")
            .style("background", "rgba(0, 0, 0, 0.6)")
            .style("border", "1px solid #444")
            .style("color", "#ccc")
            .style("padding", "3px 5px")
            .style("cursor", "pointer")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("transition", "background 0.2s, color 0.2s")
            .html(iconOriginal) // On n'affiche que l'icône
            .on("mouseover", function() { d3.select(this).style("background", "#333").style("color", "#fff"); })
            .on("mouseout", function() { d3.select(this).style("background", "rgba(0, 0, 0, 0.6)").style("color", "#ccc"); });
            

        // L'URL pointe vers le nouveau fichier plotsChart.html
        const url = `plotsChart.html?station=${this.stationName}&sensorList=${this.sensorList}`;

        linkBtn.on("click", (e) => {
            e.stopPropagation();
            if (isFullscreenPage) {
                 // Si on est déjà sur la page plein écran, on ne fait rien (ou on pourrait ouvrir la spirale si vous voulez une autre option)
                 console.log("Déjà en mode plein écran, ignorer l'ouverture de nouvel onglet.");
            } else {
                 // Si on est dans le petit encart, on ouvre la version plein écran dans un nouvel onglet
                 window.open(url, '_blank');
            }
        });
        
        // Si on est sur la page plotsChart.html (mode plein écran), ce bouton n'est pas nécessaire car on utilise le bouton FS natif.
        if (isFullscreenPage) {
            controlDiv.style("display", "none");
        }
    }

    // Créer les axes
    createAxes() {
        // Axe X
        this.g.append("g")
            .attr("class", "axis axis-x")
            .attr("transform", `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale).tickSize(2));
        
        // Axes Y
        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            this.createYAxis(groupName, scaleInfo);
        });
    }
    
    // Créer un axe Y spécifique
    createYAxis(groupName, scaleInfo) {
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
    }
    
    // Créer les lignes de données
    createLines() {
        const linesGroup = this.g.append("g")
            .attr("class", "lines-group")
            .attr(`clip-path`, `url(#clip-${this.id})`);
        
        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            scaleInfo.sensors.forEach(sensor => {
                // 1. Filtrer les données pour ce capteur spécifique
                const filteredData = this.data.filter(d => 
                    d[sensor] !== null && 
                    d[sensor] !== undefined && 
                    !isNaN(d[sensor])
                );
                
                // 2. Ne créer la ligne que si on a au moins 2 points
                if (filteredData.length < 2) return;

                const line = d3.line()
                    .x(d => this.xScale(d.datetime))
                    .y(d => scaleInfo.scale(d[sensor]))
                    .defined(d => d[sensor] !== null && d[sensor] !== undefined && !isNaN(d[sensor]))
                    .curve(sensor.startsWith('rain:') ? d3.curveStep : d3.curveBasis);
                
                linesGroup.append("path")
                    .datum(filteredData)
                    .attr("class", `line line-${sensor.replace(":", "_")}`)
                    .attr("d", line)
                    .style("stroke", this.colorScale(sensor.replace(":", "_")))
                    .style("opacity", 0)
                    .transition()
                    .duration(500)
                    .style("opacity", 1);
            });
        });
    }
    
    // Créer le brush de zoom
    createBrush() {
        this.brush = d3.brushX()
            .extent([[0, 0], [this.innerWidth, this.innerHeight]])
            .on("start", () => this.brushStarted())
            .on("brush", (event) => this.brushBrushed(event))
            .on("end", (event) => this.brushEnded(event));
        
        const brushGroup = this.g.append("g")
            .attr("class", "brush")
            .call(this.brush);
        
        // Labels du brush
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
        
        // Double-click pour reset
        brushGroup.select(".overlay")
            .on("dblclick", (event) => {
                event.stopPropagation();
                this.resetZoom();
            });
    }
    
    // Gestionnaires du brush
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
        
    // GESTIONNAIRE BRUSH - Recalcule Y avant appel API
    brushEnded(event) {
        // Masquer le label de durée
        this.brushDurationLabel.style("display", "none");
        
        // Vérifier si une sélection existe
        if (!event.selection) {
            this.isBrushing = false;
            this.brushStartLabel.style("display", "none");
            this.brushEndLabel.style("display", "none");
            return;
        }
        
        // Extraire les coordonnées de la sélection
        const [x0, x1] = event.selection;
        const startDate = this.xScale.invert(x0);
        const endDate = this.xScale.invert(x1);
        const duration = endDate - startDate;
        
        // Annuler la sélection visuelle
        this.g.select(".brush").call(this.brush.move, null);
        this.brushStartLabel.style("display", "none");
        this.brushEndLabel.style("display", "none");
        this.isBrushing = false;
        
        // Vérifier la durée minimale (12 heures)
        const minDuration = 12 * 60 * 60 * 1000; // 12 heures en millisecondes
        if (duration < minDuration) {
            setTimeout(hideStatus, 3000);
            return;
        }
        
        // Filtrer les données sur la plage sélectionnée
        const filteredData = this.data.filter(d => 
            d.datetime >= startDate && d.datetime <= endDate
        );
        
        if (filteredData.length === 0) {
            setTimeout(hideStatus, 3000);
            return;
        }
        
        // Mettre à jour le domaine X
        this.xScale.domain([startDate, endDate]);
        
        // Recalculer les domaines Y basés sur les données filtrées
        this.updateYDomains(filteredData);
        
        // Mettre à jour les axes avec transition
        this.updateAxes();
        
        // Mettre à jour les lignes avec transition
        this.updateLines();
        
        // Préparer les dates avec marge pour l'API
        const durationMargin = duration * 0.2; // 20% de marge
        const adjustedStartDate = new Date(startDate.getTime() - durationMargin);
        const adjustedEndDate = new Date(endDate.getTime() + durationMargin);
        
        // Formater les dates pour l'API
        const formatDateAPI = d3.timeFormat("%Y-%m-%dT%H:%M:00Z");
        const apiStartDate = formatDateAPI(adjustedStartDate);
        const apiEndDate = formatDateAPI(adjustedEndDate);
        
        // Construire l'URL API sans cache
        const sensors = Object.values(this.metadata.measurement).flat().join(',');
        let apiUrl = `${APIURL}?stepCount=1000`;
        apiUrl += `&startDate=${apiStartDate}`;
        apiUrl += `&endDate=${apiEndDate}`;
        
        // Appel API sans cache
        fetch(apiUrl, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(apiResponse => {
                if (!apiResponse.success) {
                    throw new Error(apiResponse.message || 'Erreur API');
                }
                
                // Traiter les nouvelles données
                const newData = processData(apiResponse.data, apiResponse.metadata);
                
                // Mettre à jour la visualisation
                this.data = newData;
                setTimeout(() => this.updateLines(false), 1000);
            })
            .catch(error => {
                console.error('Erreur API:', error);
            });
    }
    brushEnded(event) {
        // Masquer le label de durée
        this.brushDurationLabel.style("display", "none");
        
        // Vérifier si une sélection existe
        if (!event.selection) {
            this.isBrushing = false;
            this.brushStartLabel.style("display", "none");
            this.brushEndLabel.style("display", "none");
            return;
        }
        
        // Extraire les coordonnées de la sélection
        const [x0, x1] = event.selection;
        const startDate = this.xScale.invert(x0);
        const endDate = this.xScale.invert(x1);
        const duration = endDate - startDate;
        
        // Annuler la sélection visuelle
        this.g.select(".brush").call(this.brush.move, null);
        this.brushStartLabel.style("display", "none");
        this.brushEndLabel.style("display", "none");
        this.isBrushing = false;
        
        // Vérifier la durée minimale (12 heures)
        const minDuration = 12 * 60 * 60 * 1000; // 12 heures en millisecondes
        if (duration < minDuration) {
            setTimeout(hideStatus, 3000);
            return;
        }
        
        // Filtrer les données sur la plage sélectionnée
        const filteredData = this.data.filter(d => 
            d.datetime >= startDate && d.datetime <= endDate
        );
        
        if (filteredData.length === 0) {
            setTimeout(hideStatus, 3000);
            return;
        }
        
        // Mettre à jour le domaine X
        this.xScale.domain([startDate, endDate]);
        
        // Recalculer les domaines Y basés sur les données filtrées
        this.updateYDomains(filteredData);
        
        // Mettre à jour les axes avec transition
        this.updateAxes();
        
        // Mettre à jour les lignes avec transition
        this.updateLines();
        
        // Préparer les dates avec marge pour l'API
        const durationMargin = duration * 0.2; // 20% de marge
        const adjustedStartDate = new Date(startDate.getTime() - durationMargin);
        const adjustedEndDate = new Date(endDate.getTime() + durationMargin);
        
        // Formater les dates pour l'API
        const formatDateAPI = d3.timeFormat("%Y-%m-%dT%H:%M:00Z");
        const apiStartDate = formatDateAPI(adjustedStartDate);
        const apiEndDate = formatDateAPI(adjustedEndDate);
        
        // Construire l'URL API sans cache
        const sensors = Object.values(this.metadata.measurement).flat().join(',');
        let apiUrl = `${APIURL}?stepCount=1000`;
        apiUrl += `&startDate=${apiStartDate}`;
        apiUrl += `&endDate=${apiEndDate}`;
        
        // Appel API sans cache
        fetch(apiUrl, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(apiResponse => {
                if (!apiResponse.success) {
                    throw new Error(apiResponse.message || 'Erreur API');
                }
                
                // Traiter les nouvelles données
                const newData = processData(apiResponse.data, apiResponse.metadata);
                
                // Mettre à jour la visualisation
                this.data = newData;
                setTimeout(() => this.updateLines(false), 1000);
            })
            .catch(error => {
                console.error('Erreur API:', error);
            });
    }
    
    // Appliquer le zoom sur une plage de dates
    zoomToSelection(startDate, endDate) {
        // Filtrer les données
        const filteredData = this.data.filter(d => 
            d.datetime >= startDate && d.datetime <= endDate
        );
        
        if (filteredData.length === 0) return;
        
        // Mettre à jour le domaine X
        this.xScale.domain([startDate, endDate]);
        
        // Recalculer les domaines Y sur les données filtrées
        this.updateYDomains(filteredData);
        
        // Mettre à jour les éléments
        this.updateAxes();
        this.updateLines();
    }
    
    // Recalculer les domaines Y
    updateYDomains(filteredData) {
        Object.entries(this.metadata.measurement).forEach(([groupName, sensors]) => {
            const validSensors = sensors.filter(sensor => 
                filteredData.some(d => d[sensor] !== null)
            );
            
            if (validSensors.length > 0) {
                const allValues = validSensors.flatMap(sensor => 
                    filteredData.filter(d => d[sensor] !== null).map(d => d[sensor])
                );
                
                if (allValues.length > 0) {
                    const extent = d3.extent(allValues);
                    const padding = (extent[1] - extent[0]) * 0.05;
                    
                    if (this.yScales[groupName]) {
                        this.yScales[groupName].scale.domain([extent[0] - padding, extent[1] + padding]);
                        this.yScales[groupName].sensors = validSensors;
                    }
                }
            }
        });
    }
    
    // Mettre à jour tous les axes
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
    
    // Mettre à jour toutes les lignes
    updateLines(withTransition = true) {
        const linesGroup = this.g.select(".lines-group");
        
        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            scaleInfo.sensors.forEach(sensor => {
                // Filtrer les données pour ce capteur spécifique
                const filteredData = this.data.filter(d => 
                    d[sensor] !== null && d[sensor] !== undefined && !isNaN(d[sensor])
                );
                if (filteredData.length < 2) return;

                const line = d3.line()
                    .x(d => this.xScale(d.datetime))
                    .y(d => scaleInfo.scale(d[sensor]))
                    .defined(d => d[sensor] !== null && d[sensor] !== undefined && !isNaN(d[sensor]))
                    .curve(sensor.startsWith('rain:') ? d3.curveStep : d3.curveBasis);
                if (withTransition) {
                    linesGroup.select(`.line-${sensor.replace(":", "_")}`)
                        .datum(filteredData)
                        .transition()
                        .duration(750)
                        .attr("d", line);
                    return;
                } else {
                    linesGroup.select(`.line-${sensor.replace(":", "_")}`)
                        .datum(filteredData)
                        .attr("d", line);
                }
            });
        });
    }
    
    // Créer le tooltip interactif
    createTooltip() {
        const focus = this.g.append("g")
            .attr("class", "focus")
            .style("display", "none");
        
        focus.append("line")
            .attr("class", "focus-line")
            .attr("y1", 0)
            .attr("y2", this.innerHeight)
            .style("stroke", "#666")
            .style("stroke-dasharray", "3,3");
        
        focus.append("g").attr("class", "tooltip");
        focus.append("g").attr("class", "dots");
        
        // Interactions
        this.g.select(".brush .overlay")
            .on("mouseover", () => {
                if (!this.isBrushing) focus.style("display", null);
            })
            .on("mouseout", () => {
                if (!this.isBrushing) focus.style("display", "none");
            })
            .on("mousemove", (event) => this.updateTooltip(event, focus));
    }
    
    // Mettre à jour le tooltip
    updateTooltip(event, focus) {
        const bisect = d3.bisector(d => d.datetime).left;
        const [mouseX] = d3.pointer(event, event.currentTarget);
        const x0 = this.xScale.invert(mouseX);
        const i = bisect(this.data, x0, 1);
        const d = this.data[i];
        
        if (!d) {
            focus.style("display", "none");
            return;
        }
        
        focus.style("display", null);
        focus.attr("transform", `translate(${this.xScale(d.datetime)},0)`);
        
        const tooltip = focus.select(".tooltip");
        const dotsGroup = focus.select(".dots");
        
        tooltip.selectAll("*").remove();
        dotsGroup.selectAll("*").remove();
        
        // Date
        tooltip.append("text")
            .attr("x", -58)
            .attr("y", 0)
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .text(d3.timeFormat("%Y-%m-%d %H:%M")(d.datetime));
        
        // Valeurs par capteur
        let yPos = 12;
        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            scaleInfo.sensors.forEach(sensor => {
                if (d[sensor] !== null && d[sensor] !== undefined) {
                    // Point
                    dotsGroup.append("circle")
                        .attr("cx", 0)
                        .attr("cy", scaleInfo.scale(d[sensor]))
                        .attr("r", 3)
                        .attr("stroke", this.colorScale(sensor.replace(":", "_")))
                        .attr("stroke-width", 1)
                        .attr("fill", "none");
                    
                    // Valeur
                    tooltip.append("text")
                        .attr("x", 5)
                        .attr("y", yPos)
                        .style("font-size", "10px")
                        .style("fill", this.colorScale(sensor.replace(":", "_")))
                        .text(`${d[sensor]} ${this.metadata.toUserUnit[sensor].userUnit}`);
                    
                    // Nom du capteur
                    tooltip.append("text")
                        .attr("x", -5)
                        .attr("y", yPos)
                        .attr("text-anchor", "end")
                        .style("font-size", "10px")
                        .style("fill", this.colorScale(sensor.replace(":", "_")))
                        .text(`${sensor}`);
                    
                    yPos += 12;
                }
            });
        });
    }
    
    // Créer la légende
    createLegend() {
        const legendGroup = this.g.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${this.innerWidth - 150}, 20)`);
        
        const legendContent = legendGroup.append("g")
            .attr("class", "legend-content");
        
        let yOffset = 0;
        Object.entries(this.yScales).forEach(([groupName, scaleInfo]) => {
            // Titre du groupe
            legendContent.append("text")
                .attr("class", `legend-title legend-title-${groupName}`)
                .attr("x", 0)
                .attr("y", yOffset)
                .style("font-weight", "bold")
                .style("font-size", "11px")
                .text(groupName);
            
            // Items par capteur
            scaleInfo.sensors.forEach(sensor => {
                yOffset += 11;
                const item = legendContent.append("g")
                    .attr("class", `legend-item legend-item-${sensor.replace(":", "_")}`)
                    .attr("transform", `translate(10, ${yOffset})`);
                
                item.append("line")
                    .attr("x1", 0)
                    .attr("x2", 15)
                    .attr("y1", -2)
                    .attr("y2", -2)
                    .style("stroke", this.colorScale(sensor.replace(":", "_")))
                    .style("stroke-width", 2);
                
                item.append("text")
                    .attr("x", 20)
                    .attr("y", 0)
                    .style("font-size", "10px")
                    .text(sensor);
            });
            
            yOffset += 16;
        });
        
        // Bouton pour masquer/afficher
        const bbox = legendContent.node().getBBox();
        const toggleButton = legendGroup.append("g")
            .attr("class", "legend-toggle")
            .attr("transform", `translate(${bbox.width - 40}, -32)`)
            .style("cursor", "pointer")
            .on("click", () => this.toggleLegend());
        
        toggleButton.append("rect")
            .attr("width", 32)
            .attr("height", 32)
            .attr("rx", 4)
            .style("fill", "transparent");
        
        toggleButton.append("path")
            .attr("class", "eye-icon")
            .attr("d", "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z")
            .style("fill", "var(--primary-light, #eee)")
            .attr("transform", "scale(0.7)");
        
        // Auto-hide après 3s
        setTimeout(() => this.toggleLegend(), 3000);
    }
    
    // Basculer la visibilité de la légende
    toggleLegend() {
        this.legendVisible = !this.legendVisible;
        
        const legendContent = this.g.select(".legend-content");
        const toggleButton = this.g.select(".legend-toggle");
        
        if (this.legendVisible) {
            legendContent
                .style("display", "block")
                .transition()
                .duration(400)
                .style("opacity", 1);
        } else {
            legendContent
                .transition()
                .duration(400)
                .style("opacity", 0)
                .on("end", () => legendContent.style("display", "none"));
        }
    }
    
    // Reset le zoom à la vue d'origine
    resetZoom() {
        this.data = [...this.originalData];
        this.initializeScales();
        this.updateAxes();
        // sleep pour laisser le temps aux axes de se mettre à jour
        // setTimeout(() => this.updateLines(), 100);
        this.updateLines();
    }
}

// Fonction de traitement des données (utilisée par mainPlots)
function processData(rawData, metadata) {
    // Préparer les fonctions de conversion
    Object.keys(metadata.toUserUnit).forEach(key => {
        metadata.toUserUnit[key].fnFromMetric = eval(metadata.toUserUnit[key].fnFromMetric);
    });
    
    // Convertir les données
    const processed = rawData.map(d => {
        const processedPoint = { datetime: new Date(d.d) };
        Object.keys(d).forEach(key => {
            if (d[key] === null) {
                // processedPoint[key] = null;
            } else if (key !== 'd' && key !== 'datetime') {
                processedPoint[key] = metadata.toUserUnit[key].fnFromMetric(d[key]);
            } 
        });

        return processedPoint;
    });
    
    // Trier par date
    return processed.sort((a, b) => a.datetime - b.datetime);
}