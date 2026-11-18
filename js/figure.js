// Builds the Plotly figure ({ data, layout }) from a model and the app state.
// Pure: colours are theme tokens ('var:star' ...) that ui.js resolves with
// resolveColors() from the page's CSS custom properties.
import { convertArray, convertFlux, peakIndex } from './physics.js';
import { BANDS, BAND_GROUPS, surveyForLam } from './bands.js';

const Y_TITLES = {
  lamFlam: 'λF_λ (erg s⁻¹ cm⁻²)',
  Fnu: 'F_ν (Jy)',
  Flam: 'F_λ (erg s⁻¹ cm⁻² µm⁻¹)',
};

// Below this A_V (mag) the unreddened curve would be indistinguishable from the star.
const SHOW_INTRINSIC_AV = 0.05;

const ASSUMED_ERR_FRAC = 0.1; // matches chi2(): missing errors are drawn as 10%

// opts.title / opts.fit ({ reduced }) feed the class view's title and legend.
// model = totalModel() result; belts in model.belts are the ones that are on,
// belt 1 first. opts.points = student photometry (F_lambda cgs);
// opts.revealModel = a totalModel() result drawn as "True model".
export function buildFigure(model, state, opts = {}) {
  return state.view === 'modern' ? buildModernFigure(model, state, opts) : buildClassFigure(model, state, opts);
}

function buildModernFigure(model, state, { points = null, revealModel = null } = {}) {
  const { grid } = model;
  const unit = state.unit;
  const conv = (arr) => Array.from(convertArray(grid, arr, unit));

  const starY = conv(model.star);
  const totalY = conv(model.total);

  const data = [{
    name: 'Star', x: Array.from(grid), y: starY, mode: 'lines',
    line: { color: 'var:star', dash: 'dash', width: 2 },
  }];

  // Faint unreddened star, shown once the extinction is big enough to see.
  if (state.ism.Av >= SHOW_INTRINSIC_AV && model.starIntrinsic) {
    data.push({
      name: 'Star (no extinction)', x: Array.from(grid), y: conv(model.starIntrinsic), mode: 'lines',
      line: { color: 'var:muted', dash: 'dashdot', width: 1 },
    });
  }

  // model.belts holds only the belts that are on, belt 1 first.
  const labels = [];
  if (state.belt1.on) labels.push('Belt 1');
  if (state.belt2.on) labels.push('Belt 2');
  model.belts.forEach((b, i) => {
    data.push({
      name: labels[i], x: Array.from(grid), y: conv(b), mode: 'lines',
      line: { color: labels[i] === 'Belt 1' ? 'var:belt1' : 'var:belt2', dash: 'dot', width: 2 },
    });
  });

  data.push({
    name: 'Total', x: Array.from(grid), y: totalY, mode: 'lines',
    line: { color: 'var:total', width: 3 },
  });

  const pi = peakIndex(Float64Array.from(starY));
  data.push({
    name: 'Star peak', x: [grid[pi]], y: [starY[pi]], mode: 'markers+text',
    text: ['Star peak'], textposition: 'top right',
    marker: { color: 'var:star', size: 9, symbol: 'diamond' },
    textfont: { color: 'var:star' }, showlegend: false,
  });

  if (points && points.length) {
    data.push({
      name: 'Data',
      x: points.map((p) => p.lamUm),
      y: points.map((p) => convertFlux(p.lamUm, p.fLam, unit)),
      mode: 'markers',
      marker: { color: 'var:data', size: 8 },
      error_y: {
        type: 'data', visible: true, color: 'var:data',
        array: points.map((p) => convertFlux(p.lamUm, p.errFlam > 0 ? p.errFlam : ASSUMED_ERR_FRAC * p.fLam, unit)),
      },
    });
  }

  if (revealModel) {
    data.push({
      name: 'True model', x: Array.from(revealModel.grid),
      y: Array.from(convertArray(revealModel.grid, revealModel.total, unit)),
      mode: 'lines', line: { color: 'var:reveal', width: 2 },
    });
  }

  const top = Math.log10(Math.max(...totalY.filter((v) => Number.isFinite(v) && v > 0)));
  const [yLo, yHi] = yRange(data, top, 6, 0.5);
  const layout = {
    xaxis: { type: 'log', title: { text: 'Wavelength (µm)' }, color: 'var:fg', gridcolor: 'var:grid' },
    yaxis: {
      type: 'log', title: { text: Y_TITLES[unit] }, range: [yLo, yHi],
      color: 'var:fg', gridcolor: 'var:grid',
    },
    paper_bgcolor: 'var:bg',
    plot_bgcolor: 'var:bg',
    font: { color: 'var:fg' },
    legend: { orientation: 'h', y: -0.2 },
    hovermode: 'x unified',
    margin: { l: 70, r: 20, t: 20, b: 60 },
    shapes: [],
    annotations: [],
  };

  if (state.bands) addBands(layout);

  return { data, layout };
}


// y range (log10): `below` decades under and `above` over the model peak `top`,
// widened to include data points (with error bars) and the revealed curve.
function yRange(data, top, below, above) {
  let yHi = top + above;
  let yLo = top - below;
  for (const t of data) {
    if (t.error_y) {
      t.y.forEach((y, i) => {
        if (!(y > 0)) return;
        yHi = Math.max(yHi, Math.log10(y + t.error_y.array[i]) + 0.1);
        yLo = Math.min(yLo, Math.log10(y) - 0.5);
      });
    } else if (t.name === 'True model') {
      const m = Math.max(...t.y.filter((v) => Number.isFinite(v) && v > 0));
      yHi = Math.max(yHi, Math.log10(m) + 0.5);
    }
  }
  return [yLo, yHi];
}

