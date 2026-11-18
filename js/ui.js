// DOM wiring: sliders, panels, plot updates and URL hash. All physics lives in
// the pure modules; this file only connects them to the page.
import {
  totalModel, chi2, luminosity, wienPeakUm, beltTempRange, excessRatio, extinctionRatio,
} from './physics.js';
import { bandById, surveyForLam } from './bands.js';
import {
  RANGES, defaultState, decodeHash, encodeHash, normalizeState, setBeltDistance, setBeltRadii, setLinked,
  toPhysicsParams, toSimple, defaultUnit, hasAdvancedPhysics, countFreeParams, beltFrac, isFracCapped,
} from './model.js';
import { buildFigure, resolveColors } from './figure.js';
import { parseCsv, modelToCsv } from './dataio.js';
import { equations } from './equations.js';
import { PRESETS, applyPreset } from './presets.js';
import {
  CHALLENGES, mulberry32, syntheticPhotometry, startState, freeControlIds, compareValues,
} from './challenges.js';

// Live state shared with the feature modules wired in below.
let state = location.hash.length > 1 ? decodeHash(location.hash) : defaultState();
let uploadedPoints = [];    // student photometry; kept when switching to simple mode, only hidden
let uploadedName = '';      // file name (no extension) of the last upload, used as the plot title
let uploadedText = '';      // raw text of the last upload, re-parsed if the file unit changes
let activeChallenge = null; // challenge in progress (Task 10)
let fitStats = null;        // chi2 of the shown data against the model, or null
let lastModel = null;
let fitN = 0;               // number of data points behind fitStats
let fitK = 0;               // free parameters behind fitStats

const plotEl = document.getElementById('plot');
const SLIDER_STEPS = 1000;

const setStar = (key) => (s, v) => normalizeState({ ...s, star: { ...s.star, [key]: v } });
const setBelt = (belt, key) => (s, v) => normalizeState({ ...s, [belt]: { ...s[belt], [key]: v } });

// Simple-mode controls: label in plain words, symbol in small text.
const SIMPLE_CONTROLS = [
  { id: 'T', label: 'Star temperature', symbol: 'T★ (K)', range: 'T', get: (s) => s.star.T, set: setStar('T') },
  { id: 'R', label: 'Star size', symbol: 'R★ (R☉)', range: 'R', get: (s) => s.star.R, set: setStar('R') },
  { id: 'd', label: 'Distance to the star', symbol: 'd (pc)', range: 'd', get: (s) => s.star.d, set: setStar('d'), resync: true },
  { id: 'Av', label: 'Dimming by interstellar dust', symbol: 'A_V (mag)', range: 'Av', get: (s) => s.ism.Av, set: (s, v) => normalizeState({ ...s, ism: { ...s.ism, Av: v } }) },
  { id: 'r', label: 'How far the dust is from the star', symbol: 'r (AU)', range: 'r', get: (s) => s.belt1.rIn, set: (s, v) => setBeltDistance(s, v), resync: true },
  { id: 'M', label: 'How much dust', symbol: 'M_dust (M⊕, ~10 µm grains)', range: 'M', get: (s) => s.belt1.M, set: setBelt('belt1', 'M') },
];

