"""Build the local demo fallback: challenge test cases, 10 extra objects and a moving asteroid.

For each case: real SPHEREx series (JSON), quick-look spectrum, overlays and a quantitative
validation (measured vs catalog proper motion / flux variation / JPL prediction).
Outputs data/processed/<id>.json, demo_index.json and validation_report.json.
Usage: python precache_demo.py [case_id ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import cases  # noqa: E402

PM, VAR = "proper motion", "variability"
CHALLENGE = [
    {"id": "barnard", "title": "Barnard's Star", "simbad": "Barnard star", "detector": 2, "fov": 0.1, "kind": PM,
     "expected": "~10.4\"/yr towards the north (SIMBAD/Gaia DR3)."},
    {"id": "eps-ind-b", "title": "Epsilon Indi B (brown dwarfs)", "simbad": "eps Ind B", "detector": 6, "fov": 0.1,
     "kind": PM, "expected": "~4.7\"/yr; bright T dwarf near 4.5 um. Possible contamination from eps Ind A (~7')."},
    {"id": "wise-0855", "title": "WISE 0855-0714", "simbad": "WISE J085510.83-071442.5", "detector": 6, "fov": 0.1,
     "kind": PM, "expected": "~8.1\"/yr; very faint (W2~13.9), only detectable near 4.5 um."},
    {"id": "rw-aur", "title": "RW Aurigae", "simbad": "RW Aur", "detector": 3, "fov": 0.1, "kind": VAR,
     "expected": "T Tauri star with irregular brightness changes."},
    {"id": "r-dra", "title": "R Draconis", "simbad": "R Dra", "detector": 1, "fov": 0.1, "kind": VAR,
     "expected": "Mira variable (period ~246 d), large brightness amplitude."},
]
EXTRA = [
    {"id": "proxima-cen", "title": "Proxima Centauri", "simbad": "Proxima Cen", "detector": 2, "fov": 0.1, "kind": PM,
     "expected": "Closest star to the Sun; ~3.85\"/yr."},
    {"id": "luhman-16", "title": "Luhman 16 (brown dwarf binary)", "simbad": "Luhman 16", "detector": 3, "fov": 0.1,
     "kind": PM, "expected": "Nearest brown dwarfs (2 pc); ~2.8\"/yr. Found in WISE data in 2013."},
    {"id": "kapteyn", "title": "Kapteyn's Star", "simbad": "HD 33793", "detector": 2, "fov": 0.1, "kind": PM,
     "expected": "Halo red dwarf; ~8.6\"/yr, second-highest proper motion known."},
    {"id": "wolf-359", "title": "Wolf 359", "simbad": "Wolf 359", "detector": 2, "fov": 0.1, "kind": PM,
     "expected": "Nearby red dwarf; ~4.7\"/yr."},
    {"id": "teegarden", "title": "Teegarden's Star", "simbad": "GAT 1370", "detector": 2, "fov": 0.1, "kind": PM,
     "expected": "Ultracool dwarf discovered in 2003 by its motion; ~5.1\"/yr."},
    {"id": "van-maanen-2", "title": "van Maanen 2 (white dwarf)", "simbad": "van Maanen 2", "detector": 2, "fov": 0.1,
     "kind": PM, "expected": "Nearest solitary white dwarf; ~3.0\"/yr."},
    {"id": "groombridge-1830", "title": "Groombridge 1830", "simbad": "HD 103095", "detector": 1, "fov": 0.1,
     "kind": PM, "expected": "Metal-poor halo star; ~7.1\"/yr (bright: may saturate)."},
    {"id": "scr-1845", "title": "SCR J1845-6357", "simbad": "SCR J1845-6357", "detector": 2, "fov": 0.1, "kind": PM,
     "expected": "Red dwarf with a T-dwarf companion; ~2.6\"/yr."},
    {"id": "t-tau", "title": "T Tauri", "simbad": "T Tau", "detector": 2, "fov": 0.1, "kind": VAR,
     "expected": "Prototype young variable star; irregular infrared variability."},
    {"id": "ex-lup", "title": "EX Lupi", "simbad": "EX Lup", "detector": 2, "fov": 0.1, "kind": VAR,
     "expected": "Prototype EXor: young star with accretion outbursts."},
]
PSYCHE = {"id": "psyche-2025-09", "title": "Asteroid 16 Psyche in motion", "ra": 75.39, "dec": 19.472, "detector": 0,
          "fov": 0.6, "max_frames": 12, "mjd_min": 60923.2, "mjd_max": 60924.9, "kind": "solar system object",
          "body": "Psyche",
          "expected": "Psyche (V~11.2) moves ~0.27 deg/day; JPL sb_ident must mark it in every frame."}
ALL = CHALLENGE + EXTRA + [PSYCHE]


def main() -> None:
    only = set(sys.argv[1:])
    for case in ALL:
        if only and case["id"] not in only:
            continue
        case.setdefault("max_frames", 24)
        print("==", case["id"], flush=True)
        try:
            entry = cases.build_case(case, lambda m: print("  ", m, flush=True))
            print("   ->", entry["frames"], "frames", flush=True)
        except Exception as exc:
            print("FAILED", case["id"], exc, flush=True)
            cases.save({"id": case["id"], "title": case["title"], "ra": 0, "dec": 0, "detector": case["detector"],
                        "fov": case["fov"], "file": "", "frames": 0, "generated_utc": cases.now(),
                        "kind": case["kind"], "expected": case["expected"], "failed": str(exc)},
                       {"id": case["id"], "title": case["title"], "kind": case["kind"], "expected": case["expected"],
                        "verdict": {"status": "pending", "reason": f"Data access error: {exc}"}})


if __name__ == "__main__":
    main()
