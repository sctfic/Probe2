/**
 * Calcule une THSW très proche de celle de Davis VP2
 * Basé sur l'algorithme de Steadman modifié par Davis Instruments
 * 
 * @param {number} T_K - température air (K)
 * @param {number} RH - humidité relative (%)
 * @param {number} RS - rayonnement solaire (W/m²)
 * @param {number} W - vent moyen (m/s)
 * @returns {number} THSW (K)
 */
function calcTHSW(T_K, RH, RS, W) {
    // Conversion température en Celsius et Fahrenheit
    const T_C = T_K - 273.15;
    const T_F = T_C * 9/5 + 32;
    
    // 1. Calcul du Heat Index (HI) si applicable
    let HI_F = T_F;
    
    if (T_F >= 80) {
        // Formule complète du Heat Index de Rothfusz
        HI_F = -42.379 
            + 2.04901523 * T_F 
            + 10.14333127 * RH 
            - 0.22475541 * T_F * RH 
            - 6.83783e-3 * T_F * T_F 
            - 5.481717e-2 * RH * RH 
            + 1.22874e-3 * T_F * T_F * RH 
            + 8.5282e-4 * T_F * RH * RH 
            - 1.99e-6 * T_F * T_F * RH * RH;
        
        // Ajustements pour conditions extrêmes
        if (RH < 13 && T_F >= 80 && T_F <= 112) {
            const adjustment = ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T_F - 95)) / 17);
            HI_F -= adjustment;
        } else if (RH > 85 && T_F >= 80 && T_F <= 87) {
            const adjustment = ((RH - 85) / 10) * ((87 - T_F) / 5);
            HI_F += adjustment;
        }
        
        // Si le HI calculé est inférieur à la température, utiliser la température
        if (HI_F < T_F) {
            HI_F = T_F;
        }
    }
    
    // 2. Calcul du Wind Chill si applicable
    let WC_F = T_F;
    const W_mph = W * 2.23694; // Conversion m/s en mph
    
    if (T_F <= 50 && W_mph >= 3) {
        WC_F = 35.74 + 0.6215 * T_F - 35.75 * Math.pow(W_mph, 0.16) + 0.4275 * T_F * Math.pow(W_mph, 0.16);
        
        // Ne pas descendre en dessous de la température réelle
        if (WC_F > T_F) {
            WC_F = T_F;
        }
    }
    
    // 3. Déterminer la température de base (HI ou WC)
    let baseTemp_F;
    
    if (T_F >= 80) {
        baseTemp_F = HI_F;
    } else if (T_F <= 50 && W_mph >= 3) {
        baseTemp_F = WC_F;
    } else {
        baseTemp_F = T_F;
    }
    
    // 4. Ajustement solaire
    let solarAdjustment_F = 0;
    
    if (RS > 0) {
        // Calcul de l'élévation solaire théorique maximale
        // Ici on utilise une approximation, dans la réalité il faudrait la latitude et l'heure
        const maxSolarElevation = 90; // Approximation
        const currentElevation = Math.min(90, maxSolarElevation * (RS / 1000));
        
        // Facteur d'absorption basé sur les conditions
        let absorptionFactor = 0.065; // Valeur de base
        
        // Ajuster selon l'humidité (air plus sec = plus d'effet solaire)
        if (RH < 50) {
            absorptionFactor += (50 - RH) * 0.0005;
        }
        
        // Ajuster selon le vent (moins de vent = plus d'effet solaire)
        if (W < 2) {
            absorptionFactor += (2 - W) * 0.01;
        }
        
        // Calcul de l'ajustement solaire en Fahrenheit
        solarAdjustment_F = RS * absorptionFactor * (currentElevation / 90);
        
        // Limiter l'ajustement solaire maximum
        solarAdjustment_F = Math.min(solarAdjustment_F, 25); // Maximum 25°F d'ajout
        
        // Réduire l'effet solaire si venteux
        if (W_mph > 10) {
            solarAdjustment_F *= Math.max(0.3, 1 - (W_mph - 10) * 0.05);
        }
    }
    
    // 5. Calcul final THSW
    const THSW_F = baseTemp_F + solarAdjustment_F;
    
    // 6. Conversion en Celsius
    const THSW_C = (THSW_F - 32) * 5/9;
    
    return Math.round((THSW_C +273.15) * 10) / 10; // Arrondi à 0.1°C près
}

// Fonctions utilitaires supplémentaires

/**
 * Calcule le Heat Index seul
 * @param {number} T_C - température (°C)
 * @param {number} RH - humidité relative (%)
 * @returns {number} Heat Index (°C)
 */
function calcHeatIndex(T_C, RH) {
    const T_F = T_C * 9/5 + 32;
    
    if (T_F < 80) {
        return T_C;
    }
    
    let HI_F = -42.379 
        + 2.04901523 * T_F 
        + 10.14333127 * RH 
        - 0.22475541 * T_F * RH 
        - 6.83783e-3 * T_F * T_F 
        - 5.481717e-2 * RH * RH 
        + 1.22874e-3 * T_F * T_F * RH 
        + 8.5282e-4 * T_F * RH * RH 
        - 1.99e-6 * T_F * T_F * RH * RH;
    
    if (RH < 13 && T_F >= 80 && T_F <= 112) {
        const adjustment = ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T_F - 95)) / 17);
        HI_F -= adjustment;
    } else if (RH > 85 && T_F >= 80 && T_F <= 87) {
        const adjustment = ((RH - 85) / 10) * ((87 - T_F) / 5);
        HI_F += adjustment;
    }
    
    return Math.round((HI_F - 32) * 5/9 * 10) / 10;
}

/**
 * Calcule le Wind Chill seul
 * @param {number} T_C - température (°C)
 * @param {number} W - vitesse du vent (m/s)
 * @returns {number} Wind Chill (°C)
 */
function calcWindChill(T_C, W) {
    const T_F = T_C * 9/5 + 32;
    const W_mph = W * 2.23694;
    
    if (T_F > 50 || W_mph < 3) {
        return T_C;
    }
    
    const WC_F = 35.74 + 0.6215 * T_F - 35.75 * Math.pow(W_mph, 0.16) + 0.4275 * T_F * Math.pow(W_mph, 0.16);
    
    return Math.round((WC_F - 32) * 5/9 * 10) / 10;
}

/**
 * Détermine le niveau de confort basé sur THSW
 * @param {number} thsw - valeur THSW (°C)
 * @returns {object} niveau et description
 */
function getComfortLevel(thsw) {
    if (thsw < -40) return { level: 'danger-extreme-cold', desc: 'Danger extrême - Froid' };
    if (thsw < -30) return { level: 'danger-cold', desc: 'Danger - Très froid' };
    if (thsw < -20) return { level: 'very-cold', desc: 'Extrêmement froid' };
    if (thsw < -10) return { level: 'cold', desc: 'Très froid' };
    if (thsw < 0) return { level: 'chilly', desc: 'Froid' };
    if (thsw < 10) return { level: 'cool', desc: 'Frais' };
    if (thsw < 20) return { level: 'comfortable-cool', desc: 'Confortable frais' };
    if (thsw < 26) return { level: 'comfortable', desc: 'Confortable' };
    if (thsw < 32) return { level: 'comfortable-warm', desc: 'Confortable chaud' };
    if (thsw < 38) return { level: 'hot', desc: 'Chaud' };
    if (thsw < 46) return { level: 'very-hot', desc: 'Très chaud' };
    if (thsw < 54) return { level: 'danger-hot', desc: 'Danger - Chaleur extrême' };
    return { level: 'danger-extreme-hot', desc: 'Danger extrême - Chaleur' };
}
