import test from 'node:test';
import assert from 'node:assert/strict';
import { totalModel, interpLogLog, chi2 } from '../js/physics.js';

const MODEL = totalModel({
  star: { T: 9600, R: 2.7, d: 7.7 },
  belts: [{ rIn: 80, rOut: 80, f: 2e-5, lambda0: 100, beta: 0 }],
});

function pointAt(lamUm, errFrac) {
  const fLam = interpLogLog(MODEL.grid, MODEL.total, lamUm);
  return { lamUm, fLam, errFlam: errFrac === null ? null : errFrac * fLam };
}

test('interpLogLog returns grid values at grid points and NaN outside', () => {
  const i = 250;
  assert.ok(Math.abs(interpLogLog(MODEL.grid, MODEL.total, MODEL.grid[i]) / MODEL.total[i] - 1) < 1e-9);
  assert.ok(Number.isNaN(interpLogLog(MODEL.grid, MODEL.total, 0.01)));
  assert.ok(Number.isNaN(interpLogLog(MODEL.grid, MODEL.total, 5000)));
});

test('chi2 is 0 for points taken exactly from the model', () => {
  const pts = [pointAt(12, 0.05), pointAt(24, 0.05), pointAt(70, 0.05), pointAt(160, 0.05), pointAt(850, 0.05), pointAt(2.2, 0.05)];
  const r = chi2(pts, MODEL.grid, MODEL.total, 2);
  assert.ok(r.chi2 < 1e-18);
  assert.equal(r.dof, 4);
  assert.equal(r.reduced, 0);
  assert.equal(r.assumedErrCount, 0);
});

test('chi2 is 1 per point when each point is exactly 1 sigma off', () => {
  const pts = [24, 70, 160, 850].map((lam) => {
    const p = pointAt(lam, 0.1);
    return { ...p, fLam: p.fLam * 1.1 }; // offset equals 1 sigma (sigma = 0.1 * model)
  });
  const r = chi2(pts, MODEL.grid, MODEL.total, 1);
  assert.ok(Math.abs(r.chi2 - 4) < 1e-9, `chi2 ${r.chi2}`);
  assert.ok(Math.abs(r.reduced - 4 / 3) < 1e-9);
});

test('missing errors assume 10% and are counted', () => {
  const a = pointAt(24, 0.1);
  const b = pointAt(70, null);
  const r = chi2([a, { ...b, fLam: b.fLam * 1.1 }], MODEL.grid, MODEL.total, 0);
  assert.equal(r.assumedErrCount, 1);
  // The point with no error: offset is 10% of its own value, so assumed sigma
  // (10% of the data value 1.1*model) makes it just under 1 sigma.
  assert.ok(r.chi2 > 0.8 && r.chi2 < 1.0, `chi2 ${r.chi2}`);
});

test('dof <= 0 gives reduced null', () => {
  const pts = [pointAt(24, 0.1), pointAt(70, 0.1), pointAt(160, 0.1)];
  const r = chi2(pts, MODEL.grid, MODEL.total, 5);
  assert.equal(r.reduced, null);
  assert.ok(r.dof <= 0);
});

test('points outside the grid are ignored', () => {
  const r = chi2([pointAt(24, 0.1), { lamUm: 5000, fLam: 1, errFlam: 1 }], MODEL.grid, MODEL.total, 0);
  assert.equal(r.dof, 1);
});
