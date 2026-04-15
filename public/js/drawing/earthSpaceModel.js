// earthSpaceModel.js
/**
 * earthSpaceModel.js — Interactive 3D Globe Library
 * Re-implemented with Three.js (Référentiel Écliptique)
 */
import * as THREE from './three.module.min.js';
import { OrbitControls } from './OrbitControls.js';

function createTextSprite(message) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    context.font = "bold 24px 'Share Tech Mono', monospace";
    context.fillStyle = "rgba(0, 255, 255, 1)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "#00ffff";
    context.shadowBlur = 8;
    context.fillText(message, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(3, 0.75, 1);
    return sprite;
  }

  // --- Constantes Lune ---
  const MARE_N = [[-57.4, 18.4, 32, .73], [-15.6, 32.8, 15.5, .74], [17.5, 28, 10, .70], [31.4, 8.5, 11.5, .72], [1.4, 56, 10.5, .67], [-16.6, -21.3, 9.5, .70], [51.3, -7.8, 11.5, .68], [-38.6, -24.4, 7.5, .67], [59.1, 17, 8, .67], [3.6, 13.3, 5.5, .62], [34.3, -15.2, 5.5, .64], [37.4, 45.2, 3, .60], [-1, 9, 3.5, .58], [-16, 12, 3.5, .60], [-33, 44.5, 3, .57]];
  const MARE_F = [[147, 27, 5.2, .64], [129, -20, 3.4, .72], [163, -33, 3.6, .61], [163, -57, 2.6, .55], [-95, -19.4, 9, .60]];
  const SPA_BASIN = { c: [-169, -56], r: 40, op: .35 };
  const ALL_MARE = [...MARE_N, ...MARE_F];
  const NC = [[-69.1, -66.8, 287, 0], [-14.4, -58.4, 231, 0], [-68.3, -5.5, 222, 0], [-54.6, -44.4, 206, 0], [60.4, -25.1, 177, 0], [-39.9, -51.8, 175, 0], [-27.5, -60.5, 177, 0], [-6, -50.5, 163, 0], [-4.8, -32.5, 162, 0], [-74.6, -3, 156, 0], [61.6, -16.4, 147, 0], [34, -54.6, 125, 0], [-1.9, -9.3, 153, 0], [24.1, -47.5, 190, 0], [-4.1, -11.7, 114, 0], [-2.8, -13.4, 108, 0], [-1.9, -18.2, 96, 0], [-20.08, 9.62, 97, 1], [-9.4, 51.6, 101, 0], [-39.9, -17.5, 101, 0], [26.4, -11.4, 100, 0], [17.4, 50.2, 87, 0], [-11.36, -43.31, 86, 1], [44.4, 46.7, 87, 0], [39.1, 46.7, 69, 0], [-47.4, 23.7, 40, 1], [-11.3, 14.5, 58, 0], [-38, 8.1, 32, 1], [34.6, 17, 39, 1], [16.3, 44.3, 67, 0], [-13.5, -29.9, 97, 0], [6, -41.1, 126, 0], [14, -42, 114, 0], [20, -38, 116, 0], [13.5, -34.2, 88, 0], [-21.4, -63.6, 117, 0], [11.4, -56.5, 106, 0], [30.9, -50.4, 82, 0], [51.3, -54.9, 76, 0], [-5.5, -70.6, 114, 0], [-10, -66.9, 83, 0], [62.3, 46.6, 85, 0], [-22.2, -20.7, 61, 0], [-22.8, 3.3, 48, 0], [9.1, 14.5, 39, 0], [129, -20, 185, 0], [-128, 2, 591, 0], [-157, 4, 437, 0], [141, 6, 313, 0], [149, -20, 272, 0], [136, -57, 319, 0], [134, -75, 312, 0], [-152, 36, 345, 0], [-152, -36, 492, 0], [163, -57, 319, 0], [-172, 69, 143, 0], [-152, 45, 222, 0], [147, 27, 276, 0], [163, -33, 320, 0], [106, -47, 226, 0], [123, -72, 146, 0], [175, -30, 236, 0], [111, 55, 209, 0], [-138, 31, 225, 0], [-143, -6, 114, 0], [-165, -36, 98, 0], [164, 14, 140, 0], [105, -5, 94, 0], [118, 28, 92, 0], [-161, -21, 88, 0], [175, 6, 93, 0], [115, -44, 109, 0], [-118, 54, 117, 0], [-132, -8, 121, 0], [122, -57, 104, 0], [-156, 64, 136, 0], [153, 25, 96, 0], [143, -42, 222, 0], [-119, 20, 88, 0], [101, -30, 73, 0]];
  const ZONES = [[-35, 35, -68, -32, 58, 33], [-72, -35, -68, -32, 32, 30], [35, 72, -68, -32, 30, 30], [-35, 35, -82, -65, 20, 28], [35, 72, -82, -65, 16, 26], [-72, -35, -82, -65, 16, 26], [-80, 80, 35, 80, 42, 26], [54, 88, -56, 55, 35, 26], [-88, -54, -56, 55, 32, 26], [-32, 32, -38, -20, 22, 22], [-68, -32, -58, -36, 24, 28], [30, 68, -58, -36, 22, 28], [90, 180, -80, 80, 90, 36], [-180, -90, -80, 80, 85, 36], [90, 180, -85, -65, 30, 28], [-180, -90, -85, -65, 28, 28], [-180, -130, -75, -30, 45, 38], [130, 180, -75, -30, 42, 38]];
  const RAYS = [{ c: [-11.36, -43.31], len: 46, n: 22, a: .14, lw: 1.4 }, { c: [-20.08, 9.62], len: 28, n: 16, a: .09, lw: .9 }, { c: [-47.4, 23.7], len: 18, n: 14, a: .11, lw: .85 }, { c: [-38, 8.1], len: 17, n: 12, a: .08, lw: .80 }, { c: [129, -20], len: 14, n: 10, a: .08, lw: .75 }];
  let fs = 43219;
  const frng = () => ((fs = Math.imul(fs ^ fs >>> 17, fs | 1)) >>> 0) / 2 ** 32;
  const FC = [];
  ZONES.forEach(([lo, hi, la, lb, cnt, dm]) => {
    for (let i = 0; i < cnt; i++) {
      const lon = lo + (hi - lo) * frng(), lat = la + (lb - la) * frng(), d = 12 + frng() * (dm - 12);
      if (!ALL_MARE.some(([ml, mp, mr]) => Math.sqrt(((lon - ml) * Math.cos(mp * Math.PI / 180)) ** 2 + (lat - mp) ** 2) < mr * 0.78))
        FC.push([lon, lat, d, 0]);
    }
  });
  const ALL_C = [...NC, ...FC];

  function loadEarthSpaceModel(container, gps, timeStamp) {
    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    let virtualDate = new Date(timeStamp || Date.now());
    let isPlaying = true;
    let isFast = false;
    let onStateChange = null;
    let rafId = null;
    let gpsPulses = [];

    // --- Scene & Camera ---
    const scene = new THREE.Scene();
    const computedStyle = getComputedStyle(document.documentElement);
    const bgColor = computedStyle.getPropertyValue('--futuristic-dark').trim() || 'rgb(26, 26, 26)';
    scene.background = new THREE.Color(bgColor);

    // --- Stars ---
    const starGeo = new THREE.BufferGeometry();
    const starPoints = [];
    for (let i = 0; i < 600; i++) {
      const v = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(200),
        THREE.MathUtils.randFloatSpread(200),
        THREE.MathUtils.randFloatSpread(200)
      );
      if (v.length() < 30) v.setLength(30 + Math.random() * 50);
      starPoints.push(v);
    }
    starGeo.setFromPoints(starPoints);
    const starMat = new THREE.PointsMaterial({ color: 0x88ccff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    camera.position.set(5.5, 2.5, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.appendChild(renderer.domElement);

    const dateUi = document.createElement('div');
    dateUi.style.position = 'absolute';
    dateUi.style.bottom = '20px';
    dateUi.style.right = '20px';
    dateUi.style.color = '#ff6b6b';
    dateUi.style.fontFamily = "'Share Tech Mono', monospace";
    dateUi.style.fontSize = '16px';
    dateUi.style.fontWeight = 'bold';
    dateUi.style.textShadow = '0 0 4px rgba(255,107,107,0.5)';
    dateUi.style.pointerEvents = 'none';
    container.appendChild(dateUi);

    function updateDateUI() {
      const d = virtualDate;
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      const hour = String(d.getUTCHours()).padStart(2, '0');
      const min = String(d.getUTCMinutes()).padStart(2, '0');
      dateUi.innerText = `${day}/${month}/${year} ${hour}:${min} UTC`;
    }
    updateDateUI();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2.7;
    controls.maxDistance = 81.7;

    // --- Lights ---
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunLight.position.set(100, 0, 50);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x050505));

    // --- Sun Mesh ---
    const sunGeo = new THREE.SphereGeometry(2, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.copy(sunLight.position);
    scene.add(sunMesh);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128; glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 240, 1)');
    grad.addColorStop(0.2, 'rgba(255, 220, 100, 0.8)');
    grad.addColorStop(1, 'rgba(255, 200, 0, 0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(15, 15, 1);
    sunMesh.add(glowSprite);

    // --- Physics Parameters ---
    const EARTH_RADIUS = 2;
    const MOON_RADIUS = 0.54;
    const MOON_DIST = 4.08;
    const AXIAL_TILT = 23.44 * Math.PI / 180;
    const MOON_INCLINATION = 5.14 * Math.PI / 180;

    // --- Group Hierarchy ---
    const eclipticPlane = new THREE.Group();
    scene.add(eclipticPlane);

    const earthTiltGroup = new THREE.Group();
    earthTiltGroup.rotation.z = AXIAL_TILT;
    eclipticPlane.add(earthTiltGroup);

    const moonOrbitPlane = new THREE.Group();
    moonOrbitPlane.rotation.x = MOON_INCLINATION;
    eclipticPlane.add(moonOrbitPlane);

    // --- Earth Axis ---
    const axisPoints = [
      new THREE.Vector3(0, -EARTH_RADIUS, 0),
      new THREE.Vector3(0, EARTH_RADIUS, 0)
    ];
    const axisGeo = new THREE.BufferGeometry().setFromPoints(axisPoints);
    const axisMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
    const earthAxis = new THREE.Line(axisGeo, axisMat);
    earthTiltGroup.add(earthAxis);

    // --- Earth Gen ---
    const canvasEarth = document.createElement('canvas');
    canvasEarth.width = 2048; canvasEarth.height = 1024;
    const ctxEarth = canvasEarth.getContext('2d');
    const earthTexture = new THREE.CanvasTexture(canvasEarth);

    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    
    const earthMatBack = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.8,
      transparent: true,
      opacity: 1.0,
      side: THREE.BackSide,
      depthWrite: false
    });
    const earthMatFront = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.8,
      transparent: true,
      opacity: 1.0,
      side: THREE.FrontSide,
      depthWrite: false
    });

    const earthMeshBack = new THREE.Mesh(earthGeo, earthMatBack);
    const earthMeshFront = new THREE.Mesh(earthGeo, earthMatFront);

    const earthMesh = new THREE.Group();
    earthMesh.add(earthMeshBack);
    earthMesh.add(earthMeshFront);
    earthTiltGroup.add(earthMesh);

    function addGPSMarker(pt) {
      const lat = pt.latitude;
      const lon = pt.longitude;
      const name = pt.name;

      if (lat == null || lon == null) return;

      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);

      const x = -(EARTH_RADIUS * Math.sin(phi) * Math.cos(theta));
      const y = EARTH_RADIUS * Math.cos(phi);
      const z = EARTH_RADIUS * Math.sin(phi) * Math.sin(theta);

      const group = new THREE.Group();
      group.position.set(x, y, z);

      const markerGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff009d });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      group.add(marker);

      const p1Mat = new THREE.MeshBasicMaterial({ color: 0xff009d, transparent: true, opacity: 0, depthWrite: false });
      const p2Mat = new THREE.MeshBasicMaterial({ color: 0xff009d, transparent: true, opacity: 0, depthWrite: false });
      const p1 = new THREE.Mesh(markerGeo, p1Mat);
      const p2 = new THREE.Mesh(markerGeo, p2Mat);
      group.add(p1);
      group.add(p2);

      gpsPulses.push({ p1, p2, offset: Math.random() });

      if (name) {
        const sprite = createTextSprite(name);
        const nz = new THREE.Vector3(x, y, z).normalize();
        sprite.position.copy(nz.multiplyScalar(0.2));
        group.add(sprite);
      }
      earthMesh.add(group);
    }

    if (typeof d3 !== 'undefined' && typeof topojson !== 'undefined') {
      fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json')
        .then(res => res.json())
        .then(world => {
          const currentMap = topojson.feature(world, world.objects.countries);
          const projection = d3.geoEquirectangular().translate([1024, 512]).scale(1024 / Math.PI);
          const path = d3.geoPath(projection, ctxEarth);

          ctxEarth.clearRect(0, 0, 2048, 1024);

          ctxEarth.fillStyle = 'rgba(6, 21, 34, 0.95)';
          ctxEarth.fillRect(0, 0, 2048, 1024);

          ctxEarth.beginPath(); path(currentMap);
          ctxEarth.fillStyle = 'rgba(0, 255, 255, 1.0)';
          ctxEarth.fill();
          ctxEarth.strokeStyle = 'rgba(26, 26, 26, 0.8)'; ctxEarth.lineWidth = 1.5;
          ctxEarth.shadowColor = 'rgba(26, 26, 26, 0.5)'; ctxEarth.shadowBlur = 5;
          ctxEarth.stroke(); ctxEarth.shadowBlur = 0;

          const graticule = d3.geoGraticule()();
          ctxEarth.beginPath(); path(graticule);
          ctxEarth.strokeStyle = 'rgba(0,255,255,0.2)'; ctxEarth.lineWidth = 1.5; ctxEarth.stroke();

          ctxEarth.beginPath();
          ctxEarth.moveTo(0, 512);
          ctxEarth.lineTo(2048, 512);
          ctxEarth.strokeStyle = 'rgba(255, 179, 71, 0.8)';
          ctxEarth.lineWidth = 2.5;
          ctxEarth.stroke();

          earthTexture.needsUpdate = true;

          if (gps) {
            if (Array.isArray(gps)) gps.forEach(addGPSMarker);
            else addGPSMarker(gps);
          }
        });
    }

    // --- Moon Gen ---
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 1024; moonCanvas.height = 512;
    const mctx = moonCanvas.getContext('2d');
    mctx.fillStyle = '#888888';
    mctx.fillRect(0, 0, 1024, 512);

    if (typeof d3 !== 'undefined') {
      const mProj = d3.geoEquirectangular().translate([512, 256]).scale(1024 / (2 * Math.PI));
      const mPath = d3.geoPath(mProj, mctx);
      const mGc = d3.geoCircle();

      const spaF = mGc.center(SPA_BASIN.c).radius(SPA_BASIN.r)();
      mctx.beginPath(); mPath(spaF); mctx.fillStyle = `rgba(10,8,6,${SPA_BASIN.op})`; mctx.fill();

      ALL_MARE.forEach(([ml, mp, mr, op]) => {
        const f = mGc.center([ml, mp]).radius(mr)();
        mctx.beginPath(); mPath(f); mctx.fillStyle = `rgba(18,16,14,${op})`; mctx.fill();
      });

      RAYS.forEach(({ c, len, n, a, lw }) => {
        for (let i = 0; i < n; i++) {
          const ang = i / n * Math.PI * 2;
          const d = len * Math.PI / 180;
          const clat = c[1] * Math.PI / 180;
          const clon = c[0] * Math.PI / 180;
          const lat2 = Math.asin(Math.sin(clat) * Math.cos(d) + Math.cos(clat) * Math.sin(d) * Math.cos(ang));
          const lon2 = clon + Math.atan2(Math.sin(ang) * Math.sin(d) * Math.cos(clat), Math.cos(d) - Math.sin(clat) * Math.sin(lat2));
          const line = { type: "LineString", coordinates: [c, [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]] };
          mctx.beginPath(); mPath(line);
          mctx.strokeStyle = `rgba(234,230,218,${a})`; mctx.lineWidth = lw; mctx.stroke();
        }
      });

      ALL_C.forEach(([clon, clat, dkm, fresh]) => {
        const degRad = (dkm / 2) / 30.3;
        const f = mGc.center([clon, clat]).radius(degRad)();
        mctx.beginPath(); mPath(f);
        mctx.strokeStyle = `rgba(255,255,255,${fresh ? 0.8 : 0.4})`; mctx.lineWidth = fresh ? 1.5 : 0.8; mctx.stroke();
      });
    }

    const moonTexture = new THREE.CanvasTexture(moonCanvas);
    const moonGeo = new THREE.SphereGeometry(MOON_RADIUS, 32, 32);
    
    const moonMatBack = new THREE.MeshStandardMaterial({ color: 0xffffff, map: moonTexture, transparent: true, opacity: 0.95, side: THREE.BackSide, depthWrite: false });
    const moonMatFront = new THREE.MeshStandardMaterial({ color: 0xffffff, map: moonTexture, transparent: true, opacity: 0.95, side: THREE.FrontSide, depthWrite: false });
    
    const moonMeshBack = new THREE.Mesh(moonGeo, moonMatBack);
    const moonMeshFront = new THREE.Mesh(moonGeo, moonMatFront);

    const moonMesh = new THREE.Group();
    moonMesh.add(moonMeshBack);
    moonMesh.add(moonMeshFront);

    moonMesh.position.x = MOON_DIST;
    moonMesh.rotation.y = Math.PI / 2;
    moonOrbitPlane.add(moonMesh);

    const orbitCurve = new THREE.EllipseCurve(0, 0, MOON_DIST, MOON_DIST);
    const orbitPoints = orbitCurve.getPoints(100);
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMat = new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 0.15, gapSize: 0.15 });
    const orbitLine = new THREE.Line(orbitGeo, orbitMat);
    orbitLine.computeLineDistances();
    orbitLine.rotation.x = Math.PI / 2;
    moonOrbitPlane.add(orbitLine);

    // --- Animation ---
    const baseEarthSpeed = (2 * Math.PI) / 1440;

    function animate() {
      rafId = requestAnimationFrame(animate);

      if (isPlaying) {
        const mult = isFast ? 10 : 1;
        const speed = baseEarthSpeed * mult;
        const mSpeed = speed / 27.322;

        earthMesh.rotation.y += speed;
        moonOrbitPlane.rotation.y += mSpeed;
        moonMesh.rotation.y += mSpeed;

        // Advance virtual date: (2 * PI / 1440) per frame represents 1 minute simulated run limit.
        // 60000ms per frame matching speed logic
        virtualDate = new Date(virtualDate.getTime() + (60000 * mult));
        updateDateUI();
      }

      const now = performance.now() * 0.0006;
      gpsPulses.forEach(m => {
        const t1 = (now + m.offset) % 1;
        m.p1.scale.setScalar(1 + t1 * 6);
        m.p1.material.opacity = (1 - t1) * 0.6;

        const t2 = (now + m.offset + 0.5) % 1;
        m.p2.scale.setScalar(1 + t2 * 6);
        m.p2.material.opacity = (1 - t2) * 0.6;
      });

      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // --- Interaction / Resize ---
    function onWindowResize() {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener('resize', onWindowResize, false);

    return {
      togglePlay: () => {
        isPlaying = !isPlaying;
        if (onStateChange) onStateChange({ isPlaying, isFast });
        return isPlaying;
      },
      toggleSpeed: () => {
        isFast = !isFast;
        if (onStateChange) onStateChange({ isPlaying, isFast });
        return isFast;
      },
      destroy: () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onWindowResize);
        renderer.dispose();
        container.innerHTML = '';
      },
      set onStateChange(fn) {
        onStateChange = fn;
      }
    };
  }

  window.loadEarthSpaceModel = loadEarthSpaceModel;