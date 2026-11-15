"""Quantitative checks on SPHEREx series: astrometric motion and photometric variability.

Astrometry: flux-weighted centroid in a (2h+1)^2 box after local median background
subtraction; positions converted to arcsec on the common TAN grid (6.15"/px).
Proper motion estimate: least-squares line x(t), y(t) -> mu [arcsec/yr] with
1-sigma from the residual scatter.  Expected values come from SIMBAD.
Photometry: aperture r=2 px, background annulus 4-7 px (median);
F [mJy] = sum(I [MJy/sr]) * Omega_pix [sr] * 1e9.  Wavelength differs per frame
(linear variable filters), so brightness changes mix time variability and spectrum.
"""
from __future__ import annotations

import base64
import math

import numpy as np
from astropy.time import Time

ARCSEC_PX = 6.15
OMEGA_PIX_SR = (ARCSEC_PX / 206264.806) ** 2


def _arr(b64: str, n: int, dtype=np.float32) -> np.ndarray:
    return np.frombuffer(base64.b64decode(b64), dtype=dtype).reshape(n, n)


def centroid(img: np.ndarray, x0: float, y0: float, h: int = 3) -> tuple[float, float, float] | None:
    n = img.shape[0]
    xi, yi = int(round(x0)), int(round(y0))
    if not (h <= xi < n - h and h <= yi < n - h):
        return None
    box = img[yi - h:yi + h + 1, xi - h:xi + h + 1]
    ring = img[max(0, yi - 3 * h):yi + 3 * h + 1, max(0, xi - 3 * h):xi + 3 * h + 1]
    b = box - np.nanmedian(ring)
    b = np.where(np.isfinite(b) & (b > 0), b, 0)
    if b.sum() <= 0:
        return None
    yy, xx = np.mgrid[yi - h:yi + h + 1, xi - h:xi + h + 1]
    return float((xx * b).sum() / b.sum()), float((yy * b).sum() / b.sum()), float(b.max())


def aperture_flux(img: np.ndarray, x: float, y: float, r: float = 2.0) -> float | None:
    yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    rr = np.hypot(xx - x, yy - y)
    ann = img[(rr >= 4) & (rr <= 7)]
    ap = img[rr <= r]
    if not np.isfinite(ap).any() or not np.isfinite(ann).any():
        return None
    return float(np.nansum(ap - np.nanmedian(ann)) * OMEGA_PIX_SR * 1e9)


def gauss_centroid(img: np.ndarray, x0: float, y0: float, h: int = 3) -> tuple[float, float] | None:
    """Circular 2D Gaussian + constant fitted on a (2h+1)^2 box (robust for undersampled PSFs)."""
    from scipy.optimize import curve_fit
    n = img.shape[0]
    xi, yi = int(round(x0)), int(round(y0))
    if not (h <= xi < n - h and h <= yi < n - h):
        return None
    box = img[yi - h:yi + h + 1, xi - h:xi + h + 1].astype(float)
    yy, xx = np.mgrid[yi - h:yi + h + 1, xi - h:xi + h + 1]
    ok = np.isfinite(box)
    if ok.sum() < 12:
        return None

    def model(xy, a, xc, yc, s, b):
        return a * np.exp(-((xy[0] - xc) ** 2 + (xy[1] - yc) ** 2) / (2 * s * s)) + b
    b0 = float(np.nanmedian(box))
    try:
        p, _ = curve_fit(model, (xx[ok], yy[ok]), box[ok], p0=[float(np.nanmax(box)) - b0, x0, y0, 1.0, b0],
                         bounds=([0, xi - h, yi - h, 0.4, -np.inf], [np.inf, xi + h, yi + h, 3.0, np.inf]), maxfev=4000)
        return float(p[1]), float(p[2])
    except Exception:
        return None


def frame_offset(img: np.ndarray, refs_xy: list[tuple[float, float]]) -> tuple[float, float, int]:
    """Median (measured - predicted) position of Gaia reference stars in one frame [px]."""
    dx, dy = [], []
    for x, y in refs_xy:
        c = gauss_centroid(img, x, y, 3)
        if c and abs(c[0] - x) < 1.5 and abs(c[1] - y) < 1.5:
            dx.append(c[0] - x)
            dy.append(c[1] - y)
    if len(dx) < 3:
        return 0.0, 0.0, len(dx)
    return float(np.median(dx)), float(np.median(dy)), len(dx)


def measure(series: dict, refs: list[dict] | None = None, x0: float | None = None, y0: float | None = None) -> dict:
    """Registered centroid + photometry of the source nearest (x0, y0) (default: grid centre).

    refs: Gaia DR3 stars (ra, dec, pmra, pmdec at J2016.0) used to register each frame.
    """
    from . import catalogs, spherex
    n = series["n"]
    cx = (n - 1) / 2 if x0 is None else x0
    cy = (n - 1) / 2 if y0 is None else y0
    rows = []
    for f in series["frames"]:
        img = _arr(f["data"], n)
        img = img - np.nanmedian(img)
        c0 = centroid(img, cx, cy, h=3)
        if c0 is None:
            continue
        c = gauss_centroid(img, c0[0], c0[1], 3) or (c0[0], c0[1])
        ox = oy = 0.0
        nref = 0
        if refs:
            ep = Time(f["mjd"], format="mjd").jyear
            pts = [catalogs.propagate_linear(r, 2016.0, ep) for r in refs]
            xy = spherex.world_to_grid(series["ra"], series["dec"], series["fov_deg"], pts)
            xy = [(x, y) for x, y in xy if 4 <= x < n - 4 and 4 <= y < n - 4 and math.hypot(x - c[0], y - c[1]) > 4]
            ox, oy, nref = frame_offset(img, xy)
        rows.append({"mjd": f["mjd"], "date": f["date_utc"][:10], "wavelength_um": round(f["wavelength_um"], 3),
                     "x": round(c[0] - ox, 3), "y": round(c[1] - oy, 3), "n_ref": nref,
                     "offset_px": [round(ox, 3), round(oy, 3)],
                     "flux_mjy": aperture_flux(img, c[0], c[1])})
    return {"points": rows, **fit_motion(rows)}


