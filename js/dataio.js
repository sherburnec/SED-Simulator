// CSV import of student photometry and CSV export of the model. Pure, no DOM.
import { toFlamCgs, convertFlux } from './physics.js';

const MIN_UM = 0.05;
const MAX_UM = 3000;

const UNIT_LABELS = {
  lamFlam: 'lambda*F_lambda (erg s^-1 cm^-2)',
  Fnu: 'F_nu (Jy)',
  Flam: 'F_lambda (erg s^-1 cm^-2 um^-1)',
};

// Parse delimited text with columns wavelength_um, flux and optional flux_err
// (any order, case-insensitive; units like "flux (Jy)" in the header are
// ignored). Accepts comma, semicolon or tab delimiters, quoted cells, CRLF / LF
// / CR line endings, leading '#' comment lines, and decimal commas when the
// delimiter is not a comma. `unit` is the unit of the flux columns. Returns
// points as { lamUm, fLam, errFlam|null } in F_lambda cgs (a missing or zero
// error is null), plus per-row errors { row (1-based file line), message }.
export function parseCsv(text, unit) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const points = [];
  const errors = [];
  const skip = (l) => l.trim() === '' || l.trim().startsWith('#');

  const headerIdx = lines.findIndex((l) => !skip(l));
  if (headerIdx < 0) {
    return { points, errors: [{ row: 1, message: 'The file is empty.' }] };
  }
  const delim = detectDelimiter(lines[headerIdx]);
  const split = (line) => line.split(delim).map(unquote);
  const rawHeader = split(lines[headerIdx]);
  const header = rawHeader.map((h) => h.replace(/[([].*$/, '').trim().toLowerCase());
  const iLam = header.indexOf('wavelength_um');
  const iFlux = header.indexOf('flux');
  const iErr = header.indexOf('flux_err');
  if (iLam < 0 || iFlux < 0) {
    return {
      points,
      errors: [{
        row: headerIdx + 1,
        message: 'The header row must contain the columns wavelength_um and flux '
          + `(flux_err is optional). Found columns: ${rawHeader.join(', ')}.`,
      }],
    };
  }
  const decimalComma = delim !== ',';

  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (skip(lines[i])) continue;
    const row = i + 1;
    const cells = split(lines[i]);
    const lamUm = toNumber(cells[iLam], decimalComma);
    const flux = toNumber(cells[iFlux], decimalComma);
    if (lamUm === null) { errors.push({ row, message: 'wavelength_um is not a number.' }); continue; }
    if (flux === null) { errors.push({ row, message: 'flux is not a number.' }); continue; }
    if (!(lamUm >= MIN_UM && lamUm <= MAX_UM)) {
      errors.push({ row, message: `wavelength ${lamUm} um is outside the model's ${MIN_UM}-${MAX_UM} um range.` });
      continue;
    }
    if (!(flux > 0)) {
      errors.push({ row, message: 'flux must be positive (it is plotted on a log axis).' });
      continue;
    }
    let errFlam = null;
    if (iErr >= 0 && cells[iErr] !== undefined && cells[iErr] !== '') {
      const err = toNumber(cells[iErr], decimalComma);
      if (err === null) { errors.push({ row, message: 'flux_err is not a number.' }); continue; }
      if (err < 0) { errors.push({ row, message: 'flux_err must not be negative.' }); continue; }
      if (err > 0) errFlam = toFlamCgs(lamUm, err, unit);
    }
    points.push({ lamUm, fLam: toFlamCgs(lamUm, flux, unit), errFlam });
  }

  if (points.length === 0 && errors.length === 0) {
    errors.push({ row: headerIdx + 1, message: 'The file has a header but no data rows.' });
  }
  return { points, errors };
}

// Pick the delimiter that appears most often in the header line.
function detectDelimiter(headerLine) {
  let best = ',';
  let bestCount = 0;
  for (const d of [',', ';', '\t']) {
    const n = headerLine.split(d).length - 1;
    if (n > bestCount) { best = d; bestCount = n; }
  }
  return best;
}

const unquote = (s) => s.trim().replace(/^"(.*)"$/, '$1').trim();

function toNumber(s, decimalComma = false) {
  if (s === undefined || s === '') return null;
  const v = Number(decimalComma ? s.replace(',', '.') : s);
  return Number.isFinite(v) ? v : null;
}

// model = totalModel() result. Columns are converted to `unit`; belt columns
// are empty when that belt does not exist.
// opts.belt1On / opts.belt2On say which belt each entry of model.belts is
// (model.belts holds only the belts that are on, belt 1 first).
export function modelToCsv(model, unit, opts = {}) {
  const n = model.belts.length;
  const belt1On = opts.belt1On ?? n >= 1;
  const belt2On = opts.belt2On ?? n >= 2;
  const belt1 = belt1On ? model.belts[0] : undefined;
  const belt2 = belt2On ? model.belts[belt1On ? 1 : 0] : undefined;
  const out = [`# unit: ${UNIT_LABELS[unit] ?? unit}`, 'wavelength_um,star,belt1,belt2,total'];
  const { grid, star, total } = model;
  const cell = (arr, i) => (arr ? String(convertFlux(grid[i], arr[i], unit)) : '');
  for (let i = 0; i < grid.length; i++) {
    out.push([String(grid[i]), cell(star, i), cell(belt1, i), cell(belt2, i), cell(total, i)].join(','));
  }
  return out.join('\n') + '\n';
}
