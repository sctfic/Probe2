/**
 * World Map Drawing Module for Probe2
 * Renders a 3D Earth projection with back face transparency.
 */

window.loadWorldMap = async function (svgElement, config) {
    const svg = d3.select(svgElement);
    const width = svg.node().clientWidth || 800;
    const height = svg.node().clientHeight || 600;

    // 1. Projections setup
    // Back Face Projection (Pass 1)
    const projectionBack = d3.geoOrthographic()
        .scale(250)
        .translate([width / 2, height / 2])
        .clipAngle(180); // Show whole sphere

    // Front Face Projection (Pass 2)
    const projectionFront = d3.geoOrthographic()
        .scale(250)
        .translate([width / 2, height / 2])
        .clipAngle(90); // Front hemisphere only

    const pathBack = d3.geoPath().projection(projectionBack);
    const pathFront = d3.geoPath().projection(projectionFront);

    try {
        // Fetch map data
        const worldData = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        const countries = topojson.feature(worldData, worldData.objects.countries).features;

        // Initial rotation to station
        const initialRotate = [-config.gps.longitude, -config.gps.latitude];
        projectionBack.rotate(initialRotate);
        projectionFront.rotate(initialRotate);

        // Clear and setup groups
        svg.selectAll("g").remove();
        const mapGroup = svg.append("g");

        // --- Pass 1: Back Face ---
        const backGroup = mapGroup.append("g").attr("class", "back-face");

        // Graticule Back
        backGroup.append("path")
            .datum(d3.geoGraticule()())
            .attr("class", "graticule graticule-back")
            .style("stroke", "rgba(0, 255, 255, 0.05)") // dimmer
            .attr("d", pathBack);

        // Land Back
        backGroup.selectAll(".land-back")
            .data(countries)
            .enter().append("path")
            .attr("class", "land land-back")
            .style("fill", "rgba(0, 40, 60, 0.2)") // transparent
            .style("stroke", "rgba(0, 255, 255, 0.1)") // transparent stroke
            .attr("d", pathBack);

        // --- Pass 2: Front Face ---
        const frontGroup = mapGroup.append("g").attr("class", "front-face");

        // Graticule Front
        frontGroup.append("path")
            .datum(d3.geoGraticule()())
            .attr("class", "graticule")
            .attr("d", pathFront);

        // Land Front
        frontGroup.selectAll(".land")
            .data(countries)
            .enter().append("path")
            .attr("class", "land")
            .attr("d", pathFront);

        // --- Markers (Always on top/front) ---
        const markerGroup = mapGroup.append("g");

        function updateMarkers() {
            const coords = projectionFront([config.gps.longitude, config.gps.latitude]);
            markerGroup.selectAll("*").remove();

            if (coords) {
                // Pulse
                markerGroup.append("circle")
                    .attr("cx", coords[0])
                    .attr("cy", coords[1])
                    .attr("r", 5)
                    .attr("class", "marker-pulse");

                // Center point
                markerGroup.append("circle")
                    .attr("cx", coords[0])
                    .attr("cy", coords[1])
                    .attr("r", 4)
                    .attr("class", "marker");
            }
        }

        updateMarkers();

        // Drag Behavior (Rotation)
        let r0, p0;
        function dragstarted(event) {
            r0 = projectionFront.rotate();
            p0 = [event.x, event.y];
        }

        function dragged(event) {
            const currentTransform = d3.zoomTransform(svg.node());
            const scale = currentTransform.k;
            const sensitivity = 75 / (projectionFront.scale() * scale);

            const p1 = [event.x, event.y];
            const r1 = [r0[0] + (p1[0] - p0[0]) * sensitivity, r0[1] - (p1[1] - p0[1]) * sensitivity, r0[2]];
            r1[1] = Math.max(-90, Math.min(90, r1[1]));

            // Update both projections
            projectionFront.rotate(r1);
            projectionBack.rotate(r1);

            // Redraw
            frontGroup.selectAll("path").attr("d", pathFront);
            backGroup.selectAll("path").attr("d", pathBack);
            updateMarkers();
        }

        svg.call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
        );

        // Zoom Behavior
        function zoomed(event) {
            mapGroup.attr("transform", event.transform);
        }

        svg.call(d3.zoom()
            .scaleExtent([0.5, 10])
            .on("zoom", zoomed)
        );

        // Auto-rotation based on sun position
        function updateSunRotation() {
            const now = new Date();
            const timeInDays = (now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600 + now.getUTCMilliseconds() / 3600000) / 24;
            const sunLon = (0.5 - timeInDays) * 360;
            const startOfYear = new Date(now.getUTCFullYear(), 0, 0);
            const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
            const sunLat = -23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);

            if (!r0) { // Don't auto-rotate while dragging
                const sunRotate = [-sunLon, -sunLat];
                projectionFront.rotate(sunRotate);
                projectionBack.rotate(sunRotate);

                frontGroup.selectAll("path").attr("d", pathFront);
                backGroup.selectAll("path").attr("d", pathBack);
                updateMarkers();
            }
        }

        updateSunRotation();
        d3.timer(updateSunRotation);

        // Update GPS overlay
        const latEl = document.getElementById('gps-lat');
        const lonEl = document.getElementById('gps-lon');
        const altEl = document.getElementById('gps-alt');
        if (latEl) latEl.innerText = `LAT: ${config.gps.latitude.toFixed(4)}`;
        if (lonEl) lonEl.innerText = `LON: ${config.gps.longitude.toFixed(4)}`;
        if (altEl) altEl.innerText = `ALT: ${config.gps.altitude}m`;

    } catch (e) {
        console.error("Map load failed", e);
    }
};
