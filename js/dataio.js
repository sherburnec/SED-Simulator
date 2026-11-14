// CSV import of student photometry and CSV export of the model. Pure, no DOM.
import { toFlamCgs, convertFlux } from './physics.js';

const MIN_UM = 0.05;
const MAX_UM = 3000;

const UNIT_LABELS = {
  lamFlam: 'lambda*F_lambda (erg s^-1 cm^-2)',
  Fnu: 'F_nu (Jy)',
  Flam: 'F_lambda (erg s^-1 cm^-2 um^-1)',
};

// Parse CSV text with columns wavelength_um, flux and optional flux_err
// (any order, case-insensitive header, CRLF or LF). `unit` is the unit of the
// flux columns. Returns points as { lamUm, fLam, errFlam|null } in F_lambda
// cgs, plus per-row errors { row (1-based file line), message }.
export function parseCsv(text, unit) {
  const lines = String(text).split(/\r?\n/);
  const points = [];
  const errors = [];

  let headerIdx = lines.findIndex((l) => l.trim() !== '');
  if (headerIdx < 0) {
    return { points, errors: [{ row: 1, message: 'The file is empty.' }] };
  }
  const header = lines[headerIdx].split(',').map((s) => s.trim().toLowerCase());
  const iLam = header.indexOf('wavelength_um');
  const iFlux = header.indexOf('flux');
  const iErr = header.indexOf('flux_err');
  if (iLam < 0 || iFlux < 0) {
    return {
      points,
      errors: [{
        row: headerIdx + 1,
        message: 'The header row must contain the columns wavelength_um and flux (flux_err is optional).',
      }],
    };
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const row = i + 1;
    const cells = lines[i].split(',').map((s) => s.trim());
    const lamUm = toNumber(cells[iLam]);
    const flux = toNumber(cells[iFlux]);
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
      const err = toNumber(cells[iErr]);
      if (err === null) { errors.push({ row, message: 'flux_err is not a number.' }); continue; }
      if (err < 0) { errors.push({ row, message: 'flux_err must not be negative.' }); continue; }
      errFlam = toFlamCgs(lamUm, err, unit);
    }
    points.push({ lamUm, fLam: toFlamCgs(lamUm, flux, unit), errFlam });
  }

  if (points.length === 0 && errors.length === 0) {
    errors.push({ row: headerIdx + 1, message: 'The file has a header but no data rows.' });
  }
  return { points, errors };
}

function toNumber(s) {
  if (s === undefined || s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

// model = totalModel() result. Columns are converted to `unit`; belt columns
// are empty when that belt does not exist.
export function modelToCsv(model, unit) {
  const out = [`# unit: ${UNIT_LABELS[unit] ?? unit}`, 'wavelength_um,star,belt1,belt2,total'];
  const { grid, star, belts, total } = model;
  const cell = (arr, i) => (arr ? String(convertFlux(grid[i], arr[i], unit)) : '');
  for (let i = 0; i < grid.length; i++) {
    out.push([String(grid[i]), cell(star, i), cell(belts[0], i), cell(belts[1], i), cell(total, i)].join(','));
  }
  return out.join('\n') + '\n';
}
