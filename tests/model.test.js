import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGES, defaultState, setBeltDistance, normalizeState, hasAdvancedPhysics,
  toSimple, toPhysicsParams, countFreeParams, encodeHash, decodeHash,
  beltFrac, isFracCapped, setBeltRadii, setLinked,
} from '../js/model.js';

const advanced = () => {
  const s = defaultState();
  s.mode = 'advanced';
  s.star = { T: 9600, R: 2.7, d: 7.7 };
  s.belt1 = { on: true, rIn: 10, rOut: 100, M: 3e-3, lambda0: 120, beta: 1.5 };
  s.belt2 = { on: true, rIn: 2, rOut: 6, M: 2e-6, lambda0: 50, beta: 0.5 };
  s.unit = 'Fnu';
  s.ism = { Av: 2, linked: false };
  s.holdBrightness = true;
  s.bands = false;
  return s;
};

test('defaults match the spec', () => {
  const s = defaultState();
  assert.deepEqual(s.star, { T: 5772, R: 1, d: 10 });
  assert.deepEqual(s.belt1, { on: true, rIn: 40, rOut: 40, M: 2.5e-4, lambda0: 100, beta: 0 });
  assert.deepEqual(s.belt2, { on: false, rIn: 5, rOut: 10, M: 8e-7, lambda0: 100, beta: 0 });
  assert.deepEqual(s.ism, { Av: 0.01, linked: true });
  assert.equal(s.holdBrightness, false);
  assert.equal(s.bands, true);
  assert.ok(Math.abs(beltFrac(s.belt1) / 1e-4 - 1) < 0.01);
  assert.equal(s.unit, 'lamFlam');
  assert.equal(s.mode, 'simple');
  assert.deepEqual(RANGES.T, [2500, 40000, 'log']);
  assert.deepEqual(RANGES.d, [1, 3000, 'log']);
  assert.deepEqual(RANGES.Av, [0, 10, 'lin']);
  assert.deepEqual(RANGES.M, [1e-8, 100, 'log']);
});

test('hash round-trips a full advanced state to 4 sig figs', () => {
  const s = advanced();
  const back = decodeHash(encodeHash(s));
  assert.deepEqual(back, s);
  const odd = defaultState();
  odd.star.T = 5772.123456;
  assert.equal(decodeHash(encodeHash(odd)).star.T, 5772);
});

test('garbage hash gives defaults', () => {
  assert.deepEqual(decodeHash('#%%%zz=1&T=banana'), defaultState());
  assert.deepEqual(decodeHash(''), defaultState());
});

test('out-of-range values are clamped', () => {
  assert.equal(decodeHash('T=99999').star.T, 40000);
  assert.equal(decodeHash('#T=1').star.T, 2500);
  assert.equal(beltFrac(decodeHash('f1=5').belt1), 0.1);
  assert.equal(decodeHash('d=9999').star.d, 3000);
});

test('old link missing keys fills from defaults', () => {
  const s = decodeHash('T=7000');
  assert.equal(s.star.T, 7000);
  assert.deepEqual(s.belt1, defaultState().belt1);
});

test('reversed radii are swapped', () => {
  const s = normalizeState({ ...defaultState(), belt1: { ...defaultState().belt1, rIn: 100, rOut: 10 } });
  assert.deepEqual([s.belt1.rIn, s.belt1.rOut], [10, 100]);
});

test('hash with advanced settings opens in advanced mode', () => {
  assert.equal(decodeHash('b2on=1').mode, 'advanced');
  assert.equal(decodeHash('u=Fnu').mode, 'advanced');
  assert.equal(decodeHash('bd=1').mode, 'simple');
  assert.equal(decodeHash('T=7000').mode, 'simple');
});

test('setBeltDistance makes a ring', () => {
  const s = setBeltDistance(advanced(), 55);
  assert.deepEqual([s.belt1.rIn, s.belt1.rOut], [55, 55]);
});

test('toSimple resets advanced physics and display, hasAdvancedPhysics reports it', () => {
  const a = advanced();
  assert.equal(hasAdvancedPhysics(a), true);
  assert.equal(hasAdvancedPhysics(defaultState()), false);
  const s = toSimple(a);
  assert.equal(s.mode, 'simple');
  assert.equal(hasAdvancedPhysics(s), false);
  assert.deepEqual([s.belt1.rIn, s.belt1.rOut], [10, 10]);
  assert.equal(s.belt1.beta, 0);
  assert.equal(s.belt1.lambda0, 100);
  assert.equal(s.belt2.on, false);
  assert.equal(s.unit, 'lamFlam');
  assert.equal(s.bands, a.bands);
  assert.equal(s.belt1.M, 3e-3);
  assert.deepEqual(s.ism, a.ism);
  assert.deepEqual(s.star, a.star);
});

