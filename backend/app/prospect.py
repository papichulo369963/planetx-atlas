"""Transparent prospecting-interest components for NHATS-accessible NEOs.

Every component is in [0, 1] (or None = unknown) and documented. The weighted
index itself is computed in the browser so users can change the weights.
This is NOT an economic or resource-reserve estimate.

Component definitions
- access:   (12 - dv_min) / (12 - 4), clipped. dv_min = NHATS minimum round-trip dv [km/s].
- size:     (log10(D_m) - 1) / 2.5, clipped. D from SBDB diameter or NHATS size range midpoint.
- volatile: taxonomy-based HINT of hydrated minerals (C-complex, esp. Ch/Cgh with the 0.7 um
            band; Rivkin 2012, Icarus 221; DeMeo & Carry 2014, Nature 505). Not water content.
- metal:    taxonomy-based HINT (Tholen M / Bus-DeMeo X-complex; may be metal or enstatite-rich).
- evidence: (9 - OCC)/9 orbit quality * 0.6 + 0.4 if a measured taxonomy exists.
- windows:  log10(n_viable_trajectories)/log10(50000), clipped.
"""
from __future__ import annotations

import math

from . import jpl

VOLATILE = {"Ch": 0.9, "Cgh": 0.9, "C": 0.6, "Cb": 0.6, "Cg": 0.6, "B": 0.6, "F": 0.55,
            "G": 0.6, "D": 0.45, "P": 0.4, "T": 0.4, "K": 0.25, "L": 0.2}
METAL = {"M": 0.7, "X": 0.4, "Xk": 0.45, "Xe": 0.3, "Xc": 0.3, "E": 0.15, "K": 0.2}
LOW = {"S": 0.1, "Sq": 0.1, "Sr": 0.1, "Sa": 0.1, "Sk": 0.1, "Sv": 0.1, "Q": 0.1, "V": 0.05,
       "A": 0.05, "O": 0.1, "R": 0.05}


def _clip(x: float) -> float:
    return max(0.0, min(1.0, x))


def _tax(phys: dict | None) -> str | None:
    if not phys:
        return None
    t = phys.get("spec_B") or phys.get("spec_T")
    return t.strip().rstrip(":") if t else None


def taxonomy_hints(tax: str | None) -> tuple[float | None, float | None]:
    if not tax:
        return None, None
    base = tax.split("/")[0]
    for cand in (base, base[:2], base[:1]):
        if cand in VOLATILE or cand in METAL or cand in LOW:
            return VOLATILE.get(cand, LOW.get(cand, 0.1)), METAL.get(cand, 0.05)
    return None, None


def components(rec: dict, phys: dict | None) -> dict:
    dv = float(rec["min_dv"]["dv"])
    d_km = phys.get("diameter_km") if phys else None
    if d_km:
        d_m, d_src = d_km * 1000, "measured (SBDB)"
    elif rec.get("min_size") is not None and rec.get("max_size") is not None:
        d_m = (float(rec["min_size"]) + float(rec["max_size"])) / 2
        d_src = "estimated from H and albedo range (NHATS)"
    else:
        d_m, d_src = None, "unknown (no absolute magnitude)"
    tax = _tax(phys)
    vol, met = taxonomy_hints(tax)
    occ = int(rec.get("occ") or 9)
    return {
        "des": rec["des"], "name": (rec.get("fullname") or "").strip(),
        "dv_min": dv, "dur_at_min_dv": rec["min_dv"]["dur"],
        "dur_min": rec["min_dur"]["dur"], "dv_at_min_dur": float(rec["min_dur"]["dv"]),
        "size_m": None if d_m is None else round(d_m, 1), "size_source": d_src,
        "H": None if rec.get("h") is None else float(rec["h"]),
        "taxonomy": tax, "albedo": phys.get("albedo") if phys else None, "occ": occ,
        "n_traj": rec["n_via_traj"], "next_obs": rec.get("obs_start"),
        "c": {
            "access": round(_clip((12 - dv) / 8), 3),
            "size": None if d_m is None else round(_clip((math.log10(max(d_m, 1)) - 1) / 2.5), 3),
            "volatile": vol, "metal": met,
            "evidence": round(_clip((9 - occ) / 9 * 0.6 + (0.4 if tax else 0)), 3),
            "windows": round(_clip(math.log10(max(rec["n_via_traj"], 1)) / math.log10(50000)), 3),
        },
    }


def table() -> dict:
    nh = jpl.nhats_list()
    phys = jpl.neo_physical()
    rows = [components(r, phys.get(r["des"])) for r in nh]
    return {
        "count": len(rows),
        "rows": rows,
        "sources": ["NASA/JPL NHATS Data API (dv <= 12 km/s, duration <= 450 d, stay >= 8 d)",
                    "NASA/JPL SBDB Query API (taxonomy, diameter, albedo)"],
        "disclaimer": ("Prospecting INTEREST index, not profitability. Volatile or metal hints "
                       "are inferred by taxonomic analogy and do not measure water, "
                       "metals or reserves."),
    }
