"""Find real SPHEREx exposures that contain a given asteroid (moving-object demo case).

Method: SPHEREx observes near 90 deg solar elongation, so first get the JPL Horizons
geocentric ephemeris (RA/Dec, elongation) and keep days with elongation 80-100 deg;
then query IRSA SIA at the predicted position restricted to a +-1 day window.
Usage: python find_asteroid_case.py 16 [start] [stop]
"""
from __future__ import annotations

import json
import sys
import warnings

import astropy.units as u
import httpx
from astropy.coordinates import SkyCoord
from astropy.time import Time

warnings.filterwarnings("ignore")


def horizons(cmd: str, start: str, stop: str) -> list[dict]:
    r = httpx.get("https://ssd.jpl.nasa.gov/api/horizons.api", params={
        "format": "json", "COMMAND": f"'{cmd}'", "EPHEM_TYPE": "OBSERVER", "CENTER": "'500@399'",
        "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": "'1d'",
        "QUANTITIES": "'1,9,23'", "ANG_FORMAT": "DEG", "CSV_FORMAT": "YES", "OBJ_DATA": "NO"}, timeout=120)
    text = r.json()["result"]
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in body.strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        # date, solar flag, lunar flag, RA, DEC, APmag, S-brt, S-O-T, /r
        rows.append({"date": c[0], "ra": float(c[3]), "dec": float(c[4]), "vmag": c[5], "elong": float(c[7])})
    return rows


def main() -> None:
    from astroquery.ipac.irsa import Irsa
    cmd = sys.argv[1] if len(sys.argv) > 1 else "16;"
    start = sys.argv[2] if len(sys.argv) > 2 else "2025-05-01"
    stop = sys.argv[3] if len(sys.argv) > 3 else "2026-10-31"
    eph = [e for e in horizons(cmd, start, stop) if 80 <= e["elong"] <= 100]
    print("candidate days", len(eph), flush=True)
    hits = []
    for e in eph:
        t = Time.strptime(e["date"].strip(), "%Y-%b-%d %H:%M")
        c = SkyCoord(e["ra"] * u.deg, e["dec"] * u.deg)
        try:
            tab = Irsa.query_sia(pos=(c, 1 * u.arcsec), collection=["spherex_dr1", "spherex_qr3"],
                                 time=(Time(t.mjd - 1, format="mjd"), Time(t.mjd + 1, format="mjd")))
        except Exception as exc:
            print("err", e["date"], exc, flush=True)
            continue
        if len(tab):
            hits.append({"date": e["date"], "ra": e["ra"], "dec": e["dec"], "vmag": e["vmag"],
                         "n": len(tab), "mjd": sorted(float(x) for x in tab["t_min"])})
            print("HIT", e["date"], e["ra"], e["dec"], len(tab), flush=True)
    print(json.dumps(hits)[:4000])


if __name__ == "__main__":
    main()
