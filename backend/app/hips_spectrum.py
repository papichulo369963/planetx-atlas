"""Instant 102-channel quick-look spectrum from the SPHEREx DR1 HiPS mosaic cube.

Instead of downloading a 320 MB HiPS tile, only the bytes covering a small box
around the target are requested with HTTP Range headers (one range per layer).
Photometry: aperture sum minus median background annulus, converted from
surface brightness to flux density:  F_nu [mJy] = sum(I_nu [MJy/sr]) * Omega_pix [sr] * 1e9.
Per IRSA, spectra from the HiPS cube are for visualization only; scientific
spectrophotometry should use the IRSA SPHEREx Spectrophotometry tool.
Reference: IRSA tutorial "Using SPHEREx HiPS All-Sky Mosaic Cubes".
"""
from __future__ import annotations

import io
import math
from concurrent.futures import ThreadPoolExecutor

import astropy.units as u
import httpx
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.table import Table
from astropy.wcs import WCS
from astropy_healpix import HEALPix

from .cache import cached_json, key
from .config import HIPS_CUBE

ORDER = 5
BLOCK = 2880
_http = httpx.Client(timeout=60, follow_redirects=True)


def _tile_url(ipix: int) -> str:
    return f"{HIPS_CUBE}/Norder{ORDER}/Dir{(ipix // 10000) * 10000}/Npix{ipix}_cube.fits"


def _range(url: str, start: int, length: int) -> bytes:
    for _ in range(4):
        r = _http.get(url, headers={"Range": f"bytes={start}-{start + length - 1}"})
        if r.status_code in (200, 206):
            return r.content
    raise RuntimeError("HiPS range request failed")


def _header_at(url: str, offset: int) -> tuple[fits.Header, int]:
    raw = _range(url, offset, BLOCK * 12).decode("ascii", "ignore")
    end = raw.index("END" + " " * 77) + 80
    hdr = fits.Header.fromstring(raw[:end])
    return hdr, math.ceil(end / BLOCK) * BLOCK


def _layout(url: str) -> dict:
    """Locate the IMAGE cube and SPECTRAL_CHANNELS table by walking FITS headers."""
    def produce() -> dict:
        offset, out = 0, {}
        for _ in range(8):
            hdr, hlen = _header_at(url, offset)
            naxes = [hdr.get(f"NAXIS{i}", 0) for i in range(1, hdr.get("NAXIS", 0) + 1)]
            size = (abs(hdr.get("BITPIX", 8)) // 8) * int(np.prod(naxes)) + hdr.get("PCOUNT", 0) if naxes else 0
            name = hdr.get("EXTNAME")
            if name == "IMAGE":
                out["image"] = {"header": hdr.tostring(), "data": offset + hlen, "shape": naxes}
            if name == "SPECTRAL_CHANNELS":
                blob = _range(url, offset, hlen + math.ceil(size / BLOCK) * BLOCK)
                tab = Table.read(fits.BinTableHDU.fromstring(blob))
                cols = tab.colnames
                out["channels"] = {c: np.asarray(tab[c]).tolist() for c in cols
                                   if np.asarray(tab[c]).dtype.kind in "fiu"}
                break
            offset += hlen + math.ceil(size / BLOCK) * BLOCK
        return out
    return cached_json("hips_layout", key(url), None, produce)


def _celestial(hdr: fits.Header) -> WCS:
    """Sky WCS only: the WAVE-TAB axis needs the full HDUList, which we never download."""
    h = hdr.copy()
    for k in list(h.keys()):
        if k.endswith("3") and k[:-1] in ("CTYPE", "CUNIT", "CRPIX", "CDELT", "CRVAL", "CNAME", "NAXIS") \
                or k.startswith(("PS3_", "PV3_", "PC3_")) or (k.startswith("PC") and k.endswith("_3")):
            del h[k]
    h["WCSAXES"] = 2
    h["NAXIS"] = 2
    return WCS(h)


def extract(ra: float, dec: float, r_ap_px: float = 2.0, r_in: float = 4.0, r_out: float = 7.0) -> dict:
    """Quick-look spectrum at (ra, dec). Returns wavelengths [um], flux [mJy], errors."""
    def produce() -> dict:
        hp = HEALPix(nside=2 ** ORDER, order="nested")
        ipix = int(hp.lonlat_to_healpix(ra * u.deg, dec * u.deg))
        url = _tile_url(ipix)
        lay = _layout(url)
        hdr = fits.Header.fromstring(lay["image"]["header"])
        nx, ny, nz = lay["image"]["shape"]
        wcs = _celestial(hdr)
        x, y = (float(v) for v in wcs.world_to_pixel(SkyCoord(ra * u.deg, dec * u.deg)))
        half = int(math.ceil(r_out)) + 1
        x0, x1 = max(0, int(round(x)) - half), min(nx, int(round(x)) + half + 1)
        y0, y1 = max(0, int(round(y)) - half), min(ny, int(round(y)) + half + 1)
        if x1 - x0 < 2 * half or y1 - y0 < 2 * half:
            raise ValueError("The position falls on the edge of the HiPS tile; spectrum not available here.")
        base = lay["image"]["data"]

        def layer(z: int) -> np.ndarray:
            start = base + ((z * ny + y0) * nx) * 4
            raw = _range(url, start, (y1 - y0) * nx * 4)
            return np.frombuffer(raw, dtype=">f4").reshape(y1 - y0, nx)[:, x0:x1]

        with ThreadPoolExecutor(max_workers=16) as pool:
            cube = np.stack(list(pool.map(layer, range(nz))))
        yy, xx = np.mgrid[y0:y1, x0:x1]
        rr = np.hypot(xx - x, yy - y)
        ap, ann = rr <= r_ap_px, (rr >= r_in) & (rr <= r_out)
        pix_sr = abs(np.linalg.det(wcs.pixel_scale_matrix)) * (math.pi / 180) ** 2
        flux, err, wl = [], [], lay["channels"].get("WAVELENGTH") or list(range(nz))
        for z in range(nz):
            img = cube[z]
            bkg = np.nanmedian(img[ann])
            n_ap = np.isfinite(img[ap]).sum()
            s = np.nansum(img[ap] - bkg)
            noise = np.nanstd(img[ann]) * math.sqrt(max(n_ap, 1))
            flux.append(float(s * pix_sr * 1e9))  # MJy -> mJy
            err.append(float(noise * pix_sr * 1e9))
        return {
            "ra": ra, "dec": dec, "healpix_order": ORDER, "healpix": ipix, "tile": url,
            "pixel_arcsec": round(math.sqrt(pix_sr) * 206264.806, 2),
            "wavelength_um": [round(float(w), 4) for w in wl],
            "flux_mjy": [round(f, 4) if math.isfinite(f) else None for f in flux],
            "err_mjy": [round(e, 4) if math.isfinite(e) else None for e in err],
            "method": f"Aperture r={r_ap_px}px, background annulus {r_in}-{r_out}px (median).",
            "evidence": "observed (DR1 HiPS mosaic, visualization only per IRSA)",
            "bytes_downloaded": int(cube.nbytes / max(1, (x1 - x0)) * nx),
        }
    return cached_json("spectra", key(round(ra, 5), round(dec, 5), r_ap_px), None, produce)
