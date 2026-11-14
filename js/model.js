// App state: shape, ranges, defaults, simple/advanced rules and share links.
// Pure, no DOM.
import { avForDistance, fracFromMass, massForFrac, F_MAX } from './physics.js';

export const RANGES = {
  T: [2500, 40000, 'log'],
  R: [0.1, 20, 'log'],
  d: [1, 3000, 'log'],
  r: [0.1, 1000, 'log'],
  Av: [0, 10, 'lin'],
  M: [1e-8, 100, 'log'], // Earth masses
  lambda0: [10, 1000, 'log'],
  beta: [0, 2, 'lin'],
};

const UNITS = ['lamFlam', 'Fnu', 'Flam'];

export function defaultState() {
  return {
    mode: 'simple',
    star: { T: 5772, R: 1, d: 10 },
    ism: { Av: avForDistance(10), linked: true },
    belt1: { on: true, rIn: 40, rOut: 40, M: 2.5e-4, lambda0: 100, beta: 0 },
    belt2: { on: false, rIn: 5, rOut: 10, M: 8e-7, lambda0: 100, beta: 0 },
    holdBrightness: false,
    unit: 'lamFlam',
    bands: true,
  };
}

const clamp = (v, key) => Math.min(RANGES[key][1], Math.max(RANGES[key][0], v));

// Finite number clamped to the range for `key`, else the fallback.
function num(v, key, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, key) : fallback;
}

function normBelt(b, def) {
  const src = b && typeof b === 'object' ? b : {};
  let rIn = num(src.rIn, 'r', def.rIn);
  let rOut = num(src.rOut, 'r', def.rOut);
  if (rIn > rOut) [rIn, rOut] = [rOut, rIn];
  return {
    on: typeof src.on === 'boolean' ? src.on : def.on,
    rIn,
    rOut,
    M: num(src.M, 'M', def.M),
    lambda0: num(src.lambda0, 'lambda0', def.lambda0),
    beta: num(src.beta, 'beta', def.beta),
  };
}

// Clamp every value to its range, swap reversed radii and fill anything
// missing or malformed from the defaults.
export function normalizeState(state) {
  const def = defaultState();
  const s = state && typeof state === 'object' ? state : {};
  const star = s.star && typeof s.star === 'object' ? s.star : {};
  const ism = s.ism && typeof s.ism === 'object' ? s.ism : {};
  const d = num(star.d, 'd', def.star.d);
  const linked = typeof ism.linked === 'boolean' ? ism.linked : def.ism.linked;
  return {
    mode: s.mode === 'advanced' ? 'advanced' : 'simple',
    star: {
      T: num(star.T, 'T', def.star.T),
      R: num(star.R, 'R', def.star.R),
      d,
    },
    ism: { linked, Av: linked ? clamp(avForDistance(d), 'Av') : num(ism.Av, 'Av', def.ism.Av) },
    belt1: normBelt(s.belt1, def.belt1),
    belt2: normBelt(s.belt2, def.belt2),
    holdBrightness: typeof s.holdBrightness === 'boolean' ? s.holdBrightness : def.holdBrightness,
    unit: UNITS.includes(s.unit) ? s.unit : def.unit,
    bands: typeof s.bands === 'boolean' ? s.bands : def.bands,
  };
}

// Brightness of a belt, f = L_dust/L_star, from its mass and radii (capped).
export function beltFrac(belt) {
  return Math.min(F_MAX, fracFromMass(belt.M, belt.rIn, belt.rOut));
}

export function isFracCapped(belt) {
  return fracFromMass(belt.M, belt.rIn, belt.rOut) > F_MAX;
}

// Move a belt's edges. With holdBrightness on, the mass is rescaled so f stays
// the same (the bump then moves only left/right); it is clamped to its range.
export function setBeltRadii(state, key, rIn, rOut) {
  const old = state[key];
  const moved = normalizeState({ ...state, [key]: { ...old, rIn, rOut } })[key];
  const M = state.holdBrightness ? (old.M * moved.rIn * moved.rOut) / (old.rIn * old.rOut) : old.M;
  return normalizeState({ ...state, [key]: { ...moved, M } });
}

// Simple-mode distance slider: a single narrow belt at r.
export function setBeltDistance(state, r) {
  return setBeltRadii(state, 'belt1', r, r);
}

// Link or unlink A_V from the distance. Unlinking keeps the current A_V.
export function setLinked(state, linked) {
  return normalizeState({ ...state, ism: { Av: state.ism.Av, linked } });
}

// True if belt shape, emissivity or belt 2 differ from what simple mode can
// express. lambda0 only matters when beta is not 0, so it is not checked alone.
export function hasAdvancedPhysics(state) {
  const b = state.belt1;
  return b.rIn !== b.rOut || b.beta !== 0 || state.belt2.on;
}

