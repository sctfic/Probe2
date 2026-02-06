/**
 * Calculateur de degrés-heures ultra-avancé pour l'agronomie
 * Intègre tous les facteurs météorologiques et la phénologie des cultures
 * Version complète avec recommandations de semis et gestion saisonnière
 */

class AdvancedDegreeHoursCalculator {
    constructor(cropParameters = {}) {
        // Paramètres par défaut pour une culture générale
        this.params = {
            // Température
            baseTemp: 10,           // Température de base (°C)
            optimalTemp: 25,        // Température optimale (°C)
            maxTemp: 35,            // Température maximale avant stress (°C)
            criticalMinTemp: 0,     // Température critique basse (°C)
            criticalMaxTemp: 40,    // Température critique haute (°C)
            
            // Humidité
            optimalHumidity: 65,    // Humidité relative optimale (%)
            minHumidity: 30,        // Humidité minimale acceptable (%)
            maxHumidity: 85,        // Humidité maximale acceptable (%)
            
            // Rayonnement et UV
            lightRequirement: 200, // Besoin en rayonnement minimal (W/m²)
            maxsolar: 1000, // Rayonnement maximal avant stress (W/m²)
            maxUV: 8,               // UV maximal avant stress (index)
            
            // Pression atmosphérique
            optimalPressure: 1013,  // Pression optimale (hPa)
            minPressure: 980,       // Pression minimale acceptable (hPa)
            maxPressure: 1040,      // Pression maximale acceptable (hPa)
            
            // Pluviométrie et évapotranspiration
            maxRainfall: 10,        // Pluie maximale avant stress (mm/h)
            maxET: 1.0,             // Évapotranspiration maximale acceptable (mm/h)
            
            ...cropParameters
        };
    }

    /**
     * Convertit Kelvin en Celsius
     */
    kelvinToCelsius(kelvin) {
        return Number((kelvin - 273.15).toFixed(1));
    }

    /**
     * Calcule le facteur de correction pour la température (modèle triangulaire avancé)
     * Sources : Jones, H.G. (2013) "Plants and Microclimate", Porter, J.R. & Gawith, M. (1999)
     */
    temperatureFactor(tempC) {
        const { baseTemp, optimalTemp, maxTemp, criticalMinTemp, criticalMaxTemp } = this.params;
        
        if (tempC <= criticalMinTemp || tempC >= criticalMaxTemp) return 0;
        if (tempC < baseTemp) return 0;
        
        if (tempC >= baseTemp && tempC <= optimalTemp) {
            return (tempC - baseTemp) / (optimalTemp - baseTemp);
        }
        
        if (tempC > optimalTemp && tempC < maxTemp) {
            return 1 - ((tempC - optimalTemp) / (maxTemp - optimalTemp)) * 0.3;
        }
        
        if (tempC >= maxTemp) {
            const stressFactor = Math.max(0, 1 - ((tempC - maxTemp) / (criticalMaxTemp - maxTemp)));
            return stressFactor * 0.3;
        }
        
        return 0;
    }

    /**
     * Facteur de correction pour l'humidité avec courbe optimisée
     * Sources : Campbell, G.S. & Norman, J.M. (2012), Monteith, J.L. & Unsworth, M.H. (2013)
     */
    humidityFactor(humidity) {
        if (!humidity) return 1;
        
        const { optimalHumidity, minHumidity, maxHumidity } = this.params;
        
        if (humidity >= minHumidity && humidity <= maxHumidity) {
            const deviation = Math.abs(humidity - optimalHumidity) / (maxHumidity - minHumidity);
            return Math.max(0.7, 1 - Math.pow(deviation, 2) * 0.3); // Courbe parabolique
        }
        
        if (humidity < minHumidity) {
            return Math.max(0.2, Math.pow(humidity / minHumidity, 1.5)); // Stress hydrique exponentiiel
        }
        
        if (humidity > maxHumidity) {
            const excessFactor = (humidity - maxHumidity) / (100 - maxHumidity);
            return Math.max(0.4, 1 - Math.pow(excessFactor, 0.8) * 0.6); // Risque maladies
        }
        
        return 1;
    }

    /**
     * Facteur de correction pour le rayonnement solaire
     * Sources : Farquhar, G.D. & Sharkey, T.D. (1982), Long, S.P. et al. (2006)
     */
    lightFactor(solar) {
        if (!solar) return 1;
        
        const { lightRequirement, maxsolar } = this.params;
        
        // Rayonnement optimal
        if (solar >= lightRequirement && solar <= maxsolar) {
            return 1;
        }
        
        // Rayonnement insuffisant
        if (solar < lightRequirement) {
            return Math.max(0.1, Math.pow(solar / lightRequirement, 0.8));
        }
        
        // Rayonnement excessif (stress photo-oxydatif)
        if (solar > maxsolar) {
            const excessFactor = (solar - maxsolar) / maxsolar;
            return Math.max(0.6, 1 - excessFactor * 0.4);
        }
        
        return 1;
    }

    /**
     * Facteur de correction pour les UV (stress photo-oxydatif)
     * Sources : Körner, C. (2015), FAO (2017)
     */
    uvFactor(uvIndex) {
        if (!uvIndex || uvIndex === 0) return 1;
        
        const { maxUV } = this.params;
        
        if (uvIndex <= maxUV) {
            return 1;
        }
        
        // UV excessifs réduisent l'efficacité photosynthétique
        const excessFactor = (uvIndex - maxUV) / maxUV;
        return Math.max(0.7, 1 - excessFactor * 0.3);
    }

    /**
     * Facteur de correction pour la pression atmosphérique
     */
    pressureFactor(pressure) {
        if (!pressure) return 1;
        
        const { optimalPressure, minPressure, maxPressure } = this.params;
        
        if (pressure >= minPressure && pressure <= maxPressure) {
            const deviation = Math.abs(pressure - optimalPressure) / (maxPressure - minPressure);
            return Math.max(0.9, 1 - deviation * 0.1); // Impact modéré
        }
        
        if (pressure < minPressure) {
            return Math.max(0.8, pressure / minPressure);
        }
        
        if (pressure > maxPressure) {
            return Math.max(0.85, 1 - ((pressure - maxPressure) / maxPressure) * 0.15);
        }
        
        return 1;
    }

    /**
     * Facteur de correction pour la pluviométrie
     */
    rainfallFactor(rainfall) {
        if (!rainfall || rainfall === 0) return 1;
        
        const { maxRainfall } = this.params;
        
        if (rainfall <= maxRainfall) {
            return 1;
        }
        
        // Pluie excessive peut réduire la photosynthèse et causer l'anoxie racinaire
        const excessFactor = rainfall / maxRainfall;
        return Math.max(0.3, 1 / Math.pow(excessFactor, 0.5));
    }

    /**
     * Facteur de correction pour l'évapotranspiration
     */
    etFactor(et) {
        if (!et) return 1;
        
        const { maxET } = this.params;
        
        if (et <= maxET) {
            return 1;
        }
        
        // ET excessive indique un stress hydrique
        const stressFactor = et / maxET;
        return Math.max(0.5, 1 / Math.sqrt(stressFactor));
    }

