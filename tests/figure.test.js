import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS } from '../js/bands.js';
import { buildFigure, resolveColors } from '../js/figure.js';
import { defaultState, toPhysicsParams } from '../js/model.js';
import { totalModel, convertArray, convertFlux, peakIndex } from '../js/physics.js';

function setup(mutate = () => {}) {
  const state = defaultState();
  mutate(state);
  const model = totalModel(toPhysicsParams(state));
  return { state, model };
}

const names = (fig) => fig.data.map((t) => t.name);

test('BANDS has the spec list: 19 bands with J/H/Ks, W1-W4, MIPS, PACS, SPIRE, SCUBA-2, ALMA', () => {
  assert.equal(BANDS.length, 19);
  const lam = (id) => BANDS.find((b) => b.id === id).lamUm;
  assert.equal(lam('2MASS J'), 1.25);
  assert.equal(lam('WISE W4'), 22);
  assert.equal(lam('SPIRE 500'), 500);
  assert.equal(lam('ALMA B6'), 1300);
  assert.equal(new Set(BANDS.map((b) => b.lamUm)).size, 17);
});

test('trace order and count for one belt, no data', () => {
  const { state, model } = setup();
  assert.deepEqual(names(buildFigure(model, state)), ['Star', 'Belt 1', 'Total', 'Star peak']);
});

test('belt 2 trace appears only when on', () => {
  const { state, model } = setup((s) => { s.belt2.on = true; });
  assert.deepEqual(names(buildFigure(model, state)), ['Star', 'Belt 1', 'Belt 2', 'Total', 'Star peak']);
});

test('belt 1 trace is absent when belt1.on is false', () => {
  const { state, model } = setup((s) => { s.belt1.on = false; });
  assert.deepEqual(names(buildFigure(model, state)), ['Star', 'Total', 'Star peak']);
});

test('belt 2 alone is labelled Belt 2', () => {
  const { state, model } = setup((s) => { s.belt1.on = false; s.belt2.on = true; });
  assert.deepEqual(names(buildFigure(model, state)), ['Star', 'Belt 2', 'Total', 'Star peak']);
});

test('peak marker sits at the displayed star peak for each unit', () => {
  for (const unit of ['Flam', 'lamFlam', 'Fnu']) {
    const { state, model } = setup((s) => { s.unit = unit; });
    const fig = buildFigure(model, state);
    const marker = fig.data.find((t) => t.name === 'Star peak');
    const i = peakIndex(convertArray(model.grid, model.star, unit));
    assert.equal(marker.x[0], model.grid[i]);
    assert.equal(marker.y[0], convertArray(model.grid, model.star, unit)[i]);
  }
});

test('axes are log and titled per unit', () => {
  const titles = {
    lamFlam: /λF_λ/, Fnu: /F_ν.*Jy/, Flam: /F_λ.*µm/,
  };
  for (const unit of Object.keys(titles)) {
    const { state, model } = setup((s) => { s.unit = unit; });
    const { layout } = buildFigure(model, state);
    assert.equal(layout.xaxis.type, 'log');
    assert.equal(layout.yaxis.type, 'log');
    assert.match(layout.xaxis.title.text, /Wavelength \(µm\)/);
    assert.match(layout.yaxis.title.text, titles[unit]);
  }
});

test('y range spans 6 decades below the total peak, plus half a decade above', () => {
  const { state, model } = setup();
  const { layout } = buildFigure(model, state);
  const top = Math.log10(Math.max(...convertArray(model.grid, model.total, state.unit)));
  assert.ok(Math.abs(layout.yaxis.range[1] - (top + 0.5)) < 1e-9);
  assert.ok(Math.abs(layout.yaxis.range[0] - (top - 6)) < 1e-9);
});

test('bands add 19 shapes and labels when on and none when off', () => {
  const on = setup((s) => { s.bands = true; });
  const figOn = buildFigure(on.model, on.state);
  assert.equal(figOn.layout.shapes.length, 19);
  assert.equal(figOn.layout.annotations.length, 19);
  const off = setup();
  const figOff = buildFigure(off.model, off.state);
  assert.equal((figOff.layout.shapes ?? []).length, 0);
  assert.equal((figOff.layout.annotations ?? []).length, 0);
});

