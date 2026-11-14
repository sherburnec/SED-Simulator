// DOM wiring: sliders, panels, plot updates and URL hash. All physics lives in
// the pure modules; this file only connects them to the page.
import { totalModel, chi2 } from './physics.js';
import {
  RANGES, defaultState, decodeHash, encodeHash, normalizeState, setBeltDistance,
  toPhysicsParams, toSimple, hasAdvancedPhysics, countFreeParams,
} from './model.js';
import { buildFigure, resolveColors } from './figure.js';
import { parseCsv, modelToCsv } from './dataio.js';

// Live state shared with the feature modules wired in below.
let state = location.hash.length > 1 ? decodeHash(location.hash) : defaultState();
let uploadedPoints = [];    // student photometry; kept when switching to simple mode, only hidden
let uploadedText = '';      // raw text of the last upload, re-parsed if the file unit changes
let activeChallenge = null; // challenge in progress (Task 10)
let fitStats = null;        // chi2 of the shown data against the model, or null
let lastModel = null;

const plotEl = document.getElementById('plot');
const SLIDER_STEPS = 1000;

const setStar = (key) => (s, v) => normalizeState({ ...s, star: { ...s.star, [key]: v } });
const setBelt = (belt, key) => (s, v) => normalizeState({ ...s, [belt]: { ...s[belt], [key]: v } });

// Simple-mode controls: label in plain words, symbol in small text.
const SIMPLE_CONTROLS = [
  { id: 'T', label: 'Star temperature', symbol: 'T★ (K)', range: 'T', get: (s) => s.star.T, set: setStar('T') },
  { id: 'R', label: 'Star size', symbol: 'R★ (R☉)', range: 'R', get: (s) => s.star.R, set: setStar('R') },
  { id: 'd', label: 'Distance to the star', symbol: 'd (pc)', range: 'd', get: (s) => s.star.d, set: setStar('d') },
  { id: 'r', label: 'How far the dust is from the star', symbol: 'r (AU)', range: 'r', get: (s) => s.belt1.rIn, set: (s, v) => setBeltDistance(s, v) },
  { id: 'f', label: 'How bright the dust is', symbol: 'L_dust/L★', range: 'f', get: (s) => s.belt1.f, set: setBelt('belt1', 'f') },
];

// Advanced-panel controls (belt 1 radii replace the single simple-mode distance).
const beltControls = (n) => {
  const b = `belt${n}`;
  return [
    { id: `b${n}f`, label: 'Brightness', symbol: 'L_dust/L★', range: 'f', get: (s) => s[b].f, set: setBelt(b, 'f') },
    { id: `b${n}in`, label: 'Inner edge', symbol: 'r_in (AU)', range: 'r', get: (s) => s[b].rIn, set: setBelt(b, 'rIn') },
    { id: `b${n}out`, label: 'Outer edge', symbol: 'r_out (AU)', range: 'r', get: (s) => s[b].rOut, set: setBelt(b, 'rOut') },
    { id: `b${n}l0`, label: 'Emissivity turnover', symbol: 'λ₀ (µm)', range: 'lambda0', get: (s) => s[b].lambda0, set: setBelt(b, 'lambda0') },
    { id: `b${n}beta`, label: 'Emissivity slope', symbol: 'β', range: 'beta', get: (s) => s[b].beta, set: setBelt(b, 'beta') },
  ];
};

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

// Build one slider + number input pair inside the element [data-ctl=id].
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

// ---- advanced panel -----------------------------------------------------------

const UNIT_OPTIONS = [
  ['lamFlam', 'λF_λ (erg s⁻¹ cm⁻²)'],
  ['Fnu', 'F_ν (Jy)'],
  ['Flam', 'F_λ (erg s⁻¹ cm⁻² µm⁻¹)'],
];
const optionsHtml = (list) => list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
const ctlHosts = (list) => list.map((c) => `<div class="ctl" data-ctl="${c.id}"></div>`).join('');

const BELT1_CONTROLS = beltControls(1);
const BELT2_CONTROLS = beltControls(2);

document.getElementById('advanced-host').innerHTML = `
  <div id="advanced-panel" hidden>
    <fieldset class="panel">
      <legend>Belt 1 shape and grains</legend>
      ${ctlHosts(BELT1_CONTROLS.slice(1))}
      <p class="hint">Inner edge ≠ outer edge spreads the dust over a range of radii. β = 0 means perfect blackbody grains; larger β makes the dust fade faster beyond λ₀.</p>
    </fieldset>
    <fieldset class="panel">
      <legend>Belt 2</legend>
      <label class="check"><input type="checkbox" id="belt2-on"> Add a second belt</label>
      <div id="belt2-controls">${ctlHosts(BELT2_CONTROLS)}</div>
    </fieldset>
    <fieldset class="panel">
      <legend>Display</legend>
      <label for="unit-select">Flux units</label>
      <select id="unit-select">${optionsHtml(UNIT_OPTIONS)}</select>
      <label class="check"><input type="checkbox" id="bands-on"> Show telescope bands</label>
    </fieldset>
    <fieldset class="panel">
      <legend>Your data</legend>
      <p class="hint">CSV with columns wavelength_um, flux and (optionally) flux_err. Stays in your browser.</p>
      <label for="file-unit">Flux unit in the file</label>
      <select id="file-unit">${optionsHtml([['Fnu', 'F_ν (Jy)'], ['Flam', 'F_λ (erg s⁻¹ cm⁻² µm⁻¹)'], ['lamFlam', 'λF_λ (erg s⁻¹ cm⁻²)']])}</select>
      <input type="file" id="file-input" accept=".csv,.txt,text/csv,text/plain">
      <div id="upload-status" class="hint" role="status"></div>
      <ul id="upload-errors" class="errors"></ul>
      <button type="button" id="clear-data">Remove data</button>
    </fieldset>
    <fieldset class="panel">
      <legend>Export</legend>
      <button type="button" id="download-csv">Download model CSV</button>
    </fieldset>
  </div>`;