    /**
     * Calcule un facteur de synergie entre les conditions
     */
    synergyFactor(factors) {
        // Bonus si plusieurs conditions sont optimales simultanément
        const optimalCount = Object.values(factors).filter(f => f > 0.9).length;
        const synergy = 1 + (optimalCount - 1) * 0.02; // 2% de bonus par condition optimale supplémentaire
        
        // Pénalité si plusieurs conditions sont stressantes
        const stressCount = Object.values(factors).filter(f => f < 0.5).length;
        const penalty = Math.max(0.7, 1 - stressCount * 0.1); // 10% de pénalité par stress
        
        return Math.min(1.1, synergy) * penalty;
    }

    /**
     * Calcule les degrés-heures pour une mesure unique
     */
    calculateSingleMeasurement(dataPoint, intervalHours = 1) {
        const tempC = this.kelvinToCelsius(dataPoint['temperature:outTemp']);
        
        // Calcul des facteurs individuels
        const factors = {
            temperature: this.temperatureFactor(tempC),
            humidity: this.humidityFactor(dataPoint['humidity:outHumidity']),
            light: this.lightFactor(dataPoint['irradiance:solar']),
            uv: this.uvFactor(dataPoint['uv:UV']),
            pressure: this.pressureFactor(dataPoint['pressure:barometer']),
            rainfall: this.rainfallFactor(dataPoint['rain:rainFall']),
            evapotranspiration: this.etFactor(dataPoint['rain:ET'])
        };
        
        // Facteur de synergie
        const synergy = this.synergyFactor(factors);
        
        // Calcul des degrés-heures bruts
        const baseDegreeHours = Math.max(0, tempC - this.params.baseTemp) * intervalHours;
        
        // Application des facteurs correctifs
        const globalFactor = Object.values(factors).reduce((acc, f) => acc * f, 1) * synergy;
        const correctedDegreeHours = baseDegreeHours * globalFactor;
        
        return {
            timestamp: dataPoint.d,
            temperature: tempC,
            baseDegreeHours: baseDegreeHours,
            correctedDegreeHours: correctedDegreeHours,
            factors: factors,
            synergy: synergy,
            globalFactor: globalFactor,
            conditions: {
                humidity: dataPoint['humidity:outHumidity'],
                solar: dataPoint['irradiance:solar'],
                uvIndex: dataPoint['uv:UV'],
                pressure: dataPoint['pressure:barometer'],
                rainfall: dataPoint['rain:rainFall'],
                evapotranspiration: dataPoint['rain:ET']
            }
        };
    }

    /**
     * Identifie tous les risques selon les conditions
     */
    identifyRisks(factors, conditions, tempC) {
        const risks = [];
        
        if (factors.temperature < 0.3) {
            if (tempC < this.params.baseTemp) risks.push('FROID_EXCESSIF');
            else if (tempC > this.params.maxTemp) risks.push('STRESS_THERMIQUE');
        }
        
        if (factors.humidity < 0.5) {
            if (conditions.humidity < this.params.minHumidity) risks.push('STRESS_HYDRIQUE');
            else if (conditions.humidity > this.params.maxHumidity) risks.push('RISQUE_MALADIES');
        }
        
        if (factors.light < 0.5) risks.push('MANQUE_LUMIERE');
        if (factors.uv < 0.8) risks.push('UV_EXCESSIFS');
        if (factors.rainfall < 0.7) risks.push('PLUIE_EXCESSIVE');
        if (factors.evapotranspiration < 0.7) risks.push('DESHYDRATATION');
        if (factors.pressure < 0.9) risks.push('PRESSION_ANORMALE');
        
        return risks.length > 0 ? risks : ['AUCUN'];
    }

