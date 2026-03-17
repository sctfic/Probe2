/**
 * World Map Drawing Module for Probe2
 * Renders a 3D Earth projection with back face transparency.
 */
//   .call(zoom(projection)
//       .on("zoom.render", () => render(countries-110m))
//       .on("end.render", () => render(countries-50m)))
//   .call(() => render(countries-50m))

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
        // Fetch map data - load both resolutions
        const [worldData110m, worldData50m] = await Promise.all([
            d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
            d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json")
        ]);

        const countries110m = topojson.feature(worldData110m, worldData110m.objects.countries).features;
        const countries50m = topojson.feature(worldData50m, worldData50m.objects.countries).features;

        let currentCountries = countries50m; // start with high-res

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
            .data(currentCountries)
            .enter().append("path")
            .attr("class", "land land-back")
            .style("fill", "rgba(0, 40, 60, 0.2)") // transparent
            .style("stroke", "rgba(0, 255, 255, 0.1)") // transparent stroke
            .attr("d", pathBack);

        // --- Markers Back Face ---
        const markerBackGroup = mapGroup.append("g").attr("class", "marker-back");
        const pulseBack = markerBackGroup.append("circle").attr("r", 5).attr("class", "marker-pulse");
        const dotBack = markerBackGroup.append("circle").attr("r", 4).attr("class", "marker");

        // --- Pass 2: Front Face ---
        const frontGroup = mapGroup.append("g").attr("class", "front-face");

        // Graticule Front
        frontGroup.append("path")
            .datum(d3.geoGraticule()())
            .attr("class", "graticule")
            .attr("d", pathFront);

        // Land Front
        frontGroup.selectAll(".land")
            .data(currentCountries)
            .enter().append("path")
            .attr("class", "land")
            .attr("d", pathFront);

        // --- Markers Front Face ---
        const markerFrontGroup = mapGroup.append("g").attr("class", "marker-front");
        const pulseFront = markerFrontGroup.append("circle").attr("r", 5).attr("class", "marker-pulse");
        const dotFront = markerFrontGroup.append("circle").attr("r", 4).attr("class", "marker");

        function updateMarkers() {
            const lon = config.gps.longitude;
            const lat = config.gps.latitude;

            const rot = projectionFront.rotate();
            const centerLon = -rot[0];
            const centerLat = -rot[1];
            const distance = d3.geoDistance([lon, lat], [centerLon, centerLat]);
            const isFront = distance < Math.PI / 2;

            const coords = projectionFront([lon, lat]);

            if (coords) {
                if (isFront) {
                    pulseFront.attr("cx", coords[0]).attr("cy", coords[1]).style("display", null).style("opacity", 1);
                    dotFront.attr("cx", coords[0]).attr("cy", coords[1]).style("display", null).style("opacity", 1);
                    pulseBack.style("display", "none");
                    dotBack.style("display", "none");
                } else {
                    pulseBack.attr("cx", coords[0]).attr("cy", coords[1]).style("display", null).style("opacity", 0.4);
                    dotBack.attr("cx", coords[0]).attr("cy", coords[1]).style("display", null).style("opacity", 0.4);
                    pulseFront.style("display", "none");
                    dotFront.style("display", "none");
                }
            } else {
                pulseFront.style("display", "none");
                dotFront.style("display", "none");
                pulseBack.style("display", "none");
                dotBack.style("display", "none");
            }
        }

        updateMarkers();

        // Drag Behavior (Rotation)
        let r0, p0;
        function dragstarted(event) {
            r0 = projectionFront.rotate();
            p0 = [event.x, event.y];

            // Switch to low-res for dragging performance
            currentCountries = countries110m;

            const landBackSelection = backGroup.selectAll(".land-back").data(currentCountries);
            landBackSelection.enter().append("path").attr("class", "land land-back");
            landBackSelection.exit().remove();

            const landFrontSelection = frontGroup.selectAll(".land").data(currentCountries);
            landFrontSelection.enter().append("path").attr("class", "land");
            landFrontSelection.exit().remove();
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

        function dragended(event) {
            // Switch back to high-res after dragging
            currentCountries = countries50m;

            const landBackSelection = backGroup.selectAll(".land-back").data(currentCountries);
            landBackSelection.enter().append("path").attr("class", "land land-back")
                .style("fill", "rgba(0, 40, 60, 0.2)").style("stroke", "rgba(0, 255, 255, 0.1)");
            landBackSelection.exit().remove();

            const landFrontSelection = frontGroup.selectAll(".land").data(currentCountries);
            landFrontSelection.enter().append("path").attr("class", "land");
            landFrontSelection.exit().remove();

            // Redraw with high-res
            frontGroup.selectAll(".land").attr("d", pathFront);
            backGroup.selectAll(".land-back").attr("d", pathBack);
        }

        svg.call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended)
        );

        // Zoom Behavior
        function zoomed(event) {
            mapGroup.attr("transform", event.transform);
        }

        const zoomBehavior = d3.zoom()
            .scaleExtent([0.5, 10])
            .on("zoom", zoomed);

        svg.call(zoomBehavior)
            .on("dblclick.zoom", null); // Disable default dblclick

        svg.on("dblclick", () => {
            r0 = null; // Re-enable auto-rotation
            svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);

            // Re-fetch latest coordinates if onDblClick is configured (optional)
            if (config.onDblClick) config.onDblClick();

            // Force immediate update
            updateSunRotation();
        });

        // --- Continuous auto-rotation with hover pause/reset ---
        let isHovered = false;
        let continuousAngle = initialRotate[0]; // Start at initial roll

        svg.style("pointer-events", "all");

        svg.on("mouseenter", () => {
            isHovered = true;
        });

        svg.on("mouseleave", () => {
            isHovered = false;
        });

        let currentRotate = null;
        const lerpFactor = 0.08; // Vitesse de la transition fluide

        function updateSunRotation() {
            let targetRotate;

            if (isHovered) {
                // Stand still at initialRotate (position of the station)
                targetRotate = [initialRotate[0], initialRotate[1], 0];
            } else if (!r0) {
                // Continuous rotation
                continuousAngle += 0.2; // Speed of eternal rotation
                targetRotate = [continuousAngle, initialRotate[1], 0];
            } else {
                currentRotate = null; // Reset if dragging
                return;
            }

            if (!currentRotate) {
                currentRotate = [...targetRotate];
            } else {
                // Interpolation fluide (LERP) avec gestion du rebouclage à 360°
                let diff0 = targetRotate[0] - currentRotate[0];
                diff0 = ((diff0 + 180) % 360 + 360) % 360 - 180; // Shortest path

                currentRotate[0] += diff0 * lerpFactor;
                currentRotate[1] += (targetRotate[1] - currentRotate[1]) * lerpFactor;
                currentRotate[2] += (targetRotate[2] - currentRotate[2]) * lerpFactor;

                // Keep continuous angle synced when resuming
                if (!isHovered) continuousAngle = currentRotate[0];
            }

            projectionFront.rotate(currentRotate);
            projectionBack.rotate(currentRotate);

            frontGroup.selectAll("path").attr("d", pathFront);
            backGroup.selectAll("path").attr("d", pathBack);
            updateMarkers();
        }

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
