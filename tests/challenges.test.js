import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, CHALLENGES, syntheticPhotometry, startState, freeControlIds, compareValues,
} from '../js/challenges.js';
import { defaultState, hasAdvancedPhysics, toPhysicsParams } from '../js/model.js';
import { totalModel, chi2 } from '../js/physics.js';
import { BANDS } from '../js/bands.js';
import { beltFrac } from '../js/model.js';

const byId = (id) => CHALLENGES.find((c) => c.id === id);

test('five challenges in the v2 order', () => {
  assert.deepEqual(CHALLENGES.map((c) => c.id), ['bare-star', 'reddened-star', 'find-dust', 'star-and-dust', 'two-belts']);
  assert.deepEqual(CHALLENGES.map((c) => c.mode), ['simple', 'simple', 'simple', 'simple', 'advanced']);
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

test('synthetic photometry: 14 points (one per band), positive, with 7% errors', () => {
  const hidden = byId('star-and-dust').makeHidden(mulberry32(7));
  const pts = syntheticPhotometry(hidden, mulberry32(8));
  assert.equal(pts.length, 14);
  assert.deepEqual(pts.map((p) => p.lamUm), BANDS.map((b) => b.lamUm));
  for (const p of pts) {
    assert.ok(p.fLam > 0);
    assert.ok(Math.abs(p.errFlam / p.fLam - 0.07) < 1e-12);
  }
});

test('student starting at the hidden values gets reduced chi2 near N/dof (0.3-5) for the star-and-dust challenge', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const hidden = byId('star-and-dust').makeHidden(mulberry32(seed));
    const pts = syntheticPhotometry(hidden, mulberry32(seed + 100));
    const m = totalModel(toPhysicsParams(hidden));
    const r = chi2(pts, m.grid, m.total, 5);
    assert.ok(r.reduced > 0.3 && r.reduced < 5, `seed ${seed}: ${r.reduced}`);
  }
});

test('challenges 1-3 stay inside simple mode and challenge 1 has no dust', () => {
  for (const id of ['bare-star', 'reddened-star', 'find-dust', 'star-and-dust']) {
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

test('challenge 5 is fixed across seeds, advanced, and gives f of about 3e-4 and 1.5e-4', () => {
  const a = byId('two-belts').makeHidden(mulberry32(1));
  const b = byId('two-belts').makeHidden(mulberry32(999));
  assert.deepEqual(a, b);
  assert.equal(a.mode, 'advanced');
  assert.equal(a.belt2.on, true);
  assert.ok(Math.abs(beltFrac(a.belt1) / 3e-4 - 1) < 0.01);
  assert.ok(Math.abs(beltFrac(a.belt2) / 1.5e-4 - 1) < 0.01);
});

test('reddened star: hidden ranges', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const h = byId('reddened-star').makeHidden(mulberry32(seed));
    assert.ok(h.star.T >= 4000 && h.star.T <= 9000);
    assert.ok(h.star.R >= 0.8 && h.star.R <= 2.5);
    assert.equal(h.star.d, 50);
    assert.ok(h.ism.Av >= 1 && h.ism.Av <= 5);
    assert.equal(h.ism.linked, false);
    assert.equal(h.belt1.on, false);
  }
});

test('reddened star is solvable: noiseless chi2 minimum lands near the truth', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const hidden = byId('reddened-star').makeHidden(mulberry32(seed));
    const pts = syntheticPhotometry(hidden, mulberry32(seed + 50), 0);
    let best = { c: Infinity };
    for (let k = 70; k <= 130; k++) {
      for (let a = 0; a <= 120; a++) {
        const st = { ...hidden, star: { ...hidden.star, T: hidden.star.T * k / 100 }, ism: { linked: false, Av: a * 0.05 } };
        const m = totalModel(toPhysicsParams(st));
        const c = chi2(pts, m.grid, m.total, 2).chi2;
        if (c < best.c) best = { c, T: st.star.T, Av: st.ism.Av };
      }
    }
    assert.ok(Math.abs(best.T / hidden.star.T - 1) < 0.03, `seed ${seed} T ${best.T} vs ${hidden.star.T}`);
    assert.ok(Math.abs(best.Av - hidden.ism.Av) < 0.2, `seed ${seed} Av ${best.Av} vs ${hidden.ism.Av}`);
  }
});

test('find-dust radius stays within 5-100 AU', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const r = byId('find-dust').makeHidden(mulberry32(seed)).belt1.rIn;
    assert.ok(r >= 5 && r <= 100, `${r}`);
  }
});

test('startState turns hold-brightness off', () => {
  const ch = byId('find-dust');
  const hidden = { ...ch.makeHidden(mulberry32(1)), holdBrightness: true };
  assert.equal(startState(ch, hidden).holdBrightness, false);
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
  for (const id of ['b1in', 'b1out', 'b2in', 'b2out', 'M', 'b2M']) assert.ok(four.has(id), id);
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

test('no challenge frees R, d and the belt distance together (the SED is degenerate under scaling all three)', () => {
  for (const c of CHALLENGES) {
    const all = ['star.R', 'star.d', 'belt1.r'].every((p) => c.free.includes(p));
    assert.equal(all, false, c.id);
  }
});

function perturb(state, path) {
  const s = JSON.parse(JSON.stringify(state));
  switch (path) {
    case 'star.T': s.star.T *= 1.4; break;
    case 'star.R': s.star.R *= 1.4; break;
    case 'star.d': s.star.d *= 1.4; break;
    case 'belt1.r': s.belt1.rIn *= 1.6; s.belt1.rOut *= 1.6; break;
    case 'belt1.M': s.belt1.M *= 1.6; break;
    case 'ism.Av': s.ism.Av += 1.0; break;
    case 'belt2.r': s.belt2.rIn *= 1.6; s.belt2.rOut *= 1.6; break;
    case 'belt2.M': s.belt2.M *= 1.6; break;
    default: throw new Error(path);
  }
  return s;
}

test('every free parameter is identifiable: moving it alone makes chi2 clearly worse', () => {
  for (const c of CHALLENGES) {
    const hidden = c.makeHidden(mulberry32(11));
    const pts = syntheticPhotometry(hidden, mulberry32(12));
    const score = (st) => {
      const m = totalModel(toPhysicsParams(st));
      return chi2(pts, m.grid, m.total, c.free.length).chi2;
    };
    const base = score(hidden);
    for (const path of c.free) {
      const worse = score(perturb(hidden, path));
      assert.ok(worse > base + 15, `${c.id} ${path}: ${base} -> ${worse}`);
    }
  }
});

test('challenge 3 keeps the distance fixed at 10 pc', () => {
  const c = byId('star-and-dust');
  assert.equal(c.free.includes('star.d'), false);
  assert.equal(c.makeHidden(mulberry32(5)).star.d, 10);
});

test('challenge 4 prompt says which belt is which', () => {
  assert.match(byId('two-belts').prompt, /belt 1.*(warm|inner)/i);
});