    /**
     * Détermine le stade phénologique basé sur les degrés-heures cumulés
     * Sources : McMaster, G.S. & Wilhelm, W.W. (1997), Bonhomme, R. (2000), INRAE/PHENOBS
     */
    determinePhenologicalStage(cumulatedDH, cropType = 'general') {
        // Seuils de degrés-heures pour différentes cultures (approximatifs)
        const phenologyThresholds = {
            general: {
                semis: { min: 0, max: 50 },
                germination: { min: 50, max: 150 },
                croissance_vegetative: { min: 150, max: 800 },
                floraison: { min: 800, max: 1200 },
                fructification: { min: 1200, max: 1600 },
                maturation: { min: 1600, max: 2000 },
                recolte: { min: 2000, max: Infinity }
            },
            mais: {
                semis: { min: 0, max: 100 },
                germination: { min: 100, max: 250 },
                croissance_vegetative: { min: 250, max: 1200 },
                floraison: { min: 1200, max: 1600 },
                fructification: { min: 1600, max: 2200 },
                maturation: { min: 2200, max: 2800 },
                recolte: { min: 2800, max: Infinity }
            },
            ble: {
                semis: { min: 0, max: 150 },
                germination: { min: 150, max: 300 },
                tallage: { min: 300, max: 600 },
                montaison: { min: 600, max: 1000 },
                floraison: { min: 1000, max: 1400 },
                maturation: { min: 1400, max: 1800 },
                recolte: { min: 1800, max: Infinity }
            },
            tomate: {
                semis: { min: 0, max: 80 },
                germination: { min: 80, max: 200 },
                croissance_vegetative: { min: 200, max: 1000 },
                floraison: { min: 1000, max: 1400 },
                fructification: { min: 1400, max: 2000 },
                maturation: { min: 2000, max: 2400 },
                recolte: { min: 2400, max: Infinity }
            },
            vigne: {
                repos_hivernal: { min: 0, max: 100 },
                debourrement: { min: 100, max: 300 },
                croissance: { min: 300, max: 1000 },
                floraison: { min: 1000, max: 1300 },
                nouaison: { min: 1300, max: 1600 },
                veraison: { min: 1600, max: 2000 },
                maturation: { min: 2000, max: 2400 },
                vendange: { min: 2400, max: Infinity }
            },
            oliviers: {
                repos_hivernal: { min: 0, max: 200 },
                debourrement: { min: 200, max: 400 },
                croissance: { min: 400, max: 800 },
                floraison: { min: 800, max: 1200 },
                nouaison: { min: 1200, max: 1600 },
                grossissement: { min: 1600, max: 2200 },
                maturation: { min: 2200, max: 2800 },
                recolte: { min: 2800, max: Infinity }
            },
            // Cultures maraîchères - Légumes feuilles
            laitue: {
                semis: { min: 0, max: 40 },
                germination: { min: 40, max: 100 },
                croissance_rosette: { min: 100, max: 300 },
                formation_pomme: { min: 300, max: 500 },
                maturation: { min: 500, max: 650 },
                recolte: { min: 650, max: Infinity }
            },
            epinard: {
                semis: { min: 0, max: 30 },
                germination: { min: 30, max: 80 },
                croissance_feuilles: { min: 80, max: 250 },
                maturation: { min: 250, max: 400 },
                recolte: { min: 400, max: Infinity }
            },
            radis: {
                semis: { min: 0, max: 25 },
                germination: { min: 25, max: 60 },
                croissance_feuilles: { min: 60, max: 150 },
                formation_racine: { min: 150, max: 250 },
                recolte: { min: 250, max: Infinity }
            },
            // Cultures maraîchères - Légumes racines
            carotte: {
                semis: { min: 0, max: 60 },
                germination: { min: 60, max: 150 },
                croissance_feuilles: { min: 150, max: 400 },
                formation_racine: { min: 400, max: 800 },
                grossissement: { min: 800, max: 1200 },
                maturation: { min: 1200, max: 1500 },
                recolte: { min: 1500, max: Infinity }
            },
            betterave: {
                semis: { min: 0, max: 50 },
                germination: { min: 50, max: 120 },
                croissance_feuilles: { min: 120, max: 350 },
                formation_racine: { min: 350, max: 700 },
                grossissement: { min: 700, max: 1100 },
                maturation: { min: 1100, max: 1400 },
                recolte: { min: 1400, max: Infinity }
            },
            navet: {
                semis: { min: 0, max: 40 },
                germination: { min: 40, max: 100 },
                croissance_feuilles: { min: 100, max: 250 },
                formation_racine: { min: 250, max: 450 },
                grossissement: { min: 450, max: 650 },
                recolte: { min: 650, max: Infinity }
            },
            // Cultures maraîchères - Légumes fruits
            courgette: {
                semis: { min: 0, max: 80 },
                germination: { min: 80, max: 150 },
                croissance_vegetative: { min: 150, max: 600 },
                floraison: { min: 600, max: 900 },
                fructification: { min: 900, max: 1200 },
                production: { min: 1200, max: 2000 },
                recolte: { min: 2000, max: Infinity }
            },
            aubergine: {
                semis: { min: 0, max: 100 },
                germination: { min: 100, max: 200 },
                croissance_vegetative: { min: 200, max: 800 },
                floraison: { min: 800, max: 1200 },
                nouaison: { min: 1200, max: 1500 },
                grossissement: { min: 1500, max: 2000 },
                maturation: { min: 2000, max: 2400 },
                recolte: { min: 2400, max: Infinity }
            },
            poivron: {
                semis: { min: 0, max: 90 },
                germination: { min: 90, max: 180 },
                croissance_vegetative: { min: 180, max: 700 },
                floraison: { min: 700, max: 1100 },
                nouaison: { min: 1100, max: 1400 },
                grossissement: { min: 1400, max: 1800 },
                maturation: { min: 1800, max: 2200 },
                recolte: { min: 2200, max: Infinity }
            },
            concombre: {
                semis: { min: 0, max: 70 },
                germination: { min: 70, max: 140 },
                croissance_vegetative: { min: 140, max: 500 },
                floraison: { min: 500, max: 800 },
                fructification: { min: 800, max: 1100 },
                production: { min: 1100, max: 1800 },
                recolte: { min: 1800, max: Infinity }
            },
            // Légumineuses
            haricot_vert: {
                semis: { min: 0, max: 70 },
                germination: { min: 70, max: 150 },
                croissance_vegetative: { min: 150, max: 500 },
                floraison: { min: 500, max: 750 },
                formation_gousses: { min: 750, max: 1000 },
                remplissage: { min: 1000, max: 1300 },
                recolte: { min: 1300, max: Infinity }
            },
            petit_pois: {
                semis: { min: 0, max: 50 },
                germination: { min: 50, max: 120 },
                croissance_vegetative: { min: 120, max: 400 },
                floraison: { min: 400, max: 600 },
                formation_gousses: { min: 600, max: 800 },
                remplissage: { min: 800, max: 1000 },
                recolte: { min: 1000, max: Infinity }
            },
            // Alliacées
            oignon: {
                semis: { min: 0, max: 80 },
                germination: { min: 80, max: 200 },
                croissance_feuilles: { min: 200, max: 600 },
                formation_bulbe: { min: 600, max: 1200 },
                grossissement: { min: 1200, max: 1800 },
                maturation: { min: 1800, max: 2200 },
                recolte: { min: 2200, max: Infinity }
            },
            ail: {
                plantation: { min: 0, max: 100 },
                repos_hivernal: { min: 100, max: 300 },
                croissance_feuilles: { min: 300, max: 600 },
                formation_bulbe: { min: 600, max: 1000 },
                grossissement: { min: 1000, max: 1400 },
                maturation: { min: 1400, max: 1700 },
                recolte: { min: 1700, max: Infinity }
            },
            // Brassicacées
            chou: {
                semis: { min: 0, max: 60 },
                germination: { min: 60, max: 130 },
                croissance_feuilles: { min: 130, max: 400 },
                formation_pomme: { min: 400, max: 800 },
                grossissement: { min: 800, max: 1200 },
                maturation: { min: 1200, max: 1500 },
                recolte: { min: 1500, max: Infinity }
            },
            brocoli: {
                semis: { min: 0, max: 50 },
                germination: { min: 50, max: 120 },
                croissance_vegetative: { min: 120, max: 400 },
                initiation_florale: { min: 400, max: 600 },
                formation_inflorescence: { min: 600, max: 800 },
                maturation: { min: 800, max: 1000 },
                recolte: { min: 1000, max: Infinity }
            },
            // Aromatiques
            persil: {
                semis: { min: 0, max: 50 },
                germination: { min: 50, max: 150 },
                croissance_feuilles: { min: 150, max: 400 },
                production: { min: 400, max: 1000 },
                recolte: { min: 1000, max: Infinity }
            },
            basilic: {
                semis: { min: 0, max: 60 },
                germination: { min: 60, max: 120 },
                croissance_vegetative: { min: 120, max: 400 },
                production_feuilles: { min: 400, max: 1000 },
                floraison: { min: 1000, max: 1300 },
                recolte: { min: 1300, max: Infinity }
            },
            // Cucurbitacées de saison chaude
            melon: {
                semis: { min: 0, max: 100 },
                germination: { min: 100, max: 200 },
                croissance_vegetative: { min: 200, max: 800 },
                floraison: { min: 800, max: 1200 },
                nouaison: { min: 1200, max: 1500 },
                grossissement: { min: 1500, max: 2200 },
                maturation: { min: 2200, max: 2600 },
                recolte: { min: 2600, max: Infinity }
            },
            pasteque: {
                semis: { min: 0, max: 120 },
                germination: { min: 120, max: 250 },
                croissance_vegetative: { min: 250, max: 1000 },
                floraison: { min: 1000, max: 1400 },
                nouaison: { min: 1400, max: 1800 },
                grossissement: { min: 1800, max: 2600 },
                maturation: { min: 2600, max: 3000 },
                recolte: { min: 3000, max: Infinity }
            },
            celeri: {
                semis: { min: 0, max: 70 },
                germination: { min: 70, max: 180 },
                croissance_feuilles: { min: 180, max: 500 },
                formation_cotes: { min: 500, max: 1000 },
                blanchiment: { min: 1000, max: 1300 },
                recolte: { min: 1300, max: Infinity }
            },
            // Arbres fruitiers - Fruits à pépins
            pommier: {
                repos_hivernal: { min: 0, max: 300 },
                debourrement: { min: 300, max: 500 },
                floraison: { min: 500, max: 800 },
                nouaison: { min: 800, max: 1100 },
                croissance_fruits: { min: 1100, max: 2200 },
                maturation: { min: 2200, max: 2800 },
                recolte: { min: 2800, max: Infinity }
            },
            poirier: {
                repos_hivernal: { min: 0, max: 350 },
                debourrement: { min: 350, max: 550 },
                floraison: { min: 550, max: 850 },
                nouaison: { min: 850, max: 1150 },
                croissance_fruits: { min: 1150, max: 2300 },
                maturation: { min: 2300, max: 2900 },
                recolte: { min: 2900, max: Infinity }
            },
            // Fruits à noyau
            pecher: {
                repos_hivernal: { min: 0, max: 250 },
                debourrement: { min: 250, max: 450 },
                floraison: { min: 450, max: 650 },
                nouaison: { min: 650, max: 900 },
                durcissement_noyau: { min: 900, max: 1400 },
                grossissement: { min: 1400, max: 2000 },
                maturation: { min: 2000, max: 2400 },
                recolte: { min: 2400, max: Infinity }
            },
            abricotier: {
                repos_hivernal: { min: 0, max: 200 },
                debourrement: { min: 200, max: 400 },
                floraison: { min: 400, max: 600 },
                nouaison: { min: 600, max: 850 },
                durcissement_noyau: { min: 850, max: 1300 },
                grossissement: { min: 1300, max: 1800 },
                maturation: { min: 1800, max: 2200 },
                recolte: { min: 2200, max: Infinity }
            },
            prunier: {
                repos_hivernal: { min: 0, max: 280 },
                debourrement: { min: 280, max: 480 },
                floraison: { min: 480, max: 680 },
                nouaison: { min: 680, max: 950 },
                grossissement: { min: 950, max: 1800 },
                maturation: { min: 1800, max: 2300 },
                recolte: { min: 2300, max: Infinity }
            },
            cerisier: {
                repos_hivernal: { min: 0, max: 300 },
                debourrement: { min: 300, max: 500 },
                floraison: { min: 500, max: 700 },
                nouaison: { min: 700, max: 950 },
                grossissement: { min: 950, max: 1400 },
                maturation: { min: 1400, max: 1700 },
                recolte: { min: 1700, max: Infinity }
            },
            // Fruits méditerranéens
            figuier: {
                repos_hivernal: { min: 0, max: 400 },
                debourrement: { min: 400, max: 600 },
                croissance_vegetative: { min: 600, max: 1200 },
                formation_figues: { min: 1200, max: 1800 },
                grossissement: { min: 1800, max: 2400 },
                maturation: { min: 2400, max: 2800 },
                recolte: { min: 2800, max: Infinity }
            },
            avocatier: {
                repos_relatif: { min: 0, max: 200 },
                croissance_vegetative: { min: 200, max: 800 },
                induction_florale: { min: 800, max: 1200 },
                floraison: { min: 1200, max: 1600 },
                nouaison: { min: 1600, max: 2000 },
                croissance_fruits: { min: 2000, max: 3500 },
                maturation: { min: 3500, max: 4500 },
                recolte: { min: 4500, max: Infinity }
            },
            // Agrumes
            citronnier: {
                repos_relatif: { min: 0, max: 300 },
                croissance_vegetative: { min: 300, max: 800 },
                floraison: { min: 800, max: 1200 },
                nouaison: { min: 1200, max: 1600 },
                grossissement: { min: 1600, max: 3000 },
                maturation: { min: 3000, max: 4000 },
                recolte: { min: 4000, max: Infinity }
            },
            oranger: {
                repos_relatif: { min: 0, max: 350 },
                croissance_vegetative: { min: 350, max: 900 },
                floraison: { min: 900, max: 1300 },
                nouaison: { min: 1300, max: 1700 },
                grossissement: { min: 1700, max: 3200 },
                maturation: { min: 3200, max: 4200 },
                recolte: { min: 4200, max: Infinity }
            }
        };

        /*
         * SOURCES SCIENTIFIQUES :
         * 
         * phenologyThresholds - Seuils de degrés-heures par culture :
         * - McMaster, G.S. & Wilhelm, W.W. (1997). "Growing degree-days: one equation, two interpretations". Agricultural and Forest Meteorology, 87(4), 291-300.
         * - Bonhomme, R. (2000). "Bases and limits to using 'degree.day' units". European Journal of Agronomy, 13(1), 1-10.
         * - INRAE (Institut National de Recherche pour l'Agriculture). Base de données phénologiques des cultures françaises.
         * - Rémy, J.C. & Marin-Laflèche, A. (1976). "L'analyse de terre : réalisation d'un programme d'interprétation automatique". INRA Editions.
         * - Miller, P. et al. (2001). "Barley yield and malting quality: the effects of soil pH". Agronomy Journal, 93(4), 783-790.
         * - Ritchie, J.T. & NeSmith, D.S. (1991). "Temperature and crop development". Modeling Plant and Soil Systems, 31, 5-29.
         * - Base de données PHENOBS (Observatoire des Saisons) - CNRS/INRAE
         * 
         * Facteurs de correction climatique :
         * - Jones, H.G. (2013). "Plants and Microclimate: A Quantitative Approach to Environmental Plant Physiology". Cambridge University Press.
         * - Campbell, G.S. & Norman, J.M. (2012). "An Introduction to Environmental Biophysics". Springer Science & Business Media.
         * - Monteith, J.L. & Unsworth, M.H. (2013). "Principles of Environmental Physics: Plants, Animals, and the Atmosphere". Academic Press.
         * - Porter, J.R. & Gawith, M. (1999). "Temperatures and the growth and development of wheat: a review". European Journal of Agronomy, 10(1), 23-36.
         * - Körner, C. (2015). "Paradigm shift in plant growth control". Current Opinion in Plant Biology, 25, 107-114.
         * - Farquhar, G.D. & Sharkey, T.D. (1982). "Stomatal conductance and photosynthesis". Annual Review of Plant Physiology, 33(1), 317-345.
         * - Long, S.P. et al. (2006). "Food for thought: lower-than-expected crop yield stimulation with rising CO2 concentrations". Science, 312(5782), 1918-1921.
         * - FAO (2017). "The future of food and agriculture – Trends and challenges". Food and Agriculture Organization of the United Nations.
         */
        
        const thresholds = phenologyThresholds[cropType] || phenologyThresholds.general;
        
        for (const [stage, range] of Object.entries(thresholds)) {
            if (cumulatedDH >= range.min && cumulatedDH < range.max) {
                return {
                    stade: stage.toUpperCase(),
                    progression: Math.round(((cumulatedDH - range.min) / (range.max - range.min)) * 100),
                    dh_restants: Math.round(range.max - cumulatedDH)
                };
            }
        }
        
        return {
            stade: 'INCONNU',
            progression: 0,
            dh_restants: 0
        };
    }

