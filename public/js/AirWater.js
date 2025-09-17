/**
 * Quantité massique (et volumique) d'eau sous forme de vapeur dans l'air
 * -----------------------------------------------------------------------
 *  - T  en °C
 *  - RH en % (0-100)
 *  - P  en hPa (200...5 000 hPa pour travaux en chambre hyper/hypo-barique)
 *
 * Retour
 *   g_per_m3 : grammes d'eau par m³ d'air
 *   L_per_m3 : litres d'eau liquide équivalent par m³ d'air
 *
 * Théorie
 * --------
 * 1) Pression de saturation eₛ (hPa) – formule Magnus-Tetens
 *    eₛ = 6,112 · exp[ 17,67·T / (T + 243,5) ]
 *    (erreur < 0,4 % entre -40 °C et +50 °C)
 *
 * 2) Pression partielle de vapeur e (hPa)
 *    e = (RH / 100) · eₛ
 *
 * 3) Masse volumique de la vapeur (loi des gaz parfaits)
 *    ρᵥ = (Mᵥ · e) / (Rᵥ · T_K)   avec
 *         Mᵥ = 18,015 g/mol       masse molaire eau
 *         R  = 8,314  J·mol⁻¹·K⁻¹
 *         T_K= T + 273,15 K
 *    En remplaçant les constantes et en convertissant e (hPa) → Pa :
 *    ρᵥ = 216,7 · e / T_K        [g/m³]
 *    (216,7 = 10² · Mᵥ / R ; 10² car 1 hPa = 100 Pa)
 *
 * 4) Influence de la pression totale P
 *    La formule ci-dessus est indépendante de P : la concentration
 *    massique en vapeur (g/m³) ne dépend que de e et de T.
 *    En revanche, pour les protocoles expérimentaux on peut souhaiter
 *    connaître la fraction massique ou volumique dans l'air total.
 *    On fournit donc aussi :
 *    - ρ_air  (masse volumique de l'air sec + vapeur) à P et T
 *    - w      rapport massique vapeur/air (g/kg)
 *    - x      fraction volumique (ppm, 0-1)
 *
 * 5) Volume liquide équivalent
 *    1 kg d'eau vapeur ⇔ 1 L d'eau liquide (ρ_liq ≈ 1 kg/L)
 *    L_per_m3 = ρᵥ / 1000
 */
function waterInAir(T, RH, P = 1013.25) {
    // 1. pression de saturation (hPa)
    const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5));

    // 2. pression partielle vapeur (hPa)
    const e = (RH / 100) * es;

    // 3. masse volumique vapeur (g/m³)
    const T_K = T + 273.15;
    const g_per_m3 = (216.7 * e) / T_K;

    // 4. volume liquide équivalent (L/m³)
    const L_per_m3 = g_per_m3 / 1000;

    // 5. grandeur complémentaires dépendant de P
    const P_Pa = P * 100; // hPa → Pa
    const Rd = 287.05;    // J·kg⁻¹·K⁻¹  (air sec)
    const Rv = 461.5;     // J·kg⁻¹·K⁻¹  (vapeur)
    const eps = 0.622;    // Mᵥ/M_air

    // masse volumique air sec
    const rho_d = (P_Pa - e * 100) / (Rd * T_K);
    // masse volumique vapeur
    const rho_v = (e * 100) / (Rv * T_K);
    // air humide total
    const rho_air = rho_d + rho_v;

    // rapport massique (g/kg)
    const w = 1000 * rho_v / rho_air;

    // fraction volumique (ppm)
    const x = rho_v / rho_air;

    return {
        g_per_m3: Math.round(g_per_m3 * 100) / 100,
        L_per_m3: Math.round(L_per_m3 * 1000) / 1000,
        rho_air: Math.round(rho_air * 100) / 100, // kg/m³, avec prise en compte de la pression
        w: Math.round(w * 10) / 10,              // g/kg, avec prise en compte de la pression
        x: Math.round(x * 1e6) / 1e6              // 0-1 (ppm si ×1e6), avec prise en compte de la pression 
    };
}