# Class-style SED Plot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a class-style SED figure (boxed, titled, one grey model curve, survey-coloured points, in-axes legend with T★/T_eff/reduced χ², "Do Not Fit" points) the default view, with the current figure kept as a "Modern" view.

**Architecture:** `state.view` (`'class' | 'modern'`) selects between a new `buildClassFigure` and the untouched current builder, both inside `js/figure.js`. Points gain an optional `fit` flag that `chi2` honours; survey colour comes from matching a point's wavelength to `js/bands.js`. Pure modules stay pure; `ui.js` only wires the toggle, a point table and the extra options.

**Tech Stack:** Vanilla ES modules, Plotly 2.35 (CDN), `node --test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-18-class-style-plot-design.md`

## Global Constraints

- Keep the existing colour palette: colours are theme tokens (`var:<name>`) resolved from CSS custom properties; every new token is defined in both the light `:root` block and the dark block of `css/style.css`.
- Modern view output and its existing tests must not change (other than the `defaultState` default noted in Task 1).
- Shared links without a `v` key open in Class view.
- No new dependencies. Pure modules (`figure.js`, `model.js`, `physics.js`, `dataio.js`, `bands.js`) must not touch the DOM.
- Labels exactly: view names "Class" and "Modern"; excluded points "Do Not Fit"; subtitles "No Dust", "1 Dust Belt", "2 Dust Belts".

## Review Focus

1. Old share link (no `v`, `u=lamFlam`) opens without crashing, in Class view; a fresh default link must NOT force Advanced mode just because unit is `Fnu`.
2. Every point marked Do Not Fit (or no points at all): no χ² line, no NaN, no crash.
3. Point matching no survey, and a point between overlapping bands (IRAC 3.6 vs W1): deterministic group.
4. Both belts on, and challenge "reveal" (true model curve) in Class view.
5. Every `var:` token used by either view exists in `css/style.css` (light and dark), so nothing renders as an invalid colour.

---

### Task 1: `view` state, default unit, share-link key

**Files:**
- Modify: `js/model.js` (`defaultState`, `normalizeState`, `toSimple`, `encodeHash`, `decodeHash`)
- Test: `tests/model.test.js`

**Interfaces:**
- Produces: `state.view: 'class'|'modern'` (default `'class'`); `export function defaultUnit(view): 'Fnu'|'lamFlam'`; `defaultState().unit === 'Fnu'`; hash key `v=class|modern`.

- [ ] **Step 1: Write failing tests** in `tests/model.test.js`: `defaultState().view === 'class'` and `.unit === 'Fnu'`; `defaultUnit('modern') === 'lamFlam'`; `normalizeState({view:'bogus'}).view === 'class'`; round trip `decodeHash(encodeHash({...defaultState(), view:'modern', unit:'lamFlam'}))` keeps both and has `mode === 'simple'`; `decodeHash(encodeHash(defaultState())).mode === 'simple'`; legacy `decodeHash('T=5772&u=lamFlam')` has `view === 'class'`, no throw; `toSimple` keeps `view` and sets unit to `defaultUnit(view)`.
- [ ] **Step 2: Run** `npm test` — new tests FAIL.
- [ ] **Step 3: Implement.** `normalizeState` accepts `view`, falling back to default; the `unit` fallback becomes `defaultUnit(view)`. `decodeHash` reads `raw.v`; `wantsAdvanced` compares `state.unit` to `defaultUnit(state.view)` instead of the literal `'lamFlam'`.
- [ ] **Step 4: Fix any existing tests** that hard-code the old default unit (`grep lamFlam tests/`) to the new default; run `npm test` — all PASS.
- [ ] **Step 5: Commit** `feat: view state and Fnu default unit`.

### Task 2: Do Not Fit in χ², survey matching

**Files:**
- Modify: `js/physics.js:305` (`chi2`), `js/bands.js`
- Test: `tests/physics.chi2.test.js`, `tests/figure.test.js` (bands section)

**Interfaces:**
- Consumes: points `{ lamUm, fLam, errFlam, fit? }`.
- Produces: `chi2` skips points with `fit === false` (missing `fit` = fit); `export function surveyForLam(lamUm): string` in `bands.js` returning a `BAND_GROUPS` entry or `'Other'`.