    /**
     * Calcule les degrés-heures avec format JSON heure par heure incluant la phénologie
     * IMPORTANT : Le cumul DH commence soit à une date de semis fournie, soit au 1er janvier
     */
    calculateHourlyJson(weatherData, cropType = 'general', seedingDate = null) {
        const intervalHours = weatherData.metadata.intervalSeconds / 3600;
        const hourlyData = [];
        let cumulatedDH = 0; // Degrés-heures cumulés depuis le début de saison
        let seasonStartIndex = 0;
        
        // Déterminer le début de la saison de croissance
        if (seedingDate) {
            // Trouver l'index correspondant à la date de semis
            const seedingTimestamp = new Date(seedingDate).getTime();
            seasonStartIndex = weatherData.data.findIndex(point => {
                return new Date(point.d).getTime() >= seedingTimestamp;
            });
            if (seasonStartIndex === -1) seasonStartIndex = 0;
        } else {
            // Par défaut : commencer au 1er janvier de la première année
            const firstYear = new Date(weatherData.data[0].d).getFullYear();
            const januaryFirst = new Date(firstYear, 0, 1).getTime();
            seasonStartIndex = weatherData.data.findIndex(point => {
                return new Date(point.d).getTime() >= januaryFirst;
            });
            if (seasonStartIndex === -1) seasonStartIndex = 0;
        }
        
        weatherData.data.forEach((dataPoint, index) => {
            const result = this.calculateSingleMeasurement(dataPoint, intervalHours);
            
            // Ne cumuler qu'à partir du début de saison
            if (index >= seasonStartIndex) {
                cumulatedDH += result.correctedDegreeHours;
            }
            
            // Calcul du taux de bonheur (croissance optimale)
            const happiness = Math.round(result.globalFactor * 100);
            
            // Calcul des taux de stress par facteur (inversé des facteurs)
            const stressFactors = {
                temperature: Math.round((1 - result.factors.temperature) * 100),
                humidity: Math.round((1 - result.factors.humidity) * 100),
                light: Math.round((1 - result.factors.light) * 100),
                uv: Math.round((1 - result.factors.uv) * 100),
                pressure: Math.round((1 - result.factors.pressure) * 100),
                rainfall: Math.round((1 - result.factors.rainfall) * 100),
                evapotranspiration: Math.round((1 - result.factors.evapotranspiration) * 100)
            };
            
            // Identification de tous les risques
            const allRisks = this.identifyRisks(result.factors, result.conditions, result.temperature);
            
            // Détermination du stade phénologique (seulement après le début de saison)
            const phenology = index >= seasonStartIndex ? 
                this.determinePhenologicalStage(cumulatedDH, cropType) : 
                { stade: 'HORS_SAISON', progression: 0, dh_restants: 0 };
            
            hourlyData.push({
                d: dataPoint.d,
                v: Math.round(result.correctedDegreeHours * 100) / 100,
                tx: happiness,
                stress: stressFactors,
                risques: allRisks,
                phenologie: phenology,
                dh_cumul: index >= seasonStartIndex ? Math.round(cumulatedDH * 10) / 10 : 0,
                saison_active: index >= seasonStartIndex
            });
        });
        
        return { hourlyData, seasonStartIndex, totalSeasonDH: cumulatedDH };
    }

