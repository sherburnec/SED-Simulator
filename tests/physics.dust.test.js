import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONST, makeGrid, starFlux, luminosity, dustTemp, beltNorm, beltFlux,
  beltTempRange, totalModel, excessRatio, beltRings, peakIndex,
} from '../js/physics.js';

function integrate(g, f) {
  let s = 0;
  for (let i = 1; i < g.length; i++) s += 0.5 * (f[i] + f[i - 1]) * (g[i] - g[i - 1]) * CONST.um;
  return s;
}

const STAR = { T: 9600, R: 2.7, d: 7.7 };
const expectedDust = (star, f) =>
  f * luminosity(star.T, star.R) * CONST.Lsun / (4 * Math.PI * (star.d * CONST.pc) ** 2);

test('dust at 1 AU around 1 Lsun is 278.3 K', () => {
  assert.ok(Math.abs(dustTemp(1, 1) - 278.3) < 1e-9);
});

for (const beta of [0, 2]) {
  test(`belt integral equals f L/(4pi d^2) within 1%, beta=${beta}`, () => {
    const g = makeGrid(0.01, 1e6, 6000);
    const belt = { rIn: 80, rOut: 80, f: 2e-5, lambda0: 100, beta };
    const ratio = integrate(g, beltFlux(g, STAR, belt)) / expectedDust(STAR, 2e-5);
    assert.ok(Math.abs(ratio - 1) < 0.01, `ratio ${ratio}`);
  });
}

test('extended belt integral also equals f L/(4pi d^2) within 1%', () => {
  const g = makeGrid(0.01, 1e6, 6000);
  const belt = { rIn: 10, rOut: 100, f: 1e-4, lambda0: 100, beta: 1 };
  const ratio = integrate(g, beltFlux(g, STAR, belt)) / expectedDust(STAR, 1e-4);
  assert.ok(Math.abs(ratio - 1) < 0.01, `ratio ${ratio}`);
});

test('beta=0 normalisation matches sigma T^4 / pi within 0.5%', () => {
  for (const T of [5, 50, 500]) {
    assert.ok(Math.abs(beltNorm(T, 100, 0) / (CONST.sigma * T ** 4 / Math.PI) - 1) < 0.005);
  }
});

test('beltTempRange: hotter at rIn, equal for a ring', () => {
  const [lo, hi] = beltTempRange(1, { rIn: 4, rOut: 16 });
  assert.ok(Math.abs(hi - 139.15) < 0.01 && Math.abs(lo - 69.575) < 0.01);
  const [a, b] = beltTempRange(1, { rIn: 4, rOut: 4 });
  assert.equal(a, b);
});

test('excess ratio is 1 with no belts, >1 at 70um with a cold belt', () => {
  const none = totalModel({ star: STAR, belts: [] });
  assert.ok(Math.abs(excessRatio(none.grid, none.total, none.star, 70) - 1) < 1e-9);
  const withBelt = totalModel({
    star: STAR,
    belts: [{ rIn: 80, rOut: 80, f: 2e-5, lambda0: 100, beta: 0 }],
  });
  assert.ok(excessRatio(withBelt.grid, withBelt.total, withBelt.star, 70) > 1.5);
});

test('totalModel total is star plus belts', () => {
  const m = totalModel({
    star: STAR,
    belts: [{ rIn: 80, rOut: 80, f: 2e-5, lambda0: 100, beta: 0 }],
  });
  assert.equal(m.belts.length, 1);
  assert.ok(Math.abs(m.total[300] - (m.star[300] + m.belts[0][300])) <= 1e-12 * m.total[300]);
});

test('corners produce only finite, non-negative values', () => {
  const corners = [
    { star: { T: 40000, R: 20, d: 1 }, belts: [{ rIn: 0.1, rOut: 0.1, f: 1e-2, lambda0: 10, beta: 2 }] },
    { star: { T: 2500, R: 0.1, d: 500 }, belts: [{ rIn: 1000, rOut: 1000, f: 1e-6, lambda0: 1000, beta: 0 }] },
  ];
  for (const p of corners) {
    const m = totalModel(p);
    for (const arr of [m.total, m.star, ...m.belts]) {
      assert.ok(arr.every((v) => Number.isFinite(v) && v >= 0));
    }
  }
});

test('two extended belts compute in under 20 ms', () => {
  const p = {
    star: STAR,
    belts: [
      { rIn: 5, rOut: 20, f: 1e-4, lambda0: 100, beta: 1 },
      { rIn: 50, rOut: 200, f: 1e-4, lambda0: 100, beta: 1 },
    ],
  };
  totalModel(p); // warm up
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) totalModel(p);
  const avg = (performance.now() - t0) / 10;
  assert.ok(avg < 20, `avg ${avg} ms`);
});

test('ring spectrum peaks at 2898/T_d (F_lambda, beta=0)', () => {
  const g = makeGrid();
  const belt = { rIn: 80, rOut: 80, f: 2e-5, lambda0: 100, beta: 0 };
  const Td = dustTemp(luminosity(STAR.T, STAR.R), 80);
  const ratio = g[peakIndex(beltFlux(g, STAR, belt))] / (2898 / Td);
  assert.ok(ratio > 0.97 && ratio < 1.03, `ratio ${ratio}`);
});

test('extended belt shares follow area/(4 pi r^2): share ~ (1/a - 1/b)', () => {
  const rings = beltRings({ rIn: 10, rOut: 100 });
  assert.equal(rings.length, 30);
  assert.ok(Math.abs(rings.reduce((s, x) => s + x.share, 0) - 1) < 1e-12);
  const step = Math.log(100 / 10) / 30;
  const edge = (i) => 10 * Math.exp(step * i);
  const norm = 1 / 10 - 1 / 100;
  rings.forEach((x, i) => {
    const expected = (1 / edge(i) - 1 / edge(i + 1)) / norm;
    assert.ok(Math.abs(x.share / expected - 1) < 1e-9);
  });
  // Inner third of annuli carries ~59.5% of the luminosity
  const inner = rings.slice(0, 10).reduce((s, x) => s + x.share, 0);
  assert.ok(Math.abs(inner - 0.595) < 0.005, `inner third ${inner}`);
});
