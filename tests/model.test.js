import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGES, defaultState, setBeltDistance, normalizeState, hasAdvancedPhysics,
  toSimple, toPhysicsParams, countFreeParams, encodeHash, decodeHash,
} from '../js/model.js';

const advanced = () => {
  const s = defaultState();
  s.mode = 'advanced';
  s.star = { T: 9600, R: 2.7, d: 7.7 };
  s.belt1 = { on: true, rIn: 10, rOut: 100, f: 3e-4, lambda0: 120, beta: 1.5 };
  s.belt2 = { on: true, rIn: 2, rOut: 6, f: 2e-5, lambda0: 50, beta: 0.5 };
  s.unit = 'Fnu';
  s.bands = true;
  return s;
};

test('defaults match the spec', () => {
  const s = defaultState();
  assert.deepEqual(s.star, { T: 5772, R: 1, d: 10 });
  assert.deepEqual(s.belt1, { on: true, rIn: 40, rOut: 40, f: 1e-4, lambda0: 100, beta: 0 });
  assert.equal(s.belt2.on, false);
  assert.equal(s.unit, 'lamFlam');
  assert.equal(s.mode, 'simple');
  assert.deepEqual(RANGES.T, [2500, 40000, 'log']);
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
  assert.equal(decodeHash('f1=5').belt1.f, 1e-2);
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
  assert.equal(decodeHash('bd=1').mode, 'advanced');
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
  assert.equal(s.bands, false);
  assert.equal(s.belt1.f, 3e-4);
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
  s.belt1 = { on: true, rIn: 10, rOut: 100, f: 1e-4, lambda0: 100, beta: 1 };
  assert.equal(countFreeParams(s), 8);
  s.belt2 = { on: true, rIn: 2, rOut: 6, f: 1e-5, lambda0: 100, beta: 1 };
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
