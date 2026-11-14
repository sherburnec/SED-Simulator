import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, applyPreset } from '../js/presets.js';
import { normalizeState, hasAdvancedPhysics, toPhysicsParams, beltFrac } from '../js/model.js';
import { luminosity, dustTemp } from '../js/physics.js';

test('there are the six spec presets', () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ['sun', 'vega', 'fomalhaut', 'beta-pic', 'eps-eri', 'hr8799']);
});

test('every preset has at least one citation and a 2-3 sentence description', () => {
  for (const p of PRESETS) {
    assert.ok(p.citations.length >= 1, `${p.id} citations`);
    for (const c of p.citations) assert.ok(c.length > 10, `${p.id} citation text`);
    const sentences = p.description.split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.ok(sentences.length >= 2 && sentences.length <= 3, `${p.id}: ${sentences.length} sentences`);
  }
});

test('every preset records which values are unconfirmed', () => {
  for (const p of PRESETS) assert.ok(Array.isArray(p.unverified), p.id);
});

test('every belt hits its target dust temperature within 5%', () => {
  for (const p of PRESETS) {
    const s = applyPreset(p.id);
    const L = luminosity(s.star.T, s.star.R);
    const radii = [];
    if (s.belt1.on) radii.push(s.belt1.rIn);
    if (s.belt2.on) radii.push(s.belt2.rIn);
    assert.equal(radii.length, p.targetDustTemps.length, p.id);
    radii.forEach((r, i) => {
      const T = dustTemp(L, r);
      assert.ok(Math.abs(T / p.targetDustTemps[i] - 1) < 0.05, `${p.id}: ${T} vs ${p.targetDustTemps[i]}`);
    });
  }
});

test('HR 8799 uses belt 2 and opens in advanced mode', () => {
  const s = applyPreset('hr8799');
  assert.equal(s.belt2.on, true);
  assert.equal(s.mode, 'advanced');
});

test('simple-mode presets contain no advanced physics', () => {
  for (const p of PRESETS) {
    const s = applyPreset(p.id);
    if (s.mode === 'simple') assert.equal(hasAdvancedPhysics(s), false, p.id);
    assert.equal(s.mode === 'advanced', hasAdvancedPhysics(s), p.id);
  }
});

test('Sun preset has no dust belt', () => {
  const s = applyPreset('sun');
  assert.equal(s.belt1.on, false);
  assert.equal(toPhysicsParams(s).belts.length, 0);
});

test('all preset states survive normalizeState unchanged (inside slider ranges)', () => {
  for (const p of PRESETS) {
    const s = applyPreset(p.id);
    assert.deepEqual(normalizeState(s), s, p.id);
  }
});

test('unknown preset id throws', () => {
  assert.throws(() => applyPreset('nope'));
});

test('Vega luminosity is close to the literature value of about 40 Lsun', () => {
  const s = applyPreset('vega');
  const L = luminosity(s.star.T, s.star.R);
  assert.ok(L > 35 && L < 50, `L ${L}`);
});

test('epsilon Eridani fractional luminosity is flagged unverified', () => {
  assert.ok(PRESETS.find((p) => p.id === 'eps-eri').unverified.some((u) => /^f\b/.test(u)));
});

test('citations say they are second-hand where no primary paper was opened', () => {
  for (const p of PRESETS) {
    if (p.id === 'sun') continue;
    assert.ok(p.citations.every((c) => /quoted|search|not opened|context/i.test(c)), p.id);
  }
});

test('preset f survives the mass conversion', () => {
  for (const p of PRESETS) {
    const s = applyPreset(p.id);
    const belts = [s.belt1, s.belt2].filter((b) => b.on);
    belts.forEach((b, i) => {
      assert.ok(Math.abs(beltFrac(b) / p.def.belts[i].f - 1) < 0.005, `${p.id} belt ${i}`);
    });
  }
});

test('presets link extinction and keep hold-brightness off', () => {
  for (const p of PRESETS) {
    const s = applyPreset(p.id);
    assert.equal(s.ism.linked, true, p.id);
    assert.equal(s.holdBrightness, false, p.id);
  }
});
