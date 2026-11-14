// Mystery-SED challenges: definitions, seeded RNG and synthetic photometry.
// Pure, no DOM. The UI (ui.js) runs them.
import { totalModel, interpLogLog } from './physics.js';
import { BANDS } from './bands.js';
import { defaultState, normalizeState, toPhysicsParams } from './model.js';

// Small deterministic PRNG so a challenge can be reproduced from a seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const logUniform = (rng, lo, hi) => Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo)));
const sig3 = (v) => Number(v.toPrecision(3));

// Parameters a challenge can ask the student to find, keyed by path.
// controls: slider ids that stay enabled. get: read the value. reset: put the
// student's starting value back to the page default.
const PARAMS = {
  'star.T': {
    label: 'Star temperature (K)', controls: ['T'],
    get: (s) => s.star.T, reset: (s, def) => { s.star.T = def.star.T; },
  },
  'star.R': {
    label: 'Star size (R☉)', controls: ['R'],
    get: (s) => s.star.R, reset: (s, def) => { s.star.R = def.star.R; },
  },
  'star.d': {
    label: 'Distance (pc)', controls: ['d'],
    get: (s) => s.star.d, reset: (s, def) => { s.star.d = def.star.d; },
  },
  'belt1.r': {
    label: 'Belt 1 distance (AU)', controls: ['r', 'b1in', 'b1out'],
    get: (s) => s.belt1.rIn, reset: (s, def) => { s.belt1.rIn = def.belt1.rIn; s.belt1.rOut = def.belt1.rIn; },
  },
  'belt1.f': {
    label: 'Belt 1 brightness (L_dust/L★)', controls: ['f'],
    get: (s) => s.belt1.f, reset: (s, def) => { s.belt1.f = def.belt1.f; },
  },
  'belt1.lambda0': {
    label: 'Belt 1 λ₀ (µm)', controls: ['b1l0'],
    get: (s) => s.belt1.lambda0, reset: (s, def) => { s.belt1.lambda0 = def.belt1.lambda0; },
  },
  'belt1.beta': {
    label: 'Belt 1 β', controls: ['b1beta'],
    get: (s) => s.belt1.beta, reset: (s, def) => { s.belt1.beta = def.belt1.beta; },
  },
  'belt2.r': {
    label: 'Belt 2 distance (AU)', controls: ['b2in', 'b2out'],
    get: (s) => s.belt2.rIn, reset: (s, def) => { s.belt2.rIn = def.belt2.rIn; s.belt2.rOut = def.belt2.rIn; },
  },
  'belt2.f': {
    label: 'Belt 2 brightness (L_dust/L★)', controls: ['b2f'],
    get: (s) => s.belt2.f, reset: (s, def) => { s.belt2.f = def.belt2.f; },
  },
};

const SUN = { T: 5772, R: 1, d: 10 };
const ring = (r, f, extra = {}) => ({ on: true, rIn: r, rOut: r, f, lambda0: 100, beta: 0, ...extra });
const make = (mode, parts) => normalizeState({ ...defaultState(), mode, ...parts });