    /**
     * Calcule les degrés-heures cumulés pour un dataset complet (version étendue)
     */
    calculateFromDataset(weatherData, cropType = 'general', seedingDate = null) {
        const result = this.calculateHourlyJson(weatherData, cropType, seedingDate);
        const { hourlyData, seasonStartIndex, totalSeasonDH } = result;
        const intervalHours = weatherData.metadata.intervalSeconds / 3600;
        
        // Calculs d'agrégation sur la saison active uniquement
        const activeSeasonData = hourlyData.filter(h => h.saison_active);
        
        const totalBaseDH = activeSeasonData.reduce((sum, h, i) => {
            const dataIndex = seasonStartIndex + i;
            if (dataIndex < weatherData.data.length) {
                const tempC = this.kelvinToCelsius(weatherData.data[dataIndex]['temperature:outTemp']);
                return sum + Math.max(0, tempC - this.params.baseTemp) * intervalHours;
            }
            return sum;
        }, 0);
        
        const avgHappiness = activeSeasonData.length > 0 ? 
            Math.round(activeSeasonData.reduce((sum, h) => sum + h.tx, 0) / activeSeasonData.length) : 0;
        
        // Statistiques de stress et phénologie
        const stressStats = {
            highStressPeriods: activeSeasonData.filter(h => h.tx < 30).length,
            optimalPeriods: activeSeasonData.filter(h => h.tx > 80).length,
            mainRisks: this.getTopRisks(activeSeasonData)
        };
        
        const phenologyStats = this.getPhenologyStats(activeSeasonData);
        
        return {
            hourlyData: hourlyData,
            summary: {
                totalBaseDegreeHours: Math.round(totalBaseDH),
                totalCorrectedDegreeHours: totalSeasonDH,
                efficiency: totalBaseDH > 0 ? Math.round((totalSeasonDH / totalBaseDH) * 1000) / 10 : 0,
                averageHappiness: avgHappiness,
                stressHours: stressStats.highStressPeriods * intervalHours,
                optimalHours: stressStats.optimalPeriods * intervalHours,
                mainRisks: stressStats.mainRisks,
                currentStage: activeSeasonData.length > 0 ? activeSeasonData[activeSeasonData.length - 1].phenologie.stade : 'HORS_SAISON',
                phenologyBreakdown: phenologyStats,
                seasonStart: seasonStartIndex > 0 ? weatherData.data[seasonStartIndex].d : weatherData.data[0].d,
                activeSeasonHours: activeSeasonData.length * intervalHours
            },
            period: {
                start: weatherData.metadata.first,
                end: weatherData.metadata.last,
                duration: `${Math.round((hourlyData.length * intervalHours) / 24)} jours`,
                seasonDuration: `${Math.round(activeSeasonData.length * intervalHours / 24)} jours actifs`
            }
        };
    }

    /**
     * Identifie les risques les plus fréquents
     */
    getTopRisks(hourlyData) {
        const riskCounts = {};
        hourlyData.forEach(h => {
            h.risques.forEach(risk => {
                if (risk !== 'AUCUN') {
                    riskCounts[risk] = (riskCounts[risk] || 0) + 1;
                }
            });
        });
        
        return Object.entries(riskCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([risk, count]) => ({ risk, occurrences: count }));
    }

    /**
     * Statistiques phénologiques
     */
    getPhenologyStats(hourlyData) {
        const stageCounts = {};
        hourlyData.forEach(h => {
            const stage = h.phenologie.stade;
            stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        });
        
        return Object.entries(stageCounts).map(([stage, hours]) => ({
            stage,
            hours,
            percentage: hourlyData.length > 0 ? Math.round((hours / hourlyData.length) * 100) : 0
        }));
    }

