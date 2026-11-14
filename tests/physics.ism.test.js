import test from 'node:test';
import assert from 'node:assert/strict';
import { extinctionRatio, avForDistance, totalModel, excessRatio } from '../js/physics.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a / b - 1) < tol, `${msg ?? ''} ${a} vs ${b}`);

test('CCM89 anchors', () => {
  assert.ok(Math.abs(extinctionRatio(0.5495) - 1) < 0.01);
  near(extinctionRatio(0.44), 1.324, 0.02);
  near(extinctionRatio(1.235), 0.2876, 0.02);
  near(extinctionRatio(2.159), 0.1170, 0.02);
});

test('Indebetouw IRAC plateau', () => {
  near(extinctionRatio(3.55), 0.0665, 0.02);
  near(extinctionRatio(7.872), 0.0458, 0.02);
  const r = extinctionRatio(4.493) / extinctionRatio(5.731);
  assert.ok(r > 1.05 && r < 1.25, `ratio ${r}`);
});

test('continuous at 2.159 um and 8 um', () => {
  for (const l of [2.159, 8]) {
    near(extinctionRatio(l * (1 - 1e-6)), extinctionRatio(l * (1 + 1e-6)), 0.02, `at ${l}`);
  }
});

test('far-IR falls as lambda^-2', () => {
  near(extinctionRatio(71.42), extinctionRatio(24) * (24 / 71.42) ** 2, 0.02);
  assert.equal(extinctionRatio(12), extinctionRatio(8));
});

test('blue edge held', () => {
  assert.equal(extinctionRatio(0.05), extinctionRatio(0.1));
  const v = extinctionRatio(0.05);
  assert.ok(Number.isFinite(v) && v > 2);
});

test('avForDistance', () => {
  assert.equal(avForDistance(1000), 1);
  assert.equal(avForDistance(10), 0.01);
});

test('A_V = 10 at the grid edge stays finite', () => {
  const m = totalModel({ star: { T: 40000, R: 20, d: 1 }, belts: [], Av: 10 });
  for (const arr of [m.star, m.starIntrinsic, m.total]) {
    for (const v of arr) assert.ok(Number.isFinite(v) && v >= 0);
  }
  assert.ok(m.star[0] < m.starIntrinsic[0]);
});

test('extinction cancels in the excess ratio', () => {
  const star = { T: 5772, R: 1, d: 10 };
  const belts = [{ rIn: 40, rOut: 40, f: 1e-4, lambda0: 100, beta: 0 }];
  const a = totalModel({ star, belts, Av: 0 });
  const b = totalModel({ star, belts, Av: 5 });
  const ea = excessRatio(a.grid, a.total, a.star, 23.68);
  const eb = excessRatio(b.grid, b.total, b.star, 23.68);
  assert.ok(Math.abs(eb / ea - 1) < 1e-9);
});

test('Av = 0 leaves the model unchanged', () => {
  const m = totalModel({ star: { T: 5772, R: 1, d: 10 }, belts: [] });
  m.star.forEach((v, i) => assert.equal(v, m.starIntrinsic[i]));
});
