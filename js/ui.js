// DOM wiring: sliders, plot updates and URL hash. All physics lives in the
// pure modules; this file only connects them to the page.
import { totalModel } from './physics.js';
import {
  RANGES, defaultState, decodeHash, encodeHash, normalizeState, setBeltDistance,
  toPhysicsParams,
} from './model.js';
import { buildFigure, resolveColors } from './figure.js';

// Live state shared with the later feature modules wired in below.
let state = location.hash.length > 1 ? decodeHash(location.hash) : defaultState();
let uploadedPoints = [];   // student photometry (Task 7)
let activeChallenge = null; // challenge in progress (Task 10)

const plotEl = document.getElementById('plot');
const SLIDER_STEPS = 1000;

const setStar = (key) => (s, v) => normalizeState({ ...s, star: { ...s.star, [key]: v } });

// Simple-mode controls: label in plain words, symbol in small text.
const CONTROLS = [
  { id: 'T', label: 'Star temperature', symbol: 'T★ (K)', range: 'T', get: (s) => s.star.T, set: setStar('T') },
  { id: 'R', label: 'Star size', symbol: 'R★ (R☉)', range: 'R', get: (s) => s.star.R, set: setStar('R') },
  { id: 'd', label: 'Distance to the star', symbol: 'd (pc)', range: 'd', get: (s) => s.star.d, set: setStar('d') },
  { id: 'r', label: 'How far the dust is from the star', symbol: 'r (AU)', range: 'r', get: (s) => s.belt1.rIn, set: (s, v) => setBeltDistance(s, v) },
  {
    id: 'f', label: 'How bright the dust is', symbol: 'L_dust/L★', range: 'f', get: (s) => s.belt1.f,
    set: (s, v) => normalizeState({ ...s, belt1: { ...s.belt1, f: v } }),
  },
];

// ---- slider <-> value mapping ---------------------------------------------

export function posToValue(key, pos) {
  const [lo, hi, scale] = RANGES[key];
  const t = pos / SLIDER_STEPS;
  return scale === 'log' ? 10 ** (Math.log10(lo) + t * (Math.log10(hi) - Math.log10(lo))) : lo + t * (hi - lo);
}

export function valueToPos(key, value) {
  const [lo, hi, scale] = RANGES[key];
  const t = scale === 'log'
    ? (Math.log10(value) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))
    : (value - lo) / (hi - lo);
  return Math.round(Math.min(1, Math.max(0, t)) * SLIDER_STEPS);
}

const fmt = (v) => String(Number(v.toPrecision(4)));

// Build one slider + number input pair inside [data-ctl=id].
function bindSlider({ id, label, symbol, range, get, set }) {
  const host = document.querySelector(`[data-ctl="${id}"]`);
  host.innerHTML = `
    <div class="row"><label for="${id}-range">${label}<span class="sym">${symbol}</span></label></div>
    <div class="line">
      <input type="range" id="${id}-range" min="0" max="${SLIDER_STEPS}" step="1">
      <input type="number" id="${id}-num" step="any" aria-label="${label} value">
    </div>`;
  const rangeEl = host.querySelector('input[type=range]');
  const numEl = host.querySelector('input[type=number]');

  rangeEl.addEventListener('input', () => {
    state = set(state, posToValue(range, Number(rangeEl.value)));
    numEl.value = fmt(get(state));
    scheduleRender();
  });
  numEl.addEventListener('change', () => {
    const v = Number(numEl.value);
    if (Number.isFinite(v)) state = set(state, v);
    scheduleRender(true);
  });
  return () => {
    const v = get(state);
    rangeEl.value = valueToPos(range, v);
    numEl.value = fmt(v);
  };
}

const syncers = CONTROLS.map(bindSlider);

const beltOnEl = document.getElementById('belt-on');
beltOnEl.addEventListener('change', () => {
  state = normalizeState({ ...state, belt1: { ...state.belt1, on: beltOnEl.checked } });
  scheduleRender(true);
});

function syncControls() {
  for (const sync of syncers) sync();
  beltOnEl.checked = state.belt1.on;
  for (const id of ['r', 'f']) {
    const host = document.querySelector(`[data-ctl="${id}"]`);
    host.classList.toggle('disabled', !state.belt1.on);
    host.querySelectorAll('input').forEach((el) => { el.disabled = !state.belt1.on; });
  }
}

// ---- rendering --------------------------------------------------------------

const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

let frame = 0;
let resyncNext = false;
function scheduleRender(resync = false) {
  resyncNext = resyncNext || resync;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (resyncNext) { syncControls(); resyncNext = false; }
    render();
  });
}

function render() {
  const model = totalModel(toPhysicsParams(state));
  const fig = buildFigure(model, state, {
    points: state.mode === 'advanced' ? uploadedPoints : null,
  });
  const resolved = resolveColors(fig, cssColor);
  Plotly.react(plotEl, resolved.data, resolved.layout, { responsive: true, displaylogo: false });
  try {
    history.replaceState(null, '', `#${encodeHash(state)}`);
  } catch {
    // some embedders disallow replaceState; the link just isn't updated
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => scheduleRender());

syncControls();
render();

// Exposed for the feature modules added in later tasks.
export const app = {
  get state() { return state; },
  set state(s) { state = s; },
  get uploadedPoints() { return uploadedPoints; },
  set uploadedPoints(p) { uploadedPoints = p; },
  get activeChallenge() { return activeChallenge; },
  set activeChallenge(c) { activeChallenge = c; },
  scheduleRender,
  syncControls,
  cssColor,
};