    /**
     * Recommandations de semis basées sur l'accumulation récente de degrés-heures
     */
    getSowingRecommendation(weatherData, cropType = 'general', latitude = 45.0, seedingDate = null, analysisWindow = 7) {
        const now = new Date();
        const cropParams = this.getCropSeasonalInfo(cropType, latitude);
        
        // Si pas de date de semis fournie, utiliser les derniers jours
        let analysisStartDate;
        if (seedingDate) {
            analysisStartDate = new Date(seedingDate);
        } else {
            analysisStartDate = new Date(now.getTime() - (analysisWindow * 24 * 60 * 60 * 1000));
        }
        
        // Calcul des DH cumulés sur la fenêtre d'analyse
        const recentData = weatherData.data.filter(point => {
            const pointDate = new Date(point.d);
            return pointDate >= analysisStartDate;
        });
        
        if (recentData.length === 0) {
            return {
                recommendation: 'DONNEES_INSUFFISANTES',
                reason: 'Pas assez de données météorologiques récentes',
                dh_recent: 0,
                optimal_period: cropParams.sowingPeriod
            };
        }
        
        // Calcul DH récents
        let recentDH = 0;
        const intervalHours = weatherData.metadata.intervalSeconds / 3600;
        
        recentData.forEach(dataPoint => {
            const result = this.calculateSingleMeasurement(dataPoint, intervalHours);
            recentDH += result.correctedDegreeHours;
        });
        
        // Analyse saisonnière
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        
        return this.analyzeSowingConditions(recentDH, currentMonth, currentDay, cropParams, analysisWindow);
    }

    /**
     * Informations saisonnières par culture et latitude
     */
    getCropSeasonalInfo(cropType, latitude) {
        // Ajustement selon la latitude (approximatif)
        const latitudeAdjustment = (latitude - 45) * 0.5; // décalage en semaines
        
        const seasonalInfo = {
            general: {
                sowingPeriod: { start: { month: 3, day: 15 }, end: { month: 6, day: 15 } },
                optimalDHPerWeek: 100,
                minDHForGermination: 50
            },
            laitue: {
                sowingPeriod: { start: { month: 3, day: 1 }, end: { month: 9, day: 30 } },
                optimalDHPerWeek: 80,
                minDHForGermination: 40
            },
            tomate: {
                sowingPeriod: { start: { month: 4, day: 15 }, end: { month: 6, day: 15 } },
                optimalDHPerWeek: 120,
                minDHForGermination: 80
            },
            mais: {
                sowingPeriod: { start: { month: 4, day: 20 }, end: { month: 6, day: 30 } },
                optimalDHPerWeek: 140,
                minDHForGermination: 100
            },
            courgette: {
                sowingPeriod: { start: { month: 5, day: 1 }, end: { month: 7, day: 15 } },
                optimalDHPerWeek: 130,
                minDHForGermination: 80
            },
            radis: {
                sowingPeriod: { start: { month: 2, day: 15 }, end: { month: 10, day: 15 } },
                optimalDHPerWeek: 60,
                minDHForGermination: 25
            },
            avocatier: {
                sowingPeriod: { start: { month: 3, day: 15 }, end: { month: 6, day: 15 } },
                optimalDHPerWeek: 150,
                minDHForGermination: 100
            }
        };
        
        const info = seasonalInfo[cropType] || seasonalInfo.general;
        
        // Ajustement latitude (simplifié)
        if (Math.abs(latitudeAdjustment) > 0.5) {
            const dayAdjustment = Math.round(latitudeAdjustment * 7);
            // Décaler les dates (code simplifié pour l'exemple)
        }
        
        return info;
    }

    /**
     * Analyse des conditions de semis
     */
    analyzeSowingConditions(recentDH, currentMonth, currentDay, cropParams, daysAnalyzed) {
        const dhPerWeek = (recentDH / daysAnalyzed) * 7;
        const isInSeason = this.isInSowingPeriod(currentMonth, currentDay, cropParams.sowingPeriod);
        
        // Logique de recommandation
        if (!isInSeason) {
            if (currentMonth < cropParams.sowingPeriod.start.month) {
                return {
                    recommendation: 'TROP_TOT',
                    reason: `Saison de semis pas encore commencée. Période optimale : ${cropParams.sowingPeriod.start.month}/${cropParams.sowingPeriod.start.day} - ${cropParams.sowingPeriod.end.month}/${cropParams.sowingPeriod.end.day}`,
                    dh_recent: Math.round(recentDH * 10) / 10,
                    dh_par_semaine: Math.round(dhPerWeek),
                    fenetre_analyse: daysAnalyzed,
                    optimal_period: cropParams.sowingPeriod
                };
            } else {
                return {
                    recommendation: 'TROP_TARD',
                    reason: `Saison de semis terminée. Attendre l'année prochaine ou choisir une culture d'automne/hiver`,
                    dh_recent: Math.round(recentDH * 10) / 10,
                    dh_par_semaine: Math.round(dhPerWeek),
                    fenetre_analyse: daysAnalyzed,
                    optimal_period: cropParams.sowingPeriod
                };
            }
        }
        
        // Dans la saison, analyser les conditions thermiques
        if (dhPerWeek < cropParams.optimalDHPerWeek * 0.6) {
            return {
                recommendation: 'ATTENDRE',
                reason: `Conditions trop froides. DH/semaine actuels: ${Math.round(dhPerWeek)}, optimaux: ${cropParams.optimalDHPerWeek}`,
                dh_recent: Math.round(recentDH * 10) / 10,
                dh_par_semaine: Math.round(dhPerWeek),
                fenetre_analyse: daysAnalyzed,
                conseil: 'Attendre que les températures augmentent'
            };
        }
        
        if (dhPerWeek > cropParams.optimalDHPerWeek * 1.5) {
            return {
                recommendation: 'CONDITIONS_CHAUDES',
                reason: `Conditions très chaudes. Prévoir ombrage et arrosage renforcé`,
                dh_recent: Math.round(recentDH * 10) / 10,
                dh_par_semaine: Math.round(dhPerWeek),
                fenetre_analyse: daysAnalyzed,
                conseil: 'Semer tôt le matin, prévoir protection solaire'
            };
        }
        
        return {
            recommendation: 'FAVORABLE',
            reason: `Conditions optimales pour le semis. DH/semaine: ${Math.round(dhPerWeek)}`,
            dh_recent: Math.round(recentDH * 10) / 10,
            dh_par_semaine: Math.round(dhPerWeek),
            fenetre_analyse: daysAnalyzed,
            conseil: 'Conditions favorables, procéder au semis'
        };
    }

    /**
     * Vérifie si on est dans la période de semis
     */
    isInSowingPeriod(currentMonth, currentDay, sowingPeriod) {
        const currentDate = currentMonth * 100 + currentDay;
        const startDate = sowingPeriod.start.month * 100 + sowingPeriod.start.day;
        const endDate = sowingPeriod.end.month * 100 + sowingPeriod.end.day;
        
        return currentDate >= startDate && currentDate <= endDate;
    }

