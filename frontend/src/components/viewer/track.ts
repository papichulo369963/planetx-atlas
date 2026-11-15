// Planet X mode: follow a source through the frames and classify what changes,
// with explicit, displayed criteria. A classification is never a confirmed discovery.
import { aperture, bgSub, centroid } from "../../lib/image";
import { mjdToJyear } from "../../lib/wcs";
import type { DecodedFrame, OverlayPoint } from "../../types";

export interface TrackPoint { i: number; mjd: number; date: string; x: number; y: number; flux: number | null; wl: number; bad: boolean }
export interface TrackResult {
  points: TrackPoint[];
  rate: { value: number; unit: string; err: number; dxPx: number; dyPx: number } | null;
  fluxRatio: number | null;
  verdict: { label: string; tone: string; reasons: string[] };
}

function fit(t: number[], v: number[]): { slope: number; err: number } {
  const n = t.length, tm = t.reduce((a, b) => a + b, 0) / n, vm = v.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let k = 0; k < n; k++) { sxx += (t[k] - tm) ** 2; sxy += (t[k] - tm) * (v[k] - vm); }
  const slope = sxx ? sxy / sxx : 0;
  let ss = 0;
  for (let k = 0; k < n; k++) ss += (v[k] - vm - slope * (t[k] - tm)) ** 2;
  return { slope, err: n > 2 && sxx ? Math.sqrt(ss / (n - 2) / sxx) : Infinity };
}

export function trackSource(frames: DecodedFrame[], n: number, x0: number, y0: number, pix: number, moving: boolean): TrackPoint[] {
  const pts: TrackPoint[] = [];
  let px = x0, py = y0;
  frames.forEach((f, i) => {
    const img = bgSub(f.img);
    const c = centroid(img, n, px, py, moving ? 5 : 3) ?? null;
    if (!c) return;
    const c2 = centroid(img, n, c.x, c.y, 2) ?? c;
    if (moving) { px = c2.x; py = c2.y; } // follow a fast mover
    const xi = Math.round(c2.x), yi = Math.round(c2.y);
    pts.push({ i, mjd: f.mjd, date: f.date_utc, x: c2.x, y: c2.y, flux: aperture(img, n, c2.x, c2.y, pix), wl: f.wavelength_um, bad: !!f.badMask[yi * n + xi] });
  });
  return pts;
}

export function analyse(points: TrackPoint[], pix: number, gaia: OverlayPoint[], asteroids: OverlayPoint[]): TrackResult {
  const reasons: string[] = [];
  let rate: TrackResult["rate"] = null;
  if (points.length >= 3) {
    const span = points[points.length - 1].mjd - points[0].mjd;
    const short = span < 5;
    const t = points.map((p) => (short ? p.mjd * 24 : mjdToJyear(p.mjd)));
    const fx = fit(t, points.map((p) => -p.x * pix)), fy = fit(t, points.map((p) => p.y * pix));
    const v = Math.hypot(fx.slope, fy.slope);
    const dx = (points[points.length - 1].x - points[0].x), dy = (points[points.length - 1].y - points[0].y);
    rate = { value: v, unit: short ? "″/h" : "″/yr", err: Math.hypot(fx.err, fy.err), dxPx: dx, dyPx: dy };
  }
  const fl = points.map((p) => p.flux).filter((f): f is number => f !== null && f > 0);
  const fluxRatio = fl.length >= 3 ? Math.max(...fl) / Math.min(...fl) : null;
  const last = points[points.length - 1];
  const nearAst = last ? asteroids.find((a) => Math.hypot(a.x - last.x, a.y - last.y) < 4) : undefined;
  const nearGaia = points[0] ? gaia.filter((g) => Math.hypot(g.x - points[0].x, g.y - points[0].y) < 2) : [];
  const badFrac = points.length ? points.filter((p) => p.bad).length / points.length : 0;
  const moved = rate ? Math.hypot(rate.dxPx, rate.dyPx) : 0;
  const significant = rate ? rate.value > 3 * rate.err && moved > 0.5 : false;

  reasons.push(`${points.length} frames measured; total displacement ${moved.toFixed(2)} px (${(moved * pix).toFixed(1)}″).`);
  if (rate) reasons.push(`Fitted motion ${rate.value.toFixed(2)} ± ${rate.err.toFixed(2)} ${rate.unit} (criterion: > 3σ and > 0.5 px).`);
  if (fluxRatio) reasons.push(`Max/min flux ratio ${fluxRatio.toFixed(2)} (variability criterion: > 1.5; each frame has a different λ).`);
  if (badFrac > 0.3) reasons.push(`${Math.round(badFrac * 100)}% of the measurements fall on pixels flagged by the pipeline.`);

  let verdict = { label: "No significant change", tone: "slate", reasons };
  if (badFrac > 0.5) verdict = { label: "Probable artifact or bad pixel", tone: "rose", reasons };
  else if (nearAst) verdict = { label: `Known small body: ${nearAst.label} (JPL)`, tone: "sky", reasons: [...reasons, "Matches (< 4 px) the position predicted by JPL Small-Body Identification."] };
  else if (significant && nearGaia.some((g) => Math.hypot(Number(g.extra.pmra ?? 0), Number(g.extra.pmdec ?? 0)) > 100))
    verdict = { label: "Known high proper-motion star (Gaia DR3)", tone: "emerald", reasons: [...reasons, "A Gaia DR3 source lies < 2 px away with proper motion > 100 mas/yr."] };
  else if (significant) verdict = { label: "Unidentified candidate: needs review", tone: "amber", reasons: [...reasons, "No match with known asteroids or high proper-motion Gaia stars. This is not a confirmed discovery."] };
  else if (fluxRatio && fluxRatio > 1.5) verdict = { label: "Possible brightness variability", tone: "violet", reasons };
  return { points, rate, fluxRatio, verdict };
}
