// Gnomonic (TAN) projection matching backend common grid: north up, east left,
// pixel scale s [arcsec], 0-based pixel centre at (n-1)/2.  Calabretta & Greisen (2002).
const D2R = Math.PI / 180;

export function pixToWorld(x: number, y: number, ra0: number, dec0: number, n: number, s: number): [number, number] {
  const c = (n - 1) / 2;
  const xi = -(x - c) * s / 3600 * D2R;
  const eta = (y - c) * s / 3600 * D2R;
  const d0 = dec0 * D2R;
  const den = Math.cos(d0) - eta * Math.sin(d0);
  const ra = ra0 + Math.atan2(xi, den) / D2R;
  const dec = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(xi, den)) / D2R;
  return [(ra + 360) % 360, dec];
}

export function worldToPix(ra: number, dec: number, ra0: number, dec0: number, n: number, s: number): [number, number] {
  const c = (n - 1) / 2;
  const a = ra * D2R, d = dec * D2R, a0 = ra0 * D2R, d0 = dec0 * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  const xi = Math.cos(d) * Math.sin(a - a0) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
  return [c - xi / D2R * 3600 / s, c + eta / D2R * 3600 / s];
}

/** Linear proper-motion propagation (pmra = mu_alpha cos(delta), mas/yr). */
export function propagate(ra: number, dec: number, pmra: number, pmdec: number, dtYr: number): [number, number] {
  return [ra + (pmra * dtYr) / 3.6e6 / Math.max(1e-6, Math.cos(dec * D2R)), dec + (pmdec * dtYr) / 3.6e6];
}

export function mjdToJyear(mjd: number): number { return 2000 + (mjd - 51544.5) / 365.25; }
export function mjdToDate(mjd: number): Date { return new Date((mjd - 40587) * 86400000); }

export function fmtRA(ra: number): string {
  const h = ra / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), ss = (m - mm) * 60;
  return `${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m${ss.toFixed(2).padStart(5, "0")}s`;
}
export function fmtDec(dec: number): string {
  const s = dec < 0 ? "-" : "+", a = Math.abs(dec), d = Math.floor(a), m = (a - d) * 60, mm = Math.floor(m), ss = (m - mm) * 60;
  return `${s}${String(d).padStart(2, "0")}°${String(mm).padStart(2, "0")}′${ss.toFixed(1).padStart(4, "0")}″`;
}
