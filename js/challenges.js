// Mystery-SED challenges: definitions, seeded RNG and synthetic photometry.
// Pure, no DOM. The UI (ui.js) runs them.
import { totalModel, interpLogLog, massForFrac } from './physics.js';
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
  'belt1.M': {
    label: 'Belt 1 dust mass (M⊕)', controls: ['M'],
    get: (s) => s.belt1.M, reset: (s, def) => { s.belt1.M = def.belt1.M; },
  },
  'belt2.r': {
    label: 'Belt 2 distance (AU)', controls: ['b2in', 'b2out'],
    get: (s) => s.belt2.rIn, reset: (s, def) => { s.belt2.rIn = def.belt2.rIn; s.belt2.rOut = def.belt2.rIn; },
  },
  'belt2.M': {
    label: 'Belt 2 dust mass (M⊕)', controls: ['b2M'],
    get: (s) => s.belt2.M, reset: (s, def) => { s.belt2.M = def.belt2.M; },
  },
  'ism.Av': {
    label: 'Interstellar dimming A_V (mag)', controls: ['Av'],
    get: (s) => s.ism.Av, reset: (s) => { s.ism.Av = 0; },
  },
};

const SUN = { T: 5772, R: 1, d: 10 };
// A belt ring at r AU with fractional luminosity f, stored as the mass that gives it.
const ring = (r, f) => ({ on: true, rIn: r, rOut: r, M: sig3(massForFrac(f, r, r)), lambda0: 100, beta: 0 });
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
    id: 'reddened-star',
    title: '2. Reddened star',
    prompt: 'This star is 50 pc away and has no dust of its own, but starlight is dimmed on its way to us by interstellar dust. The star\'s size and distance are known. Find its temperature and the dimming A_V. Hint: the IRAC and MIPS points barely feel the dust, so they pin the temperature first; then the dimming explains the optical and near-infrared points.',
    mode: 'simple',
    free: ['star.T', 'ism.Av'],
    makeHidden: (rng) => make('simple', {
      star: { T: sig3(logUniform(rng, 4000, 9000)), R: sig3(logUniform(rng, 0.8, 2.5)), d: 50 },
      ism: { linked: false, Av: sig3(1 + 4 * rng()) },
      belt1: { ...defaultState().belt1, on: false },
    }),
  },
  {
    id: 'find-dust',
    title: '3. Find the dust',
    prompt: 'The star is a Sun-like star at 10 pc, already set for you. There is a dust belt. Find how far from the star it is and how much dust it holds.',
    mode: 'simple',
    free: ['belt1.r', 'belt1.M'],
    makeHidden: (rng) => make('simple', {
      star: { ...SUN },
      belt1: ring(sig3(logUniform(rng, 5, 100)), sig3(logUniform(rng, 1e-5, 1e-3))),
    }),
  },
  {
    id: 'star-and-dust',
    title: '4. Star and dust',
    prompt: 'The distance is fixed at 10 pc. Everything else is unknown: the star\'s temperature and size, and the dust belt\'s distance and mass. Use the shape of the star\'s curve first, then the infrared excess. (If the distance were free too, a bigger star farther away with a wider belt would fit equally well.)',
    mode: 'simple',
    free: ['star.T', 'star.R', 'belt1.r', 'belt1.M'],
    makeHidden: (rng) => make('simple', {
      star: {
        T: sig3(logUniform(rng, 3500, 10000)),
        R: sig3(logUniform(rng, 0.7, 3)),
        d: 10,
      },
      belt1: ring(sig3(logUniform(rng, 5, 100)), sig3(logUniform(rng, 1e-5, 1e-3))),
    }),
  },
  {
    id: 'two-belts',
    title: '5. Two belts (Advanced)',
    prompt: 'The star is known. There are two dust belts. Belt 1 is the warm, inner one and belt 2 is the cold, outer one. Find the distance and dust mass of each.',
    mode: 'advanced',
    free: ['belt1.r', 'belt1.M', 'belt2.r', 'belt2.M'],
    makeHidden: () => make('advanced', {
      star: { T: 7400, R: 1.4, d: 41 },
      belt1: ring(8, 3e-4),
      belt2: ring(90, 1.5e-4),
    }),
  },
];
function gaussian(rng) {
  const u1 = 1 - rng(); // in (0, 1]
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// One point per band (14, in increasing wavelength), value =
// model total * (1 + noiseFrac * gaussian), error = noiseFrac * value.
export function syntheticPhotometry(hidden, rng, noiseFrac = 0.07) {
  const model = totalModel(toPhysicsParams(hidden));
  const lams = BANDS.map((b) => b.lamUm);
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
  s.holdBrightness = false;
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
