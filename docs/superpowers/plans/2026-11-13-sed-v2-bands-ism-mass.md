# SED Simulator v2 (Survey Bands, ISM Extinction, Disk Mass) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the simulator on the 2MASS, AllWISE, IRAC and MIPS bands, add interstellar extinction linked to distance, and replace the dust-brightness slider with a disk-mass slider, as the professor asked.

**Architecture:** The existing pure-module split stays as it is. `physics.js` gains the extinction law and mass↔f conversion. `model.js` gains `ism`, `M` and `holdBrightness` state plus share-link migration. `bands.js`, `figure.js`, `equations.js`, `presets.js` and `challenges.js` are updated to match, and `ui.js`/`index.html` wire the new controls. Every pure module stays DOM-free and tested with `node --test`.

**Tech Stack:** Plain ES modules, Plotly.js `plotly.js-dist-min@2.35.2`, KaTeX `katex@0.16.11` (both pinned, from jsDelivr), and the Node built-in test runner (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-13-sed-simulator-v2-design.md` (v2 delta), which amends `docs/superpowers/specs/2026-11-13-sed-simulator-design.md` (v1). Read both. Where they conflict, v2 wins. The archived v1 plan is `docs/superpowers/plans/archive/2026-11-13-sed-simulator.md`.

## Global Constraints

- All v1 global constraints still apply: static site, no bundler, no npm dependencies, pinned CDNs, cgs internally, wavelengths in µm at module boundaries, F_λ in erg s⁻¹ cm⁻² cm⁻¹ at boundaries, a 500-point 0.05–3000 µm grid, no DOM in pure modules, redraws under 100 ms, light and dark themes, no auto-fit.
- Bands are exactly the 14 in spec §1. No Herschel, JCMT or ALMA anywhere (code, tests, README).
- Grain constants: a = 10 µm, ρ = 2.5 g cm⁻³, M⊕ = 5.972e27 g. f is capped at `F_MAX = 0.1`, with a warning when f ≥ 0.01.
- `AV_PER_KPC = 1.0`. A_V range is 0–10 (linear), M range 1e-8–1 M⊕ (log), d range 1–3000 pc (log).
- Work on a branch `sed-v2` off `main`. Each task is one commit that also ticks that task's checkboxes here.

## Review Focus

1. **Old share links** (`f1=2e-5&r1i=80&r1o=80`, `d=400` from v1) must open with the same f as before (via the mass that reproduces it) and must not open Advanced mode just because bands were on. Pinned in Task 3.
2. **Hold-brightness at the range edges** (mass 0.5 M⊕ with hold on, belt dragged from 1 AU to 1000 AU): the mass clamps at 1 M⊕, nothing goes NaN, and f falls once the clamp bites. Pinned in Task 3.
3. **Toggling the extinction link**: unlinking keeps the current A_V (no jump to 0). While linked, a typed A_V is overridden by the distance. Pinned in Task 3.
4. **Absurd mass at small radius** (1 M⊕ at 0.1 AU, raw f ≈ 6×10⁴): f is clamped to 0.1 and every model array is finite and ≥ 0. Pinned in Task 2.
5. **Heavy extinction at the blue end** (A_V = 10 at 0.05 µm): the flux is tiny but finite and ≥ 0. The excess ratio at MIPS 24 is unchanged by A_V, and the plot's y-range stays anchored to the total's peak. Pinned in Tasks 2 and 4.

---

## File map (changes only)

| File | Change |
|---|---|
| `js/bands.js` | 14 bands with `widthUm`, `group`, citations |
| `js/physics.js` | `extinctionRatio`, `avForDistance`, `fracFromMass`, `massForFrac`, `F_MAX`, `CONST.Mearth`, `totalModel` with `Av` |
| `js/model.js` | `ism`, `M`, `holdBrightness`, new ranges, `setBeltRadii`, `beltFrac`, hash keys and migration |
| `js/figure.js` | grouped and staggered band strips, a "Star (no extinction)" trace |
| `js/equations.js` | extinction and mass→f equations |
| `js/presets.js`, `js/challenges.js` | mass, extinction, new challenge list |
| `js/ui.js`, `index.html`, `css/style.css` | new controls, readouts, band colour tokens |
| `README.md` | updated feature list |

---

### Task 1: Survey band list

**Files:**
- Modify: `js/bands.js`
- Test: `tests/figure.test.js` (band list tests only; the figure drawing is in Task 4)

**Interfaces:**
- Produces: `BANDS: Array<{ id: string, label: string, lamUm: number, widthUm: number, group: '2MASS'|'AllWISE'|'IRAC'|'MIPS' }>` in increasing `lamUm` order. `BAND_GROUPS = ['2MASS', 'AllWISE', 'IRAC', 'MIPS']`. `bandById(id) → band` (throws on an unknown id).

- [x] **Step 1: Replace the old 19-band test** (`'BANDS has the spec list…'`) with `'BANDS is the 14 survey bands'`: assert length 14; ids are exactly the spec §1 ids (`'2MASS J'`…`'MIPS 160'`); the λ values match spec §1 exactly; every band has `widthUm > 0` and a group in `BAND_GROUPS`; no id matches `/PACS|SPIRE|SCUBA|ALMA/`; `lamUm` is strictly increasing; `bandById('MIPS 24').lamUm === 23.68`.
- [x] **Step 2: Run** `npm test`. Expected: the new test FAILS (length 19).
- [x] **Step 3: Rewrite `js/bands.js`** with spec §1's values. Labels: `J H Ks W1 W2 W3 W4 3.6 4.5 5.8 8.0 24 70 160`. Check each λ and width against the cited source and add a header comment with the citations (spec §1). Correct any value the source contradicts, and record what changed.
- [x] **Step 4: Run** `npm test`. Expected: the band test PASSES. Old figure tests that count 19 band shapes may now fail. Mark them `test.todo` with a note "Task 4", and leave nothing else red.
- [x] **Step 5: Commit** `feat: survey band list (2MASS, AllWISE, IRAC, MIPS)`.

### Task 2: Physics: extinction and dust mass

**Files:**
- Modify: `js/physics.js`
- Create: `tests/physics.ism.test.js`
- Modify: `tests/physics.dust.test.js`

**Interfaces:**
- Produces:
  - `CONST.Mearth = 5.972e27`; `GRAIN = { aUm: 10, rho: 2.5 }`; `F_MAX = 0.1`; `AV_PER_KPC = 1.0`
  - `extinctionRatio(lamUm: number) → number`: A_λ/A_V, using the law in spec §2
  - `avForDistance(dPc: number) → number`: `AV_PER_KPC * dPc / 1000`
  - `fracFromMass(Mearth, rInAu, rOutAu) → number`: raw `3M/(16πρa r_in r_out)`, no cap
  - `massForFrac(f, rInAu, rOutAu) → number`: the exact inverse
  - `totalModel({ star, belts, Av = 0 }) → { grid, star, starIntrinsic, belts, total }`: `star`, `belts` and `total` are the *observed* (reddened) values, and `starIntrinsic` is unreddened. The `belts[i].f` that callers pass is already capped (see Task 3).

- [x] **Step 1: Write the failing tests** in `tests/physics.ism.test.js`:
  - `'CCM89 anchors'`: `extinctionRatio(0.5495)` is within 0.01 of 1.000. Within 2%: 0.4400 → 1.324, 1.235 → 0.2876, 2.159 → 0.1170.
  - `'Indebetouw IRAC plateau'`: within 2%: 3.550 → 0.0665, 7.872 → 0.0458. Also `extinctionRatio(4.493) / extinctionRatio(5.731)` lies between 1.05 and 1.25.
  - `'continuous at 2.159 µm and 8 µm'`: the values at λ·(1 ± 1e-6) agree within 2%.
  - `'far-IR falls as λ^-2'`: `extinctionRatio(71.42)` is within 2% of `extinctionRatio(24)·(24/71.42)²`; `extinctionRatio(12) === extinctionRatio(8)`.
  - `'blue edge held'`: `extinctionRatio(0.05) === extinctionRatio(0.1)`, and the value is finite and > 2.
  - `'avForDistance'`: 1000 pc → 1, 10 pc → 0.01.
  - `'A_V = 10 at the grid edge stays finite'`: `totalModel({ star:{T:40000,R:20,d:1}, belts:[], Av:10 })` has every array finite and ≥ 0, and `star[0] < starIntrinsic[0]`.
  - `'extinction cancels in the excess ratio'`: for a Sun with a 40 AU belt at f=1e-4, `excessRatio` at 23.68 µm is the same within 1e-9 relative for Av = 0 and Av = 5.
  - `'Av = 0 leaves the model unchanged'`: `star` equals `starIntrinsic` element by element.
- [x] **Step 2: Add to `tests/physics.dust.test.js`:**
  - `'mass to f'`: `fracFromMass(1, 1, 1)` is within 0.5% of 637.1. `fracFromMass(2.5e-4, 40, 40)` is within 1% of 9.95e-5. `massForFrac(fracFromMass(3e-5, 8, 90), 8, 90)` is within 1e-12 relative of 3e-5.
  - `'extended belt f uses r_in r_out'`: `fracFromMass(M, 10, 100) === fracFromMass(M, Math.sqrt(1000), Math.sqrt(1000))` (relative 1e-12).
- [x] **Step 3: Run** `npm test`. Expected: the new tests FAIL (the functions are not exported).
- [x] **Step 4: Implement** these in `js/physics.js`, with a comment above each giving its equation and citation. `extinctionRatio` contains the full CCM89 `a(x)`, `b(x)` piecewise polynomials (IR 0.3–1.1, optical 1.1–3.3, UV 3.3–8 with the F_a/F_b terms above x = 5.9, far-UV 8–10), the Indebetouw branch and the two holds/power law. In `totalModel`, multiply star and belts by `10 ** (-0.4 * Av * extinctionRatio(λ))` once per grid point (precompute the factor array), then sum the total from the reddened parts.
- [x] **Step 5: Run** `npm test`. Expected: all physics tests PASS, and the existing star/dust/χ² tests are unchanged and green.
- [x] **Step 6: Commit** `feat: ISM extinction law and dust mass conversion`.

### Task 3: State: mass, extinction, hold-brightness, share links

**Files:**
- Modify: `js/model.js`
- Test: `tests/model.test.js` (update the existing f-based fixtures to M)

**Interfaces:**
- Consumes: `avForDistance`, `fracFromMass`, `massForFrac`, `F_MAX` (Task 2).
- Produces:
  - `RANGES` adds `Av: [0, 10, 'lin']` and `M: [1e-8, 1, 'log']`, changes `d` to `[1, 3000, 'log']`, and removes `f`.
  - `defaultState()` → `{ mode:'simple', star:{T:5772,R:1,d:10}, ism:{Av:0.01, linked:true}, belt1:{on:true,rIn:40,rOut:40,M:2.5e-4,lambda0:100,beta:0}, belt2:{on:false,rIn:5,rOut:10,M:8e-7,lambda0:100,beta:0}, holdBrightness:false, unit:'lamFlam', bands:true }`
  - `normalizeState(s)`: when `ism.linked`, set `Av = clamp(avForDistance(d))`; otherwise clamp the given Av.
  - `beltFrac(belt) → number` = `Math.min(F_MAX, fracFromMass(belt.M, belt.rIn, belt.rOut))`
  - `isFracCapped(belt) → boolean`
  - `setBeltRadii(state, key: 'belt1'|'belt2', rIn, rOut) → state`: when `holdBrightness` is on, it rescales M by `(rIn'·rOut')/(rIn·rOut)` (computed after the swap/clamp) before normalising. `setBeltDistance(state, r)` becomes `setBeltRadii(state, 'belt1', r, r)`.
  - `setLinked(state, linked: boolean) → state`: unlinking keeps the current Av.
  - `toPhysicsParams(state) → { star, belts: [{rIn,rOut,f,lambda0,beta}], Av }` with `f = beltFrac(belt)`
  - `countFreeParams` follows spec §6. `toSimple` keeps `ism`, `holdBrightness` and `bands`, and resets only the unit and the advanced physics.
  - Hash keys `av`, `al`, `hb`, `m1`, `m2` (dropping `f1`/`f2` on encode), and `bd` defaulting to on. Decoding migrates legacy `f1`/`f2` with `massForFrac` at the decoded radii, and an `m` key wins over an `f` key. `wantsAdvanced` no longer looks at `bands`.

- [x] **Step 1: Write the failing tests:**
  - `'default state matches spec §4'`: deep-equal to the object above. `beltFrac(defaultState().belt1)` is within 1% of 1e-4.
  - `'linked Av follows distance'`: setting d=2000 through `normalizeState` gives Av 2. With `linked:false, Av:4`, Av stays 4 at any d.
  - `'unlinking keeps Av'`: `setLinked({…linked state at d=1500}, false).ism.Av === 1.5`.
  - `'hold brightness keeps f when the belt moves'`: with hold on, `setBeltRadii(s,'belt1',80,80)` keeps `beltFrac` within 1e-9 and multiplies M by 4. With hold off, M is unchanged and f drops ×4.
  - `'hold brightness clamps mass at the range edge'`: M=0.5 at r=1, hold on, move to 1000 gives M === 1, a finite f, and f lower than before.
  - `'f is capped at 0.1'`: M=1 at r=0.1 gives `beltFrac === 0.1` and `isFracCapped === true`.
  - `'legacy f1 link migrates to mass'`: `decodeHash('f1=2e-5&r1i=80&r1o=80')` has `beltFrac(belt1)` within 0.1% of 2e-5 and mode `'simple'`. `decodeHash('m1=1e-3&f1=0.5')` has M === 1e-3.
  - `'bands on does not force advanced'`: `decodeHash('bd=1').mode === 'simple'`; `decodeHash('').bands === true`.
  - `'hash round-trips the new fields'`: av, al, hb, m1, m2 survive encode → decode, and so does d = 2500.
  - `'free params count A_V only when unlinked'`: default → 5; unlinked → 6.
  - Update the old fixtures (`f:` → `M:`) and the old `decodeHash('f1=5')` clamp test (it now asserts a capped `beltFrac` of 0.1).
- [x] **Step 2: Run** `npm test`. Expected: the new model tests FAIL.
- [x] **Step 3: Implement** the Interfaces above in `js/model.js`.
- [x] **Step 4: Run** `npm test`. Expected: the model tests PASS. Tests in other modules that still read `belt.f` may fail. Fix any test that only needs `f` → `M`, and leave presets/challenges/equations failures for Tasks 4–5 marked `test.todo('Task 4/5')`.
- [x] **Step 5: Commit** `feat: state for dust mass, extinction and hold-brightness, with link migration`.

### Task 4: Figure and equations

**Files:**
- Modify: `js/figure.js`, `js/equations.js`
- Test: `tests/figure.test.js`, `tests/equations.test.js`

**Interfaces:**
- Consumes: `BANDS`, `BAND_GROUPS` (Task 1); `totalModel` with `starIntrinsic` (Task 2); `beltFrac`, `state.ism` (Task 3).
- Produces:
  - `buildFigure` draws each band strip as `[lamUm − widthUm/2, lamUm + widthUm/2]` with `fillcolor: 'var:band-<group lowercased, e.g. 2mass|allwise|irac|mips>'`, and each label at `y = 1 − 0.06 · BAND_GROUPS.indexOf(group)` in that group's colour. When `state.ism.Av > 0` it adds a trace named `'Star (no extinction)'` from `model.starIntrinsic` (`line: { color:'var:muted', dash:'dashdot', width:1 }`).
  - `equations(state)` adds `{ id:'extinction', controls: linked ? ['Av','d'] : ['Av'] }`, showing `F_obs = F_int·10^{−0.4A_λ}` with the current A_V and A_Ks. For each belt that is on, it adds `{ id:'dustMass' | 'dustMass2', controls:[massCtl, ...radiusCtls] }`, showing `f = 3M/(16πρ a r_in r_out)` with a and ρ, the current M and the resulting f (noting the cap if it applies). The mass control ids are `'M'` (belt 1) and `'b2M'` (belt 2). The `beltNorm` equations use `beltFrac`, and their controls swap `'f'`/`'b2f'` for `'M'`/`'b2M'`.

- [x] **Step 1: Write the failing tests:**
  - figure: `'14 band strips and labels when on, none when off'`.
  - figure: `'band strips use real widths'`: the W3 shape has x0 ≈ 8.807 and x1 ≈ 14.313.
  - figure: `'band colours and label rows by group'`: the IRAC shapes use `'var:band-irac'`, and the MIPS labels sit at y = 0.82.
  - figure: `'no-extinction trace only when Av > 0'`, in both directions.
  - figure: `'y range ignores heavy extinction at the blue edge'`: with Av = 10 the y-range top is still log10(max total) + 0.5.
  - equations: `'extinction equation lists d only when linked'`; `'mass equation shows f'` (the TeX contains the formatted `beltFrac`); `'no equation references f or b2f controls'`.
  - Re-enable the `test.todo`s left by Task 1.
- [x] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [x] **Step 3: Implement** the Interfaces above.
- [x] **Step 4: Run** `npm test`. Expected: the figure and equations tests PASS.
- [x] **Step 5: Commit** `feat: grouped survey bands, unreddened star curve, extinction and mass equations`.

### Task 5: Presets and challenges

**Files:**
- Modify: `js/presets.js`, `js/challenges.js`
- Test: `tests/presets.test.js`, `tests/challenges.test.js`

**Interfaces:**
- Consumes: `massForFrac`, `avForDistance` (Task 2); `beltFrac`, `setLinked`, the new state (Task 3); `BANDS` (Task 1).
- Produces:
  - `applyPreset(id)` sets each belt's `M = massForFrac(f, r, r)` (to 4 significant figures), `ism.linked = true` and `holdBrightness = false`.
  - `CHALLENGES` ids in order: `bare-star`, `reddened-star`, `find-dust`, `star-and-dust`, `two-belts`. Modes: `simple ×4, advanced`.
  - `PARAMS` replaces `belt1.f`/`belt2.f` with `belt1.M` (controls `['M']`) and `belt2.M` (controls `['b2M']`). It adds `ism.Av` (label `'Interstellar dimming A_V (mag)'`, controls `['Av']`, reset to `Av = 0`) and removes `belt1.beta`/`belt1.lambda0`.
  - `startState` forces `holdBrightness = false`.
  - `syntheticPhotometry` returns one point per band (14), at `BANDS[i].lamUm`.

- [x] **Step 1: Write the failing tests** (update the existing ones):
  - presets: `'preset f survives the mass conversion'`: for every preset belt, `beltFrac` of the applied state is within 0.5% of the def's f. `'presets link extinction'`.
  - challenges: `'five challenges in the v2 order'` (ids and modes above). The photometry test becomes 14 points whose λ equal `BANDS.map(b => b.lamUm)`.
  - challenges: `'reddened star: hidden ranges'` (T 4000–9000, R 0.8–2.5, d 50, Av 1–5, `ism.linked === false`, belt off) over seeds 1–50.
  - challenges: `'reddened star is solvable'`: noiseless photometry (`syntheticPhotometry(hidden, rng, 0)`; its zero errors fall back to `chi2`'s 10% rule, which is fine for locating the minimum). A grid over T ∈ [0.7, 1.3]·T_true (step 1%) and Av ∈ [0, 6] (step 0.05) has its χ² minimum within 3% of T_true and 0.2 mag of Av_true, for seeds 1–5.
  - challenges: `'find-dust radius stays within 5–100 AU'`.
  - challenges: the `perturb` helper adds `ism.Av` (+1.0 mag), `belt1.M` and `belt2.M` (×1.6), and drops the `.f` cases. The identifiability test then covers all five challenges.
  - challenges: `'challenge 5 is fixed across seeds and gives f ≈ 3e-4 and 1.5e-4'` (within 1%).
  - challenges: `'startState turns hold-brightness off'`.
  - Delete the `submm-slope` tests.
- [x] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [x] **Step 3: Implement** using spec §7–§8. Hidden belts draw f log-uniform as before, then store `M = sig3(massForFrac(f, r, r))`. Challenge 5 stores `sig3(massForFrac(3e-4, 8, 8))` and `sig3(massForFrac(1.5e-4, 90, 90))`. Prompt for challenge 2: R★ and d are given, the distance link is switched off, find T★ and A_V, and use IRAC/MIPS (barely dimmed) to pin T first.
- [x] **Step 4: Run** `npm test`. Expected: the whole suite is green, with no `test.todo` left.
- [x] **Step 5: Commit** `feat: presets and challenges use dust mass and extinction; add reddened-star challenge`.

### Task 6: UI wiring, page, README and browser pass

**Files:**
- Modify: `js/ui.js`, `index.html`, `css/style.css`, `README.md`

**Interfaces:**
- Consumes: everything above. Slider ids: `Av` (range `'Av'`), `M` (range `'M'`, belt 1), `b2M` (belt 2), replacing `f`/`b1f`/`b2f`. Checkbox ids: `av-linked`, `hold-brightness`, `bands-on` (moved out of the Advanced panel).

- [ ] **Step 1: `index.html`:** a new fieldset "Dust between us and the star" holds `[data-ctl="Av"]` and the `av-linked` checkbox ("Set from distance (about 1 mag per kpc)"), with the Local Bubble hint from spec §2. The dust fieldset swaps `[data-ctl="f"]` for `[data-ctl="M"]` and adds the `hold-brightness` checkbox ("Keep the dust's brightness fixed when I move it"). The `bands-on` checkbox goes in a small "Display" area visible in both modes.
- [ ] **Step 2: `ui.js` controls:** `SIMPLE_CONTROLS` gets `{id:'Av', label:'Dimming by interstellar dust', symbol:'A_V (mag)'}` (set via `normalizeState` with `ism.Av`) and `{id:'M', label:'How much dust', symbol:'M_dust (M⊕, ~10 µm grains)'}`. The `r`, `b1in/b1out` and `b2in/b2out` setters go through `setBeltRadii` and use `resync: true` (the mass slider can move with them). `beltControls` swaps `b${n}f` for `b${n}M`. `syncControls` disables `[data-ctl="Av"]` while linked. During a challenge it disables `av-linked` and `hold-brightness`, and adds them to the locked list. `toSimple` handling keeps bands. The preset-in-Advanced branch no longer copies `bands`.
- [ ] **Step 3: Readouts:** add A_V, E(B−V), A_Ks (`state.ism.Av * extinctionRatio(2.159)`). For each belt: the mass in M⊕ and M☾ (÷0.0123), and f from `beltFrac`, with the spec §3 warning when f ≥ 0.01 and "(capped)" when `isFracCapped`. The excess rows use `bandById('MIPS 24'/'MIPS 70').lamUm`, labelled "MIPS 24 excess" and "MIPS 70 excess". Pass `Av` through `toPhysicsParams` (already done in Task 3).
- [ ] **Step 4: CSS:** define `--band-2mass`, `--band-allwise`, `--band-irac`, `--band-mips` (translucent, distinct, readable in light and dark). Make the colour resolver map `var:band-irac` to `--band-irac` (check how `resolveColors`' lookup builds names and extend it if it only handles single words).
- [ ] **Step 5: README:** update the simple-mode list (6 sliders and the two checkboxes), the band list (the 14 bands only), and the challenge list. Drop all Herschel/ALMA/submm wording.
- [ ] **Step 6: Run** `npm test` and `grep -rniE "PACS|SPIRE|SCUBA|ALMA|Herschel" js tests README.md index.html`. Expected: tests green and no grep hits.
- [ ] **Step 7: Browser pass (needs the user if a browser can't be launched).** Run `python -m http.server 8080` and open `http://localhost:8080`. Expected:
  - The default view shows 14 coloured band strips, with labels that don't overlap.
  - Dragging d to 3000 pc with the link on raises A_V to 3, and the unreddened star curve appears above the blue side.
  - Unlinking keeps A_V. Dragging A_V to 10 crushes the optical while IRAC/MIPS barely move.
  - With hold off, dragging the belt distance outward moves the bump right and down. With hold on, it moves right only and the mass slider climbs.
  - 1 M⊕ at 0.1 AU shows the capped-f warning.
  - The old link `#f1=2e-5&r1i=80&r1o=80&bd=1` opens in simple mode with the same bump.
  - Challenges 1–5 run, the reddened star is solvable by hand, and the checkboxes are locked during challenges.
  - Also re-run the never-executed v1 manual checks (archived plan, Tasks 6–11 "NOT RUN" steps): 375 px layout, dark mode, presets, upload, export, a clean console.
- [ ] **Step 8: Commit** `feat: wire survey bands, extinction and disk mass into the page`.
