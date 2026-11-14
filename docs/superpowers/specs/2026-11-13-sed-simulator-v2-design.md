# SED Simulator v2: survey bands, ISM extinction, disk mass (Design)

Date: 2026-11-13
Status: Draft, from the user's answers on 2026-11-13
Amends: `2026-11-13-sed-simulator-design.md` (v1). Everything in v1 still
holds unless this document changes it.

## Why

Notes from a meeting with the astronomy professor, which the slider options
must reflect:

> reddening/extinction from ISM; translates essentially to distance to star - kinda
> stellar temperature
> change disk mass (which changes how bright it is) and disk proximity/radius
> from the star (what wavelengths it emits - left/right motion)

The user also asked for a larger focus on the **2MASS, AllWISE, Spitzer IRAC
and Spitzer MIPS** bands, and for Herschel, JCMT and ALMA to be removed.

## Changes to v1

### 1. Telescope bands

- The band list is exactly these 14 bands. Herschel PACS/SPIRE, JCMT SCUBA-2
  and ALMA are **removed** from the code, plot and challenges.

  | Group | Band id | λ (µm) | Width (µm) |
  |---|---|---|---|
  | 2MASS | 2MASS J, 2MASS H, 2MASS Ks | 1.235, 1.662, 2.159 | 0.162, 0.251, 0.262 |
  | AllWISE | WISE W1, W2, W3, W4 | 3.353, 4.603, 11.56, 22.08 | 0.663, 1.042, 5.506, 4.101 |
  | IRAC | IRAC 3.6, 4.5, 5.8, 8.0 | 3.550, 4.493, 5.731, 7.872 | 0.750, 1.015, 1.425, 2.905 |
  | MIPS | MIPS 24, 70, 160 | 23.68, 71.42, 155.9 | 5.3, 19.0, 35.0 |

  Values are approximate. **The builder checks each against the cited source**
  (2MASS: Cohen et al. 2003, AJ 126, 1090; WISE: Wright et al. 2010, AJ 140,
  1868 and Jarrett et al. 2011; IRAC and MIPS: the Spitzer instrument
  handbooks) and puts the citation in `js/bands.js`, as the presets do.
- Bands are **on by default and can be toggled in simple mode** (they are no
  longer an Advanced-only setting). Going back to simple mode no longer turns
  them off, and a share link with bands on no longer opens Advanced mode.
- Each band is drawn as a shaded strip of its real width (λ ± width/2), in
  one colour per group (four theme tokens that work in light and dark). Label
  rows are staggered by group so that W1/IRAC 3.6, W2/IRAC 4.5 and W4/MIPS 24
  do not overlap.
- The readout excess ratios use MIPS 24 (23.68 µm) and MIPS 70 (71.42 µm).

### 2. Interstellar extinction (reverses the v1 non-goal)

- New simple-mode control **"Dimming by interstellar dust", A_V (mag)**,
  range 0–10, linear.
- A checkbox **"Set from distance (about 1 mag per kpc)"**, on by default.
  When it is on, A_V = 1.0 mag kpc⁻¹ × d and the A_V slider is disabled but
  shows the value. When it is off, A_V is free, starting from its current
  value with no jump. A hint says that the rate is a rough average for the
  Galactic plane, that real sightlines vary widely, and that stars within
  about 100 pc (the Local Bubble) have almost none.
- The **distance range widens to 1–3000 pc** so that the link visibly
  matters (up to 3 mag).
- Extinction applies to all observed light (star and dust):
  `F_obs(λ) = F_int(λ) · 10^(−0.4 A_λ)`.
- Extinction law, `A_λ/A_V`:
  - 0.1 ≤ λ ≤ 2.159 µm: Cardelli, Clayton & Mathis 1989 (ApJ 345, 245),
    R_V = 3.1, all of its sub-ranges (IR, optical, UV, far-UV).
  - λ < 0.1 µm: hold the 0.1 µm value.
  - 2.159 < λ ≤ 8 µm: Indebetouw et al. 2005 (ApJ 619, 931),
    `log(A_λ/A_Ks) = 0.61 − 2.22 log λ + 1.21 (log λ)²`, times
    A_Ks/A_V from CCM at 2.159 µm. This gives the flat IRAC extinction that
    makes the mid-IR "see through" dust.
  - 8 < λ ≤ 24 µm: hold the 8 µm value. The 9.7 µm silicate feature is
    omitted, and a code comment says so.
  - λ > 24 µm: the 24 µm value × (24/λ)².
- The plot adds a faint "Star (no extinction)" curve whenever A_V > 0.
- Readouts: A_V, E(B−V) = A_V/3.1, and A_Ks.
- Equations panel: the extinction equation with the current A_V and A_Ks.

### 3. Disk mass replaces f as the brightness control

