"""Build the binary orbital catalog of every known asteroid and comet.

Source: NASA/JPL SBDB Query API (https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html).
Each body is reduced to osculating Keplerian elements propagated (two-body, mean
motion only) to a common reference epoch so the browser can propagate them on the
GPU.  Mean motion n [deg/day] = k * a^-1.5 with k = 0.98560767 deg/day (Gaussian
gravitational constant, heliocentric two-body problem).  This is a visualization
approximation: no planetary perturbations, so positions drift from JPL ephemerides
over years.  Units: a [au], angles [deg], epoch [JD TDB].

Output (data/catalog/):
  orbits.bin   float32 x 7 per body: a, e, i, om, w, M_ref, H   (little endian)
  classes.bin  uint8 class code per body
  names.json   designations (pdes) in the same order, for lookup by index
  meta.json    provenance, counts, reference epoch, class table
"""
from __future__ import annotations

import datetime as dt
import json
import math
import sys
import time
from pathlib import Path

import httpx
import numpy as np

API = "https://ssd-api.jpl.nasa.gov/sbdb_query.api"
OUT = Path(__file__).resolve().parents[2] / "data" / "catalog"
REF_JD = 2461000.5  # 2025-11-21 TDB, reference epoch for M_ref
K_DEG_DAY = 0.9856076686  # Gaussian constant expressed as deg/day for a in au
CLASSES = ["MBA", "IMB", "OMB", "APO", "ATE", "AMO", "IEO", "MCA", "TJN", "CEN",
           "TNO", "PAA", "HYA", "AST", "JFc", "JFC", "HTC", "ETc", "CTc", "COM",
           "PAR", "HYP", "OTHER"]
PAGE = 250_000


def fetch(kind: str, fields: str) -> list[list]:
    rows: list[list] = []
    start = 0
    with httpx.Client(timeout=600) as client:
        while True:
            params = {"fields": fields, "sb-kind": kind, "limit": PAGE, "limit-from": start}
            for attempt in range(4):
                try:
                    r = client.get(API, params=params)
                    r.raise_for_status()
                    break
                except Exception as exc:  # network hiccup: retry with backoff
                    print("retry", attempt, exc, flush=True)
                    time.sleep(5 * (attempt + 1))
            else:
                raise RuntimeError("SBDB query failed repeatedly")
            data = r.json().get("data", [])
            rows.extend(data)
            print(kind, "fetched", len(rows), flush=True)
            if len(data) < PAGE:
                return rows
            start += PAGE


def f(x, default=math.nan):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    ast = fetch("a", "pdes,a,e,i,om,w,ma,epoch,H,class")
    com = fetch("c", "pdes,q,e,i,om,w,tp,epoch,M1,class")
    orbits, classes, names = [], [], []
    code = {c: k for k, c in enumerate(CLASSES)}
    for pdes, a, e, i, om, w, ma, epoch, H, cls in ast:
        a, e = f(a), f(e)
        if not (a > 0 and 0 <= e < 1):
            continue
        n = K_DEG_DAY * a ** -1.5
        m = (f(ma) + n * (REF_JD - f(epoch))) % 360.0
        orbits.append((a, e, f(i), f(om), f(w), m, f(H, 99.0)))
        classes.append(code.get(cls, code["OTHER"]))
        names.append(pdes)
    for pdes, q, e, i, om, w, tp, epoch, m1, cls in com:
        q, e = f(q), f(e)
        if not (q > 0 and 0 <= e < 1):
            continue  # hyperbolic/parabolic orbits cannot be drawn as ellipses
        a = q / (1 - e)
        n = K_DEG_DAY * a ** -1.5
        m = (n * (REF_JD - f(tp))) % 360.0
        orbits.append((a, e, f(i), f(om), f(w), m, f(m1, 99.0)))
        classes.append(code.get(cls, code["COM"]))
        names.append(pdes)
    arr = np.nan_to_num(np.asarray(orbits, dtype=np.float32), nan=0.0)
    arr.astype("<f4").tofile(OUT / "orbits.bin")
    np.asarray(classes, dtype=np.uint8).tofile(OUT / "classes.bin")
    (OUT / "names.json").write_text(json.dumps(names), encoding="utf-8")
    meta = {
        "source": "NASA/JPL SBDB Query API",
        "url": API,
        "retrieved_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "count": len(names),
        "asteroids_raw": len(ast),
        "comets_raw": len(com),
        "ref_epoch_jd_tdb": REF_JD,
        "layout": ["a_au", "e", "i_deg", "om_deg", "w_deg", "M_ref_deg", "H_mag"],
        "classes": CLASSES,
        "evidence": "calculated (two-body Keplerian propagation, no perturbations)",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("DONE", meta["count"], flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
