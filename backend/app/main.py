"""PlanetX Atlas API: SPHEREx time viewer, multi-mission overlays, small bodies, prospecting.

Read-only public API. Run: uvicorn app.main:app --port 8765 (from backend/).
"""
from __future__ import annotations

import json
import math
from functools import lru_cache

from astropy.time import Time
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel, Field

from . import astro, cases, catalogs, coords, hips_spectrum, jpl, prospect, spherex
from .config import CATALOG, FRONTEND_DIST, KNOWLEDGE, PROCESSED
from .schemas import Overlay, OverlayPoint, Target

app = FastAPI(title="PlanetX Atlas API", version="1.0.0",
              description="SPHEREx + Gaia + WISE + JPL: from a moving dot to a mission destination.")
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])


def _fail(exc: Exception, status: int = 502) -> HTTPException:
    return HTTPException(status_code=status, detail=str(exc))


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "catalog": (CATALOG / "meta.json").exists(),
            "demo_cases": len(_demo_index())}


# ---------- Coordinates ----------
@app.get("/api/resolve", response_model=Target)
def resolve(name: str = Query(..., min_length=1), epoch: float = Query(2026.0, ge=1990, le=2100)) -> Target:
    """SIMBAD name -> catalog position + proper-motion propagated position."""
    try:
        r = coords.resolve_name(name)
    except coords.CoordError as exc:
        raise _fail(exc, 404)
    ra, dec = coords.propagate(r["ra"], r["dec"], r["pmra_masyr"], r["pmdec_masyr"],
                               r["plx_mas"], r["rv_kms"], "J2000", epoch)
    moved = math.hypot((ra - r["ra"]) * math.cos(math.radians(dec)), dec - r["dec"]) * 3600
    return Target(query=name, main_id=r["main_id"], otype=r["otype"], ra_catalog=r["ra"],
                  dec_catalog=r["dec"], ra=ra, dec=dec, target_epoch=epoch,
                  pmra_masyr=r["pmra_masyr"], pmdec_masyr=r["pmdec_masyr"], plx_mas=r["plx_mas"],
                  moved_arcsec=round(moved, 2), source=r["source"])


@app.get("/api/parse")
def parse(ra: str, dec: str) -> dict:
    try:
        c = coords.parse_coords(ra, dec)
    except coords.CoordError as exc:
        raise _fail(exc, 422)
    return {"ra": c.ra.deg, "dec": c.dec.deg,
            "ra_hms": c.ra.to_string(unit="hourangle", sep="hms", precision=2),
            "dec_dms": c.dec.to_string(sep="dms", precision=1, alwayssign=True)}


# ---------- SPHEREx ----------
@app.get("/api/spherex/availability")
def availability(ra: float = Query(..., ge=0, lt=360), dec: float = Query(..., ge=-90, le=90)) -> dict:
    try:
        return spherex.summarize(spherex.query_images(ra, dec))
    except Exception as exc:
        raise _fail(exc)


@app.get("/api/spherex/series")
def series(ra: float = Query(..., ge=0, lt=360), dec: float = Query(..., ge=-90, le=90),
           fov: float = Query(0.1, ge=0.02, le=0.6), detector: int = Query(2, ge=0, le=6),
           max_frames: int = Query(16, ge=2, le=40), mjd_min: float | None = None,
           mjd_max: float | None = None) -> JSONResponse:
    """Real SPHEREx frames on a common grid. Falls back to a stored demo case if offline.

    detector=0 mixes all detectors; mjd_min/mjd_max restrict to a time window.
    """
    try:
        data = spherex.build_series(ra, dec, fov, detector, max_frames, mjd_min, mjd_max)
        if not data["frames"]:
            raise RuntimeError("IRSA returned no valid cutouts")
        data["fallback"] = False
        return JSONResponse(data)
    except Exception as exc:
        demo = _nearest_demo(ra, dec, detector)
        if demo:
            data = json.loads(demo.read_text(encoding="utf-8"))
            data["fallback"] = True
            data["fallback_reason"] = str(exc)
            return JSONResponse(data)
        raise _fail(exc)


@app.get("/api/spherex/spectrum")
def spectrum(ra: float = Query(..., ge=0, lt=360), dec: float = Query(..., ge=-90, le=90),
             aperture_px: float = Query(2.0, ge=1, le=5)) -> dict:
    try:
        return hips_spectrum.extract(ra, dec, aperture_px)
    except Exception as exc:
        raise _fail(exc)


