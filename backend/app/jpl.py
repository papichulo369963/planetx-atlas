"""NASA/JPL Solar System Dynamics APIs (https://ssd-api.jpl.nasa.gov).

- sb_ident: known small bodies inside a field of view at a given time.
- sbdb:     orbit + physical parameters (diameter, albedo, taxonomy, rotation).
- sbdb_query: bulk physical/taxonomic parameters for NEOs.
- nhats:    NEO Human Space Flight Accessible Targets Study (round-trip dv, duration).
- cad / sentry / fireball: CNEOS planetary-defense data.
"""
from __future__ import annotations

import httpx

from .cache import cached_json, key
from .config import JPL

_http = httpx.Client(timeout=90)


def _get(path: str, params: dict) -> dict:
    r = _http.get(f"{JPL}/{path}", params=params)
    if r.status_code >= 400:
        raise ValueError(f"JPL {path}: {r.text[:200]}")
    return r.json()


def _sex(deg: float, hours: bool) -> str:
    v = deg / 15 if hours else deg
    sign = "-" if v < 0 else ""
    v = abs(v)
    d = int(v)
    m = int((v - d) * 60)
    s = (v - d - m / 60) * 3600
    return f"{sign}{d:02d}-{m:02d}-{s:05.2f}"


def sb_ident(ra: float, dec: float, half_width_deg: float, iso_time: str) -> dict:
    """Known asteroids and comets in the field. Observer: geocenter (code 500).

    SPHEREx orbits Earth (~700 km), so topocentric parallax of very close NEOs is ignored.
    """
    def produce() -> dict:
        d = _get("sb_ident.api", {
            "sb-kind": "a", "mpc-code": "500", "obs-time": iso_time[:19].replace("T", "_"),
            "fov-ra-center": _sex(ra, True), "fov-dec-center": _sex(dec, False),
            "fov-ra-hwidth": round(half_width_deg, 4), "fov-dec-hwidth": round(half_width_deg, 4),
            "two-pass": "true", "suppress-first-pass": "true", "req-elem": "false", "vmag-lim": 22})
        rows = d.get("data_second_pass") or []
        fields = d.get("fields_second") or []
        out = []
        for r in rows:
            rec = dict(zip(fields, r))
            out.append({"name": rec.get("Object name"), "ra_sex": rec.get("Astrometric RA (hh:mm:ss)"),
                        "dec_sex": rec.get("Astrometric Dec (dd mm'ss\")"),
                        "vmag": rec.get("Visual magnitude (V)"),
                        "ra_rate": rec.get("RA rate (\"/h)"), "dec_rate": rec.get("Dec rate (\"/h)"),
                        "err_ra": rec.get("Est. error RA (\")")})
        return {"time": iso_time, "bodies": out, "observer": "geocenter (500)"}
    return cached_json("sbident", key(round(ra, 4), round(dec, 4), round(half_width_deg, 4), iso_time[:16]),
                       None, produce)


def sbdb(designation: str) -> dict:
    def produce() -> dict:
        return _get("sbdb.api", {"sstr": designation, "phys-par": 1, "discovery": 1, "full-prec": 1})
    return cached_json("sbdb", key(designation.lower()), 7 * 86400, produce)


def nhats_list() -> list[dict]:
    """Default NHATS query (dv <= 12 km/s, duration <= 450 d): all accessible NEOs."""
    def produce() -> list[dict]:
        return _get("nhats.api", {}).get("data", [])
    return cached_json("nhats", "all", 86400, produce)


def nhats_object(des: str) -> dict:
    return cached_json("nhats_obj", key(des), 86400, lambda: _get("nhats.api", {"des": des}))


def neo_physical() -> dict[str, dict]:
    """Taxonomy, diameter and albedo for every NEO in SBDB (one bulk query)."""
    def produce() -> dict[str, dict]:
        d = _get("sbdb_query.api", {"fields": "pdes,full_name,spec_B,spec_T,diameter,albedo,H,class",
                                    "sb-group": "neo"})
        out = {}
        for pdes, name, sb, st, diam, alb, H, cls in d.get("data", []):
            out[pdes] = {"name": (name or "").strip(), "spec_B": sb, "spec_T": st,
                         "diameter_km": _f(diam), "albedo": _f(alb), "H": _f(H), "class": cls}
        return out
    return cached_json("neo_phys", "all", 7 * 86400, produce)


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def close_approaches() -> dict:
    return cached_json("cad", "next60", 6 * 3600, lambda: _get(
        "cad.api", {"date-min": "now", "date-max": "+60", "dist-max": "0.05", "sort": "dist",
                    "fullname": "true", "diameter": "true"}))


def sentry() -> dict:
    return cached_json("sentry", "all", 6 * 3600, lambda: _get("sentry.api", {}))


def fireballs() -> dict:
    return cached_json("fireball", "last300", 6 * 3600, lambda: _get(
        "fireball.api", {"limit": 300, "req-loc": "true"}))
