// Survey bands overlaid on the plot. lamUm is the isophotal/effective
// wavelength, widthUm an approximate full width, both in micrometres.
// Sources (values rounded; check against them before classroom use):
//   2MASS: Cohen et al. 2003, AJ 126, 1090 (J 1.235, H 1.662, Ks 2.159 um)
//   AllWISE: Wright et al. 2010, AJ 140, 1868; Jarrett et al. 2011, ApJ 735, 112
//   IRAC: Fazio et al. 2004, ApJS 154, 10 (Spitzer IRAC instrument handbook)
//   MIPS: Rieke et al. 2004, ApJS 154, 25 (Spitzer MIPS instrument handbook)
// Bands are sampled at lamUm, not integrated over filter curves.
export const BAND_GROUPS = ['2MASS', 'AllWISE', 'IRAC', 'MIPS'];

export const BANDS = [
  { id: '2MASS J', label: 'J', lamUm: 1.235, widthUm: 0.162, group: '2MASS' },
  { id: '2MASS H', label: 'H', lamUm: 1.662, widthUm: 0.251, group: '2MASS' },
  { id: '2MASS Ks', label: 'Ks', lamUm: 2.159, widthUm: 0.262, group: '2MASS' },
  { id: 'IRAC 3.6', label: '3.6', lamUm: 3.550, widthUm: 0.750, group: 'IRAC' },
  { id: 'WISE W1', label: 'W1', lamUm: 3.353, widthUm: 0.663, group: 'AllWISE' },
  { id: 'IRAC 4.5', label: '4.5', lamUm: 4.493, widthUm: 1.015, group: 'IRAC' },
  { id: 'WISE W2', label: 'W2', lamUm: 4.603, widthUm: 1.042, group: 'AllWISE' },
  { id: 'IRAC 5.8', label: '5.8', lamUm: 5.731, widthUm: 1.425, group: 'IRAC' },
  { id: 'IRAC 8.0', label: '8.0', lamUm: 7.872, widthUm: 2.905, group: 'IRAC' },
  { id: 'WISE W3', label: 'W3', lamUm: 11.56, widthUm: 5.506, group: 'AllWISE' },
  { id: 'WISE W4', label: 'W4', lamUm: 22.08, widthUm: 4.101, group: 'AllWISE' },
  { id: 'MIPS 24', label: '24', lamUm: 23.68, widthUm: 5.3, group: 'MIPS' },
  { id: 'MIPS 70', label: '70', lamUm: 71.42, widthUm: 19.0, group: 'MIPS' },
  { id: 'MIPS 160', label: '160', lamUm: 155.9, widthUm: 35.0, group: 'MIPS' },
].sort((a, b) => a.lamUm - b.lamUm);

export function bandById(id) {
  const b = BANDS.find((x) => x.id === id);
  if (!b) throw new Error(`unknown band: ${id}`);
  return b;
}

// Survey a photometry point belongs to: the group of the band whose centre is
// nearest, provided the point lies within that band (half its width, at least
// 5% of its wavelength); otherwise 'Other'.
export function surveyForLam(lamUm) {
  let best = null;
  for (const b of BANDS) {
    const d = Math.abs(lamUm - b.lamUm);
    if (d <= Math.max(b.widthUm / 2, 0.05 * b.lamUm) && (!best || d < best.d)) best = { d, group: b.group };
  }
  return best ? best.group : 'Other';
}
