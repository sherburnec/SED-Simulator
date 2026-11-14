import test from 'node:test';
import assert from 'node:assert/strict';
import { equations } from '../js/equations.js';
import { defaultState } from '../js/model.js';

const find = (list, id) => list.find((e) => e.id === id);

test('dust temperature equation substitutes current values', () => {
  const tex = find(equations(defaultState()), 'dustTemp').tex;
  assert.match(tex, /= 44\.0\\,\\mathrm\{K\}$/); // Sun, 40 AU: 278.3 * 40^-1/2 = 44.0 K
  assert.ok(tex.includes('(40.0)^{-1/2}'));
});

test('luminosity and Wien equations give the Sun values', () => {
  const eqs = equations(defaultState());
  assert.match(find(eqs, 'luminosity').tex, /= 1\.00\\,L_\\odot$/);
  assert.ok(find(eqs, 'wien').tex.includes('0.502'));
});

test('emissivity equation only in advanced', () => {
  const s = defaultState();
  assert.equal(find(equations(s), 'emissivity'), undefined);
  s.mode = 'advanced';
  s.belt1.beta = 1.5;
  const e = find(equations(s), 'emissivity');
  assert.ok(e);
  assert.ok(e.tex.includes('1.50'));
});

test('dust equations follow the belts that are on', () => {
  const s = defaultState();
  s.belt1.on = false;
  assert.equal(find(equations(s), 'dustTemp'), undefined);
  assert.equal(find(equations(s), 'beltNorm'), undefined);
  s.mode = 'advanced';
  s.belt2.on = true;
  assert.ok(find(equations(s), 'dustTemp2'));
});

test('extended belt shows the temperature range', () => {
  const s = defaultState();
  s.mode = 'advanced';
  s.belt1.rIn = 4;
  s.belt1.rOut = 16;
  const tex = find(equations(s), 'dustTemp').tex;
  assert.ok(tex.includes('139') && tex.includes('69.6'));
});

test('each equation lists the sliders that change it, using visible slider ids', () => {
  const simple = equations(defaultState());
  for (const e of simple) assert.ok(e.controls.length > 0, e.id);
  assert.ok(find(simple, 'dustTemp').controls.includes('r'));
  const s = defaultState();
  s.mode = 'advanced';
  const adv = equations(s);
  assert.ok(find(adv, 'dustTemp').controls.includes('b1in'));
  assert.ok(!find(adv, 'dustTemp').controls.includes('r'));
});

test('small and large numbers use scientific notation in TeX', () => {
  const tex = find(equations(defaultState()), 'beltNorm').tex;
  assert.match(tex, /\\times ?10\^\{-?\d+\}/);
});

test('dust temperature formula shows the same 278.3 K coefficient it computes with', () => {
  assert.ok(find(equations(defaultState()), 'dustTemp').tex.includes('278.3'));
});
