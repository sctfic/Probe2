/**
 * Neon Wind Rose Drawing Module for Probe2
 * Renders a holographic-style wind speedometer & direction compass with update support.
 */

window.loadNeonRose = function (containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID ${containerId} not found.`);
        return;
    }

    let svg = d3.select(container).select("svg");
    const width = container.clientWidth || 350;
    const height = container.clientHeight || 300;

    // Colors
    const pinkColor = "#00ffff";
    const cyanColor = "#ff009d";
    const margin = 15;
    const dialRadius = Math.min(width * 0.35, height * 0.4) - 5;
    const dialCenter = [width - dialRadius - margin, height / 2];

    // Helper to evaluate and format sensor data
    function getSensorValue(key) {
        const def = data[key];
        if (!def) return { value: '--', unit: '', label: key };
        let raw = def.Value;
        if (raw === undefined || raw === null || raw === '--') return { value: '--', unit: def.userUnit || '', label: def.label || key };

        let valStr = raw;
        if (def.toUserUnit) {
            try {
                const cv = eval(def.toUserUnit);
                const processed = cv(raw);
                valStr = (typeof processed === 'number') ? processed.toFixed(1) : processed;
            } catch (e) {
                // fallback
            }
        }
        return { value: valStr, unit: def.userUnit || '', label: def.label || key };
    }

    const windSpeed = getSensorValue('speed:Wind');
    const gustSpeed = getSensorValue('speed:Gust');
    const windDir = getSensorValue('direction:Wind');
    const gustDir = getSensorValue('direction:Gust');

    // INITIALIZE IF SVG NOT FOUND
    if (svg.empty()) {
        container.innerHTML = ''; // First time boundary clear
        container.style.padding = '0';
        container.style.position = 'relative';

        svg = d3.select(container)
            .append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", "100%")
            .attr("height", "100%")
            .style("display", "block");

        const defs = svg.append("defs");

        // Glow Filter
        const glowFilter = defs.append("filter")
            .attr("id", "neon-glow")
            .attr("x", "-20%")
            .attr("y", "-20%")
            .attr("width", "140%")
            .attr("height", "140%");
        glowFilter.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "coloredBlur");
        const merge = glowFilter.append("feMerge");
        merge.append("feMergeNode").attr("in", "coloredBlur");
        merge.append("feMergeNode").attr("in", "SourceGraphic");

        const leftGroup = svg.append("g")
            .attr("class", "left-values")
            .attr("transform", `translate(${margin + 15}, ${margin + 20})`);

        // Large Speed Value Header
        leftGroup.append("text").attr("class", "main-val").attr("x", 0).attr("y", 20).attr("font-size", "2em").attr("font-weight", "bold").attr("fill", cyanColor).attr("filter", "url(#neon-glow)");
        leftGroup.append("text").attr("x", 0).attr("y", 40).attr("font-size", "0.8em").attr("fill", "rgba(0,255,255,0.7)").text("Wind Vectors");

        // Timestamp
        const dateRow = leftGroup.append("g").attr("transform", "translate(0, 70)");
        dateRow.append("text").attr("class", "date-str").attr("x", 0).attr("y", 0).attr("font-size", "0.7em").attr("fill", "rgba(255,255,255,0.5)");
        dateRow.append("text").attr("class", "time-str").attr("x", 0).attr("y", 12).attr("font-size", "0.75em").attr("fill", "rgba(0,255,255,0.6)");

        // Wind Speed Row
        const windRow = leftGroup.append("g").attr("transform", "translate(0, 120)");
        windRow.append("circle").attr("cx", 4).attr("cy", -4).attr("r", 4).attr("fill", pinkColor);
        windRow.append("text").attr("x", 15).attr("y", 0).attr("font-size", "0.9em").attr("fill", "#fff").text("Wind Speed");
        windRow.append("text").attr("class", "wind-speed-val").attr("x", 15).attr("y", 15).attr("font-size", "0.85em").attr("fill", pinkColor);

        // Gust Row
        const gustRow = leftGroup.append("g").attr("transform", "translate(0, 160)");
        gustRow.append("circle").attr("cx", 4).attr("cy", -4).attr("r", 4).attr("fill", cyanColor);
        gustRow.append("text").attr("x", 15).attr("y", 0).attr("font-size", "0.9em").attr("fill", "#fff").text("Gust");
        gustRow.append("text").attr("class", "gust-speed-val").attr("x", 15).attr("y", 15).attr("font-size", "0.85em").attr("fill", cyanColor);

        // --- DIAL GROUP (Compass) ---
        const dialGroup = svg.append("g").attr("class", "dial-group").attr("transform", `translate(${dialCenter[0]}, ${dialCenter[1]})`);

        dialGroup.append("circle").attr("r", dialRadius).attr("fill", "none").attr("stroke", "rgba(0, 255, 255, 0.15)").attr("stroke-width", 1);
        dialGroup.append("circle").attr("r", dialRadius - 20).attr("fill", "none").attr("stroke", "rgba(255, 255, 255, 0.25)").attr("stroke-width", 0.8).attr("stroke-dasharray", "4, 3");

        // Static Ticks
        dialGroup.append("g")
            .selectAll("line").data(d3.range(0, 360, 5)).enter().append("line")
            .attr("y1", d => d % 15 === 0 ? -dialRadius : -dialRadius + 2)
            .attr("y2", d => d % 30 === 0 ? -dialRadius + 8 : -dialRadius + 4)
            .attr("transform", d => `rotate(${d})`)
            .attr("stroke", d => d % 15 === 0 ? "rgba(0, 255, 255, 0.4)" : "rgba(255,255,255,0.2)")
            .attr("stroke-width", d => d % 15 === 0 ? 1.5 : 0.8);

        // Cardinals
        const cardinals = [
            { angle: 0, label: "N" }, { angle: 90, label: "E" }, { angle: 180, label: "S" }, { angle: 270, label: "W" },
            { angle: 45, label: "NE" }, { angle: 135, label: "SE" }, { angle: 225, label: "SW" }, { angle: 315, label: "NW" }
        ];

        dialGroup.append("g")
            .selectAll("text").data(cardinals).enter().append("text")
            .attr("transform", d => `rotate(${d.angle}) translate(0, ${d.angle % 90 === 0 ? -dialRadius + 18 : -dialRadius + 13})`)
            .attr("text-anchor", "middle").attr("font-size", d => d.angle % 90 === 0 ? "14px" : "10px").attr("font-weight", "bold").attr("fill", d => d.angle % 90 === 0 ? cyanColor : "#aaa")
            .attr("filter", d => d.angle % 90 === 0 ? "url(#neon-glow)" : null).text(d => d.label);

        // --- DYNAMIC LAYERS HOLDER ---
        const activeGroup = dialGroup.append("g").attr("class", "active-layers");

        // Static Arc Generators anchored at top (0 deg)
        const windArcGen = d3.arc().innerRadius(dialRadius - 25).outerRadius(dialRadius - 17).startAngle(-10 * Math.PI / 180).endAngle(10 * Math.PI / 180);
        const gustArcGen = d3.arc().innerRadius(dialRadius - 15).outerRadius(dialRadius - 2).startAngle(-7 * Math.PI / 180).endAngle(7 * Math.PI / 180);
        const windConeGen = d3.arc().innerRadius(0).outerRadius(dialRadius - 25).startAngle(-10 * Math.PI / 180).endAngle(10 * Math.PI / 180);
        const gustConeGen = d3.arc().innerRadius(0).outerRadius(dialRadius - 15).startAngle(-7 * Math.PI / 180).endAngle(7 * Math.PI / 180);

        const windArcRotate = activeGroup.append("g").attr("class", "wind-arc-rotate");
        windArcRotate.append("path").attr("d", windConeGen).attr("fill", pinkColor).attr("opacity", 0.15);
        windArcRotate.append("path").attr("d", windArcGen).attr("fill", pinkColor).attr("opacity", 0.6).attr("filter", "url(#neon-glow)");

        const gustArcRotate = activeGroup.append("g").attr("class", "gust-arc-rotate");
        gustArcRotate.append("path").attr("d", gustConeGen).attr("fill", cyanColor).attr("opacity", 0.15);
        gustArcRotate.append("path").attr("d", gustArcGen).attr("fill", cyanColor).attr("opacity", 0.6).attr("filter", "url(#neon-glow)");

        activeGroup.append("line").attr("class", "needle-wind").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", -dialRadius + 22).attr("stroke", pinkColor).attr("stroke-width", 5).attr("filter", "url(#neon-glow)");
        activeGroup.append("line").attr("class", "needle-gust").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", -dialRadius + 28).attr("stroke", cyanColor).attr("stroke-width", 5).attr("filter", "url(#neon-glow)");

        dialGroup.append("circle").attr("r", 4).attr("fill", "#fff").attr("stroke", cyanColor).attr("stroke-width", 1.5);
    }

    // --- ANIMATE UPDATES ---
    const t = svg.transition().duration(750);

    const mainVal = windSpeed.value !== '--' ? Math.round(parseFloat(windSpeed.value)) : '--';
    svg.select(".main-val").transition(t).text(mainVal);
    const getCardinal = (deg) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16];
    const windCard = windDir.value !== '--' ? ` (${windDir.value}° [${getCardinal(parseFloat(windDir.value))}])` : '';
    const gustCard = gustDir.value !== '--' ? ` (${gustDir.value}° [${getCardinal(parseFloat(gustDir.value))}])` : '';

    svg.select(".wind-speed-val").text(`${windSpeed.value} ${windSpeed.unit}${windCard}`);
    svg.select(".gust-speed-val").text(`${gustSpeed.value} ${gustSpeed.unit}${gustCard}`);

    const now = new Date();
    svg.select(".date-str").text(now.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }));
    svg.select(".time-str").text(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    const angleWind = windDir.value !== '--' ? parseFloat(windDir.value) : 0;
    const angleGust = gustDir.value !== '--' ? parseFloat(gustDir.value) : 0;

    svg.select(".wind-arc-rotate").transition(t).attr("transform", `rotate(${angleWind})`);
    svg.select(".gust-arc-rotate").transition(t).attr("transform", `rotate(${angleGust})`);
    svg.select(".needle-wind").transition(t).attr("transform", `rotate(${angleWind})`);
    svg.select(".needle-gust").transition(t).attr("transform", `rotate(${angleGust})`);
};
