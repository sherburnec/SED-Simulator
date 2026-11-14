# SED Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static GitHub Pages site where astronomy students build the SED of a star plus debris disk(s) with sliders, in a simple mode and an Advanced mode, with presets, challenges, data upload and live equations.

**Architecture:** Pure, DOM-free ES modules hold the physics, state, CSV handling, figure construction, equations, presets and challenges; all are unit-tested with `node --test`. A thin `ui.js` wires the DOM and calls `Plotly.react` and `katex.render`. No build step. `index.html` loads `js/ui.js` as a module.

**Tech Stack:** HTML/CSS/ES modules; Plotly.js `plotly.js-dist-min@2.35.2` and KaTeX `katex@0.16.11` from jsDelivr (pinned); Node 22 built-in test runner (no npm packages).

**Spec:** `docs/superpowers/specs/2026-11-13-sed-simulator-design.md`. Read it before starting any task. It is the source of truth for ranges, defaults, wording intent and behaviour.

## Global Constraints

- Static site served from repo root on `main`; no bundler, no Node needed to *run* the site. Node is used only for tests.
- No npm dependencies. `package.json` exists only for `"type": "module"` and the `test` script.
- CDN scripts pinned exactly: `https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js`, `https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js` and `.../katex.min.css`.
- Physics internally in cgs. Wavelengths at module boundaries are in **µm**. F_λ at module boundaries is **erg s⁻¹ cm⁻² cm⁻¹** (cgs) unless a function says otherwise.
- Wavelength grid: 500 points, log-spaced, 0.05–3000 µm.
- `js/physics.js`, `js/model.js`, `js/dataio.js`, `js/bands.js`, `js/figure.js`, `js/equations.js`, `js/presets.js`, `js/challenges.js` must not touch `document`, `window` or `Plotly`.
- Redraw under 100 ms while dragging, on an ordinary lab computer.
- Colours must work in light and dark themes (`prefers-color-scheme`).
- No auto-fit feature anywhere.
- Uploaded data never leaves the browser.

## Review Focus

