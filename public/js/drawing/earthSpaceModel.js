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
    const REF = new Date('2000-01-06T18:14:00Z');
    const SYN = 29.53058867 * 86400000;
    return (((date - REF) % SYN) + SYN) % SYN / SYN;
  }

  function geoDepth(rotation, lon, lat) {
    const [rLon, rLat] = rotation([lon, lat]);
    return Math.cos(rLat * Math.PI / 180) * Math.cos(rLon * Math.PI / 180);
  }

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

      ctx.beginPath(); ctx.arc(mx, my, currentMoonR, 0, Math.PI * 2);
      const mg = ctx.createRadialGradient(mx + lx * currentMoonR * 0.45, my + ly * currentMoonR * 0.45, currentMoonR * 0.05, mx, my, currentMoonR);
      mg.addColorStop(0, '#ddd8c8'); mg.addColorStop(0.45, '#8888a0'); mg.addColorStop(1, '#1a1a28');
      ctx.fillStyle = mg; ctx.fill();

      // Halo
      const ga = 0.1 + (inFront ? 0.2 : 0);
      const halo = ctx.createRadialGradient(mx, my, currentMoonR * 0.95, mx, my, currentMoonR * 1.6);
      halo.addColorStop(0, `rgba(160,160,210,${ga})`); halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(mx, my, currentMoonR * 1.6, 0, Math.PI * 2);
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
      ctx.fillStyle = C.cyan;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 4;
      ctx.fillText(virtualDate.toLocaleString('fr-FR', { timeZone: 'UTC' }) + ' UTC', W - 20, H - 20);
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

      const sunEclLon = (dayOfYear(virtualDate) - 81 + virtualDate.getUTCHours() / 24 + virtualDate.getUTCMinutes() / 1440) * 360 / 365.24;

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