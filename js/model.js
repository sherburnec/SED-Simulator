// App state: shape, ranges, defaults, simple/advanced rules and share links.
// Pure, no DOM.

export const RANGES = {
  T: [2500, 40000, 'log'],
  R: [0.1, 20, 'log'],
  d: [1, 500, 'log'],
  r: [0.1, 1000, 'log'],
  f: [1e-6, 1e-2, 'log'],
  lambda0: [10, 1000, 'log'],
  beta: [0, 2, 'lin'],
};

const UNITS = ['lamFlam', 'Fnu', 'Flam'];

export function defaultState() {
  return {
    mode: 'simple',
    star: { T: 5772, R: 1, d: 10 },
    belt1: { on: true, rIn: 40, rOut: 40, f: 1e-4, lambda0: 100, beta: 0 },
    belt2: { on: false, rIn: 5, rOut: 10, f: 1e-5, lambda0: 100, beta: 0 },
    unit: 'lamFlam',
    bands: false,
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
    f: num(src.f, 'f', def.f),
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
  return {
    mode: s.mode === 'advanced' ? 'advanced' : 'simple',
    star: {
      T: num(star.T, 'T', def.star.T),
      R: num(star.R, 'R', def.star.R),
      d: num(star.d, 'd', def.star.d),
    },
    belt1: normBelt(s.belt1, def.belt1),
    belt2: normBelt(s.belt2, def.belt2),
    unit: UNITS.includes(s.unit) ? s.unit : def.unit,
    bands: typeof s.bands === 'boolean' ? s.bands : def.bands,
  };
}

// Simple-mode distance slider: a single narrow belt at r.
export function setBeltDistance(state, r) {
  return normalizeState({ ...state, belt1: { ...state.belt1, rIn: r, rOut: r } });
}

// True if belt shape, emissivity or belt 2 differ from what simple mode can express.
export function hasAdvancedPhysics(state) {
  const b = state.belt1;
  return b.rIn !== b.rOut || b.beta !== 0 || b.lambda0 !== 100 || state.belt2.on;
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
    bands: false,
  });
}

// Parameters for totalModel(): only belts that are switched on, without `on`.
export function toPhysicsParams(state) {
  const strip = ({ rIn, rOut, f, lambda0, beta }) => ({ rIn, rOut, f, lambda0, beta });
  const belts = [];
  if (state.belt1.on) belts.push(strip(state.belt1));
  if (state.belt2.on) belts.push(strip(state.belt2));
  return { star: { ...state.star }, belts };
}

// Number of free parameters a student is fitting: T, R, d plus, per belt that
// is on, f, its radii (1 for a ring, 2 if extended) and lambda0 + beta if beta != 0.
export function countFreeParams(state) {
  let n = 3;
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
    ['b1on', s.belt1.on ? '1' : '0'],
    ['r1i', sig4(s.belt1.rIn)], ['r1o', sig4(s.belt1.rOut)], ['f1', sig4(s.belt1.f)],
    ['l1', sig4(s.belt1.lambda0)], ['b1', sig4(s.belt1.beta)],
    ['b2on', s.belt2.on ? '1' : '0'],
    ['r2i', sig4(s.belt2.rIn)], ['r2o', sig4(s.belt2.rOut)], ['f2', sig4(s.belt2.f)],
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
  const belt = (i) => ({
    on: flag(`b${i}on`), rIn: n(`r${i}i`), rOut: n(`r${i}o`), f: n(`f${i}`),
    lambda0: n(`l${i}`), beta: n(`b${i}`),
  });
  const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const state = normalizeState({
    star: drop({ T: n('T'), R: n('R'), d: n('d') }),
    belt1: drop(belt(1)),
    belt2: drop(belt(2)),
    unit: raw.u,
    bands: flag('bd'),
  });
  const wantsAdvanced = raw.m === 'a' || hasAdvancedPhysics(state) || state.unit !== 'lamFlam' || state.bands;
  state.mode = wantsAdvanced ? 'advanced' : 'simple';
  return state;
}
