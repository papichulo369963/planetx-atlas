// Image math done in the browser: background subtraction, stretches, sums, differences,
// centroid and aperture photometry. Units of input arrays: MJy/sr.
export type Stretch = "asinh" | "linear" | "sqrt" | "log";

export function median(a: ArrayLike<number>): number {
  const v: number[] = [];
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i])) v.push(a[i]);
  if (!v.length) return 0;
  v.sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)];
}

export function percentile(a: ArrayLike<number>, p: number): number {
  const v: number[] = [];
  for (let i = 0; i < a.length; i += Math.max(1, Math.floor(a.length / 20000))) if (Number.isFinite(a[i])) v.push(a[i]);
  if (!v.length) return 0;
  v.sort((x, y) => x - y);
  return v[Math.min(v.length - 1, Math.max(0, Math.floor((p / 100) * (v.length - 1))))];
}

/** Subtract the median sky level (removes zodiacal-light differences between visits). */
export function bgSub(img: Float32Array): Float32Array {
  const m = median(img);
  const out = new Float32Array(img.length);
  for (let i = 0; i < img.length; i++) out[i] = img[i] - m;
  return out;
}

export function combine(imgs: Float32Array[], mode: "sum" | "mean"): Float32Array {
  const n = imgs[0].length;
  const out = new Float32Array(n);
  const cnt = new Uint16Array(n);
  for (const im of imgs) for (let i = 0; i < n; i++) if (Number.isFinite(im[i])) { out[i] += im[i]; cnt[i]++; }
  for (let i = 0; i < n; i++) out[i] = cnt[i] ? (mode === "mean" ? out[i] / cnt[i] : out[i]) : NaN;
  return out;
}

export function diff(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = b[i] - a[i];
  return out;
}

function stretchVal(t: number, s: Stretch): number {
  t = Math.min(1, Math.max(0, t));
  switch (s) {
    case "linear": return t;
    case "sqrt": return Math.sqrt(t);
    case "log": return Math.log10(1 + 999 * t) / 3;
    default: return Math.asinh(10 * t) / Math.asinh(10);
  }
}

/** Grayscale (or diverging for differences) RGBA rendering. Row 0 of the data is south (FITS order). */
export function renderRGBA(img: Float32Array, n: number, lo: number, hi: number, s: Stretch,
  diverging = false, bad?: Uint8Array, showBad = false): ImageData {
  const out = new ImageData(n, n);
  const span = hi - lo || 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const src = (n - 1 - y) * n + x; // flip so north is up on screen
      const v = img[src];
      const o = (y * n + x) * 4;
      if (!Number.isFinite(v)) { out.data[o] = 20; out.data[o + 1] = 10; out.data[o + 2] = 30; out.data[o + 3] = 255; continue; }
      if (diverging) {
        const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
        const t = Math.max(-1, Math.min(1, v / m));
        const k = stretchVal(Math.abs(t), s);
        out.data[o] = t > 0 ? 255 * k : 0; out.data[o + 1] = 30 * k; out.data[o + 2] = t < 0 ? 255 * k : 0;
      } else {
        const g = 255 * stretchVal((v - lo) / span, s);
        out.data[o] = g; out.data[o + 1] = g; out.data[o + 2] = g;
      }
      if (showBad && bad && bad[src]) { out.data[o] = 255; out.data[o + 1] = 60; out.data[o + 2] = 160; }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Flux-weighted centroid in a (2h+1)^2 box, data coordinates (x right, y north). */
export function centroid(img: Float32Array, n: number, x0: number, y0: number, h = 3): { x: number; y: number } | null {
  const xi = Math.round(x0), yi = Math.round(y0);
  if (xi < h || yi < h || xi >= n - h || yi >= n - h) return null;
  const ring: number[] = [];
  for (let y = Math.max(0, yi - 3 * h); y <= Math.min(n - 1, yi + 3 * h); y++)
    for (let x = Math.max(0, xi - 3 * h); x <= Math.min(n - 1, xi + 3 * h); x++) ring.push(img[y * n + x]);
  const bg = median(ring);
  let sx = 0, sy = 0, sw = 0;
  for (let y = yi - h; y <= yi + h; y++) for (let x = xi - h; x <= xi + h; x++) {
    const w = img[y * n + x] - bg;
    if (Number.isFinite(w) && w > 0) { sx += w * x; sy += w * y; sw += w; }
  }
  return sw > 0 ? { x: sx / sw, y: sy / sw } : null;
}

/** Aperture photometry: r=2 px, annulus 4-7 px. Returns mJy given pixel scale [arcsec]. */
export function aperture(img: Float32Array, n: number, x: number, y: number, pixArcsec: number, r = 2): number | null {
  const ann: number[] = [];
  let sum = 0, cnt = 0;
  for (let j = Math.max(0, Math.floor(y - 8)); j <= Math.min(n - 1, Math.ceil(y + 8)); j++)
    for (let i = Math.max(0, Math.floor(x - 8)); i <= Math.min(n - 1, Math.ceil(x + 8)); i++) {
      const d = Math.hypot(i - x, j - y), v = img[j * n + i];
      if (!Number.isFinite(v)) continue;
      if (d <= r) { sum += v; cnt++; } else if (d >= 4 && d <= 7) ann.push(v);
    }
  if (!cnt || !ann.length) return null;
  const omega = (pixArcsec / 206264.806) ** 2;
  return (sum - cnt * median(ann)) * omega * 1e9;
}
