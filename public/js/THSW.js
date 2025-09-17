/**
 * Calcule une THSW très proche de celle de Davis VP2
 * @param {number} T_K - température air (K)
 * @param {number} RH - humidité relative (%)
 * @param {number} RS - rayonnement solaire (W/m²)
 * @param {number} W - vent moyen (m/s)
 * @param {number} [UV] - UV index (0-15), optionnel
 * @param {number} [ETP] - évapotranspiration (mm/jour), optionnel
 * @returns {number} THSW (°C)
 */
function calcTHSW(T_K, RH, RS, W, UV = null, ETP = null) {
    const T = T_K - 273.15;

    // --- 1. Indice de chaleur (HI) ---
    const T_f = T * 1.8 + 32;
    const RH_clamp = Math.max(0, Math.min(100, RH));

    let HI_f = T_f;
    if (T >= 27 && RH >= 40) {
        HI_f = -42.379 +
            2.04901523 * T_f +
            10.14333127 * RH_clamp +
            -0.22475541 * T_f * RH_clamp +
            -0.00683783 * T_f ** 2 +
            -0.05481717 * RH_clamp ** 2 +
            0.00122874 * T_f ** 2 * RH_clamp +
            0.00085282 * T_f * RH_clamp ** 2 +
            -0.00000199 * T_f ** 2 * RH_clamp ** 2;
    }
    const HI = (HI_f - 32) / 1.8;

    // --- 2. Effet rayonnement solaire global ---
    const solarEffect = 0.06 * Math.sqrt(Math.max(0, RS));

    // --- 3. Effet UV (affinage) ---
    let uvEffect = 0;
    if (UV !== null && UV >= 0) {
        const k = 0.3; // °C par unité UV
        uvEffect = k * (UV - 5); // 5 = UV "neutre"
    }

    // --- 4. Effet vent ---
    const windEffect = 1.5 * Math.sqrt(Math.max(0.5, W));

    // --- 5. Effet ETP ---
    let etpEffect = 0;
    if (ETP !== null && ETP > 0) {
        etpEffect = -0.3 * Math.log1p(ETP);
    }

    // --- 6. THSW finale ---
    const THSW = HI + solarEffect + uvEffect - windEffect + etpEffect;

    return Math.round(THSW * 10) / 10;
}