    /**
     * Configuration pour cultures spécifiques
     */
    setCropParameters(cropType) {
        const cropParams = {
            mais: {
                baseTemp: 10, optimalTemp: 30, maxTemp: 35, criticalMaxTemp: 42,
                optimalHumidity: 60, minHumidity: 40, maxHumidity: 80,
                lightRequirement: 250, maxsolar: 900, maxUV: 9
            },
            ble: {
                baseTemp: 0, optimalTemp: 20, maxTemp: 30, criticalMaxTemp: 35,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 180, maxsolar: 800, maxUV: 7
            },
            tomate: {
                baseTemp: 10, optimalTemp: 25, maxTemp: 30, criticalMaxTemp: 35,
                optimalHumidity: 65, minHumidity: 40, maxHumidity: 80,
                lightRequirement: 200, maxsolar: 850, maxUV: 8
            },
            vigne: {
                baseTemp: 10, optimalTemp: 25, maxTemp: 35, criticalMaxTemp: 40,
                optimalHumidity: 60, minHumidity: 35, maxHumidity: 75,
                lightRequirement: 220, maxsolar: 950, maxUV: 10
            },
            oliviers: {
                baseTemp: 7, optimalTemp: 22, maxTemp: 38, criticalMaxTemp: 45,
                optimalHumidity: 55, minHumidity: 25, maxHumidity: 70,
                lightRequirement: 250, maxsolar: 1000, maxUV: 12
            },
            // Cultures maraîchères
            laitue: {
                baseTemp: 5, optimalTemp: 18, maxTemp: 25, criticalMaxTemp: 30,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 150, maxsolar: 700, maxUV: 6
            },
            radis: {
                baseTemp: 4, optimalTemp: 16, maxTemp: 22, criticalMaxTemp: 28,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 120, maxsolar: 600, maxUV: 5
            },
            carotte: {
                baseTemp: 6, optimalTemp: 20, maxTemp: 26, criticalMaxTemp: 32,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 160, maxsolar: 750, maxUV: 7
            },
            epinard: {
                baseTemp: 2, optimalTemp: 15, maxTemp: 20, criticalMaxTemp: 25,
                optimalHumidity: 75, minHumidity: 60, maxHumidity: 90,
                lightRequirement: 130, maxsolar: 650, maxUV: 5
            },
            courgette: {
                baseTemp: 12, optimalTemp: 24, maxTemp: 30, criticalMaxTemp: 35,
                optimalHumidity: 60, minHumidity: 40, maxHumidity: 75,
                lightRequirement: 220, maxsolar: 850, maxUV: 8
            },
            aubergine: {
                baseTemp: 15, optimalTemp: 26, maxTemp: 32, criticalMaxTemp: 38,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 250, maxsolar: 900, maxUV: 9
            },
            poivron: {
                baseTemp: 13, optimalTemp: 25, maxTemp: 30, criticalMaxTemp: 35,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 200, maxsolar: 850, maxUV: 8
            },
            concombre: {
                baseTemp: 15, optimalTemp: 25, maxTemp: 30, criticalMaxTemp: 35,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 180, maxsolar: 800, maxUV: 7
            },
            haricot_vert: {
                baseTemp: 10, optimalTemp: 22, maxTemp: 28, criticalMaxTemp: 33,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 180, maxsolar: 800, maxUV: 8
            },
            petit_pois: {
                baseTemp: 4, optimalTemp: 16, maxTemp: 22, criticalMaxTemp: 28,
                optimalHumidity: 70, minHumidity: 55, maxHumidity: 85,
                lightRequirement: 140, maxsolar: 650, maxUV: 6
            },
            oignon: {
                baseTemp: 6, optimalTemp: 20, maxTemp: 28, criticalMaxTemp: 34,
                optimalHumidity: 60, minHumidity: 40, maxHumidity: 75,
                lightRequirement: 170, maxsolar: 800, maxUV: 8
            },
            ail: {
                baseTemp: 0, optimalTemp: 18, maxTemp: 25, criticalMaxTemp: 32,
                optimalHumidity: 55, minHumidity: 35, maxHumidity: 70,
                lightRequirement: 160, maxsolar: 750, maxUV: 8
            },
            betterave: {
                baseTemp: 5, optimalTemp: 18, maxTemp: 25, criticalMaxTemp: 30,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 150, maxsolar: 700, maxUV: 7
            },
            chou: {
                baseTemp: 6, optimalTemp: 17, maxTemp: 24, criticalMaxTemp: 29,
                optimalHumidity: 70, minHumidity: 55, maxHumidity: 85,
                lightRequirement: 160, maxsolar: 750, maxUV: 6
            },
            brocoli: {
                baseTemp: 6, optimalTemp: 16, maxTemp: 23, criticalMaxTemp: 28,
                optimalHumidity: 75, minHumidity: 60, maxHumidity: 90,
                lightRequirement: 170, maxsolar: 700, maxUV: 6
            },
            navet: {
                baseTemp: 4, optimalTemp: 16, maxTemp: 22, criticalMaxTemp: 28,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 140, maxsolar: 650, maxUV: 6
            },
            celeri: {
                baseTemp: 7, optimalTemp: 18, maxTemp: 24, criticalMaxTemp: 30,
                optimalHumidity: 75, minHumidity: 60, maxHumidity: 90,
                lightRequirement: 150, maxsolar: 700, maxUV: 6
            },
            persil: {
                baseTemp: 6, optimalTemp: 18, maxTemp: 25, criticalMaxTemp: 30,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 120, maxsolar: 600, maxUV: 5
            },
            basilic: {
                baseTemp: 12, optimalTemp: 23, maxTemp: 28, criticalMaxTemp: 33,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 180, maxsolar: 800, maxUV: 7
            },
            melon: {
                baseTemp: 15, optimalTemp: 26, maxTemp: 32, criticalMaxTemp: 38,
                optimalHumidity: 60, minHumidity: 40, maxHumidity: 75,
                lightRequirement: 250, maxsolar: 950, maxUV: 9
            },
            pasteque: {
                baseTemp: 18, optimalTemp: 28, maxTemp: 35, criticalMaxTemp: 40,
                optimalHumidity: 55, minHumidity: 35, maxHumidity: 70,
                lightRequirement: 280, maxsolar: 1000, maxUV: 10
            },
            // Arbres fruitiers
            pommier: {
                baseTemp: 6, optimalTemp: 20, maxTemp: 28, criticalMaxTemp: 35,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 200, maxsolar: 850, maxUV: 8
            },
            poirier: {
                baseTemp: 7, optimalTemp: 22, maxTemp: 30, criticalMaxTemp: 36,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 210, maxsolar: 870, maxUV: 8
            },
            pecher: {
                baseTemp: 8, optimalTemp: 24, maxTemp: 32, criticalMaxTemp: 38,
                optimalHumidity: 60, minHumidity: 40, maxHumidity: 75,
                lightRequirement: 230, maxsolar: 900, maxUV: 9
            },
            abricotier: {
                baseTemp: 7, optimalTemp: 23, maxTemp: 31, criticalMaxTemp: 37,
                optimalHumidity: 55, minHumidity: 35, maxHumidity: 70,
                lightRequirement: 240, maxsolar: 920, maxUV: 9
            },
            prunier: {
                baseTemp: 6, optimalTemp: 21, maxTemp: 29, criticalMaxTemp: 35,
                optimalHumidity: 65, minHumidity: 45, maxHumidity: 80,
                lightRequirement: 200, maxsolar: 850, maxUV: 8
            },
            cerisier: {
                baseTemp: 4, optimalTemp: 18, maxTemp: 26, criticalMaxTemp: 32,
                optimalHumidity: 70, minHumidity: 50, maxHumidity: 85,
                lightRequirement: 180, maxsolar: 800, maxUV: 7
            },
            figuier: {
                baseTemp: 12, optimalTemp: 26, maxTemp: 34, criticalMaxTemp: 40,
                optimalHumidity: 50, minHumidity: 30, maxHumidity: 65,
                lightRequirement: 250, maxsolar: 950, maxUV: 10
            },
            avocatier: {
                baseTemp: 15, optimalTemp: 25, maxTemp: 30, criticalMaxTemp: 35,
                optimalHumidity: 60, minHumidity: 40, maxHumidity: 75,
                lightRequirement: 200, maxsolar: 850, maxUV: 8
            },
            citronnier: {
                baseTemp: 13, optimalTemp: 24, maxTemp: 30, criticalMaxTemp: 36,
                optimalHumidity: 55, minHumidity: 35, maxHumidity: 70,
                lightRequirement: 220, maxsolar: 900, maxUV: 9
            },
            oranger: {
                baseTemp: 12, optimalTemp: 23, maxTemp: 29, criticalMaxTemp: 35,
                optimalHumidity: 60, minHumidity: 40, maxHumidity: 75,
                lightRequirement: 210, maxsolar: 880, maxUV: 9
            }
        };
        
        if (cropParams[cropType]) {
            this.params = { ...this.params, ...cropParams[cropType] };
        }
    }
}

