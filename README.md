# SED Simulator

An interactive page where astronomy students build the spectral energy
distribution (SED) of a star with a debris disk and watch how each physical
parameter changes it. It is a static site: it runs entirely in the browser,
needs no server and no build step, and nothing you load into it leaves your
computer.

**What it teaches:** how stellar temperature, size and distance shape a
photosphere's SED; why a debris disk shows up as an infrared excess and where;
how dust temperature follows from the star's luminosity and the dust's
distance; why real disks fall off steeply in the submillimetre; and which
telescopes can detect which dust.

## Using it

- **Simple mode** (default): five sliders for star temperature, star size,
  distance, how far the dust is, and how bright it is.
- **Advanced mode**: dust belt shape (inner and outer edge), grain emissivity
  (λ₀ and β), a second belt, flux units, telescope band overlays, upload of
  your own photometry, and CSV export of the model.
- **Presets**: Sun, Vega, Fomalhaut, β Pictoris, ε Eridani, HR 8799.
- **Challenges**: mystery SEDs to match by hand, with a live reduced χ² and a
  Reveal button.
- **Live equations**: the equations behind the curve with your current numbers.
- **Share links**: the address bar always holds the current settings, so you
  can send a link that opens a specific configuration. Challenges are not
  stored in links.

Photometry upload takes a CSV (comma, semicolon or tab separated) with the
columns `wavelength_um`, `flux` and optionally `flux_err`.

## Run it locally

Any static file server works, for example from this folder:

```
python -m http.server 8080
```

then open <http://localhost:8080>. Plotly.js and KaTeX load from jsDelivr, so
you need an internet connection.

## Tests

The physics, state, CSV, figure, equations, presets and challenge logic are
plain ES modules with no DOM dependency and are tested with Node's built-in
test runner (Node 22 or newer, no packages to install):

```
npm test
```

The page wiring in `js/ui.js` is not covered by unit tests and needs a manual
check in a browser.

## Where things are

| File | What it holds |
|---|---|
| `js/physics.js` | the physics: Planck function, stellar flux, dust temperature, belts, unit conversions, χ². Each function is commented with the equation it implements. |
| `js/model.js` | slider ranges, defaults, the simple/advanced rules, share-link encoding |
| `js/dataio.js` | reading your photometry, writing the model CSV |
| `js/figure.js`, `js/bands.js` | the Plotly figure and the telescope bands |
| `js/equations.js` | the live equations |
| `js/presets.js` | real systems, with the sources used and which values are unconfirmed |
| `js/challenges.js` | the mystery challenges |
| `js/ui.js` | the page wiring |

The design is in `docs/superpowers/specs/` and the build plan in
`docs/superpowers/plans/`.

## Publish on GitHub Pages

In the repository on GitHub: Settings → Pages → Build and deployment →
Deploy from a branch → `main`, folder `/ (root)`. The `.nojekyll` file makes
Pages serve the files as they are.

## Model limits

Stars are blackbodies (no atmosphere models, no extinction). Grains are
blackbodies or modified blackbodies, with no grain-size distribution and no
radiative transfer. A dust temperature fitted with blackbody grains puts the
belt closer to the star than it appears in images, because real small grains
run hotter than blackbodies. The presets place belts to match the observed
dust temperature, not the imaged radius. Some preset values are still
approximate and are flagged as unconfirmed in `js/presets.js`.