- The simple-mode "How bright the dust is" slider (f) becomes **"How much
  dust", M_dust (Earth masses)**, range 10⁻⁸–1 M⊕, log, default 2.5×10⁻⁴ M⊕.
  At the default 40 AU around the Sun this reproduces v1's default f ≈ 10⁻⁴.
  Belt 2's controls change the same way (default 8×10⁻⁷ M⊕).
- Physics (optically thin, single grain size): grains of radius a and density
  ρ have a total cross-section of 3M/(4ρa). A belt at r intercepts
  σ/(4πr²) of the starlight, so
  `f = 3M / (16π ρ a r_in r_out)`
  (for an extended belt with Σ ∝ r⁻¹ the r⁻² weighting integrates to
  1/(r_in r_out), which keeps v1's annulus shares unchanged; a ring has
  r_in = r_out). Constants: a = 10 µm, ρ = 2.5 g cm⁻³, M⊕ = 5.972×10²⁷ g,
  giving `f ≈ 637 · (M/M⊕) / (r_in r_out / AU²)`. The label says "mass in
  small (~10 µm) grains", and the equations panel shows a and ρ.
- f is capped at 0.1 (an optically thin model is meaningless beyond that).
  The readout warns when f ≥ 0.01 ("brighter than any known debris disk; this
  model assumes optically thin dust") and says so when the cap is hit.
- Readouts: each belt's mass in M⊕ and in lunar masses (1 M☾ = 0.0123 M⊕), and
  its resulting f.
- **Hold-brightness toggle** (simple-mode checkbox, off by default): "Keep the
  dust's brightness fixed when I move it". Off is physical: moving the belt
  out at fixed mass makes it redder *and* fainter. On: changing a belt's radii
  rescales its mass by (r_in′ r_out′)/(r_in r_out) so f stays the same, and the
  bump moves only left/right (the professor's picture). The mass slider moves
  with it, which shows how much more dust a distant belt needs. The mass is
  clamped to its range, so at the range edges f can still change.
- Challenges switch hold-brightness off and lock the checkbox.

### 4. Simple-mode controls (replaces v1's table)

| Control | Range | Scale | Default |
|---|---|---|---|
| Star temperature T★ | 2,500 – 40,000 K | log | 5,772 K |
| Star radius R★ | 0.1 – 20 R☉ | log | 1 R☉ |
| Distance d | 1 – 3000 pc | log | 10 pc |
| Interstellar dimming A_V | 0 – 10 mag | linear | linked: 0.01 mag |
| ↳ Set from distance | checkbox | | on |
| Belt distance r | 0.1 – 1000 AU | log | 40 AU |
| Dust mass M_dust | 10⁻⁸ – 1 M⊕ | log | 2.5×10⁻⁴ M⊕ |
| ↳ Keep brightness fixed when moving | checkbox | | off |
| Show telescope bands | checkbox | | on |

This is six sliders instead of five. That fits the v1 anti-goal because both
new sliders were asked for by the professor.

### 5. Share links

New keys: `av` (A_V), `al` (linked 0/1), `hb` (hold brightness 0/1), `m1`/`m2`
(belt masses). **Old links with `f1`/`f2` still work**: each f is converted
to the mass that gives the same f at that belt's radii (an `m` key wins if
both are present). `bd` defaults to on.

### 6. Free-parameter count (χ² dof)

T, R, d, plus A_V when it is not linked, plus for each belt that is on:
mass, its radii (1 or 2), and λ₀ and β when β ≠ 0.

### 7. Presets

The preset data stays as (T_d, f). `applyPreset` converts f to mass at the
belt's radius. All presets use linked extinction (all are within 41 pc).

### 8. Challenges (replaces v1's list)

Synthetic photometry uses the 14 bands above (7% noise, as before).

1. **Bare star** (unchanged).
2. **Reddened star** (new, simple): R★ and d are given and the extinction link
   is off. Find T★ and A_V. Hidden: T 4000–9000 K, R 0.8–2.5 R☉, d 50 pc,
   A_V 1–5 mag. The prompt hints that IRAC/MIPS barely feel the dust, so they
   pin the temperature first.
3. **Find the dust**: belt distance and mass. Hidden r is 5–100 AU (it was
   5–200; beyond about 100 AU only MIPS 160 sees the dust).
4. **Star and dust**: T, R, belt distance and mass (d fixed at 10 pc).
5. **Two belts** (Advanced): both belts' distance and mass, with fixed values
   that give f ≈ 3×10⁻⁴ at 8 AU and 1.5×10⁻⁴ at 90 AU.

The v1 "submillimetre slope" challenge is **removed**, because without submm
bands β cannot be identified. λ₀ and β stay in the Advanced panel.

### 9. Non-goals changes

- Interstellar extinction is **no longer a non-goal**.
- Still non-goals: grain size distributions (one grain size), optically thick
  disks, the silicate feature, band-integrated (filter-curve) photometry
  (bands are sampled at their central wavelength), and magnitude-based upload.