- [ ] **Step 1: Write failing tests.** chi2: two points, one with `fit:false`; result `dof`/`chi2` equal the one-point result. `surveyForLam`: 1.235→`'2MASS'`, 3.55→`'IRAC'`, 3.35→`'AllWISE'`, 23.7→`'MIPS'`, 0.4→`'Other'`, 1000→`'Other'`; a wavelength inside two bands' ranges (3.45) goes to the band with the nearest centre.
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement.** `chi2`: `continue` on `p.fit === false`. `surveyForLam`: nearest `lamUm` among bands whose `|lam − band.lamUm| ≤ max(widthUm/2, 0.05·band.lamUm)`; else `'Other'`.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat: Do Not Fit points and survey matching`.

### Task 3: CSV `fit` column

**Files:**
- Modify: `js/dataio.js:22-78` (`parseCsv`), header comment
- Test: `tests/dataio.test.js`

**Interfaces:**
- Produces: `parseCsv` points now always carry `fit: boolean`; optional header column `fit` (cells `0`/`1`, also `false`/`no`/`n` → false; blank or anything else → true).

- [ ] **Step 1: Write failing tests:** a file with `fit` column `1,0,` yields `fit` `true,false,true`; a file without the column yields all `fit:true`; header match is case-insensitive like the others.
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement** with `header.indexOf('fit')` alongside the other columns.
- [ ] **Step 4: Run** `npm test` — PASS; also update the ui hint text later in Task 5.
- [ ] **Step 5: Commit** `feat: fit column in CSV import`.

### Task 4: Class figure builder and theme tokens

**Files:**
- Modify: `js/figure.js` (`buildFigure` dispatches on `state.view`; new `buildClassFigure`), `css/style.css` (tokens)
- Test: `tests/figure.test.js`

**Interfaces:**
- Consumes: `surveyForLam`, `BAND_GROUPS` (Task 2), `state.view` (Task 1).
- Produces: `buildFigure(model, state, { points, revealModel, title = 'SED model', fit = null })` where `fit = { reduced: number|null }`. `view === 'modern'` returns exactly today's figure. New tokens `var:model` (grey curve) and, existing `var:fg` for Do Not Fit points; survey points use `var:bandtext-<group lowercased>`; `Other` uses `var:muted`.

- [ ] **Step 1: Write failing tests** (class view, `defaultState()` with belt1 on, then variations):
  - title text equals `title`; subtitle annotation reads "1 Dust Belt"; with both belts "2 Dust Belts"; with belts off "No Dust".
  - trace named `T★ = 5772 K`, solid, colour `var:model`; legend-only text traces include `T_eff = 5772 K`, and `Reduced χ² = 1.2` only when `fit.reduced` is a number (absent for `null` and for no `fit`).
  - given points in 2MASS, IRAC and one `fit:false`: one trace per present survey with the right colour token and name; a trace named `Do Not Fit` coloured `var:fg`; no trace for surveys with no points; a point outside all bands goes in `Other`.
  - no points → no survey traces, no throw; all points `fit:false` → only the Do Not Fit trace.
  - `layout.xaxis.showgrid === false`, `mirror === true`; `defaultState().bands === false` so the default class figure has no band shapes, and `bands: true` adds them.
  - `revealModel` adds the `True model` trace in class view.
  - modern view: existing assertions unchanged.
  - token check: every `var:<name>` in either figure (collect with `JSON.stringify` regex) has `--<name>:` in both the light and dark parts of `css/style.css` (read the file with `fs`).
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement `buildClassFigure(model, state, opts)` in `js/figure.js`.** Reuse `convertArray`/`convertFlux`. Rules: curve = total in grey; when any belt is on, add the star as a faint dashed line (`var:muted`); belts are not drawn separately; error bars as in the modern view (10% assumed); legend box inside the axes bottom-left with `bgcolor 'var:bg'` and a border; x range [0.5, 100] µm, y range reuses the modern range logic (extract it into a shared helper rather than copying). Band shading is on only when `state.bands` (change `defaultState().bands` to `false` in `js/model.js` — Class default is off; Modern users re-enable it via the checkbox; update the matching model test). Add `--model` to both theme blocks in `css/style.css` (light `#7a7f8a`, dark `#b0b6c3`).
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat: class-style figure`.

### Task 5: UI wiring

**Files:**
- Modify: `index.html` (Display panel), `js/ui.js`, `css/style.css`, `README.md`
- Test: manual (DOM code is not unit-tested in this project)

**Interfaces:**
- Consumes: Tasks 1–4 as specified there.
- Produces: `#view-class` / `#view-modern` segmented buttons (`aria-pressed`) in the Display panel, shown in both modes.

- [ ] **Step 1: View toggle.** Add the segmented control to `index.html`'s `#display-panel`; on click set `state = normalizeState({...state, view, unit: defaultUnit(view)})` only if the current unit equals the other view's default (so an explicit unit choice survives); `syncControls` sets `aria-pressed`; presets keep the student's view (like `bands` at ui.js:225).
- [ ] **Step 2: Title and fit options.** In `render()` compute `title` = active preset name (from `PRESETS` via `presetEl.value`), else challenge title, else uploaded file name without extension (store it in `loadUpload`), else `'SED model'`; pass `{ title, fit: fitStats && { reduced: fitStats.reduced } }` to `buildFigure`. `fitN` counts only `fit !== false` points.
- [ ] **Step 3: Point table.** In the "Your data" panel add `#point-table`: one row per uploaded point (wavelength, survey from `surveyForLam`, a "Fit" checkbox); toggling sets `uploadedPoints[i].fit` and calls `scheduleRender()`. Update the CSV hint to mention the optional `fit` column. Readouts line gains "(N points marked Do Not Fit)" when N > 0.
- [ ] **Step 4: README** — a short "Views" paragraph (Class default, Modern alternative, Do Not Fit).
- [ ] **Step 5: Verify.** `npm test` PASS. Then `python -m http.server 8080` and open `http://localhost:8080` (this was denied in earlier sessions, so if it is denied again, leave this step unchecked and say so). Check: default page looks like the reference; Modern button restores the previous look; dark theme; load a CSV with a `fit` column and watch black points and χ² change; open an old-style link `#T=5772&u=lamFlam`.
- [ ] **Step 6: Commit** `feat: view toggle, point table, class defaults`.
