# SED Simulator — Design

Date: 2026-11-13
Status: Approved 2026-11-13

## Intent

A web page, hosted on GitHub Pages, where astronomy students build the
spectral energy distribution (SED) of a star with a debris disk and watch
how each physical parameter changes it. Students drag sliders and see the
curve update immediately. The aim is to build intuition about:

- how stellar temperature, size and distance shape a photosphere's SED
- why a debris disk shows up as an infrared excess, and where
- how dust temperature follows from the star's luminosity and the dust's distance
- why real disks fall off steeply in the submillimetre (grain emissivity)
- which telescopes and wavelengths detect which kinds of dust

**Audience:** astronomy majors (comfortable with blackbodies and log units,
starting to work with real photometry). A **simple mode** keeps the page
usable for students meeting this material for the first time.

## Goals

1. Instant redraw (well under 100 ms) as sliders move, on ordinary lab
   computers.
2. Physics that is correct and easy to check: isolated in one module,
   commented with the equations it implements, and covered by tests
   against known values.
3. Two layers: a simple mode with 5 controls, and an Advanced panel with
   the rest.
4. Real-system presets and "mystery SED" challenges for structured lessons.
5. Students can overlay their own photometry and see how well the model
   fits.
6. Static site with no server and no build step; it deploys by pushing to
   `main`.

## Non-goals

- Real stellar atmosphere models (Kurucz/PHOENIX); stars are blackbodies.
  These can be added later.
- Interstellar extinction.
- Realistic grain optics, size distributions, or radiative transfer. Grains
  are blackbodies or modified blackbodies.
- Protoplanetary (gas-rich) disks, scattered light, or images of disks.
- **Automatic fitting / optimisation.** Students fit by hand; an "auto-fit"
  button would remove the point of the exercise.
- Accounts, saved progress, grading backend.

## Anti-goals (would count as failure even if it "works")

- Sliders that lag or stutter.
- Physics a TA cannot verify against a textbook.
- A simple mode that overwhelms a first-course student with controls,
  units, or jargon.
- Hidden advanced settings silently changing what simple mode shows.

## Constraints

- GitHub Pages, served from the repository root on `main`.
- Plain HTML/CSS/JavaScript (ES modules), no bundler, no Node required to
  run the site.
- Third-party libraries loaded from a CDN at exact pinned versions:
  - Plotly.js (e.g. `plotly.js-dist-min@2.35.2` from jsDelivr) for plotting
  - KaTeX (e.g. `katex@0.16.11`) for rendering the live equations
- Works in current Chrome, Firefox, Safari, Edge. Phone layout should be
  usable (controls stack under the plot), but desktop is the primary
  target.

## Approaches considered

| Approach | Trade-off | Outcome |
|---|---|---|
| **1. Plain JS + Plotly.js** | No build step, instant updates, physics in ~100 readable lines. Code is JS rather than the Python astronomers usually know. | **Chosen** |
| 2. PyScript/Pyodide + astropy | Physics readable as Python with astropy units. 10–30 s first load, tens of MB, slower slider response, fragile on lab machines. | Rejected: breaks instant redraw |
| 3. React + Vite + Actions deploy | Good structure for a large app. Adds a Node toolchain and build step for little gain. | Rejected: maintenance cost for a hand-off project |

The user chose approach 1.

## Physics model