const syncers = [
  ...SIMPLE_CONTROLS.map(bindSlider),
  ...BELT1_CONTROLS.slice(1).map(bindSlider),
  ...BELT2_CONTROLS.map(bindSlider),
];
// The brightness slider for belt 1 is the same quantity as simple mode's f slider.

const beltOnEl = document.getElementById('belt-on');
beltOnEl.addEventListener('change', () => {
  state = normalizeState({ ...state, belt1: { ...state.belt1, on: beltOnEl.checked } });
  scheduleRender(true);
});

const belt2OnEl = document.getElementById('belt2-on');
belt2OnEl.addEventListener('change', () => {
  state = normalizeState({ ...state, belt2: { ...state.belt2, on: belt2OnEl.checked } });
  scheduleRender(true);
});

const unitEl = document.getElementById('unit-select');
unitEl.addEventListener('change', () => {
  state = normalizeState({ ...state, unit: unitEl.value });
  scheduleRender(true);
});

const bandsEl = document.getElementById('bands-on');
bandsEl.addEventListener('change', () => {
  state = normalizeState({ ...state, bands: bandsEl.checked });
  scheduleRender(true);
});

// ---- mode toggle -------------------------------------------------------------

const topnav = document.getElementById('topnav');
topnav.insertAdjacentHTML('beforeend', `
  <div class="seg" role="group" aria-label="Mode">
    <button type="button" id="mode-simple">Simple</button>
    <button type="button" id="mode-advanced">Advanced</button>
  </div>`);

function setMode(mode) {
  if (mode === state.mode) return;
  if (mode === 'simple') {
    if (hasAdvancedPhysics(state)
      && !window.confirm('Switching to Simple mode resets belt shape, emissivity and belt 2. Continue?')) {
      return;
    }
    state = toSimple(state);
  } else {
    state = normalizeState({ ...state, mode: 'advanced' });
  }
  scheduleRender(true);
}
document.getElementById('mode-simple').addEventListener('click', () => setMode('simple'));
document.getElementById('mode-advanced').addEventListener('click', () => setMode('advanced'));

// ---- data upload and export ---------------------------------------------------

const fileInput = document.getElementById('file-input');
const fileUnitEl = document.getElementById('file-unit');
const statusEl = document.getElementById('upload-status');
const errorsEl = document.getElementById('upload-errors');

function loadUpload() {
  const { points, errors } = parseCsv(uploadedText, fileUnitEl.value);
  uploadedPoints = points;
  errorsEl.innerHTML = '';
  for (const e of errors) {
    const li = document.createElement('li');
    li.textContent = `Row ${e.row}: ${e.message}`;
    errorsEl.appendChild(li);
  }
  statusEl.textContent = uploadedText
    ? `${points.length} point${points.length === 1 ? '' : 's'} loaded${errors.length ? `, ${errors.length} row${errors.length === 1 ? '' : 's'} skipped` : ''}.`
    : '';
  scheduleRender();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  uploadedText = await file.text();
  loadUpload();
});
fileUnitEl.addEventListener('change', () => { if (uploadedText) loadUpload(); });
document.getElementById('clear-data').addEventListener('click', () => {
  uploadedText = '';
  uploadedPoints = [];
  fileInput.value = '';
  loadUpload();
});

document.getElementById('download-csv').addEventListener('click', () => {
  if (!lastModel) return;
  const csv = modelToCsv(lastModel, state.unit, { belt1On: state.belt1.on, belt2On: state.belt2.on });
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sed-model.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---- syncing controls to state -------------------------------------------------

const setDisabled = (host, disabled) => {
  host.classList.toggle('disabled', disabled);
  host.querySelectorAll('input').forEach((el) => { el.disabled = disabled; });
};

function syncControls() {
  for (const sync of syncers) sync();
  const advanced = state.mode === 'advanced';

  document.getElementById('mode-simple').setAttribute('aria-pressed', String(!advanced));
  document.getElementById('mode-advanced').setAttribute('aria-pressed', String(advanced));
  document.getElementById('advanced-panel').hidden = !advanced;
  // In Advanced mode the belt radii sliders live in the advanced panel.
  document.querySelector('[data-ctl="r"]').hidden = advanced;

  beltOnEl.checked = state.belt1.on;
  belt2OnEl.checked = state.belt2.on;
  unitEl.value = state.unit;
  bandsEl.checked = state.bands;

  for (const id of ['r', 'f', ...BELT1_CONTROLS.slice(1).map((c) => c.id)]) {
    setDisabled(document.querySelector(`[data-ctl="${id}"]`), !state.belt1.on);
  }
  for (const c of BELT2_CONTROLS) {
    setDisabled(document.querySelector(`[data-ctl="${c.id}"]`), !state.belt2.on);
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
  lastModel = model;
  const shownPoints = state.mode === 'advanced' && uploadedPoints.length ? uploadedPoints : null;
  fitStats = shownPoints ? chi2(shownPoints, model.grid, model.total, countFreeParams(state)) : null;
  const fig = buildFigure(model, state, { points: shownPoints });
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
  get activeChallenge() { return activeChallenge; },
  set activeChallenge(c) { activeChallenge = c; },
  get fitStats() { return fitStats; },
  get lastModel() { return lastModel; },
  scheduleRender,
  syncControls,
  cssColor,
};
