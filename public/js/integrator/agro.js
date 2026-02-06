/********************************************************************
 * 1.  Aide : conversion Kelvin → °C
 ********************************************************************/
const K = 273.15;
const toC = k => Number((k - K).toFixed(1));

/********************************************************************
 * 2.  acclimDyn(history, stageDef) → temp object corrigé
 *     - history : tableau des points horaires (unité K)
 *     - stageDef : objet temp complet du stage (contient acclim)
 *     renvoie un clone de stageDef.temp avec μ et σ mis à jour
 ********************************************************************/
function acclimDyn(history, stageDef) {
  if (!stageDef.temp.acclim) return { ...stageDef.temp }; // pas d'acclimatation

  const { tauDays, shiftPerDegree, shrinkPerDegree } = stageDef.temp.acclim;
  const tau = tauDays * 24; // en heures
  const alpha = 1 - Math.exp(-1 / tau); // facteur EMA

  let emaTemp = toC(history[0].temperature); // initialisation
  for (let i = 1; i < history.length; i++) {
    const t = toC(history[i].temperature);
    emaTemp = alpha * t + (1 - alpha) * emaTemp;
  }
  const μFixed = stageDef.temp.opt;
  const σFixed = (stageDef.temp.max - stageDef.temp.min) / 4; // σ ≈ ¼ plage tolérée

  const delta = emaTemp - μFixed;
  const μDyn = μFixed + delta * shiftPerDegree;
  const σDyn = Math.max(0.5, σFixed * (1 - Math.abs(delta) * shrinkPerDegree));

  return {
    ...stageDef.temp,
    opt: μDyn,
    sigma: σDyn
  };
}

/********************************************************************
 * 3.  betaScore(history, cropDef, stageKey) → coefficient [-1, 1]
 *     - history : tableau brut (unités mixtes, T en K)
 *     - cropDef : objet complet tomato
 *     - stageKey : "SOWING" | "GERMINATION" | ...
 ********************************************************************/
function betaScore(history, cropDef, stageKey) {
  const stage = cropDef.stages[stageKey];
  if (!stage) throw new Error("Unknown stage " + stageKey);

  // 3a. acclimatation dynamique
  const temp = acclimDyn(history, stage);

  // 3b. paramètres β
  const { min: tMin, max: tMax, opt: μ, lethalLow, lethalHigh } = temp;
  const σ = temp.sigma || (tMax - tMin) / 4;
  const m = (temp.betaShape && temp.betaShape.m) || 2.0;
  const n = (temp.betaShape && temp.betaShape.n) || 3.0;

  // 3c. moyennes journalières sur l’historique
  const avgTemp = history.reduce((s, h) => s + toC(h.temperature), 0) / history.length;
  const avgRH = history.reduce((s, h) => s + (h.humidity || 0), 0) / history.length;
  const avgRad = history.reduce((s, h) => s + (h.irradiance || 0), 0) / history.length;
  const avgWind = history.reduce((s, h) => s + (h.speed || 0), 0) / history.length;
  const avgET = history.reduce((s, h) => s + (h.rain_ET || 0), 0) / history.length;

  // 3d. score thermique β
  let f = 0;
  if (avgTemp <= lethalLow || avgTemp >= lethalHigh) f = -1;
  else if (avgTemp <= tMin) {
    f = (avgTemp - lethalLow) / (tMin - lethalLow); // 0 → -1
  } else if (avgTemp >= tMax) {
    f = (lethalHigh - avgTemp) / (lethalHigh - tMax); // 0 → -1
  } else {
    // loi β normalisée entre 0 et 1
    const x = (avgTemp - tMin) / (tMax - tMin);
    const B = Math.pow(x, m) * Math.pow(1 - x, n);
    const Bmax = Math.pow(m / (m + n), m) * Math.pow(n / (m + n), n);
    f = B / Bmax; // 0 … 1
  }

  // 3e. facteurs correctifs secondaires
  const hr = stage.humidity;
  if (avgRH < hr.lethalLow || avgRH > hr.lethalHigh) f = -1;
  else if (avgRH < hr.min || avgRH > hr.max) {
    const d = Math.min(Math.abs(avgRH - hr.opt), 20);
    f *= 1 - 0.03 * d; // pénalité 3 % par point d’écart
  }

  if (avgRad < stage.lightPower.min) f *= 0.85;
  if (avgWind > stage.windMax_m_s) f *= 0.90;
  if (avgET < stage.water * 0.6) f *= 0.95; // stress hydrique

  return Math.max(-1, Math.min(1, f));
}

/* ------------------------------------------------------------------ */
/* ------------------------  EXEMPLE D’USAGE  ----------------------- */
/* ------------------------------------------------------------------ */
// const score = betaScore(history.data, tomato, "VEGETATIVE");
// console.log("β-score VEGETATIVE :", score.toFixed(2));