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
};

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

// params = { star: {T,R,d}, belts: [belt, ...] } -> model on the standard grid.
export function totalModel({ star, belts }) {
  const grid = makeGrid();
  const starF = starFlux(grid, star);
  const beltF = belts.map((b) => beltFlux(grid, star, b));
  const total = Float64Array.from(starF);
  for (const bf of beltF) for (let i = 0; i < total.length; i++) total[i] += bf[i];
  return { grid, star: starF, belts: beltF, total };
}

// Log-log interpolated total/star at lamUm.
export function excessRatio(gridUm, total, star, lamUm) {
  return interpLogLogRaw(gridUm, total, lamUm) / interpLogLogRaw(gridUm, star, lamUm);
}

// Linear in (log lambda, log value). NaN outside the grid.
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