// Back to simple mode: advanced physics and display settings reset.
// (Uploaded data is held by the UI and only hidden.)
export function toSimple(state) {
  const def = defaultState();
  return normalizeState({
    ...state,
    mode: 'simple',
    belt1: { ...state.belt1, rOut: state.belt1.rIn, lambda0: def.belt1.lambda0, beta: 0 },
    belt2: { ...def.belt2, on: false },
    unit: def.unit,
  });
}

// Parameters for totalModel(): only belts that are switched on, without `on`.
export function toPhysicsParams(state) {
  const strip = (b) => ({ rIn: b.rIn, rOut: b.rOut, f: beltFrac(b), lambda0: b.lambda0, beta: b.beta });
  const belts = [];
  if (state.belt1.on) belts.push(strip(state.belt1));
  if (state.belt2.on) belts.push(strip(state.belt2));
  return { star: { ...state.star }, belts, Av: state.ism.Av };
}

// Number of free parameters a student is fitting: T, R, d, A_V if it is not
// linked to d, plus, per belt that is on, M, its radii (1 for a ring, 2 if extended) and lambda0 + beta if beta != 0.
export function countFreeParams(state) {
  let n = state.ism.linked ? 3 : 4;
  for (const b of [state.belt1, state.belt2]) {
    if (!b.on) continue;
    n += 1 + (b.rIn === b.rOut ? 1 : 2) + (b.beta !== 0 ? 2 : 0);
  }
  return n;
}

// ---- Share links ----------------------------------------------------------

const sig4 = (v) => String(Number(v.toPrecision(4)));

export function encodeHash(state) {
  const s = normalizeState(state);
  const parts = [
    ['m', s.mode === 'advanced' ? 'a' : 's'],
    ['T', sig4(s.star.T)], ['R', sig4(s.star.R)], ['d', sig4(s.star.d)],
    ['av', sig4(s.ism.Av)], ['al', s.ism.linked ? '1' : '0'], ['hb', s.holdBrightness ? '1' : '0'],
    ['b1on', s.belt1.on ? '1' : '0'],
    ['r1i', sig4(s.belt1.rIn)], ['r1o', sig4(s.belt1.rOut)], ['m1', sig4(s.belt1.M)],
    ['l1', sig4(s.belt1.lambda0)], ['b1', sig4(s.belt1.beta)],
    ['b2on', s.belt2.on ? '1' : '0'],
    ['r2i', sig4(s.belt2.rIn)], ['r2o', sig4(s.belt2.rOut)], ['m2', sig4(s.belt2.M)],
    ['l2', sig4(s.belt2.lambda0)], ['b2', sig4(s.belt2.beta)],
    ['u', s.unit], ['bd', s.bands ? '1' : '0'],
  ];
  return parts.map(([k, v]) => `${k}=${v}`).join('&');
}

// Tolerant decoder: unknown keys and unparseable values are ignored, the rest
// is clamped. Opens in advanced mode if the link uses advanced settings.
export function decodeHash(hash) {
  const raw = {};
  const text = String(hash ?? '').replace(/^#/, '');
  for (const piece of text.split('&')) {
    const eq = piece.indexOf('=');
    if (eq < 1) continue;
    try {
      raw[decodeURIComponent(piece.slice(0, eq))] = decodeURIComponent(piece.slice(eq + 1));
    } catch {
      // skip malformed escapes
    }
  }
  const n = (k) => {
    if (raw[k] === undefined || raw[k].trim() === '') return undefined;
    const v = Number(raw[k]);
    return Number.isFinite(v) ? v : undefined;
  };
  const flag = (k) => (raw[k] === '1' ? true : raw[k] === '0' ? false : undefined);
  const defBelt = [defaultState().belt1, defaultState().belt2];
  const belt = (i) => {
    const def = defBelt[i - 1];
    let M = n(`m${i}`);
    const f = n(`f${i}`);
    if (M === undefined && f !== undefined) {
      // Legacy link: convert f to the mass that gives it at the decoded radii.
      let rIn = Math.min(RANGES.r[1], Math.max(RANGES.r[0], n(`r${i}i`) ?? def.rIn));
      let rOut = Math.min(RANGES.r[1], Math.max(RANGES.r[0], n(`r${i}o`) ?? def.rOut));
      if (rIn > rOut) [rIn, rOut] = [rOut, rIn];
      M = massForFrac(Math.max(f, 0), rIn, rOut);
    }
    return {
      on: flag(`b${i}on`), rIn: n(`r${i}i`), rOut: n(`r${i}o`), M,
      lambda0: n(`l${i}`), beta: n(`b${i}`),
    };
  };
  const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const state = normalizeState({
    star: drop({ T: n('T'), R: n('R'), d: n('d') }),
    ism: drop({ Av: n('av'), linked: flag('al') }),
    belt1: drop(belt(1)),
    belt2: drop(belt(2)),
    holdBrightness: flag('hb'),
    unit: raw.u,
    bands: flag('bd'),
  });
  const wantsAdvanced = raw.m === 'a' || hasAdvancedPhysics(state) || state.unit !== 'lamFlam';
  state.mode = wantsAdvanced ? 'advanced' : 'simple';
  return state;
}
