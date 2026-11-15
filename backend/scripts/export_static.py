"""Export real-data snapshots so the frontend can run as a static site (GitHub Pages).

Writes frontend/public/static-api/... mirroring the /api/* responses the UI needs:
demo cases (real SPHEREx series), validation report, orbital catalog (binary), NHATS
prospecting table, knowledge base, CNEOS snapshots, SBDB cards and porkchops for the top
candidates and famous bodies, overlays and spectra for every case, and a name finder.
Every file is produced by the same backend functions the live app uses.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import astro, cases, catalogs, jpl, prospect  # noqa: E402
from app.config import CATALOG, KNOWLEDGE, PROCESSED, ROOT  # noqa: E402
from app.main import catalog_find, overlay, porkchop  # noqa: E402

OUT = ROOT / "frontend" / "public" / "static-api"
FAMOUS = ["101955", "162173", "99942", "433", "25143", "65803", "16", "4", "1", "3200", "2", "10", "52246"]
FIND_NAMES = ["Bennu", "Ryugu", "Apophis", "Eros", "Itokawa", "Didymos", "Psyche", "Vesta", "Ceres", "Phaethon",
              "Pallas", "Hygiea", "Donaldjohanson", "Halley", "1P", "2P", "Encke", "Toutatis", "Dimorphos"]


def key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.strip().lower())


def write(rel: str, obj) -> None:
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def default_rank(rows: list[dict], n: int) -> list[str]:
    w = {"access": 3, "size": 1, "volatile": 2, "metal": 1, "evidence": 1, "windows": 1}
    score = lambda r: sum(w[k] * (r["c"][k] or 0) for k in w) / sum(w.values())  # noqa: E731
    return [r["des"] for r in sorted(rows, key=score, reverse=True)[:n]]


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    write("health.json", {"ok": True, "static": True, "snapshot_utc": stamp})

    print("demo cases", flush=True)
    idx = [c for c in cases.index() if c.get("file")]
    write("demo.json", idx)
    for c in idx:
        data = json.loads((PROCESSED / c["file"]).read_text(encoding="utf-8"))
        data["fallback"] = True
        data["fallback_reason"] = f"Real SPHEREx data snapshot generated on {c['generated_utc']}"
        write(f"demo/{c['id']}.json", data)
        extras = PROCESSED / f"{c['id']}_extras.json"
        if extras.exists():
            spec = json.loads(extras.read_text(encoding="utf-8")).get("spectrum")
            if spec and "error" not in spec:
                write(f"spectrum/{c['id']}.json", spec)
        for kind in ("gaia", "catwise", "simbad"):
            try:
                ov = overlay(kind, c["ra"], c["dec"], c["fov"], 61000.0)
                write(f"overlay/{c['id']}_{kind}.json", ov.model_dump())
            except Exception as exc:
                print("  skip", c["id"], kind, str(exc)[:80], flush=True)
        if c["id"].startswith("psyche"):
            for f in data["frames"]:
                try:
                    ov = overlay("asteroids", c["ra"], c["dec"], c["fov"], f["mjd"])
                    write(f"overlay/{c['id']}_asteroids_{f['mjd']:.3f}.json", ov.model_dump())
                except Exception as exc:
                    print("  skip asteroids", f["mjd"], str(exc)[:80], flush=True)
    rep = PROCESSED / "validation_report.json"
    write("validation.json", json.loads(rep.read_text(encoding="utf-8")) if rep.exists() else {"cases": []})

    print("catalog", flush=True)
    (OUT / "catalog").mkdir(exist_ok=True)
    shutil.copy(CATALOG / "meta.json", OUT / "catalog" / "meta.json")
    for f in ("orbits.bin", "classes.bin"):
        shutil.copy(CATALOG / f, OUT / "catalog" / f)

    print("prospecting", flush=True)
    table = prospect.table()
    write("prospect.json", table)
    write("knowledge.json", json.loads((KNOWLEDGE / "bodies.json").read_text(encoding="utf-8")))
    bodies = list(dict.fromkeys(default_rank(table["rows"], 40) + FAMOUS))
    for i, des in enumerate(bodies):
        try:
            write(f"sbdb/{key(des)}.json", jpl.sbdb(des))
        except Exception as exc:
            print("  skip sbdb", des, exc, flush=True)
            continue
        if i < 30 or des in FAMOUS:
            try:
                write(f"porkchop/{key(des)}.json", porkchop(des, "2027-01-01", "2032-12-31", 60, 500))
            except Exception as exc:
                print("  skip porkchop", des, str(exc)[:80], flush=True)
    for q in FIND_NAMES + bodies:
        try:
            write(f"find/{key(q)}.json", catalog_find(q))
        except Exception:
            pass

    print("planetary defense", flush=True)
    for k, fn in {"cad": jpl.close_approaches, "sentry": jpl.sentry, "fireballs": jpl.fireballs}.items():
        try:
            write(f"defense/{k}.json", fn())
        except Exception as exc:
            print("  skip", k, exc, flush=True)
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()) / 1e6
    print(f"DONE {size:.1f} MB in {OUT}", flush=True)


if __name__ == "__main__":
    _ = (astro, catalogs)  # imported for side effects of module setup
    main()