1. **Broken or hand-edited share links** (typo in hash, out-of-range value, old link missing keys): page opens with defaults for bad keys, values clamped to slider ranges, never a blank page. Pinned in Task 4.
2. **Messy student CSVs** (CRLF line endings, extra spaces, blank trailing lines, zero/negative flux, non-numeric cells, wavelengths outside 0.05–3000 µm): good rows load; each bad row gets an error naming the row and the problem; zero/negative flux is rejected (it can't go on a log plot); out-of-grid wavelengths are rejected with a message. Pinned in Task 3.
3. **Slider corners** (T★ = 40,000 K with R★ = 20 R☉ at d = 1 pc and belt at 0.1 AU; T★ = 2,500 K, R★ = 0.1 R☉, belt at 1000 AU giving ~1 K dust): no `NaN`/`Infinity` in any output array; very cold dust gives tiny but finite flux. Pinned in Tasks 1 and 2.
4. **r_in > r_out typed into Advanced inputs**: the values are swapped, not rejected and not producing negative weights. Pinned in Task 4.
5. **χ² with too few points, or with some points missing errors**: dof ≤ 0 shows plain χ² with a note; missing errors use 10% and the count is reported. Pinned in Task 3.

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | `{"type":"module","private":true,"scripts":{"test":"node --test tests/"}}` |
| `js/physics.js` | constants, grid, Planck, star, dust, unit conversion, peak, interpolation, χ² |
| `js/model.js` | app state shape, ranges, defaults, simple-mode reset, hash encode/decode, free-parameter count, state → physics params |
| `js/dataio.js` | CSV parsing of student photometry, model CSV export |
| `js/bands.js` | telescope band list |
| `js/figure.js` | builds Plotly `{data, layout}` from model + state (pure) |
| `js/equations.js` | TeX strings with current values filled in (pure) |
| `js/presets.js` | presets with citations |
| `js/challenges.js` | challenge definitions, seeded RNG, synthetic photometry |
| `js/ui.js` | DOM wiring, rendering, event handling |
| `index.html`, `css/style.css` | page and styles |
| `tests/*.test.js` | one test file per pure module |
| `README.md` | what it is, run locally, test, deploy |

---

### Task 1: Physics core: star, conversions, peak

**Files:**
- Create: `package.json`, `js/physics.js`, `tests/physics.star.test.js`

**Interfaces:**
- Produces (all exported from `js/physics.js`):
  - `CONST` — `{ h, c, k, sigma, Lsun, Rsun, AU, pc, um }` cgs (`um = 1e-4` cm). Use `Lsun = 3.828e33`, `Rsun = 6.957e10`.
  - `makeGrid(minUm = 0.05, maxUm = 3000, n = 500) → Float64Array` (µm, log-spaced, endpoints inclusive)
  - `planckLam(lamUm: number, T: number) → number` — B_λ in erg s⁻¹ cm⁻² sr⁻¹ cm⁻¹; use `Math.expm1`; returns 0 (not NaN) when the exponent overflows
  - `starFlux(gridUm, { T, R, d }) → Float64Array` — F_λ = π B_λ (R/d)², R in R☉, d in pc
  - `luminosity(T, R) → number` — L in L☉
  - `wienPeakUm(T) → number` — 2898 / T
  - `convertFlux(lamUm, fLam, unit) → number` — `unit ∈ 'lamFlam' | 'Fnu' | 'Flam'`; `lamFlam` = λ[cm]·F_λ (erg s⁻¹ cm⁻²); `Fnu` = F_λ·λ²/c·1e23 (Jy); `Flam` = F_λ·1e-4 (erg s⁻¹ cm⁻² µm⁻¹)
  - `toFlamCgs(lamUm, value, unit) → number` — inverse of `convertFlux`
  - `convertArray(gridUm, arr, unit) → Float64Array`
  - `peakIndex(arr) → number` — index of the maximum

- [x] **Step 1: Create `package.json`** with the content in the file map.

- [x] **Step 2: Write failing tests** in `tests/physics.star.test.js`:

```js
test('Sun luminosity is 1 Lsun within 0.5%', () => {
  assert.ok(Math.abs(luminosity(5772, 1) - 1) < 0.005);
});
test('grid is 500 log-spaced points from 0.05 to 3000 um', () => {
  const g = makeGrid();
  assert.equal(g.length, 500);
  assert.ok(Math.abs(g[0] - 0.05) < 1e-12 && Math.abs(g[499] - 3000) < 1e-9);
});
test('integral of starFlux equals L/(4 pi d^2) within 1% on a wide grid', () => {
  // grid 0.01–1e4 um, 5000 pts, trapezoid in cm; T=5772, R=1, d=10
});
for (const [unit, k] of [['Flam', 2898], ['lamFlam', 3670], ['Fnu', 5100]]) {
  test(`displayed peak in ${unit} is near ${k}/T`, () => {
    for (const T of [3000, 5772, 10000]) {
      const g = makeGrid(); const s = convertArray(g, starFlux(g, { T, R: 1, d: 10 }), unit);
      const ratio = g[peakIndex(s)] / (k / T);
      assert.ok(ratio > 0.97 && ratio < 1.03);   // one grid step is ~1.9%
    }
  });
}
test('40,000 K F_lambda peak is on the grid, not at the edge', () => {
  const g = makeGrid(); const i = peakIndex(starFlux(g, { T: 40000, R: 1, d: 10 }));
  assert.ok(i > 0 && i < 499);
});
test('unit conversions round-trip', () => {
  for (const unit of ['lamFlam', 'Fnu', 'Flam'])
    for (const lam of [0.5, 24, 870]) {
      const v = 3.7e-9;
      assert.ok(Math.abs(toFlamCgs(lam, convertFlux(lam, v, unit), unit) / v - 1) < 1e-12);
    }
});
test('Planck stays finite and non-negative at extremes', () => {
  for (const [lam, T] of [[0.05, 1], [3000, 40000], [0.05, 40000], [3000, 1]]) {
    const b = planckLam(lam, T); assert.ok(Number.isFinite(b) && b >= 0);
  }
});
```

Fill in the integral test body with `luminosity(5772,1)*CONST.Lsun/(4*Math.PI*(10*CONST.pc)**2)` as the expected value.

- [x] **Step 3: Run** `npm test` → FAIL (module not found).
- [x] **Step 4: Implement** the exports listed above in `js/physics.js`. Put a comment above each function giving the equation it implements, matching the spec's "Physics model" section.
- [x] **Step 5: Run** `npm test` → all PASS.
- [x] **Step 6: Commit** `feat: physics core for stellar SED and flux units`.

---

### Task 2: Physics: dust belts and total model

**Files:**
- Modify: `js/physics.js`
- Create: `tests/physics.dust.test.js`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces:
  - `dustTemp(L, rAu) → number` — 278.3 · L^¼ · r^−½ (L in L☉)
  - `emissivity(lamUm, lambda0Um, beta) → number` — 1 for λ ≤ λ₀, (λ₀/λ)^β beyond
  - `beltFlux(gridUm, star: {T,R,d}, belt: {rIn, rOut, f, lambda0, beta}) → Float64Array` (F_λ cgs)
  - `beltNorm(T, lambda0, beta) → number` — ∫ Q B_λ dλ (cgs), exported for testing
  - `beltTempRange(L, belt) → [Tmin, Tmax]` (equal when `rIn === rOut`)
  - `totalModel(params) → { grid, star, belts: Float64Array[], total }` where `params = { star:{T,R,d}, belts:[belt,...] }`; grid from `makeGrid()`
  - `excessRatio(gridUm, total, star, lamUm) → number` — log–log interpolated total/star at `lamUm`

**Algorithm (not determined by signatures): belt normalisation**

```
norm(T, λ0, β) = ∫ Q(λ) B_λ(T) dλ over NORM_GRID (0.01–1e6 µm, 4000 log pts, trapezoid in cm)
ring at r:  F_λ = [f_share · L★·Lsun / (4π d²)] · Q(λ) B_λ(T_d(r)) / norm(T_d(r), λ0, β)
extended:   30 annuli, edges log-spaced from rIn to rOut; annulus i at its geometric-mean radius;
            f_share_i = f · (1/a − 1/b) / (1/rIn − 1/rOut)   // a<b annulus edges; Σ ∝ r⁻¹ ⇒ area ∝ dr, absorbed fraction ∝ dr/r²
ring case:  rIn === rOut → single ring, f_share = f
```

Cache `NORM_GRID` at module load (built once).

- [x] **Step 1: Write failing tests**:

```js
test('dust at 1 AU around 1 Lsun is 278.3 K', () => assert.ok(Math.abs(dustTemp(1, 1) - 278.3) < 1e-9));
for (const beta of [0, 2]) test(`belt integral equals f L/(4pi d^2) within 1%, beta=${beta}`, () => {
  // integrate beltFlux over a wide grid (0.01–1e6 um, 6000 pts) for
  // star {T:9600,R:2.7,d:7.7}, belt {rIn:80,rOut:80,f:2e-5,lambda0:100,beta}
});
test('extended belt integral also equals f L/(4pi d^2) within 1%', () => { /* rIn:10, rOut:100, beta 1 */ });
test('beta=0 normalisation matches sigma T^4 / pi within 0.5%', () => {
  for (const T of [5, 50, 500]) assert.ok(Math.abs(beltNorm(T, 100, 0) / (CONST.sigma * T ** 4 / Math.PI) - 1) < 0.005);
});
test('beltTempRange: hotter at rIn, equal for a ring', () => {
  const [lo, hi] = beltTempRange(1, { rIn: 4, rOut: 16 });
  assert.ok(Math.abs(hi - 139.15) < 0.01 && Math.abs(lo - 69.575) < 0.01);
});
test('excess ratio is 1 with no belts, >1 at 70um with a cold belt', () => {});
test('corners produce only finite, non-negative values', () => {
  const corners = [
    { star: { T: 40000, R: 20, d: 1 }, belts: [{ rIn: 0.1, rOut: 0.1, f: 1e-2, lambda0: 10, beta: 2 }] },
    { star: { T: 2500, R: 0.1, d: 500 }, belts: [{ rIn: 1000, rOut: 1000, f: 1e-6, lambda0: 1000, beta: 0 }] },
  ];
  for (const p of corners) for (const arr of [totalModel(p).total, ...totalModel(p).belts])
    assert.ok(arr.every(v => Number.isFinite(v) && v >= 0));
});
test('two extended belts compute in under 20 ms', () => { /* time 10 runs of totalModel, average < 20 ms */ });
```

- [x] **Step 2: Run** `npm test` → new tests FAIL.
- [x] **Step 3: Implement** the exports above. Comment each with its spec equation.
- [x] **Step 4: Run** `npm test` → all PASS.
- [x] **Step 5: Commit** `feat: debris belt emission and total model`.

---

### Task 3: Interpolation, χ² and CSV I/O

**Files:**
- Modify: `js/physics.js`
- Create: `js/dataio.js`, `tests/dataio.test.js`, `tests/physics.chi2.test.js`

**Interfaces:**
- Produces in `physics.js`:
  - `interpLogLog(gridUm, values, lamUm) → number` (linear in log λ – log F; returns `NaN` outside the grid)
  - `chi2(points, gridUm, total, nFree) → { chi2, dof, reduced /* null if dof ≤ 0 */, assumedErrCount }` where `points = [{ lamUm, fLam, errFlam /* null if missing */ }]`; missing error → `0.1 · fLam`
- Produces in `dataio.js`:
  - `parseCsv(text: string, unit: 'Fnu'|'Flam'|'lamFlam') → { points, errors: [{ row: number /* 1-based file line */, message: string }] }` — points as above, converted to F_λ cgs via `toFlamCgs`
  - `modelToCsv(model /* totalModel result */, unit) → string` — header `wavelength_um,star,belt1,belt2,total` (belt2 column empty if absent); a `# unit: ...` first line

**Parsing rules:** header row required and must contain `wavelength_um` and `flux` (case-insensitive, trimmed); `flux_err` optional; accept CRLF/LF; skip blank lines; per-row errors for: non-numeric value, flux ≤ 0, error < 0, wavelength outside 0.05–3000 µm ("outside the model's 0.05–3000 µm range"). A file with zero valid rows returns `points: []` and at least one error.

- [x] **Step 1: Write failing tests**:

```js
// physics.chi2.test.js
test('chi2 is 0 for points taken exactly from the model', () => {});
test('missing errors assume 10% and are counted', () => {
  // two points, one with err null → assumedErrCount === 1
});
test('dof <= 0 gives reduced null', () => { /* 3 points, nFree 5 */ });
test('interpLogLog returns grid values at grid points and NaN outside', () => {});

// dataio.test.js
test('parses CRLF file with spaces, blank trailing lines, optional err column', () => {
  const r = parseCsv('wavelength_um, flux, flux_err\r\n 24 , 0.5 , 0.05\r\n70,0.8,\r\n\r\n', 'Fnu');
  assert.equal(r.points.length, 2); assert.equal(r.points[1].errFlam, null); assert.deepEqual(r.errors, []);
});
test('reports bad rows by file line and keeps good rows', () => {
  const r = parseCsv('wavelength_um,flux\n24,abc\n70,-1\n5000,1\n100,2', 'Fnu');
  assert.equal(r.points.length, 1);
  assert.deepEqual(r.errors.map(e => e.row), [2, 3, 4]);
});
test('missing header column is a single clear error', () => {});
test('Jy input converts to F_lambda cgs', () => { /* 1 Jy at 100 um → 1e-23 * c / (1e-2 cm)^2 */ });
test('modelToCsv has header and 500 rows', () => {});
```

- [x] **Step 2: Run** `npm test` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test` → PASS.
- [x] **Step 5: Commit** `feat: chi-squared and photometry CSV import/export`.

---

### Task 4: App state, ranges, simple-mode reset, share links

**Files:**
- Create: `js/model.js`, `tests/model.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks except types.
- Produces:
  - `RANGES` — `{ T:[2500,40000,'log'], R:[0.1,20,'log'], d:[1,500,'log'], r:[0.1,1000,'log'], f:[1e-6,1e-2,'log'], lambda0:[10,1000,'log'], beta:[0,2,'lin'] }`
  - `defaultState() → State` where
    ```
    State = { mode: 'simple'|'advanced',
              star: { T: 5772, R: 1, d: 10 },
              belt1: { on: true, rIn: 40, rOut: 40, f: 1e-4, lambda0: 100, beta: 0 },
              belt2: { on: false, rIn: 5, rOut: 10, f: 1e-5, lambda0: 100, beta: 0 },
              unit: 'lamFlam', bands: false }
    ```
  - `setBeltDistance(state, r) → State` — simple-mode slider; sets `belt1.rIn = belt1.rOut = r`
  - `normalizeState(state) → State` — clamps every value to `RANGES`, swaps `rIn`/`rOut` if reversed, fills missing keys from defaults
  - `hasAdvancedPhysics(state) → boolean` — true if belt1 extended, belt1 β ≠ 0 or λ₀ ≠ 100, or belt2 on
  - `toSimple(state) → State` — `mode:'simple'`, belt1 → ring at `rIn` with β 0, λ₀ 100; belt2 off; `unit:'lamFlam'`; `bands:false`. (Uploaded data lives in `ui.js` and is only hidden, per spec.)
  - `toPhysicsParams(state) → { star, belts }` for `totalModel` (each belt included only when its `on` is true)
  - `countFreeParams(state) → number` — 3 (T, R, d) + if belt1 on: belt1 f + radii (1 ring / 2 extended) + (2 if belt1 β ≠ 0) + if belt2 on: belt2 f + radii (1/2) + (2 if β ≠ 0). Simple mode with dust on gives 5.
  - `encodeHash(state) → string` — compact `key=value&...` with keys `m,T,R,d,b1on,r1i,r1o,f1,l1,b1,b2on,r2i,r2o,f2,l2,b2,u,bd`; numbers with 4 significant figures

`belt1.on` is a small addition beyond the spec's control table. The Sun preset ("no disk") and Challenge 1 ("bare star") both need a star with no dust, so simple mode gets a "Show dust belt" checkbox above the two dust sliders.
  - `decodeHash(hash: string) → State` — ignores unknown keys, falls back per key on unparseable values, then `normalizeState`; sets `mode:'advanced'` if `hasAdvancedPhysics` or `unit ≠ 'lamFlam'` or `bands`

- [x] **Step 1: Write failing tests**:

```js
test('hash round-trips a full advanced state to 4 sig figs', () => {});
test('garbage hash gives defaults', () => assert.deepEqual(decodeHash('#%%%zz=1&T=banana'), defaultState()));
test('out-of-range values are clamped', () => assert.equal(decodeHash('T=99999').star.T, 40000));
test('old link missing keys fills from defaults', () => {});
test('reversed radii are swapped', () => {
  const s = normalizeState({ ...defaultState(), belt1: { ...defaultState().belt1, rIn: 100, rOut: 10 } });
  assert.deepEqual([s.belt1.rIn, s.belt1.rOut], [10, 100]);
});
test('hash with advanced settings opens in advanced mode', () => assert.equal(decodeHash('b2on=1').mode, 'advanced'));
test('toSimple resets advanced physics and display, reports via hasAdvancedPhysics', () => {});
test('countFreeParams: simple 5; dust off 3; extended belt1 with beta 8; plus extended belt2 with beta 13', () => {});
```

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat: app state, simple-mode reset and share links`.

---

### Task 5: Bands and figure construction

**Files:**
- Create: `js/bands.js`, `js/figure.js`, `tests/figure.test.js`

**Interfaces:**
- Consumes: `totalModel` result, `convertArray`, `peakIndex`, `State`, `points` from Task 3.
- Produces:
  - `BANDS` — `[{ id, label, lamUm, group }]` with exactly the spec's list: 2MASS J/H/Ks 1.25/1.65/2.17; WISE W1–W4 3.4/4.6/12/22; MIPS 24/70/160; PACS 70/100/160; SPIRE 250/350/500; SCUBA-2 850; ALMA B7 870, B6 1300
  - `buildFigure(model, state, { points = null, revealModel = null } = {}) → { data, layout }`
    - traces in order: star (dashed), belt 1, belt 2 if on (dotted), total (solid, width 3), then `points` as markers with `error_y` if given, then `revealModel` total as a contrasting solid line if given
    - y values converted with `convertArray(grid, …, state.unit)`
    - a peak marker trace at `grid[peakIndex(convertedStar)]` labelled "Star peak"
    - `layout.xaxis.type = layout.yaxis.type = 'log'`; x title `Wavelength (µm)`; y title per unit: `λF_λ (erg s⁻¹ cm⁻²)`, `F_ν (Jy)`, `F_λ (erg s⁻¹ cm⁻² µm⁻¹)`
    - y range (log10) `[log10(max total) − 6, log10(max total) + 0.5]`
    - when `state.bands`: one `layout.shapes` rect per band (±5% in λ, `yref:'paper'`, light fill) and one `layout.annotations` label each; none when off
    - colours read from CSS custom properties at render time in `ui.js`. `buildFigure` uses placeholder colour tokens such as `'var:star'`, and `ui.js` resolves them. The figure stays pure.

- [x] **Step 1: Write failing tests**:

```js
test('trace order and count for one belt, no data', () => { /* names: Star, Belt 1, Total, Star peak */ });
test('belt 2 trace appears only when on', () => {});
test('peak marker sits at the displayed star peak for each unit', () => {
  // for unit of ['Flam','lamFlam','Fnu']: marker x === grid[peakIndex(convertArray(...star..., unit))]
});
test('bands add 19 shapes when on and none when off', () => {});
test('belt 1 trace is absent when belt1.on is false', () => {});
test('points trace carries error bars converted to the display unit', () => {});
```

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat: telescope bands and Plotly figure builder`.

---

### Task 6: Page shell and simple mode

**Files:**
- Create: `index.html`, `css/style.css`, `js/ui.js`

**Interfaces:**
- Consumes: `defaultState`, `decodeHash`, `encodeHash`, `setBeltDistance`, `toPhysicsParams`, `RANGES` (Task 4); `totalModel` (Task 2); `buildFigure` (Task 5).
- Produces: `ui.js` internal functions later tasks extend. Keep these names: `render()` (recompute model, rebuild figure, `Plotly.react`, update readouts, update hash via `history.replaceState`), `bindSlider(id, getter, setter, rangeKey)`, and module-level `state`, `uploadedPoints`, `activeChallenge`.

Layout per the spec's ASCII sketch: header (title, Preset dropdown placeholder, Simple|Advanced toggle, Challenges button), plot left, controls right, readouts and equations below the plot; on screens narrower than 800 px the controls stack under the plot.

Simple-mode controls, each a range slider paired with a number input. Log ranges map the slider's 0–1000 integer position to `10^(lerp(log10 min, log10 max))`:

| id | Main label | Symbol label | Range key |
|---|---|---|---|
| `T` | Star temperature | T★ (K) | T |
| `R` | Star size | R★ (R☉) | R |
| `d` | Distance to the star | d (pc) | d |
| `r` | How far the dust is from the star | r (AU) | r |
| `f` | How bright the dust is | L_dust/L★ | f |

Plus a "Show dust belt" checkbox (`belt1.on`) above `r` and `f`; unchecking it disables those two sliders.

Redraw on `input` events via `requestAnimationFrame` coalescing (one render per frame at most). Number inputs commit on `change`, clamped via `normalizeState`. On load, state comes from `decodeHash(location.hash)` when present, otherwise `defaultState()`.

Theme tokens on `:root` (`--bg, --fg, --muted, --grid, --star, --belt1, --belt2, --total, --data, --band`), redefined under `@media (prefers-color-scheme: dark)`; `body` gets an explicit background. `ui.js` resolves `'var:<name>'` colour tokens from `getComputedStyle`.

- [x] **Step 1: Build** the page and wiring above.
- [ ] **Step 2: Verify in a browser (NOT RUN: browser launch denied; needs the user).** Run `npx --yes http-server -p 8080 -c-1` (or `python -m http.server 8080`) from the repo root and open `http://localhost:8080`. Expected: default Sun-like curve with a cold-dust bump near ~70–100 µm in λF_λ. Dragging T moves the peak smoothly with no visible lag. Reloading keeps the values (hash). Opening `#T=banana` shows defaults with no console errors. Width 375 px stacks controls with no horizontal scroll. Dark mode is readable.
- [x] **Step 3: Run** `npm test` → still all PASS.
- [x] **Step 4: Commit** `feat: page shell with simple-mode sliders and live plot`.

---

### Task 7: Advanced panel, data upload, export

**Files:**
- Modify: `index.html`, `css/style.css`, `js/ui.js`

**Interfaces:**
- Consumes: `toSimple`, `hasAdvancedPhysics`, `normalizeState` (Task 4); `parseCsv`, `modelToCsv` (Task 3); `chi2` (Task 3); `countFreeParams` (Task 4).

Behaviour (all per the spec's "Advanced panel", "Data upload" and "Plot" sections):
- The Simple|Advanced toggle shows or hides a collapsible Advanced panel. In Advanced mode, the single `r` slider is replaced by Belt 1 `r_in`/`r_out`, and the panel adds λ₀ and β for belt 1, Belt 2 (on/off plus its own `r_in`, `r_out`, `f`, λ₀, β), a flux unit select, a bands checkbox, and data upload (file input plus a unit select for the file).
- Switching to Simple: if `hasAdvancedPhysics(state)`, `confirm('Switching to Simple mode resets belt shape, emissivity and belt 2. Continue?')`; on cancel, stay in Advanced. Then `state = toSimple(state)`. `uploadedPoints` is kept but not passed to `buildFigure` while in Simple mode.
- Upload: show the parse errors as a list ("Row 3: flux must be positive") under the file input; plot the valid points.
- Export: a "Download CSV" button (`modelToCsv` in the current unit, filename `sed-model.csv`). PNG export uses Plotly's modebar.
- The χ² readout (Task 8 places it) is computed here as `chi2(uploadedPoints, grid, total, countFreeParams(state))`. Store it on a module-level `fitStats` for Task 8.

- [x] **Step 1: Build.**
- [ ] **Step 2: Verify in browser (NOT RUN: needs the user).** Expected: extended belt broadens the bump. β = 2 steepens the submm fall-off. Belt 2 adds a second bump. Changing the unit moves the peak marker. Bands draw and label. Uploading this file shows 3 points and one row error:
  ```
  wavelength_um,flux,flux_err
  12,0.9,0.05
  24,0.4,
  70,0,0.01
  100,0.2,0.02
  ```
  Toggling to Simple asks for confirmation, then hides the points; back to Advanced, the points reappear. Dragging sliders with two extended belts and data loaded shows no visible lag. Download CSV opens with a header and 500 rows.
- [x] **Step 3: Commit** `feat: advanced controls, photometry upload and CSV export`.

---

### Task 8: Readouts and live equations

**Files:**
- Create: `js/equations.js`, `tests/equations.test.js`
- Modify: `index.html`, `js/ui.js`, `css/style.css`

**Interfaces:**
- Consumes: `luminosity`, `wienPeakUm`, `dustTemp`, `beltTempRange`, `excessRatio` (Tasks 1–2); `fitStats` (Task 7).
- Produces: `equations(state) → [{ id, tex, controls: string[] }]` with ids `luminosity`, `wien`, `dustTemp` (one per active belt), `starFlux`, `beltNorm`, and `emissivity` (Advanced only). Each `tex` contains the symbolic form, `=`, then the current numbers substituted and the result to 3 significant figures, e.g. `T_d = 278\,\mathrm{K}\,(0.930)^{1/4}(40.0)^{-1/2} = 43.0\,\mathrm{K}`. `controls` lists slider ids that affect it.

Readouts panel: L★ (L☉), Wien λ_peak = 2898/T (µm) with the note "The peak you see on the plot depends on the flux unit: F_λ peaks at 2898/T µm, λF_λ near 3670/T, F_ν near 5100/T.", each belt's T_d (a range for extended belts), f, excess ratio at 24 µm and 70 µm, and, when data is shown, "χ²_red = … (N points, k free parameters)" plus "assuming 10% errors on M points" when M > 0, or "χ² = … — add more points than free parameters for a reduced χ²" when `reduced` is null.

Equations panel: collapsible, rendered with `katex.render`, re-rendered in `render()` only when open. Hovering an equation adds a highlight class to its controls.

- [x] **Step 1: Write failing tests**:

```js
test('dust temperature equation substitutes current values', () => {
  const tex = equations(defaultState()).find(e => e.id === 'dustTemp').tex;
  assert.match(tex, /= 44\.0\\,\\mathrm\{K\}$/);  // Sun, 40 AU → 278.3·40^−½ = 44.0 K
});
test('emissivity equation only in advanced', () => {});
test('each equation lists the sliders that change it', () => {});
```

- [x] **Step 2: Run** → FAIL. **Step 3: Implement** `equations.js`, then the panels. **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5 (NOT RUN: needs the user): Verify in browser:** readouts update while dragging; the equations panel renders and highlights controls on hover.
- [x] **Step 6: Commit** `feat: live readouts and equations panel`.

---

### Task 9: Presets

**Files:**
- Create: `js/presets.js`, `tests/presets.test.js`
- Modify: `index.html`, `js/ui.js`

**Interfaces:**
- Consumes: `defaultState`, `normalizeState`, `hasAdvancedPhysics` (Task 4); `luminosity`, `dustTemp` (Tasks 1–2).
- Produces: `PRESETS: [{ id, name, description, citations: string[], targetDustTemps: number[], state: Partial<State> }]` and `applyPreset(id) → State` (normalised; `mode:'advanced'` when `hasAdvancedPhysics`).

Presets and targets from the spec's table: Sun (`belt1.on: false`; the description notes the Sun's real Kuiper-belt dust is far fainter than the slider minimum), Vega (~50 K), Fomalhaut (~50 K), β Pic (~100 K), ε Eri (~40 K), HR 8799 (~150 K + ~45 K, uses belt 2). **Look up and cite** T★, R★, d, f and dust temperature for each from published sources (e.g. SIMBAD for d; papers for disk fits) and record them in `citations`. If a source value differs from the spec's approximate table, use the source and note it in the commit message. Set each belt's `rIn = rOut = (278.3 / T_target)² · √L★` so the blackbody dust temperature matches. Each description is 2–3 sentences, and one of them states that the radius is chosen to match the dust temperature, not the imaged radius.

- [ ] **Step 1: Write failing tests**:

```js
test('every preset has at least one citation and a 2–3 sentence description', () => {});
test('every belt hits its target dust temperature within 5%', () => {});
test('HR 8799 uses belt 2 and opens in advanced mode', () => {});
test('all preset states survive normalizeState unchanged (inside slider ranges)', () => {});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Research values and implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in browser:** each preset loads and shows its description under the dropdown.
- [ ] **Step 6: Commit** `feat: real-system presets with citations`.

---

### Task 10: Mystery SED challenges

**Files:**
- Create: `js/challenges.js`, `tests/challenges.test.js`
- Modify: `index.html`, `js/ui.js`, `css/style.css`

**Interfaces:**
- Consumes: `totalModel`, `interpLogLog`, `chi2` (Tasks 1–3); `BANDS` (Task 5); `defaultState`, `normalizeState`, `toPhysicsParams` (Task 4).
- Produces:
  - `mulberry32(seed: number) → () => number`
  - `CHALLENGES: [{ id, title, prompt, mode: 'simple'|'advanced', free: string[] /* state paths, e.g. 'star.T' */, makeHidden: (rng) => State }]` — five challenges in the spec's order. 1–3 randomise within the builder's chosen sensible ranges; 4–5 return fixed curated states (4: warm ~150 K + cold ~50 K belts; 5: β = 1.5, λ₀ = 100 µm with enough points past 100 µm to constrain β).
  - `syntheticPhotometry(hidden: State, rng, noiseFrac = 0.07) → points` — one point per **unique** band wavelength (dedupe 70/160 µm, which appear twice), value = model total × (1 + noiseFrac · gaussian), `errFlam = noiseFrac · value`
  - `startState(challenge, hidden) → State` — student's starting state: non-free parameters copied from `hidden` and locked; free parameters at defaults

UI: Challenges button opens a panel listing the five. Starting one sets `activeChallenge = { challenge, hidden, points }`, applies `startState`, disables sliders not in `free`, plots `points` (no model curve for hidden), and shows live χ² with `nFree = challenge.free.length`. Challenge 1's hidden state has `belt1.on: false`. "Reveal" passes `revealModel` to `buildFigure` and shows a table of true and student values. "New mystery" re-rolls (1–3 only). "Exit" restores the previous state. Challenge state is never written to the URL hash.

- [ ] **Step 1: Write failing tests**:

```js
test('seeded rng is deterministic', () => {});
test('synthetic photometry: 17 points (one per unique band wavelength), positive, with 7% errors', () => {});
test('student starting at the hidden values gets reduced chi2 near 1 (0.3–3) for challenge 3', () => {});
test('startState copies non-free params from hidden and leaves free params at defaults', () => {});
test('challenges 4 and 5 are identical across seeds', () => {});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** module, then UI. **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Verify in browser:** complete challenge 1 by hand; reveal shows the true curve; the hash does not change during a challenge; exit restores the prior view.
- [ ] **Step 6: Commit** `feat: mystery SED challenges`.

---

### Task 11: README, deploy, final verification

**Files:**
- Create: `README.md`, `.nojekyll`

- [ ] **Step 1: Write README:** what the simulator teaches (one paragraph), how to run locally (`python -m http.server` or `npx http-server`), how to run tests (`npm test`, Node 22+), where the physics lives (`js/physics.js`, equations commented), how to enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / root), and how share links work.
- [ ] **Step 2: Add `.nojekyll`** so Pages serves the files as-is.
- [ ] **Step 3: Run** `npm test` → all PASS. Paste the summary line into the task report.
- [ ] **Step 4: Full manual pass** in Chrome and Firefox, light and dark, at desktop and 375 px width: every spec section (controls, plot, readouts, equations, presets, challenges, upload, export, share link) works; the console is clean.
- [ ] **Step 5: Commit** `docs: README and Pages config`.