All internal computation in cgs. Wavelength grid: 500 points,
log-spaced from 0.05 µm to 3000 µm (the lower edge keeps the F_λ peak of a
40,000 K star, 0.072 µm, on the plot). *(Designer's call.)*

### Star

- Planck function: `B_λ(T) = (2hc²/λ⁵) / (exp(hc/λkT) − 1)`
- Observed flux: `F_λ,★ = π B_λ(T★) (R★/d)²`
- Luminosity (readout): `L★ = 4π R★² σ T★⁴`
- Wien peak (readout): `λ_peak = 2898 µm·K / T★`

### Dust belt

Each belt is a ring of grains at radius `r` (simple mode) or spread over
`r_in`–`r_out` (Advanced).

- Grain temperature (blackbody grains in radiative equilibrium):
  `T_d = 278.3 K · (L★/L☉)^¼ · (r / 1 AU)^−½`
- Emissivity: `Q(λ) = 1` for `λ ≤ λ₀`, `(λ₀/λ)^β` for `λ > λ₀`.
  Simple mode uses β = 0 (pure blackbody).
- Normalisation by fractional luminosity `f = L_dust / L★`: the belt's
  spectrum is scaled so its integral equals `f · L★ / (4π d²)`:
  `F_λ,dust = [f L★ / (4π d²)] · Q(λ) B_λ(T_d) / ∫ Q(λ) B_λ(T_d) dλ`
  (the integral is evaluated numerically on a fine grid that extends past
  the plot range so normalisation is not truncated).
- Extended belt (Advanced): split `r_in`–`r_out` into 30 annuli, log-spaced.
  Cross-sectional area per unit radius is constant (surface density
  Σ ∝ r⁻¹), so each annulus gets a share of `f` proportional to its
  width. Each annulus has its own `T_d(r)`. *(Builder-facing call made by
  the designer: a fixed profile keeps the control count down. A slider for
  the power-law index is a possible later addition.)*

Total: `F_λ = F_λ,★ + Σ belts F_λ,dust`.

**Teaching note shown in the UI:** blackbody grains are cooler than real
small grains, so the radius implied by a fitted dust temperature is usually
2–4× smaller than the radius seen in images. Presets choose `r` to match
the *observed dust temperature*, not the imaged radius, and say so.

## Controls

Each slider is paired with a numeric input box (type an exact value or
drag). Sliders for quantities spanning decades use a log scale.

### Simple mode (default)

| Control | Range | Scale | Default |
|---|---|---|---|
| Star temperature T★ | 2,500 – 40,000 K | log | 5,772 K |
| Star radius R★ | 0.1 – 20 R☉ | log | 1 R☉ |
| Distance d | 1 – 500 pc | log | 10 pc |
| Belt distance r | 0.1 – 1000 AU | log | 40 AU |
| Belt brightness f = L_dust/L★ | 10⁻⁶ – 10⁻² | log | 10⁻⁴ |

Simple mode labels use plain words ("Star temperature", "How far the dust
is from the star", "How bright the dust is") with the symbol in smaller
text.

### Advanced panel (collapsed by default)

- Belt 1: `r_in`, `r_out` (replaces the single `r`), λ₀ (10–1000 µm, log,
  default 100 µm), β (0–2, linear, default 0)
- Belt 2: on/off toggle, plus its own `r_in`, `r_out`, `f`, λ₀, β
- Flux units: λF_λ (erg s⁻¹ cm⁻², default), F_ν (Jy), F_λ (erg s⁻¹ cm⁻² µm⁻¹)
- Telescope band overlays (on/off)
- Data upload (below)

**Switching back to simple mode** resets Advanced-only *physics*
parameters to simple defaults (single narrow belt, β = 0, belt 2 off),
after a one-line confirmation if they differ from defaults. Display
settings behave differently: the flux unit returns to λF_λ and band
overlays turn off, but **uploaded data is kept in memory and only hidden**.
It reappears when the student returns to Advanced, so nobody loses a file.
Simple mode is never affected by hidden settings. A shared link or preset
that contains Advanced settings opens in Advanced mode. *(Designer's call,
prompted by builder review.)*

## Plot

- Log–log axes: wavelength (µm) on x, chosen flux unit on y. The y range
  auto-fits to the total curve's peak, about 6 decades down; the user can
  zoom with Plotly's controls.
- Curves: star (dashed), each belt (dotted), total (solid, thicker). A
  legend click toggles each one.
- Marker at the peak of the **stellar curve as currently displayed**,
  found numerically on the grid (λF_λ peaks near 3670/T µm, F_ν near
  5100/T µm, F_λ at 2898/T µm). The readouts panel shows Wien's
  `λ_peak = 2898/T` with a short note explaining why the visible peak
  moves when the unit changes. That difference is itself a teaching
  point. *(Designer's call, prompted by builder review.)*
- Hover shows wavelength and the flux of each component.
- Telescope bands (Advanced, toggleable) as light shaded vertical strips
  with labels:
  - 2MASS J, H, Ks (1.25, 1.65, 2.17 µm)
  - WISE W1–W4 (3.4, 4.6, 12, 22 µm)
  - Spitzer MIPS 24, 70, 160 µm
  - Herschel PACS 70, 100, 160 µm; SPIRE 250, 350, 500 µm
  - JCMT SCUBA-2 850 µm; ALMA Band 7 (~870 µm), Band 6 (~1.3 mm)
- Export: PNG (Plotly's built-in) and CSV of the model (wavelength, star,
  belt 1, belt 2, total in the current unit).

## Readouts panel

Live values: L★ (L☉), λ_peak, each belt's T_d (range for extended belts),
f, and the **excess ratio** `F_total / F_★` at 24 µm and 70 µm. When data
is loaded, also show reduced χ².

## Live equations panel

A collapsible panel shows the key equations rendered with KaTeX, with the
current numbers filled in, updating as sliders move. For example:
`T_d = 278 K · (0.93)^¼ · (40)^−½ = 43 K`. It links each equation to the
slider that changes it (hovering highlights the slider).

## Presets

A dropdown that sets all parameters. Values are approximate literature
values. **The builder must verify each against a cited source and record
the citation in `js/presets.js`.**

| Preset | T★ (K) | R★ (R☉) | d (pc) | Belts (T_d target, f) |
|---|---|---|---|---|
| Sun (no disk) | 5772 | 1.0 | 10 | none |
| Vega | ~9600 | ~2.7 | 7.7 | cold, ~50 K, f ~2×10⁻⁵ |
| Fomalhaut | ~8600 | ~1.8 | 7.7 | cold, ~50 K, f ~8×10⁻⁵ |
| β Pictoris | ~8000 | ~1.5 | 19.4 | ~100 K, f ~2×10⁻³ |
| ε Eridani | ~5100 | ~0.74 | 3.2 | cold, ~40 K, f ~1×10⁻⁴ |
| HR 8799 | ~7400 | ~1.4 | 41 | warm ~150 K + cold ~45 K, f total ~2×10⁻⁴ (uses belt 2) |

Each preset shows a 2–3 sentence description (what is special about it,
what to look for in the SED). Presets that use two belts or β ≠ 0 switch
the page to Advanced mode.

## Mystery SED challenges

A "Challenges" tab with a short, ordered set:

1. **Bare star:** find T★ and R★ (distance given).
2. **Find the dust:** star given; find belt distance and f.
3. **Star and dust:** find all five simple-mode parameters.
4. **Two belts** (Advanced): find both belts.
5. **Submillimetre slope** (Advanced): find β from long-wavelength points.

Each challenge has a hidden parameter set. It shows synthetic photometry
at the standard band wavelengths with 5–10% Gaussian noise and error bars,
but no curve. The student adjusts sliders and sees live reduced χ². A
"Reveal" button overlays the true model and lists the true values next to
the student's. Challenge 1–3 hidden parameters are randomised within
sensible ranges each time ("New mystery" button); 4–5 use fixed curated
values so they always teach the intended feature.

## Data upload (Advanced)

- Accepts CSV with columns `wavelength_um, flux, flux_err` (header row
  required; `flux_err` optional) and a dropdown selecting the flux unit
  (Jy, erg s⁻¹ cm⁻² µm⁻¹, or λF_λ in erg s⁻¹ cm⁻²).
- Points are plotted with error bars and converted when the display unit
  changes.
- Reduced χ² against the total model, computed at each data wavelength by
  interpolating the model in log–log space.
- If `flux_err` is missing for a point, assume a 10% fractional error and
  say so next to the χ² readout ("assuming 10% errors on N points").
- Degrees of freedom = number of data points − number of free parameters.
  In a challenge, the free parameters are the ones that challenge asks for
  (e.g. 2 in Challenge 1). With uploaded data, it is the count of
  parameters active in the current mode (5 in simple; more with an
  extended belt, β/λ₀, or belt 2). If dof ≤ 0, show plain χ² and a note
  that more points are needed. *(Designer's call, prompted by builder
  review.)*
- Clear error messages for malformed files (which row, what is wrong).
- Data stays in the browser; nothing is uploaded anywhere.

## Shareable links

The full parameter state is encoded in the URL hash, so an instructor can
send a link that opens a specific configuration (e.g. "open this, then
make the disk 10× farther out"). Challenges do not encode their hidden
answers in the URL.

## Layout

```
┌───────────────────────────────────────────────────────────┐
│ SED Simulator      [Preset ▼] [Simple|Advanced] [Challenges]│
├──────────────────────────────────────┬────────────────────┤
│                                      │ Star               │
│          log λF_λ vs log λ           │  Temperature ──●── │
│        (star, belt(s), total,        │  Radius      ─●─── │
│         bands, data points)          │  Distance    ──●── │
│                                      │ Dust belt          │
│                                      │  Distance    ───●─ │
├──────────────────────────────────────┤  Brightness  ─●─── │
│ Readouts: L★  λpeak  T_d  f  excess │ ▸ Advanced         │
│ ▸ Equations (live)                   │                    │
└──────────────────────────────────────┴────────────────────┘
```

On narrow screens the controls stack under the plot.

## File structure (proposed)

```
index.html
css/style.css
js/physics.js     — pure functions: planck, stellar flux, dust temperature,
                    modified blackbody, belt spectra, unit conversions, χ²
js/model.js       — parameter state, defaults, simple/advanced reset rules,
                    URL hash encode/decode
js/plot.js        — Plotly figure construction and updates
js/ui.js          — sliders, inputs, panels, wiring
js/presets.js     — preset data with citations
js/challenges.js  — challenge definitions, synthetic data generation
js/dataio.js      — CSV parsing, model CSV export
tests/physics.test.mjs — run with `node --test` (no dependencies)
README.md         — what it is, how to run locally, how to deploy
```

`physics.js` has no DOM or Plotly dependencies so it can be tested in Node
and read alongside a textbook.

## Verification

Unit tests in `tests/` (Node's built-in test runner, no packages):

- Sun (5772 K, 1 R☉) gives L★ = 1.00 L☉ to within 0.5%.
- Peak of the computed stellar curve matches 2898/T µm (F_λ),
  ~3670/T µm (λF_λ) and ~5100/T µm (F_ν) to within the grid resolution,
  and stays on the grid at 40,000 K.
- ∫ F_λ,dust dλ = f · L★ / (4πd²) to within 1% for β = 0 and β = 2.
- T_d = 278 K at 1 AU around a 1 L☉ star.
- Unit conversions round-trip (Jy ↔ F_λ ↔ λF_λ).
- χ² is 0 for data generated exactly from the model.

Manual check: the page redraws without visible lag while a slider is
dragged quickly with two extended belts and data loaded.

## Left to the builder

- Visual styling, colours (must work in light and dark), fonts.
- Exact wording of tooltips and preset descriptions (accurate, plain,
  aimed at majors, with simpler wording in simple mode).
- Slider step sizes, debounce or requestAnimationFrame strategy.
- Exact Plotly configuration and how bands are drawn.
- Exact randomisation ranges for challenges 1–3.
- Sourcing and citing preset values.
