import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, modelToCsv } from '../js/dataio.js';
import { totalModel, CONST } from '../js/physics.js';

test('parses CRLF file with spaces, blank trailing lines, optional err column', () => {
  const r = parseCsv('wavelength_um, flux, flux_err\r\n 24 , 0.5 , 0.05\r\n70,0.8,\r\n\r\n', 'Fnu');
  assert.equal(r.points.length, 2);
  assert.equal(r.points[1].errFlam, null);
  assert.ok(r.points[0].errFlam > 0);
  assert.deepEqual(r.errors, []);
});

test('reports bad rows by file line and keeps good rows', () => {
  const r = parseCsv('wavelength_um,flux\n24,abc\n70,-1\n5000,1\n100,2', 'Fnu');
  assert.equal(r.points.length, 1);
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3, 4]);
  assert.match(r.errors[0].message, /number/i);
  assert.match(r.errors[1].message, /positive/i);
  assert.match(r.errors[2].message, /0\.05.*3000/);
});

test('negative error value is reported', () => {
  const r = parseCsv('wavelength_um,flux,flux_err\n24,1,-0.1', 'Fnu');
  assert.equal(r.points.length, 0);
  assert.equal(r.errors[0].row, 2);
});

test('missing header column is a single clear error', () => {
  const r = parseCsv('lambda,jy\n24,1\n70,2', 'Fnu');
  assert.deepEqual(r.points, []);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /wavelength_um/);
});

test('file with no valid rows returns no points and an error', () => {
  const r = parseCsv('wavelength_um,flux\n', 'Fnu');
  assert.deepEqual(r.points, []);
  assert.ok(r.errors.length >= 1);
});

test('header is case-insensitive and column order is free', () => {
  const r = parseCsv('FLUX, Wavelength_UM\n1,24', 'Flam');
  assert.equal(r.points.length, 1);
  assert.equal(r.points[0].lamUm, 24);
});

test('Jy input converts to F_lambda cgs', () => {
  const r = parseCsv('wavelength_um,flux,flux_err\n100,1,0.1', 'Fnu');
  const lam = 100 * CONST.um;
  const expected = 1e-23 * CONST.c / (lam * lam);
  assert.ok(Math.abs(r.points[0].fLam / expected - 1) < 1e-12);
  assert.ok(Math.abs(r.points[0].errFlam / (0.1 * expected) - 1) < 1e-12);
});

test('modelToCsv has unit comment, header and 500 rows', () => {
  const m = totalModel({ star: { T: 5772, R: 1, d: 10 }, belts: [] });
  const lines = modelToCsv(m, 'Fnu').trim().split('\n');
  assert.match(lines[0], /^# unit: /);
  assert.equal(lines[1], 'wavelength_um,star,belt1,belt2,total');
  assert.equal(lines.length, 2 + 500);
  assert.ok(lines[2].endsWith(',') === false);
  assert.equal(lines[2].split(',').length, 5);
});
