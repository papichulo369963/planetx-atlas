"""Coordinate parsing (decimal or sexagesimal) and name resolution (CDS Sesame)."""
from __future__ import annotations

import re

import astropy.units as u
from astropy.coordinates import SkyCoord

from .cache import cached_json, key


class CoordError(ValueError):
    """Raised with a human readable (Spanish) explanation."""


_NUM = re.compile(r"^\s*[+-]?\d+(\.\d+)?\s*$")


def parse_coords(ra: str, dec: str) -> SkyCoord:
    """Accept '269.45', '17h57m48.5s', '17 57 48.5' for RA and '4.69', '+04d41m36s' for Dec.

    Decimal RA is interpreted in degrees; sexagesimal RA in hours (IAU convention).
    Frame: ICRS. The epoch of the coordinates is the caller's responsibility.
    """
    ra, dec = ra.strip(), dec.strip()
    if not ra or not dec:
        raise CoordError("Missing coordinates: enter right ascension and declination.")
    try:
        if _NUM.match(ra) and _NUM.match(dec):
            r, d = float(ra), float(dec)
            if not 0 <= r < 360:
                raise CoordError("Right ascension in degrees must be between 0 and 360.")
            if not -90 <= d <= 90:
                raise CoordError("Declination must be between -90 and +90 degrees.")
            return SkyCoord(r * u.deg, d * u.deg, frame="icrs")
        return SkyCoord(ra, dec, unit=(u.hourangle, u.deg), frame="icrs")
    except CoordError:
        raise
    except Exception as exc:  # astropy raises several types
        raise CoordError(
            "Could not parse those coordinates. Valid examples: '269.452 4.693' or "
            "'08h55m10.831s -07d14m42.53s'.") from exc


SIMBAD_TAP = ["https://simbad.harvard.edu/simbad/sim-tap/sync",
              "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"]


def simbad_tap(adql: str) -> list[list]:
    """Run ADQL on SIMBAD TAP, trying the Harvard mirror first (CDS main site may be down)."""
    import httpx
    last = None
    for url in SIMBAD_TAP:
        try:
            r = httpx.get(url, params={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json",
                                       "QUERY": adql}, timeout=30, follow_redirects=True)
            if r.status_code == 200:
                return r.json().get("data", [])
            last = r.status_code
        except Exception as exc:  # try next mirror
            last = exc
    raise CoordError(f"SIMBAD is not responding ({last}).")


def resolve_name(name: str) -> dict:
    """Resolve a name with SIMBAD; include proper motion, parallax and RV. Cached forever.

    SIMBAD basic positions are ICRS at epoch J2000.0.
    """
    def produce() -> dict:
        n = name.strip().replace("'", "''")
        rows = simbad_tap(
            "SELECT b.main_id, b.ra, b.dec, b.pmra, b.pmdec, b.plx_value, b.rvz_radvel, b.otype "
            f"FROM basic b JOIN ident i ON i.oidref = b.oid WHERE i.id = '{n}'")
        if not rows:
            raise CoordError(f"'{name}' was not found in SIMBAD. Try another designation "
                             "(e.g. 'Barnard star', 'eps Ind B', 'RW Aur').")
        main_id, ra, dec, pmra, pmdec, plx, rv, otype = rows[0]
        return {"name": name, "main_id": main_id, "ra": ra, "dec": dec, "epoch": "J2000.0",
                "pmra_masyr": pmra, "pmdec_masyr": pmdec, "plx_mas": plx, "rv_kms": rv,
                "otype": otype, "source": "SIMBAD (TAP, Harvard/CDS mirror)"}
    return cached_json("names", key(name.lower().strip()), None, produce)


def propagate(ra: float, dec: float, pmra: float | None, pmdec: float | None,
              plx: float | None, rv: float | None, from_epoch: str, to_jyear: float) -> tuple[float, float]:
    """Space-motion propagation (astropy apply_space_motion, rigorous for linear motion).

    pmra is mu_alpha* = mu_alpha cos(delta) [mas/yr]; plx [mas]; rv [km/s].
    """
    from astropy.coordinates import Distance
    from astropy.time import Time
    if not pmra and not pmdec:
        return ra, dec
    kw = dict(pm_ra_cosdec=(pmra or 0) * u.mas / u.yr, pm_dec=(pmdec or 0) * u.mas / u.yr,
              obstime=Time(from_epoch))
    if plx and plx > 0:
        kw["distance"] = Distance(parallax=plx * u.mas)
        kw["radial_velocity"] = (rv or 0) * u.km / u.s
    c = SkyCoord(ra * u.deg, dec * u.deg, frame="icrs", **kw)
    c2 = c.apply_space_motion(Time(to_jyear, format="jyear"))
    return float(c2.ra.deg), float(c2.dec.deg)