def fit_motion(rows: list[dict]) -> dict:
    if len(rows) < 3:
        return {"pm_measured": None}
    t = np.array([Time(r["mjd"], format="mjd").jyear for r in rows])
    if t.max() - t.min() < 0.3:
        return {"pm_measured": None, "note": "Time baseline too short to measure proper motion."}
    # grid: x increases to the west (cdelt1 < 0): east offset = -x
    east = -np.array([r["x"] for r in rows]) * ARCSEC_PX
    north = np.array([r["y"] for r in rows]) * ARCSEC_PX
    out = {}
    for name, v in (("east", east), ("north", north)):
        A = np.vstack([t - t.mean(), np.ones_like(t)]).T
        coef, res, *_ = np.linalg.lstsq(A, v, rcond=None)
        resid = v - A @ coef
        sig = math.sqrt(float((resid ** 2).sum()) / max(1, len(v) - 2))
        err = sig / math.sqrt(float(((t - t.mean()) ** 2).sum()))
        out[name] = (float(coef[0]), err, sig)
    return {"pm_measured": {
        "pmra_masyr": round(out["east"][0] * 1000, 1), "pmra_err": round(out["east"][1] * 1000, 1),
        "pmdec_masyr": round(out["north"][0] * 1000, 1), "pmdec_err": round(out["north"][1] * 1000, 1),
        "scatter_arcsec": round(max(out["east"][2], out["north"][2]), 2),
        "baseline_yr": round(float(t.max() - t.min()), 3)}}


def moving_object_check(series: dict, asteroids: list[dict], name: str) -> dict:
    """Compare JPL sb_ident predicted positions of `name` with the measured centroid per frame."""
    import astropy.units as u
    from astropy.coordinates import SkyCoord
    from . import spherex
    n, pix, offsets = series["n"], series["pixel_arcsec"], []
    for f, a in zip(series["frames"], asteroids):
        body = next((b for b in a.get("bodies", []) if name in (b.get("name") or "")), None)
        if not body:
            continue
        c = SkyCoord(body["ra_sex"], body["dec_sex"].replace("'", "m").replace('"', "s").replace(" ", "d", 1),
                     unit=(u.hourangle, u.deg))
        (x, y), = spherex.world_to_grid(series["ra"], series["dec"], series["fov_deg"], [(c.ra.deg, c.dec.deg)])
        img = _arr(f["data"], n)
        img = img - np.nanmedian(img)
        g = gauss_centroid(img, x, y, 3)
        if g:
            offsets.append({"date": f["date_utc"], "pred_px": [round(x, 2), round(y, 2)],
                            "offset_arcsec": round(float(math.hypot(g[0] - x, g[1] - y)) * pix, 2)})
    med = float(np.median([o["offset_arcsec"] for o in offsets])) if offsets else None
    status = "validated" if med is not None and med < pix and len(offsets) >= 3 else "pending"
    return {"status": status, "frames_matched": len(offsets), "frames": len(series["frames"]),
            "median_offset_arcsec": None if med is None else round(med, 2), "pixel_arcsec": pix,
            "criterion": "median |measured - JPL predicted| < 1 pixel", "offsets": offsets}


def verdict(measured: dict | None, pmra: float | None, pmdec: float | None) -> dict:
    """Validated only if the measurement is significant AND agrees with the catalog.

    Significant: total uncertainty <= 1/3 of the catalog total proper motion.
    Agreement: |delta| <= max(3 sigma, 150 mas/yr) on both axes.
    """
    if not measured or pmra is None or pmdec is None:
        return {"status": "pending", "reason": "Not enough measurements or no reference proper motion."}
    dra, ddec = measured["pmra_masyr"] - pmra, measured["pmdec_masyr"] - pmdec
    tol_ra = max(3 * measured["pmra_err"], 150)
    tol_dec = max(3 * measured["pmdec_err"], 150)
    sigma = math.hypot(measured["pmra_err"], measured["pmdec_err"])
    total = math.hypot(pmra, pmdec)
    base = {"delta_masyr": [round(dra, 1), round(ddec, 1)], "tolerance_masyr": [round(tol_ra), round(tol_dec)],
            "sigma_total_masyr": round(sigma), "catalog_total_masyr": round(total)}
    if sigma > total / 3:
        return {"status": "inconclusive", **base,
                "reason": "The measurement uncertainty is too large compared with the expected motion "
                          "(source saturated, faint or contaminated in this band)."}
    ok = abs(dra) <= tol_ra and abs(ddec) <= tol_dec
    return {"status": "validated" if ok else "does not match", **base}
