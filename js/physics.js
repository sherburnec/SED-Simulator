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