test('points trace carries error bars converted to the display unit', () => {
  const { state, model } = setup((s) => { s.unit = 'Fnu'; });
  const pts = [
    { lamUm: 24, fLam: 1e-3, errFlam: 1e-4 },
    { lamUm: 70, fLam: 2e-3, errFlam: null },
  ];
  const fig = buildFigure(model, state, { points: pts });
  const t = fig.data.find((x) => x.name === 'Data');
  assert.deepEqual(t.x, [24, 70]);
  assert.ok(Math.abs(t.y[0] / convertFlux(24, 1e-3, 'Fnu') - 1) < 1e-12);
  assert.ok(Math.abs(t.error_y.array[0] / convertFlux(24, 1e-4, 'Fnu') - 1) < 1e-12);
  // missing error is drawn as the 10% that chi-squared assumes
  assert.ok(Math.abs(t.error_y.array[1] / convertFlux(70, 2e-4, 'Fnu') - 1) < 1e-12);
});

test('revealModel adds a True model trace', () => {
  const { state, model } = setup();
  const fig = buildFigure(model, state, { revealModel: model });
  assert.equal(names(fig).at(-1), 'True model');
});

test('trace colours are theme tokens, not literal colours', () => {
  const { state, model } = setup();
  const fig = buildFigure(model, state);
  assert.match(fig.data[0].line.color, /^var:/);
});

test('resolveColors replaces every var: token and leaves other strings alone', () => {
  const { state, model } = setup((s) => { s.bands = true; });
  const fig = resolveColors(buildFigure(model, state), (name) => `#${name}`);
  const text = JSON.stringify(fig);
  assert.ok(!text.includes('var:'));
  assert.ok(text.includes('#star') && text.includes('#band'));
  assert.equal(fig.data[0].name, 'Star');
});

test('band shapes use data values and annotations use log10 (Plotly log-axis rules)', () => {
  const { state, model } = setup((s) => { s.bands = true; });
  const { layout } = buildFigure(model, state);
  const iJ = BANDS.findIndex((b) => b.id === '2MASS J');
  assert.ok(Math.abs(layout.shapes[iJ].x0 - 1.25 * 0.95) < 1e-12);
  assert.ok(Math.abs(layout.shapes[iJ].x1 - 1.25 * 1.05) < 1e-12);
  assert.ok(Math.abs(layout.annotations[iJ].x - Math.log10(1.25)) < 1e-12);
});

test('y range expands to include data far above the model, with error bars', () => {
  const { state, model } = setup();
  const base = buildFigure(model, state).layout.yaxis.range;
  const hi = 10 ** (base[1] + 1.5);
  const fig = buildFigure(model, state, { points: [{ lamUm: 24, fLam: hi / (24e-4), errFlam: null }] });
  assert.ok(fig.layout.yaxis.range[1] > Math.log10(hi * 1.1));
});

test('y range expands to include a brighter reveal curve', () => {
  const { state, model } = setup();
  const bright = totalModel({ star: { T: 5772, R: 5, d: 10 }, belts: [] });
  const fig = buildFigure(model, state, { revealModel: bright });
  const topReveal = Math.log10(Math.max(...convertArray(bright.grid, bright.total, state.unit)));
  assert.ok(fig.layout.yaxis.range[1] >= topReveal);
});

test('zero flux error is drawn as the same 10% that chi2 assumes', () => {
  const { state, model } = setup();
  const fig = buildFigure(model, state, { points: [{ lamUm: 24, fLam: 1e-3, errFlam: 0 }] });
  const t = fig.data.find((x) => x.name === 'Data');
  assert.ok(Math.abs(t.error_y.array[0] / convertFlux(24, 1e-4, state.unit) - 1) < 1e-12);
});

test('hover shows all components at one wavelength', () => {
  const { state, model } = setup();
  assert.equal(buildFigure(model, state).layout.hovermode, 'x unified');
});
