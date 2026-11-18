# Class-style SED plot as the default view (Design)

Date: 2026-11-18
Status: Draft for approval
Size: small-to-medium change (plot layer, one state key, one point flag)

## Why
The professor's class uses a specific SED figure (see the reference image of
SSTSL2 J000153.93-303904.2). Students should see that look by default so what
they make here matches what they make in class. The current look stays as an
alternative, now named **Modern**.

## Goals
- New default view, **Class**, imitating the reference:
  - Boxed axes, no grid, no band shading, no horizontal legend.
  - Title = object name (preset or challenge name, else "SED model"); subtitle
    under it: "No Dust", "1 Dust Belt" or "2 Dust Belts".
  - One solid grey model curve (the total). With belts on, the star alone is a
    faint dashed line so the excess is still visible.
  - Log-log, x = λ (µm), y = F_ν (Jy) by default; x about 0.5 to 100 µm.
  - Photometry as dots with error bars, coloured by survey: 2MASS, IRAC, MIPS,
    AllWISE (the existing `--bandtext-*` tokens, so light and dark both work).
  - **Do Not Fit** points are black and are excluded from the fit and from χ².
  - Legend box inside the axes, top-left of the data: line swatch with
    "T★ = … K", "T_eff = … K", "Reduced χ²: …" (only when enough points), then
    one entry per survey present, then "Do Not Fit" if any.
- **Modern** view = today's figure, unchanged.
- A Class/Modern toggle in the Display panel; the choice is in the URL hash.

## Non-goals / anti-goals
- No new colour palette; no matplotlib-style fonts.
- Do not change Modern's behaviour or its tests.
- Do not break shared links: a hash without the new key opens in Class.

## Approaches considered
1. **Second recipe in figure.js** (`buildClassFigure`), picked by `state.view`;
   shares colour resolution and data conversion. *Chosen.*
2. Restyle the one figure with many conditionals. Rejected: tangles both looks.
3. Render the class plot with a separate chart library. Rejected: second
   dependency, inconsistent theming.

## Design
- `state.view`: `'class' | 'modern'`, default `'class'`; `normalizeState`,
  `encodeHash`, `decodeHash` carry it. Class default sets `unit` to `Fnu` for
  new sessions; the existing unit selector still overrides. Modern keeps
  `lamFlam` when chosen (switching view does not rewrite an explicit unit).
- Point shape gains `fit: boolean` (default true). Survey = nearest band in
  `bands.js` whose range contains the point (±width/2, with a small tolerance);
  no match = grouped as "Other", drawn in the muted token.
- `chi2` input filters `fit === false` points; the readouts say how many
  points are excluded.
- T_eff: the effective temperature of the plotted star
  `(L / 4πR²σ)^¼`; with belts on it is still the star's, not the total's.
  (Equals T★ in the simple model; shown as in the reference.)
- Data panel: a small table of loaded points with a "Fit" checkbox each.
  CSV import accepts an optional fourth column `fit` (0/1, default 1);
  challenges are generated with all points fit.

## My calls (please check)
- Default unit becomes F_ν only in Class; Modern remains λF_λ.
- "Other" bucket for points matching no survey.
- Band shading stays available via the existing checkbox, default off in Class.
- Object name for uploads = file name without extension.

## Left to the builder
Exact legend positioning, marker sizes, tolerance for survey matching,
test fixtures. Tests: `figure.test.js` (trace names/colours/legend text for
both views), `model.test.js` (hash round trip, backward-compatible hash),
`dataio.test.js` (fit column), `physics.chi2.test.js` (excluded points).