# ---------- Overlays ----------
def _jyear(mjd: float) -> float:
    return float(Time(mjd, format="mjd").jyear)


@app.get("/api/overlay/{kind}", response_model=Overlay)
def overlay(kind: str, ra: float, dec: float, fov: float = 0.1, mjd: float = 61000.0,
            cat: str | None = None) -> Overlay:
    radius = fov * 0.75
    epoch = _jyear(mjd)
    try:
        if kind == "gaia":
            src = catalogs.gaia_cone(ra, dec, radius)
            pos = [catalogs.propagate_linear(s, 2016.0, epoch) for s in src]
            labels = [f"Gaia DR3 {s['id']} G={s['g']:.1f}" for s in src]
            note, source = f"Gaia DR3 (J2016.0) propagated to {epoch:.2f}", "ESA Gaia DR3"
        elif kind == "catwise":
            src = catalogs.catwise_cone(ra, dec, radius)
            pos = [catalogs.propagate_linear(s, 2015.4, epoch) for s in src]
            labels = [f"CatWISE {s['id']} W1={s['w1']}" for s in src]
            note, source = f"CatWISE2020 (~2015.4) propagated to {epoch:.2f}", "CatWISE2020 / VizieR"
        elif kind == "simbad":
            src = catalogs.simbad_cone(ra, dec, radius)
            pos = [(s["ra"], s["dec"]) for s in src]
            labels = [f"{s['id']} ({s['otype']})" for s in src]
            note, source = "SIMBAD J2000 (not propagated)", "SIMBAD"
        elif kind == "asteroids":
            iso = Time(mjd, format="mjd").isot
            res = jpl.sb_ident(ra, dec, fov / 2, iso)
            src, pos, labels = [], [], []
            from astropy.coordinates import SkyCoord
            import astropy.units as u
            for b in res["bodies"]:
                c = SkyCoord(b["ra_sex"], b["dec_sex"].replace("'", "m").replace('"', "s").replace(" ", "d", 1),
                             unit=(u.hourangle, u.deg))
                src.append({"id": b["name"], **b})
                pos.append((c.ra.deg, c.dec.deg))
                labels.append(f"{b['name']} V={b['vmag']}")
            note, source = f"Predicted position for {iso[:16]} UTC (geocenter)", "JPL Small-Body Identification"
        elif kind == "vizier":
            if not cat:
                raise HTTPException(422, "Missing VizieR catalog identifier (cat=...)")
            res = catalogs.vizier_cone(cat, ra, dec, radius)
            src = [{"id": s["id"], **s["extra"], "ra": s["ra"], "dec": s["dec"]} for s in res["rows"]]
            pos = [(s["ra"], s["dec"]) for s in res["rows"]]
            labels = [f"{cat} {s['id']}" for s in res["rows"]]
            note, source = "VizieR J2000 positions at the catalog epoch (not propagated)", f"VizieR {cat}: {res['title']}"
        else:
            raise HTTPException(404, "Unknown layer")
    except HTTPException:
        raise
    except Exception as exc:
        raise _fail(exc)
    xy = spherex.world_to_grid(ra, dec, fov, pos)
    kind_name = "asteroid" if kind == "asteroids" else kind
    epoch0 = {"gaia": 2016.0, "catwise": 2015.4}.get(kind)
    pts = [OverlayPoint(id=str(s.get("id")), x=x, y=y, label=lab, kind=kind_name,
                        extra={**{k: v for k, v in s.items() if kind == "vizier" and k not in ("id", "ra", "dec")
                                  or k in ("pmra", "pmdec", "plx", "g", "otype", "vmag", "ra_rate", "dec_rate",
                                           "w1", "w2")},
                               "ra0": s.get("ra", p[0]) if kind != "asteroids" else p[0],
                               "dec0": s.get("dec", p[1]) if kind != "asteroids" else p[1],
                               "epoch0": epoch0})
           for s, p, (x, y), lab in zip(src, pos, xy, labels)]
    return Overlay(source=source, epoch_note=note, points=pts)


@app.get("/api/validation")
def validation() -> dict:
    p = PROCESSED / "validation_report.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"cases": []}


