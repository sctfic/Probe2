// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const funcs = factory();
        for (const key in funcs) {
            root[key] = funcs[key];
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function waterInAir(T, RH, P = 1013.25) {
        // Constantes
        const R_v = 461.5; // Constante spécifique de la vapeur d'eau (J/kg·K)
        const R_d = 287.0; // Constante spécifique de l'air sec (J/kg·K)
        const M_w = 18.016; // Masse molaire de l'eau (g/mol)
        const M_d = 28.964; // Masse molaire de l'air sec (g/mol)
        
        // Calcul de la pression de vapeur saturante selon la formule de Magnus
        // Valide pour -40°C à +50°C (233K à 323K)
        const T_celsius = T - 273.15;
        let e_sat;
        
        if (T_celsius >= 0) {
            // Formule pour T >= 0°C (au-dessus de l'eau)
            e_sat = 6.112 * Math.exp((17.67 * T_celsius) / (T_celsius + 243.5));
        } else {
            // Formule pour T < 0°C (au-dessus de la glace)
            e_sat = 6.112 * Math.exp((22.46 * T_celsius) / (T_celsius + 272.62));
        }
        
        // Pression de vapeur réelle
        const e = (RH / 100) * e_sat;
        
        // 1. Masse volumique de la vapeur d'eau (g/m³)
        // Loi des gaz parfaits : ρ_v = e / (R_v * T)
        // Conversion : e en Pa, résultat en kg/m³, puis en g/m³
        const rho_v = (e * 100) / (R_v * T); // kg/m³
        const g_per_m3 = rho_v * 1000; // g/m³
        
        // 2. Rapport de mélange (g/kg d'air sec)
        // w = 0.622 * e / (P - e)
        // Facteur 0.622 = M_w / M_d
        const mixing_ratio = 0.622 * e / (P - e);
        const g_per_kg = mixing_ratio * 1000; // g/kg
        
        // 3. Fraction volumique (ppm)
        // Pour les gaz parfaits : fraction molaire = fraction volumique
        // x_v = e / P
        const volume_fraction = e / P;
        const ppm = volume_fraction * 1e6; // conversion en ppm
        
        return {
            g_per_m3: Math.round(g_per_m3 * 100) / 100,     // arrondi à 2 décimales
            g_per_kg: Math.round(g_per_kg * 100) / 100,      // arrondi à 2 décimales
            ppm: Math.round(ppm * 10) / 10                   // arrondi à 1 décimale
        };
    }

    return {
        waterInAir
    };
}));
