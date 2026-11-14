import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONST, makeGrid, planckLam, starFlux, luminosity, wienPeakUm,
  convertFlux, toFlamCgs, convertArray, peakIndex,
} from '../js/physics.js';

test('Sun luminosity is 1 Lsun within 0.5%', () => {
  assert.ok(Math.abs(luminosity(5772, 1) - 1) < 0.005);
});

test('grid is 500 log-spaced points from 0.05 to 3000 um', () => {
  const g = makeGrid();
  assert.equal(g.length, 500);
  assert.ok(Math.abs(g[0] - 0.05) < 1e-12 && Math.abs(g[499] - 3000) < 1e-9);
  const r0 = g[1] / g[0];
  assert.ok(Math.abs(g[300] / g[299] - r0) < 1e-12);
});

test('wienPeakUm is 2898/T', () => {
  assert.ok(Math.abs(wienPeakUm(5772) - 2898 / 5772) < 1e-12);
});

test('integral of starFlux equals L/(4 pi d^2) within 1% on a wide grid', () => {
  const g = makeGrid(0.01, 1e4, 5000);
  const f = starFlux(g, { T: 5772, R: 1, d: 10 });
  let sum = 0;
  for (let i = 1; i < g.length; i++) {
    sum += 0.5 * (f[i] + f[i - 1]) * (g[i] - g[i - 1]) * CONST.um;
  }
  const expected = luminosity(5772, 1) * CONST.Lsun / (4 * Math.PI * (10 * CONST.pc) ** 2);
  assert.ok(Math.abs(sum / expected - 1) < 0.01, `ratio ${sum / expected}`);
});

for (const [unit, k] of [['Flam', 2898], ['lamFlam', 3670], ['Fnu', 5100]]) {
  test(`displayed peak in ${unit} is near ${k}/T`, () => {
    for (const T of [3000, 5772, 10000]) {
      const g = makeGrid();
      const s = convertArray(g, starFlux(g, { T, R: 1, d: 10 }), unit);
      const ratio = g[peakIndex(s)] / (k / T);
      assert.ok(ratio > 0.97 && ratio < 1.03, `T=${T} ratio ${ratio}`);
    }
  });
}

test('40,000 K F_lambda peak is on the grid, not at the edge', () => {
  const g = makeGrid();
  const i = peakIndex(starFlux(g, { T: 40000, R: 1, d: 10 }));
  assert.ok(i > 0 && i < 499);
});

test('unit conversions round-trip', () => {
  for (const unit of ['lamFlam', 'Fnu', 'Flam']) {
    for (const lam of [0.5, 24, 870]) {
      const v = 3.7e-9;
      assert.ok(Math.abs(toFlamCgs(lam, convertFlux(lam, v, unit), unit) / v - 1) < 1e-12);
    }
  }
});

test('Planck stays finite and non-negative at extremes', () => {
  for (const [lam, T] of [[0.05, 1], [3000, 40000], [0.05, 40000], [3000, 1]]) {
    const b = planckLam(lam, T);
    assert.ok(Number.isFinite(b) && b >= 0, `lam ${lam} T ${T} -> ${b}`);
  }
});
