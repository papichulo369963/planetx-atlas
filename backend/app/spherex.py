"""SPHEREx spectral-image access: discovery (IRSA SIA), cutouts and common-grid series.

Data: SPHEREx Level-2 spectral images (DR1 / QR3) served by NASA/IPAC IRSA.
- Discovery: IRSA SIA v2, collections spherex_dr1 + spherex_qr3.
- Cutouts: IRSA IBE cutout service `<access_url>?center=<ra>,<dec>d&size=<deg>`.
- Units: IMAGE in MJy/sr (surface brightness, no zodiacal subtraction applied).
- Wavelength at a pixel: alternate WCS key 'W' (lookup table in WCS-WAVE).
References: IRSA SPHEREx tutorials (spherex-intro, spherex-cutouts) and the
SPHEREx Explanatory Supplement.
Each frame is resampled (bilinear) onto a common north-up TAN grid so frames from
different visits/orientations are comparable. No frame is interpolated in time.
"""
from __future__ import annotations

import base64
import io
import logging
import math
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import astropy.units as u
import httpx
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS, FITSFixedWarning
from scipy.ndimage import map_coordinates

from .cache import cached_json, key
from .config import CACHE, SPHEREX_COLLECTIONS

warnings.filterwarnings("ignore", category=FITSFixedWarning)
logging.getLogger("astropy").setLevel(logging.ERROR)
PIXEL_ARCSEC = 6.15  # native SPHEREx pixel scale (~6.15 arcsec)
CUT_DIR = CACHE / "cutouts"
CUT_DIR.mkdir(parents=True, exist_ok=True)
_http = httpx.Client(timeout=120, follow_redirects=True)


def query_images(ra: float, dec: float) -> list[dict]:
    """All SPHEREx spectral images covering (ra, dec). Cached 12 h (weekly releases)."""
    def produce() -> list[dict]:
        from astroquery.ipac.irsa import Irsa
        import time as _t
        c = SkyCoord(ra * u.deg, dec * u.deg)
        for attempt in range(4):  # IRSA SIA returns sporadic 502 proxy errors
            try:
                tab = Irsa.query_sia(pos=(c, 1 * u.arcsec), collection=SPHEREX_COLLECTIONS)
                break
            except Exception:
                if attempt == 3:
                    raise
                _t.sleep(4 * (attempt + 1))
        rows = []
        for r in tab:
            rows.append({
                "id": str(r["obs_publisher_did"]),
                "url": str(r["access_url"]),
                "mjd": float(r["t_min"]),
                "mjd_end": float(r["t_max"]),
                "detector": int(str(r["energy_bandpassname"])[-1]),
                "em_min_um": float(r["em_min"]) * 1e6,
                "em_max_um": float(r["em_max"]) * 1e6,
                "collection": str(r["obs_collection"]),
                "exptime_s": float(r["t_exptime"]),
            })
        rows.sort(key=lambda x: x["mjd"])
        return rows
    return cached_json("sia", key(round(ra, 5), round(dec, 5)), 12 * 3600, produce)


