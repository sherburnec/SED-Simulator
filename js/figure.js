// Builds the Plotly figure ({ data, layout }) from a model and the app state.
// Pure: colours are theme tokens ('var:star' ...) that ui.js resolves with
// resolveColors() from the page's CSS custom properties.
import { convertArray, convertFlux, peakIndex } from './physics.js';
import { BANDS } from './bands.js';

const Y_TITLES = {
  lamFlam: 'λF_λ (erg s⁻¹ cm⁻²)',
  Fnu: 'F_ν (Jy)',
  Flam: 'F_λ (erg s⁻¹ cm⁻² µm⁻¹)',
};

const ASSUMED_ERR_FRAC = 0.1; // matches chi2(): missing errors are drawn as 10%

// model = totalModel() result; belts in model.belts are the ones that are on,
// belt 1 first. opts.points = student photometry (F_lambda cgs);
// opts.revealModel = a totalModel() result drawn as "True model".
export function buildFigure(model, state, { points = null, revealModel = null } = {}) {
  const { grid } = model;
  const unit = state.unit;
  const conv = (arr) => Array.from(convertArray(grid, arr, unit));

  const starY = conv(model.star);
  const totalY = conv(model.total);

  const data = [{
    name: 'Star', x: Array.from(grid), y: starY, mode: 'lines',
    line: { color: 'var:star', dash: 'dash', width: 2 },
  }];

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
  // y range: 6 decades below the model peak, half a decade above, widened to
  // include any data points (with error bars) and the revealed curve.
  let yHi = top + 0.5;
  let yLo = top - 6;
  for (const t of data) {
    if (t.name === 'Data') {
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

  if (state.bands) {
    // Plotly log axes: shape x0/x1 are data values, annotation x is log10(value).
    for (const b of BANDS) {
      layout.shapes.push({
        type: 'rect', xref: 'x', yref: 'paper',
        x0: b.lamUm * 0.95, x1: b.lamUm * 1.05, y0: 0, y1: 1,
        fillcolor: 'var:band', line: { width: 0 }, layer: 'below',
      });
      layout.annotations.push({
        x: Math.log10(b.lamUm), xref: 'x', y: 1, yref: 'paper', text: b.label,
        textangle: -90, showarrow: false, yanchor: 'top', xanchor: 'center',
        font: { size: 9, color: 'var:muted' },
      });
    }
  }

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
