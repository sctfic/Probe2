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

    // Fonctions utilitaires
    function kelvinToCelsius(k) {
        return k - 273.15;
    }

    function parseDate(dateString) {
        return new Date(dateString);
    }

    function getDaysBetween(date1, date2) {
        return Math.abs(date1 - date2) / (1000 * 60 * 60 * 24);
    }

    function calculateLinearRegression(data) {
        if (data.length < 2) return 0;

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = data.length;

        for (let i = 0; i < n; i++) {
            const x = i;
            const y = data[i].temp;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }

    function calculateStandardDeviation(arr) {
        if (arr.length < 2) return 1;
        const mean = arr.reduce((a, b) => a + b) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length - 1);
        return Math.sqrt(variance);
    }

    function filterLastDays(data, days) {
        if (data.length === 0) return [];

        const now = new Date();
        const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        return data.filter(item => {
            const itemDate = parseDate(item.d);
            return itemDate >= cutoffDate;
        });
    }

    function getForecastForPeriod(forecastData, startHours, endHours) {
        if (!forecastData || forecastData.length === 0) return null;

        const now = new Date();
        const startTime = new Date(now.getTime() + startHours * 60 * 60 * 1000);
        const endTime = new Date(now.getTime() + endHours * 60 * 60 * 1000);

        const relevantForecasts = forecastData.filter(item => {
            const itemDate = parseDate(item.d);
            return itemDate >= startTime && itemDate <= endTime;
        });

        if (relevantForecasts.length === 0) return null;

        // Calculer les moyennes pour la période
        const temps = relevantForecasts
            .filter(item => item["temperature:outTemp"] !== undefined)
            .map(item => kelvinToCelsius(item["temperature:outTemp"]));

        const irradiances = relevantForecasts
            .filter(item => item["irradiance:solar"] !== undefined)
            .map(item => item["irradiance:solar"]);

        return {
            avgTemp: temps.length > 0 ? temps.reduce((a, b) => a + b) / temps.length : null,
            avgIrradiance: irradiances.length > 0 ? irradiances.reduce((a, b) => a + b) / irradiances.length : null,
            count: relevantForecasts.length
        };
    }

    // Fonction principale
    function consigneAjustee_calc(data, Tcth, dT = 3, inerti = 12) {
        // 1. Extraire les données historiques (10 derniers jours)
        const historique10jours = filterLastDays(data.data || [], 10);

        if (historique10jours.length === 0) {
            console.warn("Pas de données historiques pour 10 jours");
            return Tcth;
        }

        // 2. Calculer les statistiques historiques
        const tempsInterieurs = historique10jours
            .filter(item => item["temperature:inTemp"] !== undefined)
            .map(item => kelvinToCelsius(item["temperature:inTemp"]));

        const tempsExterieurs = historique10jours
            .filter(item => item["temperature:outTemp"] !== undefined)
            .map(item => kelvinToCelsius(item["temperature:outTemp"]));

        if (tempsInterieurs.length === 0 || tempsExterieurs.length === 0) {
            console.warn("Données de température incomplètes");
            return Tcth;
        }

        const Tint_moyenne_10j = tempsInterieurs.reduce((a, b) => a + b) / tempsInterieurs.length;
        const Text_moyenne_10j = tempsExterieurs.reduce((a, b) => a + b) / tempsExterieurs.length;
        const delta_T_historique = Tint_moyenne_10j - Text_moyenne_10j;

        // 3. Calculer la tendance saisonnière
        const tendanceData = tempsExterieurs.map((temp, index) => ({ temp, index }));
        const penteTendance = calculateLinearRegression(tendanceData);
        const ecartTypeTemp = calculateStandardDeviation(tempsExterieurs);
        const tendanceNormalisee = ecartTypeTemp > 0 ? penteTendance / ecartTypeTemp : 0;

        // 4. Déterminer l'état thermique actuel
        let etat;
        if (Tint_moyenne_10j > Tcth + dT) {
            etat = "besoin_rafraichissement";
        } else if (Tint_moyenne_10j < Tcth - dT) {
            etat = "besoin_chauffage";
        } else {
            etat = "confort";
        }

        // 5. Obtenir les prévisions pour la période d'inertie (12-24h)
        const forecastData = data.forecast || [];
        const previsions = getForecastForPeriod(forecastData, inerti, inerti + 12);

        // 6. Calculer la consigne de base avec ajustement saisonnier
        let Tconsigne = Tcth;
        const coefficientSaison = 0.5; // Coefficient d'ajustement saisonnier

        // Ajustement basé sur la tendance
        Tconsigne += tendanceNormalisee * coefficientSaison * dT;

        // 7. Ajuster selon l'état et les prévisions
        if (previsions && previsions.avgTemp !== null) {
            const TempPrevue = previsions.avgTemp;

            switch (etat) {
                case "besoin_rafraichissement":
                    if (TempPrevue < Tcth - dT) {
                        // Demain froid, on vise la consigne normale
                        Tconsigne = Tcth;
                    } else if (TempPrevue > Tcth + dT) {
                        // Demain chaud, on anticipe en refroidissant plus
                        Tconsigne = Tcth - dT;
                    } else {
                        // Situation intermédiaire
                        Tconsigne = Tcth - (dT * tendanceNormalisee);
                    }
                    break;

                case "besoin_chauffage":
                    if (TempPrevue < Tcth - dT) {
                        // Demain froid, on anticipe en chauffant plus
                        Tconsigne = Tcth + dT;
                    } else if (TempPrevue > Tcth + dT) {
                        // Demain chaud, on vise la consigne normale
                        Tconsigne = Tcth;
                    } else {
                        // Situation intermédiaire
                        Tconsigne = Tcth + (dT * tendanceNormalisee);
                    }
                    break;

                case "confort":
                    // Ajustement basé sur la tendance et les prévisions
                    const ecartPrevision = TempPrevue - Tcth;
                    const facteurAjustement = Math.min(Math.abs(ecartPrevision) / dT, 1);

                    if (TempPrevue > Tcth) {
                        Tconsigne -= facteurAjustement * dT * 0.5;
                    } else {
                        Tconsigne += facteurAjustement * dT * 0.5;
                    }
                    break;
            }

            // 8. Ajustement basé sur l'irradiance solaire
            if (previsions.avgIrradiance !== null && previsions.avgIrradiance > 200) {
                // Fort ensoleillement prévu -> on peut baisser la consigne
                const ajustementIrradiance = Math.min(previsions.avgIrradiance / 500, 1) * 2;
                Tconsigne -= ajustementIrradiance;
            }
        }

        // 9. Appliquer les limites de sécurité
        Tconsigne = Math.max(Tcth - dT, Math.min(Tcth + dT, Tconsigne));

        // 10. Lissage pour prendre en compte l'inertie
        // (Pour une version avancée, on pourrait mémoriser la consigne précédente)

        // 11. Arrondir à 0.5°C près pour plus de lisibilité
        Tconsigne = Math.round(Tconsigne * 2) / 2;

        // Retourner également des informations de débogage
        return {
            consigne: Tconsigne,
            etat: etat,
            stats: {
                Tint_moyenne: Tint_moyenne_10j,
                Text_moyenne: Text_moyenne_10j,
                delta_T: delta_T_historique,
                tendance: penteTendance,
                previsions: previsions
            }
        };
    }

    // Fonction supplémentaire pour calculer la période optimale de ventilation
    function calculerPeriodeOptimaleVentilation(data, Tconsigne, fenetre = 24) {
        const maintenant = new Date();
        const forecastData = data.forecast || [];

        if (forecastData.length === 0) return null;

        // Filtrer les prévisions pour les prochaines X heures
        const finFenetre = new Date(maintenant.getTime() + fenetre * 60 * 60 * 1000);

        const periodesFavorables = forecastData
            .filter(item => {
                const itemDate = parseDate(item.d);
                return itemDate >= maintenant && itemDate <= finFenetre;
            })
            .map(item => {
                const tempOut = item["temperature:outTemp"] !== undefined ?
                    kelvinToCelsius(item["temperature:outTemp"]) : null;
                const irradiance = item["irradiance:solar"] || 0;

                // Calculer un score de pertinence
                let score = 0;
                if (tempOut !== null) {
                    const ecart = Math.abs(tempOut - Tconsigne);
                    score = 10 - Math.min(ecart, 10); // Score inversement proportionnel à l'écart

                    // Bonus pour l'irradiance faible (éviter les pertes thermiques)
                    if (irradiance < 100) {
                        score += 2;
                    }
                }

                return {
                    date: item.d,
                    heure: parseDate(item.d).getHours(),
                    tempExterieure: tempOut,
                    irradiance: irradiance,
                    score: score
                };
            })
            .filter(p => p.tempExterieure !== null)
            .sort((a, b) => b.score - a.score);

        if (periodesFavorables.length === 0) return null;

        // Retourner les 3 meilleures périodes
        return periodesFavorables.slice(0, 3);
    }

    return {
        consigneAjustee_calc,
        calculerPeriodeOptimaleVentilation,
        kelvinToCelsius // Exposé pour les tests
    };
}));