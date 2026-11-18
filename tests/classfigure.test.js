import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFigure } from '../js/figure.js';
import { defaultState, toPhysicsParams } from '../js/model.js';
import { totalModel, toFlamCgs } from '../js/physics.js';

function setup(mutate = () => {}) {
  const state = defaultState(); // class view, Fnu, belt 1 on
  mutate(state);
  return { state, model: totalModel(toPhysicsParams(state)) };
}
const pt = (lamUm, extra = {}) => ({ lamUm, fLam: toFlamCgs(lamUm, 1, 'Fnu'), errFlam: null, fit: true, ...extra });
const find = (fig, re) => fig.data.find((t) => re.test(t.name));
const subtitle = (fig) => fig.layout.annotations.find((a) => /Dust/.test(a.text))?.text;

test('class view title, subtitle and model curve', () => {
  const { state, model } = setup();
  const fig = buildFigure(model, state, { title: 'Vega' });
  assert.equal(fig.layout.title.text, 'Vega');
  assert.equal(subtitle(fig), '1 Dust Belt');
  const curve = find(fig, /^T★ = 5772 K$/);
  assert.equal(curve.line.color, 'var:model');
  assert.notEqual(curve.line.dash, 'dash');
  assert.match(find(fig, /eff/).name, /T.*eff.* = 5772 K/);
  assert.equal(buildFigure(model, state).layout.title.text, 'SED model');
});

test('subtitle: no dust and two belts', () => {
  const none = setup((s) => { s.belt1.on = false; });
  assert.equal(subtitle(buildFigure(none.model, none.state)), 'No Dust');
  const two = setup((s) => { s.belt2.on = true; });
  assert.equal(subtitle(buildFigure(two.model, two.state)), '2 Dust Belts');
});

test('reduced chi2 line only when a number is supplied', () => {
  const { state, model } = setup();
  assert.ok(find(buildFigure(model, state, { fit: { reduced: 1.2 } }), /Reduced χ² = 1\.2$/));
  assert.equal(find(buildFigure(model, state, { fit: { reduced: null } }), /Reduced/), undefined);
  assert.equal(find(buildFigure(model, state), /Reduced/), undefined);
});

test('survey points are coloured by survey; Do Not Fit is black and separate', () => {
  const { state, model } = setup();
  const points = [pt(1.235), pt(3.55), pt(3.6, { fit: false }), pt(0.4)];
  const fig = buildFigure(model, state, { points });
  assert.equal(find(fig, /^2MASS$/).marker.color, 'var:bandtext-2mass');
  assert.equal(find(fig, /^IRAC$/).marker.color, 'var:bandtext-irac');
  assert.equal(find(fig, /^Other$/).marker.color, 'var:muted');
  const nofit = find(fig, /^Do Not Fit$/);
  assert.equal(nofit.marker.color, 'var:fg');
  assert.deepEqual(nofit.x, [3.6]);
  assert.equal(find(fig, /^MIPS$/), undefined);
  assert.equal(find(fig, /^AllWISE$/), undefined);
});

test('no data, and all data Do Not Fit, do not break the figure', () => {
  const { state, model } = setup();
  assert.doesNotThrow(() => buildFigure(model, state, { points: [] }));
  const fig = buildFigure(model, state, { points: [pt(3.55, { fit: false })], fit: { reduced: null } });
  assert.deepEqual(fig.data.filter((t) => t.error_y).map((t) => t.name), ['Do Not Fit']);
});

test('boxed axes, no grid, bands only when asked (as points, not strips), true model in reveal', () => {
  const { state, model } = setup();
  const fig = buildFigure(model, state, { revealModel: model });
  assert.equal(fig.layout.xaxis.showgrid, false);
  assert.equal(fig.layout.xaxis.mirror, true);
  assert.equal(fig.layout.shapes.length, 0);
  assert.ok(find(fig, /True model/));
  const withBands = setup((s) => { s.bands = true; });
  const bfig = buildFigure(withBands.model, withBands.state);
  assert.equal(bfig.layout.shapes.length, 0);
  const irac = find(bfig, /^IRAC bands$/);
  assert.equal(irac.x.length, 4);
  assert.ok(irac.y.every((y) => y > 0));
  assert.equal(irac.marker.color, 'var:bandtext-irac');
  assert.equal(find(fig, /bands$/), undefined);
});

test('every theme token either view uses is defined for light and dark', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const dark = css.slice(css.indexOf('prefers-color-scheme: dark'));
  const light = css.slice(0, css.indexOf('prefers-color-scheme: dark'));
  const points = [pt(1.235), pt(3.55), pt(23.7), pt(3.4), pt(0.4), pt(5, { fit: false })];
  for (const view of ['class', 'modern']) {
    const { state, model } = setup((s) => { s.view = view; s.bands = true; s.belt2.on = true; s.ism = { Av: 2, linked: false }; });
    const text = JSON.stringify(buildFigure(model, state, { points, revealModel: model, fit: { reduced: 2 } }));
    for (const [, name] of text.matchAll(/var:([a-z0-9-]+)/g)) {
      assert.ok(light.includes(`--${name}:`), `light --${name}`);
      assert.ok(dark.includes(`--${name}:`), `dark --${name}`);
    }
  }
});