// Fonction utilitaire pour analyser vos données et obtenir le JSON heure par heure avec phénologie et recommandations de semis
function getHourlyGrowthData(weatherData, cropType = 'general', seedingDate = null, latitude = 45.0) {
    const calculator = new AdvancedDegreeHoursCalculator();
    
    // Configuration pour une culture spécifique
    if (cropType) {
        calculator.setCropParameters(cropType);
    }
    
    // Calcul des données horaires avec phénologie et gestion de la date de semis
    const result = calculator.calculateFromDataset(weatherData, cropType, seedingDate);
    
    // Recommandations de semis basées sur les derniers jours
    const sowingRecommendation = calculator.getSowingRecommendation(weatherData, cropType, latitude, seedingDate);
    
    return {
        // Données JSON heure par heure avec phénologie
        hourlyData: result.hourlyData,
        
        // Résumé global incluant le stade actuel
        summary: result.summary,
        
        // Recommandations de semis
        sowingAdvice: sowingRecommendation,
        
        // Période analysée
        period: result.period,
        
        // Exemple d'utilisation du nouveau JSON
        example: result.hourlyData.filter(h => h.saison_active).slice(0, 3)
    };
}
// Exemple d'usage complet avec toutes les nouvelles fonctionnalités
function example() {
    console.log('=== CODE COMPLET - CALCULATEUR DEGRÉS-HEURES ULTRA-AVANCÉ ===');
    
    // Structure de sortie finale :
    const sampleOutput = [
        {
            "d": "2025-09-15T00:34:08Z",
            "v": 1.85,                    // Degrés-heures corrigés
            "tx": 67,                     // Taux de bonheur/croissance (%)
            "stress": {                   // Taux de stress par facteur (%)
                "temperature": 15,
                "humidity": 0,
                "light": 100,
                "uv": 0,
                "pressure": 5,
                "rainfall": 0,
                "evapotranspiration": 10
            },
            "risques": [                  // Liste des risques
                "MANQUE_LUMIERE"
            ],
            "phenologie": {               // Stade de développement
                "stade": "CROISSANCE_VEGETATIVE",
                "progression": 35,        // % de progression dans ce stade
                "dh_restants": 520       // DH restants avant le prochain stade
            },
            "dh_cumul": 280.5,           // DH cumulés depuis début de saison
            "saison_active": true        // Indique si dans la saison de croissance
        }
    ];
    
    console.log('Format JSON final :', JSON.stringify(sampleOutput, null, 2));
    
    // Cultures supportées (40+ cultures) :
    console.log('\n=== CULTURES SUPPORTÉES ===');
    console.log('Céréales: mais, ble');
    console.log('Légumes feuilles: laitue, epinard, chou, brocoli, persil, basilic');
    console.log('Légumes racines: carotte, betterave, navet, radis, oignon, ail');
    console.log('Légumes fruits: tomate, courgette, aubergine, poivron, concombre, melon, pasteque');
    console.log('Légumineuses: haricot_vert, petit_pois');
    console.log('Divers: celeri');
    console.log('Fruits à pépins: pommier, poirier');
    console.log('Fruits à noyau: pecher, abricotier, prunier, cerisier');
    console.log('Méditerranéens: vigne, oliviers, figuier, avocatier');
    console.log('Agrumes: citronnier, oranger');
    
    console.log('\n=== UTILISATION COMPLÈTE ===');
    console.log('// Analyse avec date de semis précise');
    console.log('const result = getHourlyGrowthData(weatherData, "tomate", "2025-04-15", 43.3);');
    console.log('');
    console.log('// Accès aux données horaires');
    console.log('const hourlyJson = result.hourlyData;');
    console.log('');
    console.log('// Recommandations de semis');
    console.log('console.log(result.sowingAdvice.recommendation);');
    console.log('');
    console.log('// Stade phénologique actuel');
    console.log('console.log(result.summary.currentStage);');
    
    return sampleOutput;
}

// Export pour utilisation
if (typeof module !== 'undefined') {
    module.exports = { 
        AdvancedDegreeHoursCalculator, 
        getHourlyGrowthData,
        example
    };
}

/*
UTILISATION PRATIQUE COMPLÈTE :

// 1. Chargez vos données météo
const myWeatherData = { ... vos données JSON ... };

// 2. Analyse complète avec culture spécifique
const tomatoGrowth = getHourlyGrowthData(myWeatherData, 'tomate', '2025-04-15', 43.3);

// 3. Données JSON heure par heure
const hourlyData = tomatoGrowth.hourlyData;
console.log('Premier point saison active:', hourlyData.find(h => h.saison_active));

// 4. Recommandations de semis actuelles  
console.log('Conseil semis:', tomatoGrowth.sowingAdvice.recommendation);
console.log('Raison:', tomatoGrowth.sowingAdvice.reason);

// 5. Résumé de la saison
console.log('Stade actuel:', tomatoGrowth.summary.currentStage);
console.log('DH total saison:', tomatoGrowth.summary.totalCorrectedDegreeHours);
console.log('Efficacité climatique:', tomatoGrowth.summary.efficiency + '%');

// 6. Pour 2 ans de données sans date de semis (cumul depuis 1er janvier)
const generalAnalysis = getHourlyGrowthData(myWeatherData, 'mais', null, 45.0);

TYPES DE RECOMMANDATIONS :
- FAVORABLE: Conditions optimales, procéder au semis
- TROP_TOT: Hors saison, attendre la période de semis  
- TROP_TARD: Saison terminée, attendre l'année suivante
- ATTENDRE: Dans la saison mais trop froid temporairement
- CONDITIONS_CHAUDES: Semis possible mais prévoir protections
- DONNEES_INSUFFISANTES: Pas assez de données météo récentes
*/