// ./sunpath3d.js - Version améliorée avec animations et physique lunaire corrigée
export async function loadWorldMap(containerSelector, pointData, timeStamp) {
  const container = d3.select(containerSelector);
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;

  // Configuration temporelle et astronomique
  let date = new Date(timeStamp);
  const eps = 23.44 * Math.PI / 180;
  
  let dayOfYear, declination, subsolarLongitude, GMST, moonGeoLon, moonGeoLat;
  let X_geo, Ze_geo, Ye_geo, Zec_geo, Yec_geo, moonZ_geo, moonY_geo, moonNode_geo;

  function eciToGeo(xEci, yEci, zEci) {
    const lat = Math.asin(zEci) * 180 / Math.PI;
    const ra = Math.atan2(yEci, xEci) * 180 / Math.PI;
    return [ra - GMST, lat];
  }

  function computeAstronomy() {
    dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const hoursUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    declination = 23.44 * Math.cos((dayOfYear + 10) * 2 * Math.PI / 365.25);
    subsolarLongitude = -15 * (hoursUTC - 12);

    const age_days = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  
    const sunLambda = ((dayOfYear - 80) / 365.25 * 360) * Math.PI / 180;
    const sunRA = Math.atan2(Math.sin(sunLambda) * Math.cos(eps), Math.cos(sunLambda)) * 180 / Math.PI;
    GMST = sunRA - subsolarLongitude;

    const L = (218.316 + 13.176396 * age_days) % 360;
    const M = (134.963 + 13.064993 * age_days) % 360;
    const F = (93.272 + 13.229350 * age_days) % 360;
    const moonEclipticLon = (L + 6.289 * Math.sin(M * Math.PI / 180)) % 360;
    const moonEclipticLat = 5.128 * Math.sin(F * Math.PI / 180);
  
    const mLambda = moonEclipticLon * Math.PI / 180;
    const mBeta = moonEclipticLat * Math.PI / 180;
    const moonX_eci = Math.cos(mBeta) * Math.cos(mLambda);
    const moonY_eci = Math.cos(mBeta) * Math.sin(mLambda) * Math.cos(eps) - Math.sin(mBeta) * Math.sin(eps);
    const moonZ_eci = Math.cos(mBeta) * Math.sin(mLambda) * Math.sin(eps) + Math.sin(mBeta) * Math.cos(eps);
    moonGeoLat = Math.asin(moonZ_eci) * 180 / Math.PI;
    const moonRA = Math.atan2(moonY_eci, moonX_eci) * 180 / Math.PI;
    moonGeoLon = moonRA - GMST;

    const Omega = (125.04452 - 0.05295381 * age_days) % 360;

    X_geo = eciToGeo(1, 0, 0);
    Ze_geo = eciToGeo(0, 0, 1);
    Ye_geo = eciToGeo(0, 1, 0);
    Zec_geo = eciToGeo(0, -Math.sin(eps), Math.cos(eps));
    Yec_geo = eciToGeo(0, Math.cos(eps), Math.sin(eps));

    const mInc = 5.14 * Math.PI / 180;
    const oRad = Omega * Math.PI / 180;
    const mNodeX = Math.cos(oRad);
    const mNodeY = Math.sin(oRad) * Math.cos(eps);
    const mNodeZ = Math.sin(oRad) * Math.sin(eps);
    moonNode_geo = eciToGeo(mNodeX, mNodeY, mNodeZ);

    const mzX = Math.sin(oRad) * Math.sin(mInc);
    const mzY = -Math.cos(oRad) * Math.sin(mInc) * Math.cos(eps) - Math.cos(mInc) * Math.sin(eps);
    const mzZ = -Math.cos(oRad) * Math.sin(mInc) * Math.sin(eps) + Math.cos(mInc) * Math.cos(eps);
    moonZ_geo = eciToGeo(mzX, mzY, mzZ);

    const normYm = Math.hypot(mzZ, -mzY);
    moonY_geo = eciToGeo(0, mzZ / normYm, -mzY / normYm);
  }

  computeAstronomy();

  // ---- PROJECTIONS DE LA TERRE ----
  const earthRadius = Math.min(width, height) * 0.35;
  const projection = d3.geoOrthographic()
    .scale(earthRadius)
    .translate([width / 2, height / 2])
    .clipAngle(90)
    .precision(0.1)
    .rotate([-subsolarLongitude, -declination, 23.44]);

  const backProjection = d3.geoOrthographic()
    .scale(earthRadius)
    .translate([width / 2, height / 2])
    .clipAngle(90)
    .precision(0.1)
    .reflectX(true)
    .rotate([-subsolarLongitude, -declination, 23.44]);

  // ---- PROJECTIONS FIXES (ROBUSTES A LA ROTATION TERRESTRE) ----
  const statUnclipped = d3.geoOrthographic()
    .scale(earthRadius)
    .translate([width / 2, height / 2])
    .clipAngle(null)
    .precision(0.1)
    .rotate([-subsolarLongitude, -declination, 23.44]);

  const stationaryProj = d3.geoOrthographic()
    .scale(earthRadius)
    .translate([width / 2, height / 2])
    .clipAngle(90)
    .precision(0.1)
    .rotate([-subsolarLongitude, -declination, 23.44]);

  const path = d3.geoPath().projection(projection);
  const backPath = d3.geoPath().projection(backProjection);

  // ---- PROJECTIONS DE LA LUNE ----
  const moonRatio = 0.2726;
  const moonRadius = earthRadius * moonRatio;
  const moonDistance = earthRadius * 2.2; // Rapproché pour proximité visuelle

  const moonProjection = d3.geoOrthographic()
    .scale(moonRadius)
    .clipAngle(90)
    .precision(0.1);

  const moonBackProjection = d3.geoOrthographic()
    .scale(moonRadius)
    .clipAngle(90)
    .precision(0.1)
    .reflectX(true);

  const moonPath = d3.geoPath().projection(moonProjection);
  const moonBackPath = d3.geoPath().projection(moonBackProjection);

  // ---- SETUP SVG ----
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  const defs = svg.append("defs");

  // Filtre glow amélioré
  const filter = defs.append("filter").attr("id", "glow");
  filter.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "coloredBlur");
  const feMerge = filter.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  // Création des conteneurs globaux pour gérer le z-index dynamiquement
  // Ordre initial: Terre arrière -> Lune -> Marqueur -> Terre avant
  const gEarthBack = svg.append("g").attr("class", "earth-layer-back");
  const gMoon = svg.append("g").attr("class", "moon-layer");
  const gMarker = svg.append("g").attr("class", "marker-layer");
  const gEarthFront = svg.append("g").attr("class", "earth-layer-front");

  const gMoonBack = gMoon.append("g").attr("class", "moon-layer-back");
  const gMoonFront = gMoon.append("g").attr("class", "moon-layer-front");

  // ---- GROUPES DE REPERES ----
  const gAxes = svg.append("g").attr("class", "axes-layer");

  // ---- ELEMENTS DE LA TERRE ----
  const sphere = { type: "Sphere" };
  const graticule = d3.geoGraticule10();

  gEarthBack.append("path").datum(sphere).attr("class", "sphere").attr("d", backPath);
  const pathGraticuleBack = gEarthBack.append("path").datum(graticule).attr("class", "graticule-back");
  const pathLandBack = gEarthBack.append("path").attr("class", "land-back");

  gEarthFront.append("path").datum(sphere).attr("class", "sphere").attr("d", path);
  const pathGraticuleFront = gEarthFront.append("path").datum(graticule).attr("class", "graticule-front");
  const pathLandFront = gEarthFront.append("path").attr("class", "land-front").attr("filter", "url(#glow)");

  // ---- ELEMENTS DE LA LUNE ----
  const moonGraticule = d3.geoGraticule10();

  const moonSphereBackPath = gMoonBack.append("path").datum(sphere).attr("class", "moon-sphere");
  const moonGraticuleBackPath = gMoonBack.append("path").datum(moonGraticule).attr("class", "moon-graticule-back");

  const moonSphereFrontPath = gMoonFront.append("path").datum(sphere).attr("class", "moon-sphere");
  const moonGraticuleFrontPath = gMoonFront.append("path").datum(moonGraticule).attr("class", "moon-graticule-front");

  // ---- MARQUEUR AVEC ANIMATION PULSE AMÉLIORÉE ----
  const markerGroup = gMarker.append("g");

  // Cercle pulse animé avec SMIL (plus fluide que CSS)
  const pulseCircle = markerGroup.append("circle")
    .attr("class", "marker-pulse")
    .attr("cx", 0)
    .attr("cy", 0)
    .attr("r", 4);

  // Animation SMIL pour le pulse
  pulseCircle.append("animate")
    .attr("attributeName", "r")
    .attr("values", "4;20;4")
    .attr("dur", "2s")
    .attr("repeatCount", "indefinite");

  pulseCircle.append("animate")
    .attr("attributeName", "opacity")
    .attr("values", "1;0;1")
    .attr("dur", "2s")
    .attr("repeatCount", "indefinite");

  // Cercle central
  markerGroup.append("circle")
    .attr("class", "marker-core")
    .attr("cx", 0)
    .attr("cy", 0)
    .attr("r", 4);

  // Texte du marqueur
  markerGroup.append("text")
    .attr("class", "marker-text")
    .attr("x", 12)
    .attr("y", 4)
    .text(pointData.name);

  // ---- INDICATEUR DE TEMPS ----
  const timeText = svg.append("text")
    .attr("x", 20)
    .attr("y", 30)
    .attr("fill", "var(--futuristic-cyan)")
    .attr("font-family", "var(--font-mono)")
    .attr("font-size", "14px")
    .text(date.toLocaleString('fr-FR') + " UTC" + (date.getTimezoneOffset() / -60 > 0 ? "+" : "") + (-date.getTimezoneOffset() / 60));

  // Chargement des données JSON
  const [world110, world50] = await Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json")
  ]);

  const land110 = topojson.feature(world110, world110.objects.countries);
  const land50 = topojson.feature(world50, world50.objects.countries);
  let currentLand = land50;

  // ---- ASTRONOMIE GLOBALE ----
  const cx = width / 2, cy = height / 2;

  function drawAxis(coordsGeo, color, label, scale = 1.35) {
    const pt = statUnclipped(coordsGeo);
    if (!pt) return;
    const dx = pt[0] - cx, dy = pt[1] - cy;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return;

    const x2 = cx + dx * scale;
    const y2 = cy + dy * scale;
    gAxes.append("line")
      .attr("x1", cx).attr("y1", cy).attr("x2", x2).attr("y2", y2)
      .attr("stroke", color).attr("stroke-width", 2).attr("stroke-linecap", "round");
    gAxes.append("text").attr("x", x2 + 4).attr("y", y2 + 4).attr("fill", color)
      .style("font-size", "10px").style("font-family", "sans-serif").text(label);
  }

  function drawAxes() {
    gAxes.selectAll("*").remove();

    // Common X axis (Vernal Equinox)
    drawAxis(X_geo, "white", "x, x', x'' (γ)", 1.7);

    // Ecliptic (x, y, z) - Amber
    drawAxis(Zec_geo, "var(--futuristic-amber)", "z (Ecliptique)", 1.5);
    drawAxis(Yec_geo, "var(--futuristic-amber)", "y (Ecliptique)", 1.5);

    // Earth (x', y', z') - Cyan
    drawAxis(Ze_geo, "var(--futuristic-cyan)", "z' (Terrestre)", 1.6);
    drawAxis(Ye_geo, "var(--futuristic-cyan)", "y' (Terrestre)", 1.6);

    // Moon (x'', y'', z'') - Magenta
    drawAxis(moonZ_geo, "var(--futuristic-magenta)", "z'' (Lunaire)", 1.4);
    drawAxis(moonY_geo, "var(--futuristic-magenta)", "y'' (Lunaire)", 1.4);
  }

  // ---- MOTEUR DE RENDU ----
  let isInteracting = false;
  let camLon = -GMST;
  let camLat = 0;
  let earthSpinDelta = 0;

  function update() {
    computeAstronomy();
    
    timeText.text(date.toLocaleString('fr-FR') + " UTC" + (date.getTimezoneOffset() / -60 > 0 ? "+" : "") + (-date.getTimezoneOffset() / 60));

    statUnclipped.rotate([camLon, camLat, 23.44]);
    stationaryProj.rotate([camLon, camLat, 23.44]);
    projection.rotate([camLon + GMST, camLat, 23.44]);
    backProjection.rotate([camLon + GMST + 180, -camLat, -23.44]);

    drawAxes();

    pathLandFront.datum(currentLand).attr("d", path);
    pathLandBack.datum(currentLand).attr("d", backPath);
    pathGraticuleFront.attr("d", path);
    pathGraticuleBack.attr("d", backPath);

    // Position du marqueur
    let isMarkerBack = false;
    const frontPos = projection([pointData.longitude, pointData.latitude]);
    if (frontPos) {
      markerGroup.attr("transform", `translate(${frontPos[0]}, ${frontPos[1]})`);
      markerGroup.classed("marker-back", false);
      isMarkerBack = false;
    } else {
      const backPos = backProjection([pointData.longitude, pointData.latitude]);
      if (backPos) {
        markerGroup.attr("transform", `translate(${backPos[0]}, ${backPos[1]})`);
        markerGroup.classed("marker-back", true);
        isMarkerBack = true;
      }
    }

    // ---- POSITION PHYSIQUE DE LA LUNE FIXE A LA DATE ----
    // Projeté dynamiquement selon la face visible par rapport au Soleil (Caméra)
    const moonPt = statUnclipped([moonGeoLon, moonGeoLat]);
    const dx = moonPt[0] - cx;
    const dy = moonPt[1] - cy;
    const distScale = 2.2; // multiple de earthRadius pour l'orbite lunaire visuelle

    const moonScreenX = cx + dx * distScale;
    const moonScreenY = cy + dy * distScale;

    const isMoonInFront = stationaryProj([moonGeoLon, moonGeoLat]) !== null;

    // La Lune se bloque et présente la même face (rotation verrouillée vers la Terre)
    // Synchroniser lunar rotation pour affronter la Terre
    const lunarRotation = -(moonGeoLon + GMST) + 90;

    // Calcul de l'inclinaison on-screen du Pôle Nord lunaire (Moon Z)
    const mzPt = statUnclipped(moonZ_geo);
    let moonRoll = 23.44;
    if(mzPt) {
      moonRoll = Math.atan2(mzPt[1] - cy, mzPt[0] - cx) * 180 / Math.PI + 90;
    }

    // Mise à jour des projections lunaires (inclinaison via moonRoll)
    moonProjection.translate([moonScreenX, moonScreenY]).rotate([lunarRotation + camLon, camLat, moonRoll]);
    moonBackProjection.translate([moonScreenX, moonScreenY]).rotate([lunarRotation + camLon + 180, -camLat, -moonRoll]);

    moonSphereFrontPath.attr("d", moonPath);
    moonGraticuleFrontPath.attr("d", moonPath);

    moonSphereBackPath.attr("d", moonBackPath);
    moonGraticuleBackPath.attr("d", moonBackPath);

    // ---- GESTION DU Z-INDEX DYNAMIQUE ----
    // Ordre de rendu souhaité:
    // 1. Terre arrière (toujours en fond)
    // 2. Lune (si derrière la Terre)
    // 3. Terre avant
    // 4. Marqueur (si visible)
    // 5. Lune (si devant la Terre)
    // 6. Marqueur (si derrière)

    // Réorganiser les couches selon la position
    if (isMoonInFront) {
      // Lune devant: Terre arrière -> Terre avant -> Marqueur -> Lune
      gEarthBack.lower();
      gEarthFront.raise();
      if (isMarkerBack) {
        gMarker.raise();
        gMoon.raise();
      } else {
        gMoon.raise();
        gMarker.raise();
      }
    } else {
      // Lune derrière: Terre arrière -> Lune -> Terre avant -> Marqueur
      gEarthBack.lower();
      gMoon.raise();
      gEarthFront.raise();
      gMarker.raise();
    }
  }

  let rotationSpeed = 0.006;
  let lastTime = d3.now();

  const timer = d3.timer((elapsed) => {
    if (!isInteracting) {
      const dt = elapsed - lastTime;
      // 7200x speed
      date = new Date(date.getTime() + dt * 7200);
    }
    lastTime = elapsed;
    update();
  });

  const drag = d3.drag() // manipulation a la sourie
    .on("start", () => {
      isInteracting = true;
      currentLand = land110;
    })
    .on("drag", (event) => {
      const k = 75 / projection.scale();
      camLon += event.dx * k;
      camLat -= event.dy * k;
      camLat = Math.max(-90, Math.min(90, camLat));
      update();
    })
    .on("end", () => {
      currentLand = land50;
      update();
      setTimeout(() => { isInteracting = false; lastTime = d3.now(); }, 2000);
    });

  svg.call(drag);
  update();
}