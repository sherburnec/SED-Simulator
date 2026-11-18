// Physics core for the SED simulator. Pure functions, no DOM.
// Internal units are cgs. Wavelengths at module boundaries are in micrometres;
// F_lambda at boundaries is erg s^-1 cm^-2 cm^-1 unless a function says otherwise.

export const CONST = {
  h: 6.62607015e-27,      // erg s
  c: 2.99792458e10,       // cm/s
  k: 1.380649e-16,        // erg/K
  sigma: 5.670374419e-5,  // erg cm^-2 s^-1 K^-4
  Lsun: 3.828e33,         // erg/s
  Rsun: 6.957e10,         // cm
  AU: 1.495978707e13,     // cm
  pc: 3.0856775814914e18, // cm
  um: 1e-4,               // cm per micrometre
  Mearth: 5.972e27,       // g
};

// Single grain size for the mass <-> brightness conversion.
export const GRAIN = { aUm: 10, rho: 2.5 }; // radius (um), density (g cm^-3)
export const F_MAX = 0.1;        // optically thin model is meaningless beyond this
export const AV_PER_KPC = 1.0;   // rough Galactic-plane average, mag per kpc

// Log-spaced wavelength grid in micrometres, endpoints inclusive.
export function makeGrid(minUm = 0.05, maxUm = 3000, n = 500) {
  const g = new Float64Array(n);
  const a = Math.log(minUm);
  const step = (Math.log(maxUm) - a) / (n - 1);
  for (let i = 0; i < n; i++) g[i] = Math.exp(a + step * i);
  g[0] = minUm;
  g[n - 1] = maxUm;
  return g;
}

// Planck function per unit wavelength:
//   B_lambda(T) = (2 h c^2 / lambda^5) / (exp(h c / (lambda k T)) - 1)
// Returns erg s^-1 cm^-2 sr^-1 cm^-1. Overflowing exponentials give 0.
export function planckLam(lamUm, T) {
  const lam = lamUm * CONST.um;
  const x = (CONST.h * CONST.c) / (lam * CONST.k * T);
  const denom = Math.expm1(x);
  if (!Number.isFinite(denom)) return 0;
  return (2 * CONST.h * CONST.c * CONST.c) / (lam ** 5) / denom;
}

// Observed stellar flux: F_lambda = pi * B_lambda(T) * (R/d)^2, R in Rsun, d in pc.
export function starFlux(gridUm, { T, R, d }) {
  const ratio = (R * CONST.Rsun) / (d * CONST.pc);
  const geom = Math.PI * ratio * ratio;
  const out = new Float64Array(gridUm.length);
  for (let i = 0; i < gridUm.length; i++) out[i] = geom * planckLam(gridUm[i], T);
  return out;
}

// Stefan-Boltzmann: L = 4 pi R^2 sigma T^4, returned in Lsun (R in Rsun).
export function luminosity(T, R) {
  const r = R * CONST.Rsun;
  return (4 * Math.PI * r * r * CONST.sigma * T ** 4) / CONST.Lsun;
}

// Wien displacement law for the peak of F_lambda: lambda_peak = 2898 um K / T.
export function wienPeakUm(T) {
  return 2898 / T;
}

// Convert F_lambda (cgs, per cm) at lamUm into a display unit.
//   lamFlam: lambda[cm] * F_lambda                 (erg s^-1 cm^-2)
//   Fnu:     F_lambda * lambda^2 / c * 1e23        (Jy)
//   Flam:    F_lambda * 1e-4                        (erg s^-1 cm^-2 um^-1)
export function convertFlux(lamUm, fLam, unit) {
  const lam = lamUm * CONST.um;
  switch (unit) {
    case 'lamFlam': return lam * fLam;
    case 'Fnu': return (fLam * lam * lam / CONST.c) * 1e23;
    case 'Flam': return fLam * 1e-4;
    default: throw new Error(`unknown flux unit: ${unit}`);
  }
}

// Inverse of convertFlux: display-unit value back to F_lambda (cgs, per cm).
export function toFlamCgs(lamUm, value, unit) {
  const lam = lamUm * CONST.um;
  switch (unit) {
    case 'lamFlam': return value / lam;
    case 'Fnu': return (value * 1e-23 * CONST.c) / (lam * lam);
    case 'Flam': return value * 1e4;
    default: throw new Error(`unknown flux unit: ${unit}`);
  }
}

export function convertArray(gridUm, arr, unit) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = convertFlux(gridUm[i], arr[i], unit);
  return out;
}

