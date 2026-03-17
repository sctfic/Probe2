// earthSpaceModel.js
/**
 * earthSpaceModel.js — Interactive 3D Globe Library (Référentiel Écliptique)
 * Deps (globals): d3 (d3-geo v2), topojson
 */
(function (global) {
  'use strict';

  /* ─── Palette ──────────────────────────────────────────────────────────── */
  const C = {
    cyan: '#00ffff',
    magenta: '#ff009d',
    amber: '#ffb347',
    pink: '#ff6b6b',
    cyanDim: 'rgba(0,255,255,0.3)',
    dark: 'rgb(26,26,26)',
  };

  /* ─── Mathématiques Quaternions & Rotations ────────────────────────────── */
  function qY(a) { const r = a * Math.PI / 360; return [Math.cos(r), 0, Math.sin(r), 0]; }
  function qX(a) { const r = a * Math.PI / 360; return [Math.cos(r), Math.sin(r), 0, 0]; }
  function qZ(a) { const r = a * Math.PI / 360; return [Math.cos(r), 0, 0, Math.sin(r)]; }
  function qMult(A, B) {
    return [
      A[0] * B[0] - A[1] * B[1] - A[2] * B[2] - A[3] * B[3],
      A[0] * B[1] + A[1] * B[0] + A[2] * B[3] - A[3] * B[2],
      A[0] * B[2] - A[1] * B[3] + A[2] * B[0] + A[3] * B[1],
      A[0] * B[3] + A[1] * B[2] - A[2] * B[1] + A[3] * B[0]
    ];
  }
  function qToEuler(q) {
    const [w, x, y, z] = q;
    const sinp = 2 * (w * x + y * z);
    const phi = Math.asin(Math.max(-1, Math.min(1, sinp)));
    const lam = Math.atan2(2 * (w * y - x * z), w * w - x * x - y * y + z * z);
    const gam = Math.atan2(2 * (w * z - x * y), w * w - x * x + y * y - z * z);
    return [lam * 180 / Math.PI, phi * 180 / Math.PI, gam * 180 / Math.PI];
  }

  /* ─── Astronomie ────────────────────────────────────────────────────────── */
  function dayOfYear(d) {
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  }

  function solarSubpoint(date) {
    const B = (360 / 365.24) * (dayOfYear(date) - 81 + date.getUTCHours() / 24) * Math.PI / 180;
    const decl = 23.44 * Math.sin(B);
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    return {
      longitude: -((utcMin - 720 + eot) * (360 / 1440)),
      latitude: decl,
    };
  }

  function getMoonPhase(date) {
    const REF = Date.UTC(2000, 0, 6, 18, 14);
    const SYN = 29.53058867 * 86400000;
    return (((date.getTime() - REF) / SYN) % 1 + 1) % 1;
  }

  function geoDepth(rotation, lon, lat) {
    const [rLon, rLat] = rotation([lon, lat]);
    return Math.cos(rLat * Math.PI / 180) * Math.cos(rLon * Math.PI / 180);
  }

  /* ─── DONNÉES DE LA LUNE (Cratères, Mers, Éjectas) ────────────────────── */
  const MARE_N = [
    [-57.4,18.4,32,.73],[-15.6,32.8,15.5,.74],[17.5,28,10,.70],
    [31.4,8.5,11.5,.72],[1.4,56,10.5,.67],[-16.6,-21.3,9.5,.70],
    [51.3,-7.8,11.5,.68],[-38.6,-24.4,7.5,.67],[59.1,17,8,.67],
    [3.6,13.3,5.5,.62],[34.3,-15.2,5.5,.64],[37.4,45.2,3,.60],
    [-1,9,3.5,.58],[-16,12,3.5,.60],[-33,44.5,3,.57]
  ];
  const MARE_F = [
    [147,27,5.2,.64],[129,-20,3.4,.72],[163,-33,3.6,.61],
    [163,-57,2.6,.55],[-95,-19.4,9,.60]
  ];
  const SPA_BASIN = {c:[-169,-56],r:40,op:.35};
  const ALL_MARE = [...MARE_N,...MARE_F];

  const NC = [
    [-69.1,-66.8,287,0],[-14.4,-58.4,231,0],[-68.3,-5.5,222,0],
    [-54.6,-44.4,206,0],[60.4,-25.1,177,0],[-39.9,-51.8,175,0],
    [-27.5,-60.5,177,0],[-6,-50.5,163,0],[-4.8,-32.5,162,0],
    [-74.6,-3,156,0],[61.6,-16.4,147,0],[34,-54.6,125,0],
    [-1.9,-9.3,153,0],[24.1,-47.5,190,0],[-4.1,-11.7,114,0],
    [-2.8,-13.4,108,0],[-1.9,-18.2,96,0],[-20.08,9.62,97,1],
    [-9.4,51.6,101,0],[-39.9,-17.5,101,0],[26.4,-11.4,100,0],
    [17.4,50.2,87,0],[-11.36,-43.31,86,1],[44.4,46.7,87,0],
    [39.1,46.7,69,0],[-47.4,23.7,40,1],[-11.3,14.5,58,0],
    [-38,8.1,32,1],[34.6,17,39,1],[16.3,44.3,67,0],
    [-13.5,-29.9,97,0],[6,-41.1,126,0],[14,-42,114,0],
    [20,-38,116,0],[13.5,-34.2,88,0],[-21.4,-63.6,117,0],
    [11.4,-56.5,106,0],[30.9,-50.4,82,0],[51.3,-54.9,76,0],
    [-5.5,-70.6,114,0],[-10,-66.9,83,0],[62.3,46.6,85,0],
    [-22.2,-20.7,61,0],[-22.8,3.3,48,0],[9.1,14.5,39,0],
    [129,-20,185,0],[-128,2,591,0],[-157,4,437,0],[141,6,313,0],
    [149,-20,272,0],[136,-57,319,0],[134,-75,312,0],[-152,36,345,0],
    [-152,-36,492,0],[163,-57,319,0],[-172,69,143,0],[-152,45,222,0],
    [147,27,276,0],[163,-33,320,0],[106,-47,226,0],[123,-72,146,0],
    [175,-30,236,0],[111,55,209,0],[-138,31,225,0],[-143,-6,114,0],
    [-165,-36,98,0],[164,14,140,0],[105,-5,94,0],[118,28,92,0],
    [-161,-21,88,0],[175,6,93,0],[115,-44,109,0],[-118,54,117,0],
    [-132,-8,121,0],[122,-57,104,0],[-156,64,136,0],[153,25,96,0],
    [143,-42,222,0],[-119,20,88,0],[101,-30,73,0]
  ];

  const ZONES = [
    [-35,35,-68,-32,58,33],[-72,-35,-68,-32,32,30],[35,72,-68,-32,30,30],
    [-35,35,-82,-65,20,28],[35,72,-82,-65,16,26],[-72,-35,-82,-65,16,26],
    [-80,80,35,80,42,26],[54,88,-56,55,35,26],[-88,-54,-56,55,32,26],
    [-32,32,-38,-20,22,22],[-68,-32,-58,-36,24,28],[30,68,-58,-36,22,28],
    [90,180,-80,80,90,36],[-180,-90,-80,80,85,36],[90,180,-85,-65,30,28],
    [-180,-90,-85,-65,28,28],[-180,-130,-75,-30,45,38],[130,180,-75,-30,42,38]
  ];

  const RAYS = [
    {c:[-11.36,-43.31],len:46,n:22,a:.14,lw:1.4},
    {c:[-20.08,9.62],  len:28,n:16,a:.09,lw:.9},
    {c:[-47.4,23.7],   len:18,n:14,a:.11,lw:.85},
    {c:[-38,8.1],      len:17,n:12,a:.08,lw:.80},
    {c:[129,-20],      len:14,n:10,a:.08,lw:.75}
  ];

  let fs = 43219;
  const frng = () => ((fs = Math.imul(fs ^ fs >>> 17, fs | 1)) >>> 0) / 2 ** 32;
  const FC = [];
  ZONES.forEach(([lo,hi,la,lb,cnt,dm]) => {
    for(let i=0; i<cnt; i++){
      const lon = lo + (hi - lo) * frng(), lat = la + (lb - la) * frng(), d = 12 + frng() * (dm - 12);
      if(!ALL_MARE.some(([ml,mp,mr]) => Math.sqrt(((lon - ml) * Math.cos(mp * Math.PI / 180)) ** 2 + (lat - mp) ** 2) < mr * 0.78))
        FC.push([lon, lat, d, 0]);
    }
  });

  const ALL_C = [...NC, ...FC];

  /* ═══════════════════════════════════════════════════════════════════════════
     MAIN
  ═══════════════════════════════════════════════════════════════════════════ */
  function loadEarthSpaceModel(container, gps, timeStamp) {
    const initialDate = (timeStamp instanceof Date) ? timeStamp : new Date(timeStamp || Date.now());
    let virtualDate = new Date(initialDate.getTime());

    /* ── Canvas ─────────────────────────────────────────────────────────── */
    container.style.cssText += ';position:relative;overflow:hidden;background:' + C.dark;
    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;
    const sz = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const R = sz * 0.38; // Rayon de base initial
    const dpr = window.devicePixelRatio || 1;

    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.cssText = `width:${W}px;height:${H}px;display:block;cursor:grab;`;
    container.innerHTML = '';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    /* ── Caméra (Référentiel Écliptique) ────────────────────────────────── */
    let camLon = 70;
    let camLat = 20;

    const proj = d3.geoOrthographic().scale(R).translate([cx, cy]).clipAngle(90);
    const path = d3.geoPath(proj, ctx);

    /* ── Données carto ──────────────────────────────────────────────────── */
    let map50 = null, map110 = null, loaded = 0;
    function onLoad() {
      loaded++;
      if (loaded === 2) { currentMap = map110; startLoop(); }
    }
    const BASE = 'https://cdn.jsdelivr.net/npm/world-atlas@2/';
    ['countries-110m.json', 'countries-50m.json'].forEach(file => {
      fetch(BASE + file).then(r => r.json()).then(topo => {
        const feat = topojson.feature(topo, topo.objects.countries);
        if (file.includes('110')) map110 = feat; else map50 = feat;
        onLoad();
      }).catch(() => { map50 = map50 || map110; onLoad(); });
    });

    /* ── Géométries fixes ───────────────────────────────────────────────── */
    const graticule = d3.geoGraticule()();
    const sphere = { type: 'Sphere' };

    function parallelCircle(lat) {
      if (lat >= 0) {
        return d3.geoCircle().center([0, 90]).radius(90 - lat)();
      } else {
        return d3.geoCircle().center([0, -90]).radius(90 + lat)();
      }
    }

    /* ── Étoiles (Sphère Écliptique 3D) ─────────────────────────────────── */
    const projStars = d3.geoOrthographic().scale(sz * 1.5).translate([cx, cy]).clipAngle(90);
    const STARS = Array.from({ length: 400 }, (_, i) => {
      const a = i * 2.399963229;
      const r = Math.acos(2 * (i / 400) - 1) * 180 / Math.PI - 90;
      return { lon: a * 180 / Math.PI, lat: r, s: 0.35 + (i % 3) * 0.45, o: 0.22 + (i % 7) * 0.11 };
    });

    /* ═══════════════════════════════════════════════════════════════════════
       RENDU
    ═══════════════════════════════════════════════════════════════════════ */
    let currentMap = null;

    function render(solar, sunEclLon) {
      ctx.clearRect(0, 0, W, H);
      drawStars();
      drawAtmosphere();

      // Calques de fond (derrière la Terre)
      // La lune orbite plus loin (2*R) que le marqueur (R), elle est donc dessinée en premier
      drawMoon(sunEclLon, 'back');
      if (gps) {
        if (Array.isArray(gps)) gps.forEach(pt => drawMarker(pt, 'back'));
        else drawMarker(gps, 'back');
      }

      // La Terre
      drawBackHemisphere();
      drawFrontGlobe();
      drawTerminator(solar);
      drawPolarAxis();

      // Calques de premier plan (devant la Terre)
      // Le marqueur est sur la surface de la terre (R), il est dessiné avant la lune (2*R)
      if (gps) {
        if (Array.isArray(gps)) gps.forEach(pt => drawMarker(pt, 'front'));
        else drawMarker(gps, 'front');
      }
      drawMoon(sunEclLon, 'front');

      drawDate();
    }

    /* ── Étoiles ── */
    function drawStars() {
      STARS.forEach(s => {
        const pt = projStars([s.lon, s.lat]);
        if (pt) {
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], s.s, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180,220,255,${s.o})`;
          ctx.fill();
        }
      });
    }

    /* ── Atmosphère ── */
    function drawAtmosphere() {
      const s = proj.scale();
      const g = ctx.createRadialGradient(cx, cy, s * 0.92, cx, cy, s * 1.22);
      g.addColorStop(0, 'rgba(0,180,255,0.15)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(cx, cy, s * 1.22, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }

    /* ── Face cachée ── */
    function drawBackHemisphere() {
      proj.clipAngle(180);
      ctx.save(); ctx.globalAlpha = 0.09;
      ctx.beginPath(); path(sphere); ctx.fillStyle = '#010c1c'; ctx.fill();
      ctx.restore();
      if (currentMap) {
        ctx.save(); ctx.globalAlpha = 0.06;
        ctx.beginPath(); path(currentMap); ctx.fillStyle = C.cyan; ctx.fill();
        ctx.restore();
      }
      proj.clipAngle(90);
    }

    /* ── Globe face avant ── */
    function drawFrontGlobe() {
      const s = proj.scale();
      ctx.beginPath(); path(sphere);
      const og = ctx.createRadialGradient(cx - s * 0.2, cy - s * 0.2, s * 0.04, cx, cy, s);
      og.addColorStop(0, 'rgba(13, 48, 85, 0.85)');
      og.addColorStop(0.65, 'rgba(6, 21, 34, 0.85)');
      og.addColorStop(1, 'rgba(2, 8, 16, 0.85)');
      ctx.fillStyle = og; ctx.fill();

      ctx.beginPath(); path(graticule);
      ctx.strokeStyle = 'rgba(0,255,255,0.09)'; ctx.lineWidth = 0.4; ctx.stroke();

      [
        { circle: parallelCircle(0), color: C.amber },
        { circle: parallelCircle(23.45), color: 'rgba(255,180,50,0.18)' },
        { circle: parallelCircle(-23.45), color: 'rgba(255,180,50,0.18)' },
        { circle: parallelCircle(66.56), color: 'rgba(100,200,255,0.20)' },
        { circle: parallelCircle(-66.56), color: 'rgba(100,200,255,0.20)' },
      ].forEach(({ circle, color }) => {
        ctx.beginPath(); path(circle);
        ctx.strokeStyle = color; ctx.lineWidth = 0.6; ctx.stroke();
      });

      if (currentMap) {
        ctx.beginPath(); path(currentMap);
        ctx.fillStyle = 'rgba(0,255,255,0.15)'; ctx.fill();
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 0.6;
        ctx.shadowColor = C.cyan; ctx.shadowBlur = 5;
        ctx.stroke(); ctx.shadowBlur = 0;
      }

      ctx.beginPath(); path(sphere);
      ctx.strokeStyle = 'rgba(0,255,255,0.48)'; ctx.lineWidth = 1.1;
      ctx.shadowColor = C.cyan; ctx.shadowBlur = 11; ctx.stroke(); ctx.shadowBlur = 0;
    }

    /* ── Terminateur jour/nuit dynamique ─────────────────────────────────── */
    function drawTerminator(solar) {
      const nCircle = d3.geoCircle().center([solar.longitude + 180, -solar.latitude]).radius(90)();
      const tCircle = d3.geoCircle().center([solar.longitude + 180, -solar.latitude]).radius(96)();

      ctx.save();
      ctx.beginPath(); path(sphere); ctx.clip();
      ctx.beginPath(); path(nCircle); ctx.fillStyle = 'rgba(0,0,20,0.58)'; ctx.fill();
      ctx.beginPath(); path(tCircle); ctx.fillStyle = 'rgba(0,0,30,0.22)'; ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath(); path(sphere); ctx.clip();
      proj.clipAngle(90);
      ctx.beginPath(); path(nCircle);
      ctx.strokeStyle = 'rgba(80,140,255,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }

    /* ── Axe de rotation terrestre (Pôle Céleste) ────────────────────────── */
    function drawPolarAxis() {
      proj.clipAngle(180);
      const npPt = proj([0, 90]);
      const spPt = proj([0, -90]);
      proj.clipAngle(90);
      if (!npPt || !spPt) return;

      const rotation = d3.geoRotation(proj.rotate());
      const depthNP = geoDepth(rotation, 0, 90);
      const depthSP = geoDepth(rotation, 0, -90);

      ctx.save();
      ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(0,255,255,0.22)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(spPt[0], spPt[1]); ctx.lineTo(npPt[0], npPt[1]); ctx.stroke();
      ctx.setLineDash([]);

      const npAlpha = depthNP > 0 ? 0.85 : 0.22;
      ctx.globalAlpha = npAlpha;
      ctx.beginPath(); ctx.arc(npPt[0], npPt[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,255,255,0.7)'; ctx.fill();
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1;
      ctx.shadowColor = C.cyan; ctx.shadowBlur = depthNP > 0 ? 8 : 0;
      ctx.stroke(); ctx.shadowBlur = 0;

      const spAlpha = depthSP > 0 ? 0.85 : 0.22;
      ctx.globalAlpha = spAlpha;
      ctx.beginPath(); ctx.arc(spPt[0], spPt[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(80,180,255,0.7)'; ctx.fill();
      ctx.strokeStyle = 'rgba(80,180,255,0.9)'; ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(80,180,255,0.8)'; ctx.shadowBlur = depthSP > 0 ? 8 : 0;
      ctx.stroke(); ctx.shadowBlur = 0;

      ctx.globalAlpha = 1; ctx.restore();
    }

    /* ── Lune (Référentiel Écliptique 3D avec gestion de calques) ── */
    function drawMoon(sunEclLon, layer) {
      const s = proj.scale();
      const currentMoonDist = s * 2.0;
      const currentMoonR = s * 0.2726;

      const projMoon = d3.geoOrthographic().scale(currentMoonDist).translate([cx, cy]).rotate([camLon, camLat, 0]);
      const phase = getMoonPhase(virtualDate);
      const moonEclLon = sunEclLon + phase * 360;
      const moonEclLat = 5.14 * Math.sin(moonEclLon * Math.PI / 180);

      const pt = projMoon([moonEclLon, moonEclLat]);
      const inFront = geoDepth(d3.geoRotation(projMoon.rotate()), moonEclLon, moonEclLat) >= 0;

      if (layer === 'back' && inFront) return;
      if (layer === 'front' && !inFront) return;

      const [mx, my] = pt;
      const sunPt = projStars([sunEclLon, 0]) || [cx, cy];
      const toLightX = sunPt[0] - mx;
      const toLightY = sunPt[1] - my;
      const lightLen = Math.hypot(toLightX, toLightY) || 1;
      const lx = toLightX / lightLen;
      const ly = toLightY / lightLen;

      // Shading de base retiré pour préserver la transparence

      ctx.save();
      ctx.beginPath(); ctx.arc(mx, my, currentMoonR, 0, Math.PI * 2); ctx.clip();

      // Local projection pour les coordonées de la Lune
      // On tourne de camLon + moonEclLon pour que la face visible [0,0] regarde toujours la Terre (Vérrouillage maréal)
      const localProj = d3.geoOrthographic()
        .scale(currentMoonR)
        .translate([mx, my])
        .rotate([camLon + moonEclLon, camLat, 0])
        .clipAngle(90);

      const gpLocal = d3.geoPath().projection(localProj).context(ctx);
      const isVisMoon = (lon, lat) => d3.geoDistance([lon, lat], [-localProj.rotate()[0], -localProj.rotate()[1]]) < Math.PI / 2 * 0.97;

      const gc = d3.geoCircle();

      // 1. Bassin SPA et Mers (Maria) - Fills
      const SPA_F = gc.center(SPA_BASIN.c).radius(SPA_BASIN.r)();
      ctx.beginPath(); gpLocal(SPA_F); ctx.fillStyle = `rgba(10,8,6,${SPA_BASIN.op})`; ctx.fill();

      ALL_MARE.forEach(([ml, mp, mr, op]) => {
        const f = gc.center([ml, mp]).radius(mr)();
        ctx.beginPath(); gpLocal(f); ctx.fillStyle = `rgba(18,16,14,${op})`; ctx.fill();
      });

      // 2. Éjectas (Rays)
      RAYS.forEach(({ c, len, n, a, lw }) => {
        if (!isVisMoon(c[0], c[1])) return;
        const ptLocal = localProj(c); if (!ptLocal) return;
        for (let i = 0; i < n; i++) {
          const ang = i / n * Math.PI * 2, dst = len * currentMoonR / 90;
          const ex = ptLocal[0] + Math.cos(ang) * dst, ey = ptLocal[1] + Math.sin(ang) * dst;
          const gr = ctx.createLinearGradient(ptLocal[0], ptLocal[1], ex, ey);
          gr.addColorStop(0, `rgba(234,230,218,${a})`); gr.addColorStop(1, 'rgba(234,230,218,0)');
          ctx.beginPath(); ctx.moveTo(ptLocal[0], ptLocal[1]); ctx.lineTo(ex, ey);
          ctx.strokeStyle = gr; ctx.lineWidth = lw * currentMoonR / 150; ctx.stroke();
        }
      });

      // 3. Cratères - Ellipses perspectivées
      ALL_C.forEach(([clon, clat, dkm, fresh]) => {
        if (!isVisMoon(clon, clat)) return;
        const ptLocal = localProj([clon, clat]); if (!ptLocal) return;
        const crs = currentMoonR * Math.asin(Math.min(dkm / 2 / 1737.4, 0.9999));
        if (crs < 0.6) return;
        const theta = d3.geoDistance([clon, clat], [-localProj.rotate()[0], -localProj.rotate()[1]]);
        const fore = Math.max(0.07, Math.cos(theta));
        const rA = Math.atan2(ptLocal[1] - my, ptLocal[0] - mx);
        const rx = crs * fore, ry = crs;

        ctx.beginPath(); ctx.ellipse(ptLocal[0], ptLocal[1], rx, ry, rA, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${fresh ? 0.8 : 0.4})`; ctx.lineWidth = fresh ? 1 : 0.6; ctx.stroke();
      });

      // 4. Ombres dynamiques overlay (Le gradient radial sur le dessus pour ombrager selon le Soleil)
      const mgDetails = ctx.createRadialGradient(mx + lx * currentMoonR * 0.45, my + ly * currentMoonR * 0.45, currentMoonR * 0.05, mx, my, currentMoonR);
      mgDetails.addColorStop(0, 'rgba(250,248,240,0)');
      mgDetails.addColorStop(0.3, 'rgba(234,230,220,0.1)');
      mgDetails.addColorStop(0.65, 'rgba(100,100,110,0.5)');
      mgDetails.addColorStop(1, 'rgba(10,10,20,0.95)');
      ctx.beginPath(); ctx.arc(mx, my, currentMoonR + 1, 0, Math.PI * 2);
      ctx.fillStyle = mgDetails; ctx.fill();

      ctx.restore();

      // Halo réduit
      const ga = 0.05 + (inFront ? 0.08 : 0);
      const halo = ctx.createRadialGradient(mx, my, currentMoonR * 0.95, mx, my, currentMoonR * 1.25);
      halo.addColorStop(0, `rgba(160,160,210,${ga})`); halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(mx, my, currentMoonR * 1.25, 0, Math.PI * 2);
      ctx.fillStyle = halo; ctx.fill();
      ctx.beginPath(); ctx.arc(mx, my, currentMoonR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200,200,240,${ga})`; ctx.lineWidth = 1; ctx.stroke();
    }

    /* ── Marqueur GPS (Avec système de calques z-index) ── */
    let pulseT = 0;
    function drawMarker({ latitude: lat, longitude: lon, name }, layer) {
      if (lat == null || lon == null) return;
      const rotation = d3.geoRotation(proj.rotate());
      const visible = geoDepth(rotation, lon, lat) >= 0;

      // Z-Index filtering via layers
      if (layer === 'back' && visible) return;
      if (layer === 'front' && !visible) return;

      proj.clipAngle(180);
      const pt = proj([lon, lat]);
      proj.clipAngle(90);
      if (!pt) return;
      const [x, y] = pt;

      ctx.save();
      ctx.globalAlpha = 1; // Le marqueur garde toujours son opacité max. L'occlusion se fait par z-index.

      [[5 + 15 * Math.abs(Math.sin(pulseT + 0.5)), 0.12],
      [5 + 9 * Math.abs(Math.sin(pulseT)), 0.26]].forEach(([r, a]) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,0,157,${a})`; ctx.lineWidth = 1.5; ctx.stroke();
      });

      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = C.magenta;
      ctx.shadowColor = C.magenta; ctx.shadowBlur = 10;
      ctx.fill(); ctx.shadowBlur = 0;

      if (name) {
        ctx.font = "bold 11px 'Share Tech Mono', monospace";
        ctx.fillStyle = C.cyan;
        ctx.shadowColor = C.cyan;
        ctx.shadowBlur = 7;
        ctx.fillText(name, x + 7, y - 7);
      }
      ctx.restore();
    }

    /* ── Date en bas à droite ── */
    function drawDate() {
      ctx.save();
      ctx.font = "bold 16px 'Share Tech Mono', monospace";
      ctx.fillStyle = C.pink;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.shadowColor = C.pink;
      ctx.shadowBlur = 4;
      ctx.fillText(virtualDate.toLocaleString('fr-FR', { timeZone: 'UTC' }) + ' UTC', W - 20, 20);
      ctx.restore();
    }

    /* ═══════════════════════════════════════════════════════════════════════
       ANIMATION & PHYSIQUE ÉCLIPTIQUE
    ═══════════════════════════════════════════════════════════════════════ */
    let rafId = null, spinning = true, lastT = null, resumeId = null;

    function tick(t) {
      rafId = requestAnimationFrame(tick);
      if (!lastT) lastT = t;
      const dt = t - lastT; lastT = t;
      pulseT += dt * 0.003;

      if (spinning) {
        virtualDate = new Date(virtualDate.getTime() + dt * 7200);
      }

      const solar = solarSubpoint(virtualDate);

      const baseUTC = Date.UTC(virtualDate.getUTCFullYear(), 0, 0);
      const dayFrac = (virtualDate.getTime() - baseUTC) / 86400000;
      const sunEclLon = (dayFrac - 81) * 360 / 365.2422;

      const GST = sunEclLon - solar.longitude;

      const qEarth = qY(GST);
      const qObliq = qX(-23.44);
      const qCamYaw = qY(camLon);
      const qCamPitch = qX(camLat);

      const qTotal = qMult(qCamPitch, qMult(qCamYaw, qMult(qObliq, qEarth)));
      const d3Rot = qToEuler(qTotal);

      proj.rotate(d3Rot);
      projStars.rotate([camLon, camLat, 0]);

      render(solar, sunEclLon);
    }

    function startLoop() { if (!rafId) rafId = requestAnimationFrame(tick); }

    function pauseSpin(ms) {
      spinning = false;
      clearTimeout(resumeId);
      resumeId = setTimeout(() => {
        spinning = true;
        currentMap = map110;
      }, ms || 200);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       INTERACTION
    ═══════════════════════════════════════════════════════════════════════ */
    let dragging = false, dragLastX = 0, dragLastY = 0;

    function pxToDeg(dx) { return dx * (180 / (Math.PI * proj.scale())); }
    function clientXonCanvas(e) { const r_rect = canvas.getBoundingClientRect(); return (e.clientX - r_rect.left) * (W / r_rect.width); }
    function clientYonCanvas(e) { const r_rect = canvas.getBoundingClientRect(); return (e.clientY - r_rect.top) * (H / r_rect.height); }

    canvas.addEventListener('pointerdown', e => {
      const px = clientXonCanvas(e);
      const py = clientYonCanvas(e);
      if (Math.hypot(px - cx, py - cy) > proj.scale() * 3) return;
      dragging = true;
      dragLastX = px;
      dragLastY = py;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      pauseSpin();
      currentMap = map50;
    });

    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const px = clientXonCanvas(e);
      const py = clientYonCanvas(e);

      camLon += pxToDeg(px - dragLastX);
      camLat -= pxToDeg(py - dragLastY);
      camLat = Math.max(-89, Math.min(89, camLat));

      dragLastX = px;
      dragLastY = py;
    });

    canvas.addEventListener('pointerup', () => {
      dragging = false;
      canvas.style.cursor = 'grab';
      currentMap = map110;
    });

    canvas.addEventListener('pointercancel', () => {
      dragging = false;
      canvas.style.cursor = 'grab';
      currentMap = map110;
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      pauseSpin(1500);
      const s = Math.max(R * 0.1, Math.min(R * 10, proj.scale() * (e.deltaY > 0 ? 0.92 : 1.09)));
      proj.scale(s);
      currentMap = map50;
    }, { passive: false });

    /* ── Cleanup ── */
    function destroy() {
      cancelAnimationFrame(rafId);
      clearTimeout(resumeId);
      canvas.remove();
    }

    return { destroy };
  }

  global.loadEarthSpaceModel = loadEarthSpaceModel;

})(window);