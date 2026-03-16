/**
 * @file solarLunarPaths.js
 * @description Génère les trajectoires solaires et lunaires en SVG
 * @author LOPEZ Alban
 * @license AGPL
 */

class SolarLunarPaths {
    constructor(container, data) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        if (!this.container) {
            throw new Error(`Container not found`);
        }

        this.timestamp = new Date(data.timestamp);
        this.latitude = data.gps.latitude;
        this.longitude = data.gps.longitude;
        this.altitude = data.gps.altitude || 0;

        this.width = this.container.clientWidth || 400;
        this.height = this.container.clientHeight || 300;
        this.padding = 40;

        // Couleurs du thème futuriste
        this.colors = {
            sun: '#ffb347',      // futuristic-amber
            moon: '#d4c9ff',     // lune
            horizon: 'rgba(0, 255, 255, 0.3)',
            grid: 'rgba(0, 255, 255, 0.1)',
            text: 'rgba(0, 255, 255, 0.5)',
            cardinal: '#00ffff'  // futuristic-cyan
        };
    }

    /**
     * Convertit les coordonnées équatoriales en horizontales (azimuth, altitude)
     */
    _equatorialToHorizontal(ra, dec, lat, lon, date) {
        const jd = this._julianDay(date);
        const lst = this._localSiderealTime(jd, lon);
        const ha = lst - ra;

        const latRad = this._toRad(lat);
        const decRad = this._toRad(dec);
        const haRad = this._toRad(ha);

        const sinAlt = Math.sin(decRad) * Math.sin(latRad) +
            Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
        const altitude = this._toDeg(Math.asin(sinAlt));

        const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
            (Math.cos(latRad) * Math.cos(this._toRad(altitude)));
        let azimuth = this._toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));

        if (Math.sin(haRad) > 0) {
            azimuth = 360 - azimuth;
        }

        return { azimuth, altitude };
    }

    /**
     * Calcule la position du Soleil
     */
    _sunPosition(date, lat, lon) {
        const jd = this._julianDay(date);
        const n = jd - 2451545.0;

        // Longitude moyenne du Soleil
        let L = (280.460 + 0.9856474 * n) % 360;
        if (L < 0) L += 360;

        // Anomalie moyenne
        let g = (357.528 + 0.9856003 * n) % 360;
        if (g < 0) g += 360;

        // Longitude écliptique
        const lambda = L + 1.915 * Math.sin(this._toRad(g)) +
            0.020 * Math.sin(this._toRad(2 * g));

        // Obliquité de l'écliptique
        const epsilon = 23.439 - 0.0000004 * n;

        // Ascension droite et déclinaison
        let ra = this._toDeg(Math.atan2(
            Math.cos(this._toRad(epsilon)) * Math.sin(this._toRad(lambda)),
            Math.cos(this._toRad(lambda))
        ));
        if (ra < 0) ra += 360;

        const dec = this._toDeg(Math.asin(
            Math.sin(this._toRad(epsilon)) * Math.sin(this._toRad(lambda))
        ));

        return this._equatorialToHorizontal(ra, dec, lat, lon, date);
    }

    /**
     * Calcule la position de la Lune (simplifié mais précis)
     */
    _moonPosition(date, lat, lon) {
        const jd = this._julianDay(date);
        const T = (jd - 2451545.0) / 36525.0;

        // Longitude moyenne de la Lune
        const Lp = 218.316 + 13.176396 * T * 36525;

        // Anomalie moyenne du Soleil
        const M = 357.52911 + 35999.05029 * T;

        // Anomalie moyenne de la Lune
        const Mp = 134.963 + 13.064993 * T * 36525;

        // Élongation moyenne de la Lune
        const D = 297.850 + 12.190749 * T * 36525;

        // Distance de la Lune au noeud ascendant
        const F = 93.272 + 13.229350 * T * 36525;

        // Corrections pour la longitude
        let lambda = Lp + 6.289 * Math.sin(this._toRad(Mp));
        lambda += 1.274 * Math.sin(this._toRad(2 * D - Mp));
        lambda += 0.658 * Math.sin(this._toRad(2 * D));
        lambda += 0.214 * Math.sin(this._toRad(2 * Mp));
        lambda += -0.186 * Math.sin(this._toRad(M));
        lambda += -0.114 * Math.sin(this._toRad(2 * F));

        // Latitude
        let beta = 5.128 * Math.sin(this._toRad(F));
        beta += 0.281 * Math.sin(this._toRad(Mp + F));
        beta += 0.278 * Math.sin(this._toRad(Mp - F));

        // Parallaxe et distance
        const pi = 0.9508 + 0.0518 * Math.cos(this._toRad(Mp));
        const delta = 6378.14 / Math.sin(this._toRad(pi));

        // Ascension droite et déclinaison
        const epsilon = 23.439 - 0.0000004 * T * 36525;

        let ra = this._toDeg(Math.atan2(
            Math.sin(this._toRad(lambda)) * Math.cos(this._toRad(epsilon)) -
            Math.tan(this._toRad(beta)) * Math.sin(this._toRad(epsilon)),
            Math.cos(this._toRad(lambda))
        ));
        if (ra < 0) ra += 360;

        const dec = this._toDeg(Math.asin(
            Math.sin(this._toRad(beta)) * Math.cos(this._toRad(epsilon)) +
            Math.cos(this._toRad(beta)) * Math.sin(this._toRad(epsilon)) *
            Math.sin(this._toRad(lambda))
        ));

        return this._equatorialToHorizontal(ra, dec, lat, lon, date);
    }

    /**
     * Génère les points de la trajectoire pour une journée
     */
    _generatePath(getPosition, date, samples = 48) {
        const points = [];
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        for (let i = 0; i <= samples; i++) {
            const currentTime = new Date(startOfDay.getTime() + (i / samples) * 24 * 60 * 60 * 1000);
            const pos = getPosition(currentTime, this.latitude, this.longitude);

            // Ne garder que les positions au-dessus de l'horizon
            if (pos.altitude > -6) { // -6° pour le crépuscule civil
                points.push({
                    azimuth: pos.azimuth,
                    altitude: pos.altitude,
                    time: currentTime
                });
            }
        }

        return points;
    }

    /**
     * Convertit les coordonnées azimuth/altitude en coordonnées SVG
     * Projection stéréographique ou simple
     */
    _toSVG(azimuth, altitude, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - this.padding;

        // Azimuth: 0° = Nord, 90° = Est, 180° = Sud, 270° = Ouest
        // On inverse pour avoir le Nord en haut
        const angle = this._toRad((azimuth - 90) * -1);

        // Altitude: 90° = zénith (centre), 0° = horizon (bord)
        // Distance depuis le centre proportionnelle à (90 - altitude)
        const r = radius * (1 - altitude / 90);

        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);

        return { x, y, r };
    }

    /**
     * Crée le path SVG à partir des points
     */
    _createPath(points, closed = false) {
        if (points.length < 2) return '';

        let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

        for (let i = 1; i < points.length; i++) {
            // Ligne droite ou courbe de Bézier pour lisser
            d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
        }

        if (closed && points.length > 2) {
            d += ' Z';
        }

        return d;
    }

    /**
     * Génère le SVG complet
     */
    generate() {
        // Vider le container
        this.container.innerHTML = '';

        // Recalculer les dimensions
        this.width = this.container.clientWidth || 400;
        this.height = this.container.clientHeight || 300;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
        svg.style.display = 'block';

        // Définitions pour les gradients
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

        // Gradient Soleil
        const sunGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        sunGradient.setAttribute('id', 'sunGradient');
        sunGradient.innerHTML = `
            <stop offset="0%" stop-color="${this.colors.sun}" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="${this.colors.sun}" stop-opacity="0"/>
        `;
        defs.appendChild(sunGradient);

        // Gradient Lune
        const moonGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        moonGradient.setAttribute('id', 'moonGradient');
        moonGradient.innerHTML = `
            <stop offset="0%" stop-color="${this.colors.moon}" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="${this.colors.moon}" stop-opacity="0"/>
        `;
        defs.appendChild(moonGradient);

        svg.appendChild(defs);

        // Groupe principal
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Cercle horizon
        const horizonRadius = Math.min(this.width, this.height) / 2 - this.padding;
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        const horizon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        horizon.setAttribute('cx', centerX);
        horizon.setAttribute('cy', centerY);
        horizon.setAttribute('r', horizonRadius);
        horizon.setAttribute('fill', 'none');
        horizon.setAttribute('stroke', this.colors.horizon);
        horizon.setAttribute('stroke-width', '2');
        horizon.setAttribute('stroke-dasharray', '5,5');
        g.appendChild(horizon);

        // Lignes cardinales
        const cardinals = [
            { label: 'N', angle: 0, x: centerX, y: centerY - horizonRadius - 15 },
            { label: 'E', angle: 90, x: centerX + horizonRadius + 15, y: centerY },
            { label: 'S', angle: 180, x: centerX, y: centerY + horizonRadius + 15 },
            { label: 'W', angle: 270, x: centerX - horizonRadius - 15, y: centerY }
        ];

        cardinals.forEach(card => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const angle = this._toRad(card.angle - 90);
            line.setAttribute('x1', centerX + horizonRadius * 0.9 * Math.cos(angle));
            line.setAttribute('y1', centerY + horizonRadius * 0.9 * Math.sin(angle));
            line.setAttribute('x2', centerX + horizonRadius * 1.05 * Math.cos(angle));
            line.setAttribute('y2', centerY + horizonRadius * 1.05 * Math.sin(angle));
            line.setAttribute('stroke', this.colors.grid);
            line.setAttribute('stroke-width', '1');
            g.appendChild(line);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', card.x);
            text.setAttribute('y', card.y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', this.colors.cardinal);
            text.setAttribute('font-family', 'Share Tech Mono, monospace');
            text.setAttribute('font-size', '12');
            text.setAttribute('font-weight', 'bold');
            text.textContent = card.label;
            g.appendChild(text);
        });

        // Cercles d'altitude (30°, 60°)
        [30, 60].forEach(alt => {
            const r = horizonRadius * (1 - alt / 90);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', centerX);
            circle.setAttribute('cy', centerY);
            circle.setAttribute('r', r);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', this.colors.grid);
            circle.setAttribute('stroke-width', '0.5');
            circle.setAttribute('stroke-dasharray', '2,4');
            g.appendChild(circle);

            // Label d'altitude
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', centerX + r);
            label.setAttribute('y', centerY - 5);
            label.setAttribute('fill', this.colors.text);
            label.setAttribute('font-family', 'Share Tech Mono, monospace');
            label.setAttribute('font-size', '8');
            label.textContent = `${alt}°`;
            g.appendChild(label);
        });

        // Générer la trajectoire solaire
        const sunPoints = this._generatePath(
            (d, lat, lon) => this._sunPosition(d, lat, lon),
            this.timestamp
        ).map(p => ({
            ...p,
            ...this._toSVG(p.azimuth, p.altitude, this.width, this.height)
        }));

        // Générer la trajectoire lunaire
        const moonPoints = this._generatePath(
            (d, lat, lon) => this._moonPosition(d, lat, lon),
            this.timestamp
        ).map(p => ({
            ...p,
            ...this._toSVG(p.azimuth, p.altitude, this.width, this.height)
        }));

        // Dessiner la trajectoire solaire
        if (sunPoints.length > 1) {
            const sunPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            sunPath.setAttribute('d', this._createPath(sunPoints));
            sunPath.setAttribute('fill', 'none');
            sunPath.setAttribute('stroke', this.colors.sun);
            sunPath.setAttribute('stroke-width', '2');
            sunPath.setAttribute('stroke-linecap', 'round');
            sunPath.setAttribute('stroke-linejoin', 'round');
            g.appendChild(sunPath);

            // Zone sous la trajectoire (jour)
            const sunArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const areaD = this._createPath(sunPoints) +
                ` L ${centerX} ${centerY + horizonRadius} L ${centerX} ${centerY - horizonRadius} Z`;
            sunArea.setAttribute('d', areaD);
            sunArea.setAttribute('fill', this.colors.sun);
            sunArea.setAttribute('fill-opacity', '0.1');
            sunArea.setAttribute('stroke', 'none');
            g.appendChild(sunArea);

            // Position actuelle du soleil
            const currentSun = this._sunPosition(this.timestamp, this.latitude, this.longitude);
            if (currentSun.altitude > -6) {
                const sunPos = this._toSVG(currentSun.azimuth, Math.max(0, currentSun.altitude),
                    this.width, this.height);

                const sunGlow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                sunGlow.setAttribute('cx', sunPos.x);
                sunGlow.setAttribute('cy', sunPos.y);
                sunGlow.setAttribute('r', '15');
                sunGlow.setAttribute('fill', 'url(#sunGradient)');
                g.appendChild(sunGlow);

                const sunDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                sunDot.setAttribute('cx', sunPos.x);
                sunDot.setAttribute('cy', sunPos.y);
                sunDot.setAttribute('r', '4');
                sunDot.setAttribute('fill', this.colors.sun);
                sunDot.setAttribute('stroke', '#fff');
                sunDot.setAttribute('stroke-width', '1');
                g.appendChild(sunDot);
            }
        }

        // Dessiner la trajectoire lunaire
        if (moonPoints.length > 1) {
            const moonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            moonPath.setAttribute('d', this._createPath(moonPoints));
            moonPath.setAttribute('fill', 'none');
            moonPath.setAttribute('stroke', this.colors.moon);
            moonPath.setAttribute('stroke-width', '2');
            moonPath.setAttribute('stroke-linecap', 'round');
            moonPath.setAttribute('stroke-linejoin', 'round');
            moonPath.setAttribute('stroke-dasharray', '5,3');
            g.appendChild(moonPath);

            // Position actuelle de la lune
            const currentMoon = this._moonPosition(this.timestamp, this.latitude, this.longitude);
            if (currentMoon.altitude > -6) {
                const moonPos = this._toSVG(currentMoon.azimuth, Math.max(0, currentMoon.altitude),
                    this.width, this.height);

                const moonGlow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                moonGlow.setAttribute('cx', moonPos.x);
                moonGlow.setAttribute('cy', moonPos.y);
                moonGlow.setAttribute('r', '12');
                moonGlow.setAttribute('fill', 'url(#moonGradient)');
                g.appendChild(moonGlow);

                const moonDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                moonDot.setAttribute('cx', moonPos.x);
                moonDot.setAttribute('cy', moonPos.y);
                moonDot.setAttribute('r', '3');
                moonDot.setAttribute('fill', this.colors.moon);
                moonDot.setAttribute('stroke', '#fff');
                moonDot.setAttribute('stroke-width', '1');
                g.appendChild(moonDot);
            }
        }

        // Info texte
        const info = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        info.setAttribute('x', 10);
        info.setAttribute('y', this.height - 10);
        info.setAttribute('fill', this.colors.text);
        info.setAttribute('font-family', 'Share Tech Mono, monospace');
        info.setAttribute('font-size', '9');
        info.textContent = `Lat: ${this.latitude.toFixed(3)}° | Lon: ${this.longitude.toFixed(3)}° | ${this.timestamp.toLocaleDateString()}`;
        g.appendChild(info);

        svg.appendChild(g);
        this.container.appendChild(svg);

        return svg;
    }

    // Helpers mathématiques
    _toRad(deg) { return deg * Math.PI / 180; }
    _toDeg(rad) { return rad * 180 / Math.PI; }

    _julianDay(date) {
        const msPerDay = 86400000;
        return 2440587.5 + date.getTime() / msPerDay;
    }

    _localSiderealTime(jd, lon) {
        const T = (jd - 2451545.0) / 36525.0;
        let lst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
            0.000387933 * T * T - T * T * T / 38710000;
        lst = (lst + lon) % 360;
        if (lst < 0) lst += 360;
        return lst;
    }

    /**
     * Met à jour les données et régénère le SVG
     */
    update(data) {
        this.timestamp = new Date(data.timestamp);
        this.latitude = data.gps.latitude;
        this.longitude = data.gps.longitude;
        this.altitude = data.gps.altitude || 0;
        return this.generate();
    }

    /**
     * Redimensionne le SVG (à appeler si le container change de taille)
     */
    resize() {
        return this.generate();
    }
}

/**
 * Fonction utilitaire pour charger les trajectoires
 * @param {string} containerId - ID du container HTML
 * @param {object} data - Données avec timestamp et gps
 * @returns {SolarLunarPaths} Instance de la classe
 */
function loadPath(containerId, data) {
    const instance = new SolarLunarPaths(containerId, data);
    instance.generate();
    return instance;
}

// Export pour module ou global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SolarLunarPaths, loadPath };
} else {
    window.SolarLunarPaths = SolarLunarPaths;
    window.loadPath = loadPath;
}