export const CHALLENGES = [
  {
    id: 'bare-star',
    title: '1. Bare star',
    prompt: 'This star has no dust. Its distance is fixed at 10 pc. Adjust the temperature and size until your curve passes through the data points.',
    mode: 'simple',
    free: ['star.T', 'star.R'],
    makeHidden: (rng) => make('simple', {
      star: { T: sig3(logUniform(rng, 3000, 12000)), R: sig3(logUniform(rng, 0.5, 5)), d: 10 },
      belt1: { ...defaultState().belt1, on: false },
    }),
  },
  {
    id: 'find-dust',
    title: '2. Find the dust',
    prompt: 'The star is a Sun-like star at 10 pc, already set for you. There is a dust belt. Find how far from the star it is and how bright it is.',
    mode: 'simple',
    free: ['belt1.r', 'belt1.f'],
    makeHidden: (rng) => make('simple', {
      star: { ...SUN },
      belt1: ring(sig3(logUniform(rng, 5, 200)), sig3(logUniform(rng, 1e-5, 1e-3))),
    }),
  },
  {
    id: 'star-and-dust',
    title: '3. Star and dust',
    prompt: 'The distance is fixed at 10 pc. Everything else is unknown: the star\'s temperature and size, and the dust belt\'s distance and brightness. Use the shape of the star\'s curve first, then the infrared excess. (If the distance were free too, a bigger star farther away with a wider belt would fit equally well.)',
    mode: 'simple',
    free: ['star.T', 'star.R', 'belt1.r', 'belt1.f'],
    makeHidden: (rng) => make('simple', {
      star: {
        T: sig3(logUniform(rng, 3500, 10000)),
        R: sig3(logUniform(rng, 0.7, 3)),
        d: 10,
      },
      belt1: ring(sig3(logUniform(rng, 5, 200)), sig3(logUniform(rng, 1e-5, 1e-3))),
    }),
  },
  {
    id: 'two-belts',
    title: '4. Two belts (Advanced)',
    prompt: 'The star is known. There are two dust belts. Belt 1 is the warm, inner one and belt 2 is the cold, outer one. Find the distance and brightness of each.',
    mode: 'advanced',
    free: ['belt1.r', 'belt1.f', 'belt2.r', 'belt2.f'],
    makeHidden: () => make('advanced', {
      star: { T: 7400, R: 1.4, d: 41 },
      belt1: ring(8, 3e-4),
      belt2: ring(90, 1.5e-4),
    }),
  },
  {
    id: 'submm-slope',
    title: '5. Submillimetre slope (Advanced)',
    prompt: 'The star and the belt\'s distance and brightness are known. The dust is not made of perfect blackbody grains: find the emissivity slope β (and the turnover λ₀) from the points beyond 100 µm.',
    mode: 'advanced',
    free: ['belt1.beta', 'belt1.lambda0'],
    makeHidden: () => make('advanced', {
      star: { T: 9600, R: 2.7, d: 7.7 },
      belt1: ring(80, 5e-5, { lambda0: 150, beta: 1.5 }),
    }),
  },
];
function gaussian(rng) {
  const u1 = 1 - rng(); // in (0, 1]
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// One point per unique band wavelength (BANDS repeats 70 and 160 µm), value =
// model total * (1 + noiseFrac * gaussian), error = noiseFrac * value.
export function syntheticPhotometry(hidden, rng, noiseFrac = 0.07) {
  const model = totalModel(toPhysicsParams(hidden));
  const lams = [...new Set(BANDS.map((b) => b.lamUm))].sort((a, b) => a - b);
  return lams.map((lamUm) => {
    const truth = interpLogLog(model.grid, model.total, lamUm);
    const fLam = Math.max(truth * (1 + noiseFrac * gaussian(rng)), truth * 0.01);
    return { lamUm, fLam, errFlam: noiseFrac * fLam };
  });
}

// What the student starts from: non-free parameters copied from the hidden
// truth (and locked), free parameters at the page defaults.
export function startState(challenge, hidden) {
  const s = JSON.parse(JSON.stringify(hidden));
  const def = defaultState();
  for (const path of challenge.free) PARAMS[path].reset(s, def);
  s.mode = challenge.mode;
  return normalizeState(s);
}

// Slider ids the student may move in this challenge.
export function freeControlIds(challenge) {
  const ids = new Set();
  for (const path of challenge.free) for (const id of PARAMS[path].controls) ids.add(id);
  return ids;
}

// Rows for the "Reveal" table: true vs the student's current values.
export function compareValues(challenge, hidden, student) {
  return challenge.free.map((path) => ({
    label: PARAMS[path].label,
    truth: PARAMS[path].get(hidden),
    student: PARAMS[path].get(student),
  }));
}