// Index of the maximum value.
export function peakIndex(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

// ---------------------------------------------------------------------------
// Debris dust
// ---------------------------------------------------------------------------

// Blackbody grains in radiative equilibrium: T_d = 278.3 K * L^(1/4) * r^(-1/2)
// (L in Lsun, r in AU).
export function dustTemp(L, rAu) {
  return 278.3 * Math.pow(L, 0.25) / Math.sqrt(rAu);
}

// Grain emissivity: Q = 1 for lambda <= lambda0, (lambda0/lambda)^beta beyond.
export function emissivity(lamUm, lambda0Um, beta) {
  return lamUm <= lambda0Um ? 1 : Math.pow(lambda0Um / lamUm, beta);
}

// Wide log grid (um) used only to normalise belt spectra, so the integral is
// not truncated by the plotted range. Built once at load.
const NORM_GRID = makeGrid(0.01, 1e6, 500);

// norm(T, lambda0, beta) = integral of Q(lambda) B_lambda(T) d(lambda), cgs.
export function beltNorm(T, lambda0, beta) {
  let sum = 0;
  let prevLam = NORM_GRID[0];
  let prev = emissivity(prevLam, lambda0, beta) * planckLam(prevLam, T);
  for (let i = 1; i < NORM_GRID.length; i++) {
    const lam = NORM_GRID[i];
    const cur = emissivity(lam, lambda0, beta) * planckLam(lam, T);
    sum += 0.5 * (cur + prev) * (lam - prevLam) * CONST.um;
    prev = cur;
    prevLam = lam;
  }
  return sum;
}

const N_ANNULI = 30;

// Split a belt into rings: [{ r, share }] where share is the fraction of the
// belt's fractional luminosity f carried by that ring. A belt with
// rIn === rOut is one ring. An extended belt has 30 log-spaced annuli with
// surface density proportional to 1/r, so the cross-sectional area of an
// annulus is proportional to its width dr. f is the fraction of starlight
// absorbed and re-emitted, and an annulus at r intercepts area/(4 pi r^2)
// of it, so its share is proportional to dr/r^2, i.e. (1/a - 1/b).
export function beltRings({ rIn, rOut }) {
  if (rIn === rOut) return [{ r: rIn, share: 1 }];
  const lo = Math.log(rIn);
  const step = (Math.log(rOut) - lo) / N_ANNULI;
  const norm = 1 / rIn - 1 / rOut;
  const rings = [];
  for (let i = 0; i < N_ANNULI; i++) {
    const a = Math.exp(lo + step * i);
    const b = Math.exp(lo + step * (i + 1));
    rings.push({ r: Math.sqrt(a * b), share: (1 / a - 1 / b) / norm });
  }
  return rings;
}

// Belt spectrum (F_lambda, cgs), normalised so its integral is
// f * L_star / (4 pi d^2):
//   F = [share * f * L * Lsun / (4 pi d^2)] * Q(lambda) B(T_d) / norm(T_d)
export function beltFlux(gridUm, star, belt) {
  const { f, lambda0, beta } = belt;
  const L = luminosity(star.T, star.R);
  const dist = star.d * CONST.pc;
  const totalFlux = (f * L * CONST.Lsun) / (4 * Math.PI * dist * dist);
  const out = new Float64Array(gridUm.length);
  for (const { r, share } of beltRings(belt)) {
    const Td = dustTemp(L, r);
    const norm = beltNorm(Td, lambda0, beta);
    if (!(norm > 0)) continue;
    const scale = (share * totalFlux) / norm;
    for (let i = 0; i < gridUm.length; i++) {
      out[i] += scale * emissivity(gridUm[i], lambda0, beta) * planckLam(gridUm[i], Td);
    }
  }
  return out;
}

// [Tmin, Tmax] of the dust: hotter at rIn. Equal for a ring.
export function beltTempRange(L, { rIn, rOut }) {
  return [dustTemp(L, rOut), dustTemp(L, rIn)];
}

// ---------------------------------------------------------------------------
// Interstellar extinction and dust mass
// ---------------------------------------------------------------------------

const RV = 3.1;

// Cardelli, Clayton & Mathis 1989 (ApJ 345, 245): A_lambda/A_V = a(x) + b(x)/R_V,
// x = 1/lambda in 1/um, valid 0.3 <= x <= 10.
function ccm(x) {
  let a;
  let b;
  if (x < 1.1) {
    const p = x ** 1.61;
    a = 0.574 * p;
    b = -0.527 * p;
  } else if (x < 3.3) {
    const y = x - 1.82;
    a = 1 + y * (0.17699 + y * (-0.50447 + y * (-0.02427 + y * (0.72085 + y * (0.01979 + y * (-0.77530 + y * 0.32999))))));
    b = y * (1.41338 + y * (2.28305 + y * (1.07233 + y * (-5.38434 + y * (-0.62251 + y * (5.30260 + y * -2.09002))))));
  } else if (x < 8) {
    let fa = 0;
    let fb = 0;
    if (x >= 5.9) {
      const u = x - 5.9;
      fa = -0.04473 * u * u - 0.009779 * u ** 3;
      fb = 0.2130 * u * u + 0.1207 * u ** 3;
    }
    a = 1.752 - 0.316 * x - 0.104 / ((x - 4.67) ** 2 + 0.341) + fa;
    b = -3.090 + 1.825 * x + 1.206 / ((x - 4.62) ** 2 + 0.263) + fb;
  } else {
    const u = x - 8;
    a = -1.073 - 0.628 * u + 0.137 * u * u - 0.070 * u ** 3;
    b = 13.670 + 4.257 * u - 0.420 * u * u + 0.374 * u ** 3;
  }
  return a + b / RV;
}

// A_lambda / A_V (R_V = 3.1):
//   0.1-2.159 um: CCM89. Below 0.1 um: held at the 0.1 um value.
//   2.159-8 um: Indebetouw et al. 2005 (ApJ 619, 931),
//     log(A/A_Ks) = 0.61 - 2.22 log(lam) + 1.21 log(lam)^2, times A_Ks/A_V.
//   8-24 um: held at the 8 um value (the 9.7 um silicate feature is omitted).
//   > 24 um: the 24 um value times (24/lam)^2.
export function extinctionRatio(lamUm) {
  const KS = 2.159;
  if (lamUm <= KS) return ccm(1 / Math.max(lamUm, 0.1));
  const indebetouw = (l) => {
    const lg = Math.log10(l);
    return ccm(1 / KS) * 10 ** (0.61 - 2.22 * lg + 1.21 * lg * lg);
  };
  if (lamUm <= 8) return indebetouw(lamUm);
  if (lamUm <= 24) return indebetouw(8);
  return indebetouw(8) * (24 / lamUm) ** 2;
}

// Typical Galactic-plane reddening: A_V grows linearly with distance.
export function avForDistance(dPc) {
  return (AV_PER_KPC * dPc) / 1000;
}

// Optically thin belt of single-size grains (radius a, density rho, mass M):
// total cross-section = 3M/(4 rho a); a belt at r intercepts sigma/(4 pi r^2) of
// the starlight, which for Sigma ~ 1/r integrates to 1/(r_in r_out):
//   f = 3 M / (16 pi rho a r_in r_out)   (M in Earth masses, radii in AU)
const fracFactor = () => (3 * CONST.Mearth) / (16 * Math.PI * GRAIN.rho * GRAIN.aUm * CONST.um * CONST.AU * CONST.AU);

export function fracFromMass(Mearth, rInAu, rOutAu) {
  return (fracFactor() * Mearth) / (rInAu * rOutAu);
}

export function massForFrac(f, rInAu, rOutAu) {
  return (f * rInAu * rOutAu) / fracFactor();
}

// params = { star: {T,R,d}, belts: [belt, ...], Av }. star, belts and total are
// as observed (reddened by Av); starIntrinsic is the unreddened star.
export function totalModel({ star, belts, Av = 0 }) {
  const grid = makeGrid();
  const starIntrinsic = starFlux(grid, star);
  const att = new Float64Array(grid.length);
  for (let i = 0; i < grid.length; i++) att[i] = Av > 0 ? 10 ** (-0.4 * Av * extinctionRatio(grid[i])) : 1;
  const redden = (arr) => arr.map((v, i) => v * att[i]);
  const starF = redden(starIntrinsic);
  const beltF = belts.map((b) => redden(beltFlux(grid, star, b)));
  const total = Float64Array.from(starF);
  for (const bf of beltF) for (let i = 0; i < total.length; i++) total[i] += bf[i];
  return { grid, star: starF, starIntrinsic, belts: beltF, total };
}

// Log-log interpolated total/star at lamUm.
export function excessRatio(gridUm, total, star, lamUm) {
  return interpLogLogRaw(gridUm, total, lamUm) / interpLogLogRaw(gridUm, star, lamUm);
}

// Linear in (log lambda, log value). NaN outside the grid.
export function interpLogLog(gridUm, values, lamUm) {
  return interpLogLogRaw(gridUm, values, lamUm);
}

function interpLogLogRaw(gridUm, values, lamUm) {
  const n = gridUm.length;
  if (!(lamUm >= gridUm[0] && lamUm <= gridUm[n - 1])) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (gridUm[mid] <= lamUm) lo = mid; else hi = mid;
  }
  const v0 = values[lo];
  const v1 = values[hi];
  if (!(v0 > 0) || !(v1 > 0)) return v0 + (v1 - v0) * ((lamUm - gridUm[lo]) / (gridUm[hi] - gridUm[lo]));
  const t = Math.log(lamUm / gridUm[lo]) / Math.log(gridUm[hi] / gridUm[lo]);
  return Math.exp(Math.log(v0) + t * (Math.log(v1) - Math.log(v0)));
}

// Chi-squared of photometric points against a model on gridUm.
// points = [{ lamUm, fLam, errFlam|null }] (F_lambda cgs). A missing error is
// taken as 10% of the data value and counted in assumedErrCount. Points
// outside the grid, and points with fit === false (Do Not Fit), are ignored. dof = N - nFree; reduced is null if dof <= 0.
export function chi2(points, gridUm, total, nFree) {
  let sum = 0;
  let n = 0;
  let assumedErrCount = 0;
  for (const p of points) {
    if (p.fit === false) continue;
    const model = interpLogLog(gridUm, total, p.lamUm);
    if (!Number.isFinite(model)) continue;
    let sigma = p.errFlam;
    if (sigma === null || sigma === undefined || !(sigma > 0)) {
      sigma = 0.1 * p.fLam;
      assumedErrCount++;
    }
    const r = (p.fLam - model) / sigma;
    sum += r * r;
    n++;
  }
  const dof = n - nFree;
  return { chi2: sum, dof, reduced: dof > 0 ? sum / dof : null, assumedErrCount };
}
