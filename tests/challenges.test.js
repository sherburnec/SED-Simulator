import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, CHALLENGES, syntheticPhotometry, startState, freeControlIds, compareValues,
} from '../js/challenges.js';
import { defaultState, hasAdvancedPhysics, toPhysicsParams } from '../js/model.js';
import { totalModel, chi2 } from '../js/physics.js';

const byId = (id) => CHALLENGES.find((c) => c.id === id);

test('there are five challenges in the spec order', () => {
  assert.equal(CHALLENGES.length, 5);
  assert.deepEqual(CHALLENGES.map((c) => c.mode), ['simple', 'simple', 'simple', 'advanced', 'advanced']);
});

test('seeded rng is deterministic and in [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('synthetic photometry: 17 points (one per unique band wavelength), positive, with 7% errors', () => {
  const hidden = byId('star-and-dust').makeHidden(mulberry32(7));
  const pts = syntheticPhotometry(hidden, mulberry32(8));
  assert.equal(pts.length, 17);
  const lams = pts.map((p) => p.lamUm);
  assert.deepEqual(lams, [...lams].sort((x, y) => x - y));
  assert.equal(new Set(lams).size, 17);
  for (const p of pts) {
    assert.ok(p.fLam > 0);
    assert.ok(Math.abs(p.errFlam / p.fLam - 0.07) < 1e-12);
  }
});

test('student starting at the hidden values gets reduced chi2 near 1 (0.3-3) for challenge 3', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const hidden = byId('star-and-dust').makeHidden(mulberry32(seed));
    const pts = syntheticPhotometry(hidden, mulberry32(seed + 100));
    const m = totalModel(toPhysicsParams(hidden));
    const r = chi2(pts, m.grid, m.total, 5);
    assert.ok(r.reduced > 0.3 && r.reduced < 3, `seed ${seed}: ${r.reduced}`);
  }
});

test('challenges 1-3 stay inside simple mode and challenge 1 has no dust', () => {
  for (const id of ['bare-star', 'find-dust', 'star-and-dust']) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const h = byId(id).makeHidden(mulberry32(seed));
      assert.equal(hasAdvancedPhysics(h), false, `${id} seed ${seed}`);
      assert.equal(h.mode, 'simple');
    }
  }
  assert.equal(byId('bare-star').makeHidden(mulberry32(1)).belt1.on, false);
});

test('challenge 1 randomises T and R inside sensible ranges, distance fixed', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const h = byId('bare-star').makeHidden(mulberry32(seed));
    assert.ok(h.star.T >= 3000 && h.star.T <= 12000);
    assert.ok(h.star.R >= 0.5 && h.star.R <= 5);
    assert.equal(h.star.d, 10);
    seen.add(h.star.T);
  }
  assert.ok(seen.size > 40);
});

test('challenges 4 and 5 are identical across seeds and advanced', () => {
  for (const id of ['two-belts', 'submm-slope']) {
    const a = byId(id).makeHidden(mulberry32(1));
    const b = byId(id).makeHidden(mulberry32(999));
    assert.deepEqual(a, b);
    assert.equal(a.mode, 'advanced');
  }
  assert.equal(byId('two-belts').makeHidden(mulberry32(1)).belt2.on, true);
  assert.ok(byId('submm-slope').makeHidden(mulberry32(1)).belt1.beta > 0);
});

test('startState copies non-free params from hidden and leaves free params at defaults', () => {
  const ch = byId('bare-star');
  const hidden = ch.makeHidden(mulberry32(3));
  const s = startState(ch, hidden);
  const def = defaultState();
  assert.equal(s.star.T, def.star.T);
  assert.equal(s.star.R, def.star.R);
  assert.equal(s.star.d, hidden.star.d);
  assert.equal(s.belt1.on, false);

  const ch2 = byId('find-dust');
  const h2 = ch2.makeHidden(mulberry32(3));
  const s2 = startState(ch2, h2);
  assert.deepEqual(s2.star, h2.star);
  assert.equal(s2.belt1.rIn, def.belt1.rIn);
  assert.equal(s2.belt1.rOut, def.belt1.rOut);
  assert.equal(s2.belt1.f, def.belt1.f);
  assert.equal(s2.mode, 'simple');
});

test('freeControlIds maps free parameters to slider ids', () => {
  assert.deepEqual([...freeControlIds(byId('bare-star'))].sort(), ['R', 'T']);
  const four = freeControlIds(byId('two-belts'));
  for (const id of ['b1in', 'b1out', 'b2in', 'b2out', 'f', 'b2f']) assert.ok(four.has(id), id);
  assert.ok(!four.has('T'));
});

test('compareValues lists true and student values for the free parameters', () => {
  const ch = byId('bare-star');
  const hidden = ch.makeHidden(mulberry32(3));
  const rows = compareValues(ch, hidden, defaultState());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].truth, hidden.star.T);
  assert.equal(rows[0].student, 5772);
});

test('challenge prompts are non-empty', () => {
  for (const c of CHALLENGES) assert.ok(c.prompt.length > 20 && c.title.length > 3);
});
