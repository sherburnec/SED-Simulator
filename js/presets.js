// Real-system presets. Pure data plus a small builder; no DOM.
//
// Belt radii are NOT the imaged radii: each belt is placed where blackbody
// grains would have the observed dust temperature (r = (278.3/T_d)^2 sqrt(L)).
// Real small grains run hotter than blackbodies, so imaged belts sit farther out.
//
// Provenance: `citations` says where each value was seen. Most were read
// second-hand from web search results and the primary papers were NOT opened.
// `unverified` lists values that are still the project's approximate figures and
// were not confirmed in a primary source; check them before classroom use.
import { luminosity } from './physics.js';
import { defaultState, normalizeState, hasAdvancedPhysics } from './model.js';

const radiusForTemp = (L, Td) => Number((((278.3 / Td) ** 2) * Math.sqrt(L)).toPrecision(4));

// Each belt: { Td: target blackbody dust temperature (K), f: L_dust/L_star }.
const DEFS = [
  {
    id: 'sun', name: 'Sun (no disk)',
    star: { T: 5772, R: 1, d: 10 }, belts: [],
    description: 'A G2 star seen from 10 pc, with no dust belt. Notice that the whole SED is a single blackbody peaking in the visible. The Sun does have a Kuiper-belt dust disk, but it is far fainter than this simulator can show.',
    citations: ['Solar effective temperature and radius: IAU 2015 nominal values (5772 K, 1 R☉).'],
    unverified: [],
  },
  {
    id: 'vega', name: 'Vega',
    star: { T: 9600, R: 2.36, d: 7.7 }, belts: [{ Td: 50, f: 2e-5 }],
    description: 'A bright A0 star with a cold dust belt. The infrared excess starts around 30 µm and the dust outshines the star by 70 µm. Earlier IRAS fits gave a warmer single temperature of about 85 K, so the dust temperature here is a modelling choice.',
    citations: [
      'Su et al. 2005, ApJ 628, 487, Spitzer imaging of the Vega debris disk (https://w.astro.berkeley.edu/~kalas/disksite/library/su05a.pdf), listed for context only: no preset value was taken from it and the paper was not opened.',
      'Distance of about 7.7 pc and IRAS single-blackbody fit (about 85 K, f about 2.5e-5) as summarised in web search results; primary source not opened.',
    ],
    unverified: ['T★', 'R★ (a polar radius of about 2.36 R☉ from memory, giving L of about 43 L☉; Vega is a rapid rotator)', 'dust temperature 50 K', 'f'],
  },
  {
    id: 'fomalhaut', name: 'Fomalhaut',
    star: { T: 8590, R: 1.84, d: 7.7 }, belts: [{ Td: 50, f: 8e-5 }],
    description: 'An A3 star with a famous narrow dust ring. The stellar peak sits in the blue and the dust adds a bump in the far infrared. Compare how much more slowly the dust curve rises and falls than the stellar one.',
    citations: [
      'Stellar Teff 8590 K and R 1.842 R☉ (2009 re-derivation) and distance 7.70 pc, as quoted in a Wikipedia summary of the star (https://en.wikipedia.org/wiki/Fomalhaut); primary papers not opened.',
    ],
    unverified: ['dust temperature 50 K', 'f', 'primary sources for the stellar parameters'],
  },
  {
    id: 'beta-pic', name: 'β Pictoris',
    star: { T: 8050, R: 1.53, d: 19.4 }, belts: [{ Td: 100, f: 2e-3 }],
    description: 'A young A6 star with one of the brightest debris disks known, so the infrared excess is huge compared with most systems. The dust peaks in the mid-infrared where it can outshine the star. Published single-temperature fits range from about 90 K to 220 K depending on the wavelengths used.',
    citations: [
      'Distance about 19.44 pc, Teff about 8050 K and R about 1.53 R☉ as quoted in a Wikipedia summary of the star (https://en.wikipedia.org/wiki/Beta_Pictoris).',
      'Fractional luminosity about 0.0019 to 0.003 and dust temperatures of 89 K (submillimetre fit, https://arxiv.org/pdf/0910.2738) to 103 K (Gillett 1986) as quoted in web search results.',
    ],
    unverified: ['primary sources for stellar parameters', 'adopted dust temperature 100 K'],
  },
  {
    id: 'eps-eri', name: 'ε Eridani',
    star: { T: 5084, R: 0.74, d: 3.2 }, belts: [{ Td: 40, f: 3e-5 }],
    description: 'A nearby young K star, much cooler than the Sun, so its photosphere peaks in the near infrared. Its cold dust belt is faint compared with the star and shows up mainly beyond 70 µm. The adopted fractional luminosity is the smaller value reported in the literature.',
    citations: [
      'Backman et al. 2009, ApJ 690, 1522, "Epsilon Eridani\'s Planetary Debris Disk" (https://arxiv.org/abs/0810.4564): distance 3.22 pc and a multi-belt model, as quoted in web search results; paper not opened.',
      'Teff 5084 K and fractional luminosity about 3e-5 (4e-5 in some fits), as quoted in web search results from the table in https://arxiv.org/pdf/1810.04194, which cites Greaves et al. 2014 and Backman et al. 2009; not opened.',
    ],
    unverified: ['R★', 'f (taken from a secondary table; the project spec said 1e-4)', 'dust temperature 40 K (the model has several belts; this is the cold one)'],
  },
  {
    id: 'hr8799', name: 'HR 8799',
    star: { T: 7430, R: 1.44, d: 41 }, belts: [{ Td: 150, f: 4e-5 }, { Td: 45, f: 1.6e-4 }],
    description: 'An A-type star with directly imaged planets and two dust belts, a warm one inside the planets and a cold one outside them. The warm and cold belts give two separate infrared bumps that blend into a broad excess. This preset uses the second belt, so it opens in Advanced mode.',
    citations: [
      'Su et al. 2009, ApJ 705, 314, "The Debris Disk Around HR 8799" (https://arxiv.org/abs/0909.2687): warm component about 150 K and cold component about 45 K, as quoted in web search results; paper not opened.',
      'Matthews et al. 2014, Herschel resolved imaging (https://arxiv.org/abs/1311.2977): fits of 153 K (warm) and 36 K (cold), as quoted in web search results; paper not opened.',
    ],
    unverified: ['T★', 'R★', 'distance', 'how f is split between the two belts (total about 2e-4)'],
  },
];

export const PRESETS = DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  description: def.description,
  citations: def.citations,
  unverified: def.unverified,
  targetDustTemps: def.belts.map((b) => b.Td),
  def,
}));

// Full, normalised state for a preset. Opens in Advanced mode only if the
// preset uses features simple mode cannot show.
export function applyPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown preset: ${id}`);
  const { star, belts } = p.def;
  const base = defaultState();
  const L = luminosity(star.T, star.R);
  const beltState = (b, fallback) => {
    if (!b) return { ...fallback, on: false };
    const r = radiusForTemp(L, b.Td);
    return { on: true, rIn: r, rOut: r, f: b.f, lambda0: 100, beta: 0 };
  };
  const state = normalizeState({
    ...base,
    star,
    belt1: beltState(belts[0], base.belt1),
    belt2: beltState(belts[1], base.belt2),
  });
  state.mode = hasAdvancedPhysics(state) ? 'advanced' : 'simple';
  return state;
}
