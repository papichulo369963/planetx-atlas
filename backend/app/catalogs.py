"""Multi-mission catalog overlays: Gaia DR3 (ESA), CatWISE2020 (VizieR) and SIMBAD.

Gaia DR3 positions are at epoch J2016.0 (Gaia Collaboration, Vallenari et al. 2023);
they are propagated linearly to the frame epoch:
    alpha(t) = alpha_0 + mu_alpha* dt / cos(delta),  delta(t) = delta_0 + mu_delta dt
CatWISE2020 positions refer to MJD 57170 (~2015.4) (Marocco et al. 2021).
Cross-match rule shown to users: nearest source within r_match after epoch propagation.
"""
from __future__ import annotations

import math
import re

import httpx

from .cache import cached_json, key
from .coords import simbad_tap

GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
VIZIER = ["https://vizier.cfa.harvard.edu/viz-bin/asu-tsv", "https://vizier.cds.unistra.fr/viz-bin/asu-tsv"]


def _tap(url: str, adql: str) -> list[list]:
    r = httpx.get(url, params={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": adql},
                  timeout=90)
    r.raise_for_status()
    return r.json().get("data", [])


def gaia_cone(ra: float, dec: float, radius_deg: float, gmax: float = 19.0) -> list[dict]:
    def produce() -> list[dict]:
        rows = _tap(GAIA_TAP, (
            "SELECT TOP 3000 source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag "
            "FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),"
            f"CIRCLE('ICRS',{ra},{dec},{radius_deg})) AND phot_g_mean_mag < {gmax}"))
        return [{"id": str(r[0]), "ra": r[1], "dec": r[2], "pmra": r[3], "pmdec": r[4],
                 "plx": r[5], "g": r[6]} for r in rows]
    return cached_json("gaia", key(round(ra, 4), round(dec, 4), round(radius_deg, 4), gmax), None, produce)


def propagate_linear(src: dict, epoch0: float, epoch1: float) -> tuple[float, float]:
    dt = epoch1 - epoch0
    pmra, pmdec = src.get("pmra") or 0.0, src.get("pmdec") or 0.0
    dec = src["dec"] + pmdec * dt / 3.6e6
    ra = src["ra"] + pmra * dt / 3.6e6 / max(1e-6, math.cos(math.radians(src["dec"])))
    return ra, dec


def catwise_cone(ra: float, dec: float, radius_deg: float) -> list[dict]:
    def produce() -> list[dict]:
        params = {"-source": "II/365/catwise", "-c": f"{ra} {dec}", "-c.rd": radius_deg,
                  "-out": "Name RA_ICRS DE_ICRS pmRA pmDE W1mproPM W2mproPM", "-out.max": 2000}
        for url in VIZIER:
            try:
                r = httpx.get(url, params=params, timeout=60, follow_redirects=True)
                if r.status_code == 200:
                    return _parse_tsv(r.text)
            except httpx.HTTPError:
                continue
        return []
    return cached_json("catwise", key(round(ra, 4), round(dec, 4), round(radius_deg, 4)), None, produce)


def _parse_tsv(text: str) -> list[dict]:
    out, header = [], None
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        cells = line.split("\t")
        if header is None:
            header = [c.strip() for c in cells]
            continue
        if line.startswith("-") or len(cells) != len(header):
            continue
        d = dict(zip(header, (c.strip() for c in cells)))
        try:
            out.append({"id": d["Name"], "ra": float(d["RA_ICRS"]), "dec": float(d["DE_ICRS"]),
                        "pmra": float(d["pmRA"] or 0) * 1000, "pmdec": float(d["pmDE"] or 0) * 1000,
                        "w1": _f(d.get("W1mproPM")), "w2": _f(d.get("W2mproPM"))})
        except (KeyError, ValueError):
            continue
    return out


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def simbad_cone(ra: float, dec: float, radius_deg: float) -> list[dict]:
    def produce() -> list[dict]:
        rows = simbad_tap(
            "SELECT TOP 200 main_id, ra, dec, otype, pmra, pmdec FROM basic WHERE "
            f"CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra}, {dec}, {radius_deg})) = 1")
        return [{"id": r[0], "ra": r[1], "dec": r[2], "otype": r[3], "pmra": r[4], "pmdec": r[5]}
                for r in rows if r[1] is not None]
    return cached_json("simbad_cone", key(round(ra, 4), round(dec, 4), round(radius_deg, 4)), None, produce)


def vizier_cone(catalog: str, ra: float, dec: float, radius_deg: float, max_rows: int = 2000) -> dict:
    """Generic cone search on ANY VizieR catalog (e.g. II/328/allwise, II/246/out, I/355/gaiadr3).

    VizieR computes _RAJ2000/_DEJ2000 for every catalog, so no per-catalog column mapping is needed.
    Positions are at the catalog's own epoch (not propagated).
    """
    def produce() -> dict:
        params = {"-source": catalog, "-c": f"{ra} {dec}", "-c.rd": radius_deg, "-out.max": max_rows,
                  "-out.add": "_RAJ2000,_DEJ2000", "-sort": "_r"}
        last = None
        for url in VIZIER:
            try:
                r = httpx.get(url, params=params, timeout=90, follow_redirects=True)
                if r.status_code == 200:
                    return _parse_generic(r.text, catalog)
                last = r.status_code
            except httpx.HTTPError as exc:
                last = exc
        raise RuntimeError(f"VizieR is not responding ({last})")
    return cached_json("vizier", key(catalog, round(ra, 4), round(dec, 4), round(radius_deg, 4)), 7 * 86400, produce)


def _parse_generic(text: str, catalog: str) -> dict:
    header, title, rows = None, catalog, []
    for line in text.splitlines():
        if line.startswith("#Title:"):
            title = line[7:].strip()
        if not line or line.startswith("#"):
            continue
        cells = [c.strip() for c in line.split("\t")]
        if header is None:
            header = cells
            continue
        if len(cells) != len(header) or set(line.strip()) <= {"-", " ", "\t"}:
            continue
        d = dict(zip(header, cells))
        try:
            ra, dec = float(d["_RAJ2000"]), float(d["_DEJ2000"])
        except (KeyError, ValueError):
            continue  # units line or malformed row
        others = [h for h in header if not h.startswith("_")
                  and not re.match(r"^(RA|DE|Dec|GLON|GLAT|ELON|ELAT|e_RA|e_DE)", h, re.I)]
        rows.append({"ra": ra, "dec": dec, "id": d.get(others[0], "") if others else "",
                     "extra": {h: d[h] for h in others[:5]}})
    if header is None:
        raise ValueError(f"Catalog '{catalog}' not found in VizieR or no sources in this field.")
    return {"catalog": catalog, "title": title, "columns": header, "rows": rows}