def select_frames(images: list[dict], detector: int, max_frames: int,
                  mjd_min: float | None = None, mjd_max: float | None = None) -> list[dict]:
    """Pick real exposures to animate.

    Default: one image per observing day (middle exposure), spread over the whole span.
    With a time window (moving-object mode): one image per distinct exposure time.
    detector=0 accepts every detector (wavelength shown per frame).
    """
    det = [im for im in images if detector in (0, im["detector"])
           and (mjd_min is None or im["mjd"] >= mjd_min) and (mjd_max is None or im["mjd"] <= mjd_max)]
    window = mjd_min is not None or mjd_max is not None
    by_day: dict[float, list[dict]] = {}
    for im in det:
        by_day.setdefault(round(im["mjd"], 3) if window else int(im["mjd"]), []).append(im)
    picks = [sorted(v, key=lambda im: im["mjd"])[len(v) // 2] for _, v in sorted(by_day.items())]
    if len(picks) <= max_frames:
        return picks
    idx = np.unique(np.linspace(0, len(picks) - 1, max_frames).round().astype(int))
    return [picks[i] for i in idx]


def _cutout_path(image_id: str, ra: float, dec: float, size: float) -> Path:
    return CUT_DIR / f"{key(image_id, round(ra, 5), round(dec, 5), round(size, 4))}.npz"


def fetch_cutout(image: dict, ra: float, dec: float, size_deg: float) -> dict | None:
    """Download (or load cached) cutout; keep IMAGE, FLAGS, VARIANCE and headers."""
    path = _cutout_path(image["id"], ra, dec, size_deg)
    if not path.exists():
        url = f"{image['url']}?center={ra:.6f},{dec:.6f}d&size={size_deg:.4f}"
        content = None
        for _ in range(4):  # the IRSA cutout service returns sporadic 503s
            try:
                r = _http.get(url)
                if r.status_code == 200 and r.content[:6] == b"SIMPLE":
                    content = r.content
                    break
            except httpx.HTTPError:
                pass
        if content is None:
            return None
        with fits.open(io.BytesIO(content)) as h:
            np.savez_compressed(
                path, image=h["IMAGE"].data.astype(np.float32), flags=h["FLAGS"].data,
                variance=h["VARIANCE"].data.astype(np.float32),
                zodi=h["ZODI"].data.astype(np.float32),
                header=np.array(h["IMAGE"].header.tostring()),
                flag_header=np.array(h["FLAGS"].header.tostring()),
                wave=np.array(_wavelength_at(h, ra, dec)),
                version=np.array(h[0].header.get("VERSION", "")))
    d = np.load(path)
    return {k: d[k] for k in d.files}


def _wavelength_at(h: fits.HDUList, ra: float, dec: float) -> list[float]:
    """Central wavelength and bandwidth [um] at the target pixel (spectral WCS key 'W')."""
    hdr = h["IMAGE"].header
    x, y = WCS(hdr).world_to_pixel(SkyCoord(ra * u.deg, dec * u.deg))
    sw = WCS(hdr, fobj=h, key="W")
    sw.sip = None
    wl, bw = sw.pixel_to_world(x, y)
    return [float(wl.to(u.um).value), float(bw.to(u.um).value)]


def flag_names(flag_header: str) -> dict[int, tuple[str, str]]:
    """Parse the self-describing mask planes (MSKNnnnn/MSKMnnnn/MSKDnnnn)."""
    h = fits.Header.fromstring(flag_header)
    out = {}
    for k in h:
        if k.startswith("MSKN"):
            n = k[4:]
            out[int(h.get(f"MSKM{n}", 0))] = (h[k].strip(), str(h.get(f"MSKD{n}", "")))
    return out


# Planes that make a pixel unreliable for visual comparison.
BAD_PLANES = {"SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD", "NONLINEAR",
              "PERSIST", "OUTLIER", "STREAK", "BLOOM", "SNOWBALL"}


MAX_GRID = 200  # larger fields are block-averaged (binned) to keep payloads light


def bin_factor(fov_deg: float) -> int:
    return max(1, math.ceil(round(fov_deg * 3600 / PIXEL_ARCSEC) / MAX_GRID))


def _tan(ra: float, dec: float, n: int, pix_arcsec: float) -> WCS:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    s = pix_arcsec / 3600.0
    w.wcs.cdelt = [-s, s]  # east left, north up
    return w


def common_grid(ra: float, dec: float, fov_deg: float) -> tuple[WCS, int]:
    """Display grid (binned when the field is large)."""
    f = bin_factor(fov_deg)
    n = max(16, int(round(fov_deg * 3600 / PIXEL_ARCSEC)) // f)
    return _tan(ra, dec, n, PIXEL_ARCSEC * f), n


def native_grid(ra: float, dec: float, fov_deg: float) -> tuple[WCS, int, int]:
    """Native-resolution grid whose f x f blocks map exactly onto common_grid pixels."""
    f = bin_factor(fov_deg)
    _, n = common_grid(ra, dec, fov_deg)
    return _tan(ra, dec, n * f, PIXEL_ARCSEC), n * f, f


def block_mean(a: np.ndarray, f: int) -> np.ndarray:
    if f == 1:
        return a
    n = a.shape[0] // f
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(a[:n * f, :n * f].reshape(n, f, n, f), axis=(1, 3))


def resample(cut: dict, grid: WCS, n: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    """Bilinear resampling of IMAGE/VARIANCE and nearest for FLAGS onto the common grid."""
    src = WCS(fits.Header.fromstring(str(cut["header"])))
    yy, xx = np.mgrid[0:n, 0:n]
    world = grid.pixel_to_world(xx, yy)
    sx, sy = src.world_to_pixel(world)
    img = map_coordinates(cut["image"], [sy, sx], order=1, cval=np.nan)
    var = map_coordinates(cut["variance"], [sy, sx], order=1, cval=np.nan)
    flg = map_coordinates(cut["flags"].astype(np.float64), [sy, sx], order=0, cval=0).astype(np.int64)
    names = flag_names(str(cut["flag_header"]))
    bad_mask_bits = sum(b for b, (nm, _) in names.items() if nm in BAD_PLANES)
    bad = (flg & bad_mask_bits) != 0
    counts = {nm: int(((flg & b) != 0).sum()) for b, (nm, _) in names.items() if ((flg & b) != 0).any()}
    return img.astype(np.float32), var.astype(np.float32), bad, counts


def _b64(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()


def build_series(ra: float, dec: float, fov_deg: float, detector: int, max_frames: int,
                 mjd_min: float | None = None, mjd_max: float | None = None) -> dict:
    """Time series of real SPHEREx frames on a common grid, ready for the browser."""
    images = query_images(ra, dec)
    picks = select_frames(images, detector, max_frames, mjd_min, mjd_max)
    grid, n_nat, factor = native_grid(ra, dec, fov_deg)
    n = n_nat // factor
    size = fov_deg * 1.5  # margin so rotated frames still fill the grid
    with ThreadPoolExecutor(max_workers=8) as pool:
        cuts = list(pool.map(lambda im: fetch_cutout(im, ra, dec, size), picks))
    frames = []
    for im, cut in zip(picks, cuts):
        if cut is None:
            continue
        img, var, bad, counts = resample(cut, grid, n_nat)
        img, var = block_mean(img, factor), block_mean(var, factor) / factor ** 2
        bad = block_mean(bad.astype(np.float32), factor) > 0.5
        zodi = float(np.nanmedian(cut["zodi"]))
        frames.append({
            **im,
            "date_utc": Time(im["mjd"], format="mjd").isot[:19],
            "wavelength_um": float(cut["wave"][0]),
            "bandwidth_um": float(cut["wave"][1]),
            "version": str(cut["version"]),
            "zodi_median": zodi,
            "flag_counts": counts,
            "data": _b64(img),
            "sigma_median": float(np.nanmedian(np.sqrt(np.clip(var, 0, None)))),
            "bad": _b64(bad.astype(np.uint8)),
        })
    return {
        "ra": ra, "dec": dec, "fov_deg": fov_deg, "detector": detector, "n": n,
        "pixel_arcsec": PIXEL_ARCSEC * factor, "bin_factor": factor,
        "frames": frames,
        "available": summarize(images),
        "processing": [
            "Cutouts from the IRSA service centred on the target.",
            f"Bilinear resampling to a common TAN grid (north up, east left, "
            f"{PIXEL_ARCSEC * factor:.2f}\"/px{'; binned ' + str(factor) + 'x' + str(factor) if factor > 1 else ''}).",
            "No temporal interpolation: every frame is a real exposure.",
            "Units MJy/sr; the contrast stretch is applied in the browser.",
        ],
    }


def summarize(images: list[dict]) -> dict:
    """Availability summary per detector and per observing season (gap > 30 d)."""
    seasons: list[list[float]] = []
    for mjd in sorted(im["mjd"] for im in images):
        if not seasons or mjd - seasons[-1][-1] > 30:
            seasons.append([mjd])
        else:
            seasons[-1].append(mjd)
    per_det = {d: sum(1 for im in images if im["detector"] == d) for d in range(1, 7)}
    return {
        "total": len(images),
        "per_detector": per_det,
        "seasons": [{"start": Time(s[0], format="mjd").isot[:10], "end": Time(s[-1], format="mjd").isot[:10],
                     "n": len(s)} for s in seasons],
        "detector_ranges_um": {d: [round(min(im["em_min_um"] for im in images if im["detector"] == d), 3),
                                   round(max(im["em_max_um"] for im in images if im["detector"] == d), 3)]
                               for d in range(1, 7) if per_det[d]},
    }


def world_to_grid(ra: float, dec: float, fov_deg: float, pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    grid, _ = common_grid(ra, dec, fov_deg)
    if not pts:
        return []
    x, y = grid.world_to_pixel(SkyCoord([p[0] for p in pts] * u.deg, [p[1] for p in pts] * u.deg))
    return list(zip(np.atleast_1d(x).tolist(), np.atleast_1d(y).tolist()))


def grid_to_world(ra: float, dec: float, fov_deg: float, x: float, y: float) -> tuple[float, float]:
    grid, _ = common_grid(ra, dec, fov_deg)
    c = grid.pixel_to_world(x, y)
    return float(c.ra.deg), float(c.dec.deg)


def mjd_to_iso(mjd: float) -> str:
    return Time(mjd, format="mjd").isot[:19]


def pixel_scale_deg() -> float:
    return PIXEL_ARCSEC / 3600.0


def safe(v: float) -> float | None:
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v
