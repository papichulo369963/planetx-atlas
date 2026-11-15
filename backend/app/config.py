"""Paths and constants shared by the backend."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CACHE = DATA / "cache"
PROCESSED = DATA / "processed"
CATALOG = DATA / "catalog"
KNOWLEDGE = DATA / "knowledge"
FRONTEND_DIST = ROOT / "frontend" / "dist"

for _p in (CACHE, PROCESSED, CATALOG, KNOWLEDGE):
    _p.mkdir(parents=True, exist_ok=True)

IRSA = "https://irsa.ipac.caltech.edu"
SPHEREX_COLLECTIONS = ["spherex_dr1", "spherex_qr3"]
HIPS_CUBE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/hips_20261026"
JPL = "https://ssd-api.jpl.nasa.gov"

# Physical constants (SI unless noted). IAU 2012 / JPL DE values.
AU_KM = 149_597_870.7          # km
MU_SUN = 1.32712440018e11      # km^3 s^-2
MU_EARTH = 398_600.4418        # km^3 s^-2
R_EARTH = 6_378.137            # km
DAY_S = 86_400.0               # s
G0 = 9.80665                   # m s^-2, standard gravity (Tsiolkovsky)