// Survey band strips and labels. Plotly log axes: shape x0/x1 are data values,
// annotation x is log10(value). One colour per survey, one label row per survey.
function addBands(layout) {
  for (const b of BANDS) {
    const gi = BAND_GROUPS.indexOf(b.group);
    const token = `var:band-${b.group.toLowerCase()}`;
    layout.shapes.push({
      type: 'rect', xref: 'x', yref: 'paper',
      x0: b.lamUm - b.widthUm / 2, x1: b.lamUm + b.widthUm / 2, y0: 0, y1: 1,
      fillcolor: token, line: { width: 0 }, layer: 'below',
    });
    layout.annotations.push({
      x: Math.log10(b.lamUm), xref: 'x', y: 1 - 0.06 * gi, yref: 'paper', text: b.label,
      showarrow: false, yanchor: 'top', xanchor: 'center',
      font: { size: 9, color: `var:bandtext-${b.group.toLowerCase()}` },
    });
  }
}

const CLASS_X_RANGE = [0.5, 100]; // um, as in the class figures

// The class figure: boxed axes, one grey model curve, survey-coloured points,
// Do Not Fit points in black, legend (T_star, T_eff, reduced chi2) in the axes.
function buildClassFigure(model, state, { points = null, revealModel = null, title = 'SED model', fit = null } = {}) {
  const { grid } = model;
  const unit = state.unit;
  const conv = (arr) => Array.from(convertArray(grid, arr, unit));
  const x = Array.from(grid);
  const totalY = conv(model.total);
  const T = Math.round(state.star.T);
  const nBelts = model.belts.length;
  // Legend-only rows: no marks, just a label.
  const note = (name) => ({
    name, x: [null], y: [null], mode: 'lines', line: { color: 'rgba(0,0,0,0)' }, hoverinfo: 'skip',
  });

  const data = [{ name: `T★ = ${T} K`, x, y: totalY, mode: 'lines', line: { color: 'var:model', width: 2 } }];
  data.push(note(`T<sub>eff</sub> = ${T} K`));
  if (fit && typeof fit.reduced === 'number' && Number.isFinite(fit.reduced)) {
    data.push(note(`Reduced χ² = ${Number(fit.reduced.toPrecision(3))}`));
  }
  if (nBelts > 0) {
    data.push({
      name: 'Star only', x, y: conv(model.star), mode: 'lines',
      line: { color: 'var:muted', dash: 'dash', width: 1 },
    });
  }

  const errArr = (p) => convertFlux(p.lamUm, p.errFlam > 0 ? p.errFlam : ASSUMED_ERR_FRAC * p.fLam, unit);
  const pointTrace = (name, pts, color) => ({
    name, x: pts.map((p) => p.lamUm), y: pts.map((p) => convertFlux(p.lamUm, p.fLam, unit)),
    mode: 'markers', marker: { color, size: 8 },
    error_y: { type: 'data', visible: true, color, array: pts.map(errArr) },
  });
  const all = points || [];
  for (const group of [...BAND_GROUPS, 'Other']) {
    const pts = all.filter((p) => p.fit !== false && surveyForLam(p.lamUm) === group);
    if (pts.length) data.push(pointTrace(group, pts, group === 'Other' ? 'var:muted' : `var:bandtext-${group.toLowerCase()}`));
  }
  const skipped = all.filter((p) => p.fit === false);
  if (skipped.length) data.push(pointTrace('Do Not Fit', skipped, 'var:fg'));

  if (revealModel) {
    data.push({
      name: 'True model', x: Array.from(revealModel.grid),
      y: Array.from(convertArray(revealModel.grid, revealModel.total, unit)),
      mode: 'lines', line: { color: 'var:reveal', width: 2 },
    });
  }

  // Peak of the curve inside the visible wavelength window.
  const inView = totalY.filter((v, i) => grid[i] >= CLASS_X_RANGE[0] && grid[i] <= CLASS_X_RANGE[1] && Number.isFinite(v) && v > 0);
  const [yLo, yHi] = yRange(data, Math.log10(Math.max(...inView)), 2.5, 0.3);
  const axis = {
    type: 'log', color: 'var:fg', showgrid: false, showline: true, mirror: true, ticks: 'outside', linecolor: 'var:fg',
  };
  const layout = {
    title: { text: title, x: 0.5 },
    xaxis: { ...axis, title: { text: 'λ (µm)' }, range: CLASS_X_RANGE.map(Math.log10) },
    yaxis: { ...axis, title: { text: Y_TITLES[unit] }, range: [yLo, yHi] },
    paper_bgcolor: 'var:bg',
    plot_bgcolor: 'var:bg',
    font: { color: 'var:fg' },
    legend: {
      x: 0.02, y: 0.02, xanchor: 'left', yanchor: 'bottom',
      bgcolor: 'var:bg', bordercolor: 'var:fg', borderwidth: 1,
    },
    hovermode: 'closest',
    margin: { l: 70, r: 20, t: 80, b: 60 },
    shapes: [],
    annotations: [{
      text: nBelts === 0 ? 'No Dust' : `${nBelts} Dust Belt${nBelts === 1 ? '' : 's'}`,
      x: 0.5, xref: 'paper', y: 1.02, yref: 'paper', yanchor: 'bottom', showarrow: false,
    }],
  };
  if (state.bands) addBands(layout);
  return { data, layout };
}

// Replace every 'var:<name>' string in a figure with lookup(name).
export function resolveColors(value, lookup) {
  if (typeof value === 'string') return value.startsWith('var:') ? lookup(value.slice(4)) : value;
  if (Array.isArray(value)) return value.map((v) => resolveColors(v, lookup));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveColors(v, lookup)]));
  }
  return value;
}