// Advanced-panel controls (belt 1 radii replace the single simple-mode distance).
const beltControls = (n) => {
  const b = `belt${n}`;
  return [
    { id: `b${n}M`, label: 'How much dust', symbol: 'M_dust (M⊕, ~10 µm grains)', range: 'M', get: (s) => s[b].M, set: setBelt(b, 'M') },
    { id: `b${n}in`, label: 'Inner edge', symbol: 'r_in (AU)', range: 'r', get: (s) => s[b].rIn, set: (s, v) => setBeltRadii(s, b, v, s[b].rOut), resync: true },
    { id: `b${n}out`, label: 'Outer edge', symbol: 'r_out (AU)', range: 'r', get: (s) => s[b].rOut, set: (s, v) => setBeltRadii(s, b, s[b].rIn, v), resync: true },
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
function bindSlider({ id, label, symbol, range, get, set, resync = false }) {
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
    markCustom();
    // Edge sliders can swap rIn and rOut when dragged past each other, so redraw all controls.
    if (resync) { scheduleRender(true); return; }
    numEl.value = fmt(get(state));
    scheduleRender();
  });
  numEl.addEventListener('change', () => {
    const raw = numEl.value.trim();
    const v = Number(raw);
    // An emptied box reverts to the current value instead of jumping to the minimum.
    if (raw !== '' && Number.isFinite(v)) { state = set(state, v); markCustom(); }
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
    </fieldset>
    <fieldset class="panel">
      <legend>Your data</legend>
      <p class="hint">CSV with columns wavelength_um, flux and (optionally) flux_err and fit (0 = Do Not Fit). Stays in your browser.</p>
      <label for="file-unit">Flux unit in the file</label>
      <select id="file-unit">${optionsHtml([['Fnu', 'F_ν (Jy)'], ['Flam', 'F_λ (erg s⁻¹ cm⁻² µm⁻¹)'], ['lamFlam', 'λF_λ (erg s⁻¹ cm⁻²)']])}</select>
      <input type="file" id="file-input" accept=".csv,.txt,text/csv,text/plain">
      <div id="upload-status" class="hint" role="status"></div>
      <ul id="upload-errors" class="errors"></ul>
      <div id="point-table"></div>
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
const avLinkedEl = document.getElementById('av-linked');
avLinkedEl.addEventListener('change', () => {
  state = setLinked(state, avLinkedEl.checked);
  markCustom();
  scheduleRender(true);
});

const holdEl = document.getElementById('hold-brightness');
holdEl.addEventListener('change', () => {
  state = normalizeState({ ...state, holdBrightness: holdEl.checked });
  scheduleRender(true);
});

const beltOnEl = document.getElementById('belt-on');
beltOnEl.addEventListener('change', () => {
  state = normalizeState({ ...state, belt1: { ...state.belt1, on: beltOnEl.checked } });
  markCustom();
  scheduleRender(true);
});

const belt2OnEl = document.getElementById('belt2-on');
belt2OnEl.addEventListener('change', () => {
  state = normalizeState({ ...state, belt2: { ...state.belt2, on: belt2OnEl.checked } });
  markCustom();
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

function setView(view) {
  if (view === state.view) return;
  // Only swap the unit if it is still the old view's default; an explicit choice stays.
  const unit = state.unit === defaultUnit(state.view) ? defaultUnit(view) : state.unit;
  state = normalizeState({ ...state, view, unit });
  scheduleRender(true);
}
document.getElementById('view-class').addEventListener('click', () => setView('class'));
document.getElementById('view-modern').addEventListener('click', () => setView('modern'));

// ---- mode toggle -------------------------------------------------------------

const topnav = document.getElementById('topnav');
topnav.insertAdjacentHTML('beforeend', `
  <div class="seg" role="group" aria-label="Mode">
    <button type="button" id="mode-simple">Simple</button>
    <button type="button" id="mode-advanced">Advanced</button>
  </div>`);

// ---- presets -------------------------------------------------------------------

topnav.insertAdjacentHTML('afterbegin', `
  <label class="inline">Preset
    <select id="preset">
      <option value="">Custom</option>
      ${PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
    </select>
  </label>`);
const presetEl = document.getElementById('preset');
const presetDescEl = document.getElementById('preset-desc');
presetEl.addEventListener('change', () => {
  const p = PRESETS.find((x) => x.id === presetEl.value);
  if (!p) { presetDescEl.textContent = ''; return; }
  const prev = state;
  state = applyPreset(p.id);
  // A preset keeps the student's band overlay; in Advanced it also keeps Advanced mode and the flux unit.
  // A preset keeps the student's plot view too (and that view's default unit).
  state = { ...state, bands: prev.bands, view: prev.view, unit: defaultUnit(prev.view) };
  if (prev.mode === 'advanced') state = { ...state, mode: 'advanced', unit: prev.unit };
  presetDescEl.textContent = p.description;
  if (p.unverified.length) {
    const note = document.createElement('span');
    note.className = 'hint';
    note.textContent = ` Not yet confirmed against a primary source: ${p.unverified.join('; ')}.`;
    presetDescEl.appendChild(note);
  }
  const src = document.createElement('details');
  src.className = 'hint';
  src.innerHTML = '<summary>Sources</summary>';
  const list = document.createElement('ul');
  for (const c of p.citations) {
    const li = document.createElement('li');
    li.textContent = c;
    list.appendChild(li);
  }
  src.appendChild(list);
  presetDescEl.appendChild(src);
  scheduleRender(true);
});

// Back to "Custom" once the student changes anything by hand.
function markCustom() {
  if (presetEl.value) {
    presetEl.value = '';
    presetDescEl.textContent = '';
  }
}

function setMode(mode) {
  if (activeChallenge || mode === state.mode) return;
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

// One row per uploaded point with a Fit checkbox; unticked = Do Not Fit.
function renderPointTable() {
  const host = document.getElementById('point-table');
  if (!uploadedPoints.length) { host.innerHTML = ''; return; }
  const rows = uploadedPoints.map((p, i) => `<tr><td>${g3(p.lamUm)} µm</td><td>${surveyForLam(p.lamUm)}</td>`
    + `<td><input type="checkbox" data-pt="${i}" aria-label="Fit point at ${g3(p.lamUm)} µm"${p.fit === false ? '' : ' checked'}></td></tr>`);
  host.innerHTML = `<table class="reveal"><thead><tr><th>λ</th><th>Survey</th><th>Fit</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
document.getElementById('point-table').addEventListener('change', (e) => {
  const i = e.target.dataset ? e.target.dataset.pt : undefined;
  if (i === undefined || !uploadedPoints[i]) return;
  uploadedPoints[i].fit = e.target.checked;
  scheduleRender();
});

function loadUpload() {
  const { points, errors } = uploadedText ? parseCsv(uploadedText, fileUnitEl.value) : { points: [], errors: [] };
  uploadedPoints = points;
  renderPointTable();
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
  uploadedName = file.name.replace(/\.[^.]*$/, '');
  fileInput.value = ''; // so choosing the same (corrected) file again still fires change
  loadUpload();
});
fileUnitEl.addEventListener('change', () => { if (uploadedText) loadUpload(); });
document.getElementById('clear-data').addEventListener('click', () => {
  uploadedText = '';
  uploadedName = '';
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ---- challenges --------------------------------------------------------------

const MYSTERY_REROLL = new Set(['bare-star', 'find-dust', 'star-and-dust']);

topnav.insertAdjacentHTML('beforeend', '<button type="button" id="btn-challenges" aria-pressed="false">Challenges</button>');
document.querySelector('.controls').insertAdjacentHTML('afterbegin', `
  <section class="panel" id="challenge-panel" hidden>
    <h2 class="panel-title">Challenges</h2>
    <div id="challenge-list">
      ${CHALLENGES.map((c) => `<button type="button" class="block" data-challenge="${c.id}">${c.title}</button>`).join('')}
    </div>
    <div id="challenge-active" hidden>
      <h3 id="ch-title"></h3>
      <p id="ch-prompt"></p>
      <p id="ch-chi" role="status"></p>
      <div class="btn-row">
        <button type="button" id="ch-reveal-btn">Reveal</button>
        <button type="button" id="ch-new">New mystery</button>
        <button type="button" id="ch-exit">Exit</button>
      </div>
      <div id="ch-reveal"></div>
    </div>
  </section>`);
const challengePanel = document.getElementById('challenge-panel');
const challengeBtn = document.getElementById('btn-challenges');
challengeBtn.addEventListener('click', () => {
  challengePanel.hidden = !challengePanel.hidden;
  challengeBtn.setAttribute('aria-pressed', String(!challengePanel.hidden));
});

function startChallenge(ch) {
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const rng = mulberry32(seed);
  const hidden = ch.makeHidden(rng);
  const points = syntheticPhotometry(hidden, rng);
  const previous = activeChallenge ? activeChallenge.previous : { state, preset: presetEl.value };
  activeChallenge = { challenge: ch, hidden, points, revealed: false, previous };
  state = startState(ch, hidden);
  document.getElementById('ch-reveal').innerHTML = '';
  scheduleRender(true);
}

function exitChallenge() {
  if (!activeChallenge) return;
  state = activeChallenge.previous.state;
  presetEl.value = activeChallenge.previous.preset;
  activeChallenge = null;
  scheduleRender(true);
}

challengePanel.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-challenge]');
  if (btn) startChallenge(CHALLENGES.find((c) => c.id === btn.dataset.challenge));
});
document.getElementById('ch-reveal-btn').addEventListener('click', () => {
  if (activeChallenge) { activeChallenge.revealed = true; scheduleRender(); }
});
document.getElementById('ch-new').addEventListener('click', () => {
  if (activeChallenge) startChallenge(activeChallenge.challenge);
});
document.getElementById('ch-exit').addEventListener('click', exitChallenge);

const fmtVal = (v) => (v !== 0 && (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2) ? v.toExponential(2) : String(Number(v.toPrecision(4))));

function renderChallengePanel() {
  const active = !!activeChallenge;
  if (active) { challengePanel.hidden = false; challengeBtn.setAttribute('aria-pressed', 'true'); }
  document.getElementById('challenge-list').hidden = active;
  document.getElementById('challenge-active').hidden = !active;
  if (!active) return;
  const { challenge, hidden, revealed } = activeChallenge;
  document.getElementById('ch-title').textContent = challenge.title;
  document.getElementById('ch-prompt').textContent = challenge.prompt;
  document.getElementById('ch-new').hidden = !MYSTERY_REROLL.has(challenge.id);
  document.getElementById('ch-chi').textContent = fitStats
    ? (fitStats.reduced === null
      ? `χ² = ${fmtVal(fitStats.chi2)}`
      : `Reduced χ² = ${fmtVal(fitStats.reduced)} (aim for about 1)`)
    : '';
  const revealEl = document.getElementById('ch-reveal');
  if (!revealed) { revealEl.innerHTML = ''; return; }
  const rows = compareValues(challenge, hidden, state);
  revealEl.innerHTML = '<table class="reveal"><tr><th>Parameter</th><th>True</th><th>Yours</th></tr>'
    + rows.map((r) => `<tr><td>${r.label}</td><td>${fmtVal(r.truth)}</td><td>${fmtVal(r.student)}</td></tr>`).join('')
    + '</table>';
}

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
  document.getElementById('view-class').setAttribute('aria-pressed', String(state.view === 'class'));
  document.getElementById('view-modern').setAttribute('aria-pressed', String(state.view === 'modern'));
  avLinkedEl.checked = state.ism.linked;
  holdEl.checked = state.holdBrightness;
  setDisabled(document.querySelector('[data-ctl="Av"]'), state.ism.linked);

  for (const id of ['r', 'M', ...BELT1_CONTROLS.slice(1).map((c) => c.id)]) {
    setDisabled(document.querySelector(`[data-ctl="${id}"]`), !state.belt1.on);
  }
  for (const c of BELT2_CONTROLS) {
    setDisabled(document.querySelector(`[data-ctl="${c.id}"]`), !state.belt2.on);
  }

  // During a challenge only the sliders being solved for stay enabled.
  const allowed = activeChallenge ? freeControlIds(activeChallenge.challenge) : null;
  for (const host of document.querySelectorAll('[data-ctl]')) {
    if (allowed && !allowed.has(host.dataset.ctl)) setDisabled(host, true);
    else if (!allowed && ['T', 'R', 'd'].includes(host.dataset.ctl)) setDisabled(host, false);
  }
  const locked = !!activeChallenge;
  for (const el of [beltOnEl, belt2OnEl, avLinkedEl, holdEl, presetEl, fileInput, document.getElementById('clear-data'),
    document.getElementById('mode-simple'), document.getElementById('mode-advanced')]) {
    el.disabled = locked;
  }
}

// ---- readouts and equations --------------------------------------------------

const readoutsEl = document.getElementById('readouts');
const eqHost = document.getElementById('equations-host');
eqHost.innerHTML = '<details class="panel" id="equations"><summary>Equations (live)</summary><div id="eq-list"></div></details>';
const eqDetails = document.getElementById('equations');
const eqList = document.getElementById('eq-list');
eqDetails.addEventListener('toggle', () => { if (eqDetails.open) renderEquations(); });

const g3 = (v) => (v !== 0 && (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2) ? v.toExponential(2) : v.toPrecision(3));

function renderReadouts(model) {
  const L = luminosity(state.star.T, state.star.R);
  const rows = [
    ['Luminosity', `${g3(L)} L☉`],
    ['Wien peak (2898/T)', `${g3(wienPeakUm(state.star.T))} µm`],
  ];
  const beltRows = [['Belt 1', state.belt1], ['Belt 2', state.belt2]];
  for (const [name, b] of beltRows) {
    if (!b.on) continue;
    const [lo, hi] = beltTempRange(L, b);
    rows.push([`${name} dust temperature`, b.rIn === b.rOut ? `${g3(hi)} K` : `${g3(lo)}–${g3(hi)} K`]);
    rows.push([`${name} dust mass`, `${g3(b.M)} M⊕ (${g3(b.M / 0.0123)} lunar masses)`]);
    rows.push([`${name} L_dust/L★`, isFracCapped(b) ? `${g3(beltFrac(b))} (capped)` : g3(beltFrac(b))]);
  }
  if (state.belt1.on || state.belt2.on) {
    for (const id of ['MIPS 24', 'MIPS 70']) {
      rows.push([`${id} excess (total/star)`, g3(excessRatio(model.grid, model.total, model.star, bandById(id).lamUm))]);
    }
  }
  const AV = state.ism.Av;
  rows.push(['Dimming A_V', `${g3(AV)} mag (E(B−V) = ${g3(AV / 3.1)}, A_Ks = ${g3(AV * extinctionRatio(2.159))})`]);
  let html = '<dl class="readout-grid">' + rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '</dl>';
  html += '<p class="hint">The peak you see on the plot depends on the flux unit: F_λ peaks at 2898/T µm, λF_λ near 3670/T, F_ν near 5100/T.</p>';
  if (state.belt1.on || state.belt2.on) {
    html += '<p class="hint">Dust distances assume blackbody grains at the fitted temperature. Real small grains run hotter, so belts seen in images usually sit 2 to 4 times farther out.</p>';
  }
  const hot = [['Belt 1', state.belt1], ['Belt 2', state.belt2]].filter(([, b]) => b.on && beltFrac(b) >= 0.01);
  if (hot.length) {
    const capped = [state.belt1, state.belt2].some((b) => b.on && isFracCapped(b));
    html += `<p class="hint">${hot.map(([n]) => n).join(' and ')} is brighter than any known debris disk (f ≥ 0.01). This model assumes optically thin dust${capped ? ', and f is capped at 0.1' : ''}.</p>`;
  }
  if (fitStats) {
    const n = fitN;
    const k = fitK;
    const assumed = fitStats.assumedErrCount ? ` (assuming 10% errors on ${fitStats.assumedErrCount} point${fitStats.assumedErrCount === 1 ? '' : 's'})` : '';
    html += fitStats.reduced === null
      ? `<p>χ² = ${g3(fitStats.chi2)}: add more points than free parameters (${n} points, ${k} free) for a reduced χ².${assumed}</p>`
      : `<p>χ²<sub>red</sub> = ${g3(fitStats.reduced)} (${n} points, ${k} free parameters)${assumed}</p>`;
  }
  const skipped = state.mode === 'advanced' && !activeChallenge ? uploadedPoints.filter((p) => p.fit === false).length : 0;
  if (skipped) html += `<p class="hint">${skipped} point${skipped === 1 ? '' : 's'} marked Do Not Fit (not in χ²).</p>`;
  readoutsEl.innerHTML = html;
}

function renderEquations() {
  if (!eqDetails.open) return;
  eqList.innerHTML = '';
  for (const eq of equations(state)) {
    const div = document.createElement('div');
    div.className = 'eq';
    div.dataset.controls = eq.controls.join(' ');
    if (window.katex) {
      window.katex.render(eq.tex, div, { throwOnError: false, displayMode: false });
    } else {
      div.textContent = eq.tex;
    }
    eqList.appendChild(div);
  }
}

function highlight(controlIds, on) {
  for (const id of controlIds) {
    const host = document.querySelector(`[data-ctl="${id}"]`);
    if (host) host.classList.toggle('hl', on);
  }
}
eqList.addEventListener('mouseover', (e) => {
  const eq = e.target.closest('.eq');
  if (eq) highlight(eq.dataset.controls.split(' '), true);
});
eqList.addEventListener('mouseout', (e) => {
  const eq = e.target.closest('.eq');
  if (eq) highlight(eq.dataset.controls.split(' '), false);
});

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

// The address bar follows the state, debounced so a long slider drag does not
// hammer history.replaceState (browsers throttle it).
let hashTimer = 0;
let lastHash = location.hash.slice(1);
function scheduleHashWrite() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (activeChallenge) return;
    const h = encodeHash(state);
    try {
      history.replaceState(null, '', `#${h}`);
      lastHash = h;
    } catch {
      // some embedders disallow replaceState; the link just isn't updated
    }
  }, 200);
}

// Pasting a share link into a tab that already has the page open only changes the hash.
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (h === lastHash || activeChallenge) return;
  lastHash = h;
  state = h ? decodeHash(h) : defaultState();
  markCustom();
  scheduleRender(true);
});

function render() {
  const model = totalModel(toPhysicsParams(state));
  lastModel = model;
  let shownPoints = state.mode === 'advanced' && uploadedPoints.length ? uploadedPoints : null;
  let nFree = countFreeParams(state);
  let revealModel = null;
  if (activeChallenge) {
    shownPoints = activeChallenge.points;
    nFree = activeChallenge.challenge.free.length;
    if (activeChallenge.revealed) revealModel = totalModel(toPhysicsParams(activeChallenge.hidden));
  }
  fitN = shownPoints ? shownPoints.filter((p) => p.fit !== false).length : 0;
  fitK = nFree;
  fitStats = shownPoints ? chi2(shownPoints, model.grid, model.total, nFree) : null;
  const preset = PRESETS.find((x) => x.id === presetEl.value);
  const title = preset ? preset.name
    : activeChallenge ? activeChallenge.challenge.title
      : shownPoints && uploadedName ? uploadedName : 'SED model';
  const fig = buildFigure(model, state, {
    points: shownPoints, revealModel, title, fit: fitStats && { reduced: fitStats.reduced },
  });
  renderChallengePanel();
  renderReadouts(model);
  renderEquations();
  const resolved = resolveColors(fig, cssColor);
  Plotly.react(plotEl, resolved.data, resolved.layout, { responsive: true, displaylogo: false });
  scheduleHashWrite();
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
