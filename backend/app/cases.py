"""Preloaded cases: build, validate and store real SPHEREx series as local fallbacks.

Used by scripts/precache_demo.py (built-in cases) and by POST /api/cases (cases users add
from the viewer). Every stored case keeps its generation date and provenance.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
import threading
import traceback
import uuid
from typing import Callable

from . import catalogs, coords, hips_spectrum, jpl, spherex, validate
from .config import PROCESSED

EPOCH = 2026.0
_lock = threading.Lock()
JOBS: dict[str, dict] = {}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or uuid.uuid4().hex[:8]


def _read(name: str, default):
    p = PROCESSED / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def index() -> list[dict]:
    return _read("demo_index.json", [])


def _flux_verdict(meas: dict) -> dict:
    f = [p["flux_mjy"] for p in meas["points"] if p.get("flux_mjy")]
    if len(f) < 3:
        return {"status": "pending", "reason": "Too few flux measurements (source may be saturated in this band)."}
    ratio = max(f) / max(min(f), 1e-6)
    return {"status": "change observed" if ratio > 1.5 else "no clear change", "flux_ratio_max_min": round(ratio, 2),
            "caveat": "Each frame has a different wavelength: part of the change may be spectral."}


def build_case(case: dict, log: Callable[[str], None] = print) -> dict:
    """case: id, title, kind, expected, detector, fov, max_frames and either simbad or ra/dec."""
    r = None
    if case.get("simbad"):
        log(f"Resolving {case['simbad']} in SIMBAD")
        r = coords.resolve_name(case["simbad"])
        ra, dec = coords.propagate(r["ra"], r["dec"], r["pmra_masyr"], r["pmdec_masyr"], r["plx_mas"],
                                   r["rv_kms"], "J2000", EPOCH)
    else:
        ra, dec = float(case["ra"]), float(case["dec"])
    log("Downloading real SPHEREx cutouts from IRSA")
    ser = spherex.build_series(ra, dec, case["fov"], case["detector"], case.get("max_frames", 24),
                               case.get("mjd_min"), case.get("mjd_max"))
    if not ser["frames"]:
        raise RuntimeError("No SPHEREx images were found for this position and settings.")
    ser["case"] = dict(case)
    ser["target"] = r
    kind = case.get("kind", "custom")
    meas: dict = {"points": []}
    if kind in ("proper motion", "variability"):
        log("Measuring the source in every frame (registered with Gaia DR3)")
        refs = []
        try:
            refs = [s for s in catalogs.gaia_cone(ra, dec, case["fov"] * 0.7, gmax=19.0)
                    if s["g"] and 9 < s["g"] < 15.5 and math.hypot(s["pmra"] or 0, s["pmdec"] or 0) < 50]
        except Exception as exc:  # registration is optional
            log(f"Gaia reference stars unavailable: {exc}")
        meas = validate.measure(ser, refs)
        meas["n_gaia_refs"] = len(refs)
    log("Extracting the 102-channel spectrum")
    try:
        spec = hips_spectrum.extract(ra, dec)
    except Exception as exc:
        spec = {"error": str(exc)}
    ast = []
    if kind == "solar system object":
        log("Querying JPL for known small bodies in every frame")
        for f in ser["frames"]:
            try:
                ast.append({"mjd": f["mjd"], **jpl.sb_ident(ra, dec, case["fov"] / 2, f["date_utc"])})
            except Exception as exc:
                ast.append({"mjd": f["mjd"], "error": str(exc)})
    ser["validation"] = meas
    path = PROCESSED / f"{case['id']}.json"
    path.write_text(json.dumps(ser), encoding="utf-8")
    (PROCESSED / f"{case['id']}_extras.json").write_text(json.dumps({"spectrum": spec, "asteroids": ast}),
                                                         encoding="utf-8")
    pm = meas.get("pm_measured")
    if kind == "proper motion":
        ver = validate.verdict(pm, r and r["pmra_masyr"], r and r["pmdec_masyr"])
    elif kind == "variability":
        ver = _flux_verdict(meas)
    elif kind == "solar system object":
        ver = validate.moving_object_check(ser, ast, case.get("body", "Psyche"))
    else:
        ver = {"status": "stored", "reason": "User-added case: no automatic validation criterion."}
    entry = {"id": case["id"], "title": case["title"], "ra": ra, "dec": dec, "detector": case["detector"],
             "fov": case["fov"], "file": path.name, "frames": len(ser["frames"]), "generated_utc": now(),
             "kind": kind, "expected": case.get("expected", ""), "mjd_min": case.get("mjd_min"),
             "mjd_max": case.get("mjd_max"), "size_kb": round(path.stat().st_size / 1024),
             "user": bool(case.get("user"))}
    report = {"id": case["id"], "title": case["title"], "kind": kind, "expected": case.get("expected", ""),
              "catalog_pm": [r["pmra_masyr"], r["pmdec_masyr"]] if r else None, "measured": pm, "verdict": ver,
              "frames": len(ser["frames"]), "seasons": ser["available"]["seasons"], "points": meas.get("points", [])}
    save(entry, report)
    return entry


def save(entry: dict, report: dict | None) -> None:
    with _lock:
        idx = {c["id"]: c for c in index()}
        idx[entry["id"]] = entry
        (PROCESSED / "demo_index.json").write_text(json.dumps(list(idx.values()), indent=1), encoding="utf-8")
        if report is not None:
            rep = {c["id"]: c for c in _read("validation_report.json", {"cases": []})["cases"]}
            rep[report["id"]] = report
            (PROCESSED / "validation_report.json").write_text(json.dumps(
                {"generated_utc": now(), "cases": list(rep.values())}, indent=1), encoding="utf-8")


def delete(case_id: str) -> bool:
    with _lock:
        idx = index()
        keep = [c for c in idx if not (c["id"] == case_id and c.get("user"))]
        if len(keep) == len(idx):
            return False
        (PROCESSED / "demo_index.json").write_text(json.dumps(keep, indent=1), encoding="utf-8")
        rep = _read("validation_report.json", {"cases": []})
        rep["cases"] = [c for c in rep["cases"] if c["id"] != case_id]
        (PROCESSED / "validation_report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
        for suffix in (".json", "_extras.json"):
            (PROCESSED / f"{case_id}{suffix}").unlink(missing_ok=True)
        return True


def start_job(kind: str, fn: Callable[[Callable[[str], None]], dict]) -> str:
    """Run fn(log) in a background thread; progress is exposed through JOBS."""
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"id": job_id, "kind": kind, "status": "running", "log": [], "started": now(), "result": None}

    def log(msg: str) -> None:
        JOBS[job_id]["log"].append(msg)

    def run() -> None:
        try:
            JOBS[job_id]["result"] = fn(log)
            JOBS[job_id]["status"] = "done"
        except Exception as exc:
            JOBS[job_id]["status"] = "error"
            JOBS[job_id]["error"] = str(exc)
            log(traceback.format_exc(limit=2))
    threading.Thread(target=run, daemon=True).start()
    return job_id