test('toPhysicsParams includes only belts that are on', () => {
  assert.equal(toPhysicsParams(defaultState()).belts.length, 1);
  assert.equal(toPhysicsParams(advanced()).belts.length, 2);
  const noDust = defaultState();
  noDust.belt1.on = false;
  assert.equal(toPhysicsParams(noDust).belts.length, 0);
  const b = toPhysicsParams(defaultState()).belts[0];
  assert.deepEqual(Object.keys(b).sort(), ['beta', 'f', 'lambda0', 'rIn', 'rOut']);
});

test('countFreeParams: simple 5; dust off 3; extended belt1 with beta 8; plus extended belt2 with beta 13', () => {
  assert.equal(countFreeParams(defaultState()), 5);
  const off = defaultState();
  off.belt1.on = false;
  assert.equal(countFreeParams(off), 3);
  const s = defaultState();
  s.belt1 = { on: true, rIn: 10, rOut: 100, M: 1e-4, lambda0: 100, beta: 1 };
  assert.equal(countFreeParams(s), 8);
  s.belt2 = { on: true, rIn: 2, rOut: 6, M: 1e-5, lambda0: 100, beta: 1 };
  assert.equal(countFreeParams(s), 13);
});

test('non-finite numbers fall back to defaults', () => {
  const s = normalizeState({ star: { T: NaN, R: Infinity, d: 'x' } });
  assert.deepEqual(s.star, defaultState().star);
});

test('lambda0 alone does not count as advanced physics when beta is 0', () => {
  const s = defaultState();
  s.belt1.lambda0 = 100.4;
  assert.equal(hasAdvancedPhysics(s), false);
  assert.equal(decodeHash('l1=120').mode, 'simple');
});

test('linked Av follows distance', () => {
  const s = normalizeState({ ...defaultState(), star: { T: 5772, R: 1, d: 2000 } });
  assert.equal(s.ism.Av, 2);
  const u = normalizeState({ ...defaultState(), ism: { Av: 4, linked: false }, star: { T: 5772, R: 1, d: 2000 } });
  assert.equal(u.ism.Av, 4);
});

test('unlinking keeps Av', () => {
  const s = normalizeState({ ...defaultState(), star: { T: 5772, R: 1, d: 1500 } });
  const u = setLinked(s, false);
  assert.equal(u.ism.Av, 1.5);
  assert.equal(u.ism.linked, false);
});

test('hold brightness keeps f when the belt moves', () => {
  const s = { ...defaultState(), holdBrightness: true };
  const m = setBeltRadii(s, 'belt1', 80, 80);
  assert.ok(Math.abs(beltFrac(m.belt1) / beltFrac(s.belt1) - 1) < 1e-9);
  assert.ok(Math.abs(m.belt1.M / s.belt1.M - 4) < 1e-9);
  const off = setBeltRadii(defaultState(), 'belt1', 80, 80);
  assert.equal(off.belt1.M, defaultState().belt1.M);
  assert.ok(Math.abs(beltFrac(off.belt1) / beltFrac(defaultState().belt1) - 0.25) < 1e-9);
});

test('hold brightness clamps mass at the range edge', () => {
  const s = { ...defaultState(), holdBrightness: true, belt1: { ...defaultState().belt1, rIn: 1, rOut: 1, M: 0.5 } };
  const m = setBeltRadii(s, 'belt1', 1000, 1000);
  assert.equal(m.belt1.M, 100);
  assert.ok(Number.isFinite(beltFrac(m.belt1)));
  assert.ok(beltFrac(m.belt1) < beltFrac(s.belt1));
});

test('f is capped at 0.1', () => {
  const b = { ...defaultState().belt1, rIn: 0.1, rOut: 0.1, M: 1 };
  assert.equal(beltFrac(b), 0.1);
  assert.equal(isFracCapped(b), true);
  assert.equal(isFracCapped(defaultState().belt1), false);
});

test('legacy f1 link migrates to mass', () => {
  const s = decodeHash('f1=2e-5&r1i=80&r1o=80');
  assert.ok(Math.abs(beltFrac(s.belt1) / 2e-5 - 1) < 1e-3);
  assert.equal(s.mode, 'simple');
  assert.equal(decodeHash('m1=1e-3&f1=0.5').belt1.M, 1e-3);
});

test('bands default on and do not force advanced', () => {
  assert.equal(decodeHash('').bands, true);
  assert.equal(decodeHash('bd=0').bands, false);
});

test('hash round-trips the new fields', () => {
  const s = advanced();
  s.star.d = 2500;
  const back = decodeHash(encodeHash(s));
  assert.deepEqual(back.ism, s.ism);
  assert.equal(back.holdBrightness, true);
  assert.equal(back.star.d, 2500);
  assert.equal(back.belt1.M, 3e-3);
  assert.equal(back.belt2.M, 2e-6);
});

test('free params count A_V only when unlinked', () => {
  assert.equal(countFreeParams(defaultState()), 5);
  assert.equal(countFreeParams(setLinked(defaultState(), false)), 6);
});
