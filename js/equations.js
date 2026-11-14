// TeX for the live equations panel, with the current numbers substituted.
// Pure: returns strings; ui.js renders them with KaTeX.
import { CONST, luminosity, dustTemp, beltTempRange } from './physics.js';

// 3 significant figures; scientific notation for very small or large numbers.
function sig3(v) {
  if (v !== 0 && (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2)) {
    const [m, e] = v.toExponential(2).split('e');
    return String.raw`${m}\times10^{${Number(e)}}`;
  }
  return v.toPrecision(3);
}

// Returns [{ id, tex, controls }] where controls are the slider ids (the
// ones visible in the current mode) that change the equation.
export function equations(state) {
  const { T, R, d } = state.star;
  const advanced = state.mode === 'advanced';
  const L = luminosity(T, R);
  const out = [];

  out.push({
    id: 'luminosity',
    tex: String.raw`L_\star = 4\pi R_\star^2\,\sigma T_\star^4 = 4\pi\,(${sig3(R)}\,R_\odot)^2\,\sigma\,(${sig3(T)}\,\mathrm{K})^4 = ${sig3(L)}\,L_\odot`,
    controls: ['T', 'R'],
  });

  out.push({
    id: 'wien',
    tex: String.raw`\lambda_{\rm peak} = \frac{2898\,\mu\mathrm{m\,K}}{T_\star} = \frac{2898}{${sig3(T)}} = ${sig3(2898 / T)}\,\mu\mathrm{m}`,
    controls: ['T'],
  });

  out.push({
    id: 'starFlux',
    tex: String.raw`F_\lambda = \pi B_\lambda(T_\star)\left(\frac{R_\star}{d}\right)^2,\quad \frac{R_\star}{d} = \frac{${sig3(R)}\,R_\odot}{${sig3(d)}\,\mathrm{pc}} = ${sig3((R * CONST.Rsun) / (d * CONST.pc))}`,
    controls: ['T', 'R', 'd'],
  });

  const belts = [
    { n: 1, belt: state.belt1, id: 'dustTemp', ctl: advanced ? ['b1in', 'b1out'] : ['r'], f: 'f' },
    { n: 2, belt: state.belt2, id: 'dustTemp2', ctl: ['b2in', 'b2out'], f: 'b2f' },
  ];
  for (const { n, belt, id, ctl, f } of belts) {
    if (!belt.on) continue;
    const sub = n === 2 ? '_2' : '';
    const ring = belt.rIn === belt.rOut;
    let tex;
    if (ring) {
      tex = String.raw`T_{d${sub}} = 278.3\,\mathrm{K}\,(${sig3(L)})^{1/4}\,(${sig3(belt.rIn)})^{-1/2} = ${sig3(dustTemp(L, belt.rIn))}\,\mathrm{K}`;
    } else {
      const [lo, hi] = beltTempRange(L, belt);
      tex = String.raw`T_{d${sub}}(r) = 278.3\,\mathrm{K}\,(${sig3(L)})^{1/4}\,r^{-1/2}:\; ${sig3(belt.rIn)}\text{ to }${sig3(belt.rOut)}\,\mathrm{AU} \Rightarrow ${sig3(hi)}\,\mathrm{K}\text{ to }${sig3(lo)}\,\mathrm{K}`;
    }
    out.push({ id, tex, controls: ['T', 'R', ...ctl] });

    const total = (belt.f * L * CONST.Lsun) / (4 * Math.PI * (d * CONST.pc) ** 2);
    out.push({
      id: n === 1 ? 'beltNorm' : 'beltNorm2',
      tex: String.raw`\int F_{\lambda,\rm dust${sub}}\,d\lambda = \frac{f${sub}\,L_\star}{4\pi d^2} = \frac{${sig3(belt.f)}\cdot ${sig3(L)}\,L_\odot}{4\pi\,(${sig3(d)}\,\mathrm{pc})^2} = ${sig3(total)}\,\mathrm{erg\,s^{-1}\,cm^{-2}}`,
      controls: ['T', 'R', 'd', f],
    });
  }

  if (advanced) {
    for (const [n, belt, ids] of [[1, state.belt1, ['b1l0', 'b1beta']], [2, state.belt2, ['b2l0', 'b2beta']]]) {
      if (!belt.on) continue;
      const sub = n === 2 ? '_2' : '';
      out.push({
        id: n === 1 ? 'emissivity' : 'emissivity2',
        tex: String.raw`Q(\lambda) = \begin{cases}1 & \lambda\le\lambda_0\\ (\lambda_0/\lambda)^{\beta} & \lambda>\lambda_0\end{cases},\quad \lambda_{0${sub}} = ${sig3(belt.lambda0)}\,\mu\mathrm{m},\ \beta${sub} = ${sig3(belt.beta)}`,
        controls: ids,
      });
    }
  }

  return out;
}