@app.get("/api/pixel")
def pixel(ra: float, dec: float, fov: float, x: float, y: float) -> dict:
    r, d = spherex.grid_to_world(ra, dec, fov, x, y)
    return {"ra": r, "dec": d}


# ---------- Small bodies ----------
@app.get("/api/sbdb/{des}")
def sbdb(des: str) -> dict:
    try:
        return jpl.sbdb(des)
    except Exception as exc:
        raise _fail(exc, 404)


@app.get("/api/knowledge")
def knowledge() -> dict:
    return json.loads((KNOWLEDGE / "bodies.json").read_text(encoding="utf-8"))


@app.get("/api/prospect")
def prospect_table() -> dict:
    try:
        return prospect.table()
    except Exception as exc:
        raise _fail(exc)


@app.get("/api/nhats/{des}")
def nhats(des: str) -> dict:
    try:
        return jpl.nhats_object(des)
    except Exception as exc:
        raise _fail(exc, 404)


@app.get("/api/porkchop")
def porkchop(des: str, start: str = "2027-01-01", end: str = "2030-12-31",
             tof_min: float = Query(60, ge=20), tof_max: float = Query(500, le=1500)) -> dict:
    """One-way Earth->body rendezvous grid (own Lambert solver, two-body)."""
    try:
        orb = jpl.sbdb(des)["orbit"]
        el = {e["name"]: float(e["value"]) for e in orb["elements"] if e.get("value") is not None}
        elements = {"a": el["a"], "e": el["e"], "i": el["i"], "om": el["om"], "w": el["w"],
                    "ma": el["ma"], "epoch": float(orb["epoch"])}
        jd0, jd1 = Time(start).jd, Time(end).jd
        res = astro.porkchop(elements, jd0, jd1, tof_min, tof_max)
        res["elements"] = elements
        res["method"] = ("Single-revolution Lambert (Curtis, Alg. 5.2); Earth from Standish mean elements; "
                         "body from SBDB osculating elements; dv = departure from 400 km LEO + "
                         "arrival (rendezvous). One way, no perturbations.")
        if res["best"]:
            res["best"]["departure_iso"] = Time(res["best"]["departure_jd"], format="jd").isot[:10]
        return res
    except Exception as exc:
        raise _fail(exc)


@app.get("/api/rocket")
def rocket(dv: float = Query(..., ge=0, le=30), isp: float = Query(450, ge=100, le=10000),
           payload_t: float = Query(10, gt=0)) -> dict:
    ratio = astro.tsiolkovsky_mass_ratio(dv, isp)
    return {"mass_ratio": ratio, "propellant_t": payload_t * (ratio - 1), "initial_t": payload_t * ratio,
            "formula": "m0/mf = exp(dv / (Isp * g0))", "evidence": "calculated"}


# ---------- Orbit catalog ----------
@lru_cache(maxsize=1)
def _names() -> list[str]:
    return json.loads((CATALOG / "names.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _name_index() -> dict[str, int]:
    return {n: i for i, n in enumerate(_names())}


@app.get("/api/catalog/meta")
def catalog_meta() -> dict:
    return json.loads((CATALOG / "meta.json").read_text(encoding="utf-8"))


@app.get("/api/catalog/{fname}")
def catalog_file(fname: str):
    if fname not in ("orbits.bin", "classes.bin"):
        raise HTTPException(404)
    return FileResponse(CATALOG / fname, media_type="application/octet-stream")


@app.get("/api/catalog-name/{idx}")
def catalog_name(idx: int) -> dict:
    names = _names()
    if not 0 <= idx < len(names):
        raise HTTPException(404)
    return {"index": idx, "pdes": names[idx]}


@app.get("/api/catalog-find")
def catalog_find(q: str) -> dict:
    """Find catalog index by designation; names like 'Bennu' are resolved through SBDB."""
    idx = _name_index().get(q.strip())
    des = q.strip()
    if idx is None:
        try:
            obj = jpl.sbdb(q.strip())["object"]
            des = obj.get("des")
            idx = _name_index().get(des)
        except Exception:
            idx = None
    if idx is None:
        raise HTTPException(404, f"'{q}' was not found in the orbital catalog")
    return {"index": idx, "pdes": des}


# ---------- Planetary defense ----------
@app.get("/api/defense/{kind}")
def defense(kind: str) -> dict:
    fn = {"cad": jpl.close_approaches, "sentry": jpl.sentry, "fireballs": jpl.fireballs}.get(kind)
    if not fn:
        raise HTTPException(404)
    try:
        return fn()
    except Exception as exc:
        raise _fail(exc)


# ---------- Demo cases (local fallback) ----------
def _demo_index() -> list[dict]:
    p = PROCESSED / "demo_index.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def _nearest_demo(ra: float, dec: float, detector: int):
    for case in _demo_index():
        if abs(case["ra"] - ra) < 0.01 and abs(case["dec"] - dec) < 0.01 and case["detector"] == detector:
            p = PROCESSED / case["file"]
            return p if p.exists() else None
    return None


@app.get("/api/demo")
def demo_cases() -> list[dict]:
    return _demo_index()


class NewCase(BaseModel):
    """A user request to store a real SPHEREx series as a preloaded case."""
    title: str = Field(min_length=1, max_length=80)
    name: str | None = Field(None, description="SIMBAD name (proper motion is propagated)")
    ra: float | None = Field(None, ge=0, lt=360)
    dec: float | None = Field(None, ge=-90, le=90)
    fov: float = Field(0.1, ge=0.02, le=0.6)
    detector: int = Field(2, ge=0, le=6)
    max_frames: int = Field(24, ge=2, le=40)
    mjd_min: float | None = None
    mjd_max: float | None = None
    kind: str = Field("custom", pattern="^(custom|proper motion|variability)$")
    expected: str = Field("", max_length=300)


@app.post("/api/cases")
def add_case(req: NewCase) -> dict:
    """Start a background job that downloads, validates and stores a new case."""
    if not req.name and (req.ra is None or req.dec is None):
        raise HTTPException(422, "Give a SIMBAD name or RA/Dec.")
    case = {"id": "user-" + cases.slug(req.title), "title": req.title, "simbad": req.name, "ra": req.ra,
            "dec": req.dec, "fov": req.fov, "detector": req.detector, "max_frames": req.max_frames,
            "mjd_min": req.mjd_min, "mjd_max": req.mjd_max, "kind": req.kind if req.name else "custom",
            "expected": req.expected, "user": True}
    return {"job": cases.start_job("case", lambda log: cases.build_case(case, log)), "case_id": case["id"]}


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: str) -> dict:
    if not cases.delete(case_id):
        raise HTTPException(404, "Only user-added cases can be deleted.")
    return {"deleted": case_id}


@app.get("/api/jobs/{job_id}")
def job(job_id: str) -> dict:
    j = cases.JOBS.get(job_id)
    if not j:
        raise HTTPException(404)
    return j


@app.post("/api/catalog/refresh")
def refresh_catalog() -> dict:
    """Re-download every known asteroid and comet orbit from JPL SBDB (takes a few minutes)."""
    import importlib.util
    from .config import ROOT
    spec = importlib.util.spec_from_file_location("boc", ROOT / "backend" / "scripts" / "build_orbit_catalog.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    def run(log):
        log("Downloading all orbits from NASA/JPL SBDB (about 1.6 million bodies)")
        mod.main()
        _names.cache_clear()
        _name_index.cache_clear()
        meta = json.loads((CATALOG / "meta.json").read_text(encoding="utf-8"))
        log(f"Done: {meta['count']} bodies")
        return meta
    return {"job": cases.start_job("catalog", run)}


@app.get("/api/demo/{case_id}")
def demo_case(case_id: str) -> JSONResponse:
    for case in _demo_index():
        if case["id"] == case_id:
            data = json.loads((PROCESSED / case["file"]).read_text(encoding="utf-8"))
            data["fallback"] = True
            data["fallback_reason"] = f"Local backup generated on {case['generated_utc']}"
            return JSONResponse(data)
    raise HTTPException(404)


# ---------- Frontend (single-page app) ----------
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    NO_CACHE = {"Cache-Control": "no-store, must-revalidate"}

    @app.get("/{path:path}")
    def spa(path: str):
        """index.html is never cached, so a rebuild never leaves the browser pointing at deleted chunks."""
        if path.startswith("api/"):
            raise HTTPException(404, "Unknown API route")
        f = FRONTEND_DIST / path
        if path and f.is_file() and f.name != "index.html":
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html", headers=NO_CACHE)
