# PlanetX Atlas

**From a moving dot to a mission destination.** A public web tool for the NASA Space Apps
*Planet X and SPHEREx* challenge. It joins the SPHEREx time viewer (the core of the challenge)
with a 3D Solar System of 1.58 million bodies and an asteroid prospecting planner.

## Try it online (no install)

**Live showcase:** https://papichulo369963.github.io/planetx-atlas/

The online version runs entirely in the browser on a snapshot of real NASA/ESA data: 16 preloaded SPHEREx cases, 1.58 million orbits, 7,212 NHATS asteroids, their composition cards, porkchop plots, planetary-defense data and the validation report. Searching new sky positions, saving cases, VizieR layers and catalog refresh need the full app below.

## Run the full app locally (Windows)

1. Install Python 3.11+ and Node.js 20+.
2. `git clone https://github.com/papichulo369963/planetx-atlas.git` and `cd planetx-atlas`
3. `powershell -ExecutionPolicy Bypass -File .\install.ps1` (downloads the orbital catalog and rebuilds the cases from IRSA)
4. Run `PlanetX-Atlas.bat`.

## How to open it (installed copy)

- Double-click **PlanetX Atlas** (desktop or Start-menu shortcut), or run `PlanetX-Atlas.bat`.
- The server runs in the background (no window) and the browser opens `http://127.0.0.1:8765`. Its log is `server.log`.
- To stop it, use **Stop PlanetX Atlas** (Start menu) or `Stop-PlanetX-Atlas.bat`.
- If the page shows "The PlanetX Atlas local server is not running", open the shortcut again and reload.
- Full reinstall on another machine: `powershell -ExecutionPolicy Bypass -File .\install.ps1`.

## What it does (all with real data)

| Tab | Function | Data |
|---|---|---|
| SPHEREx viewer | Search by name or RA/Dec (decimal or sexagesimal); field of view; detector D1–D6; video playback with real dates and visible irregular gaps; blink A/B, slider, difference, sum; same stretch for every frame; quality flags; λ filter; Gaia DR3 / CatWISE / SIMBAD / JPL asteroid layers; inspector; follow-and-classify (Planet X mode); 102-channel spectrum; local annotations; shareable URL and iframe | IRSA SIA + IBE cutouts (DR1/QR3), DR1 HiPS cube |
| Multi-mission atlas | Aladin Lite with 2MASS, AllWISE, DSS2, Spitzer and Gaia overlay | IRSA HiPS mirrors, ESA Gaia |
| 3D Solar System | 1,582,561 asteroids and comets propagated on the GPU (Kepler); planets (Standish) and moons; population and H filters; time control 1990–2100 | JPL SBDB |
| Prospecting & missions | 7,212 accessible NEOs (NHATS) with a transparent, adjustable-weight index; composition card with evidence levels and mission ground truth; porkchop plot from our own Lambert solver; Tsiolkovsky exercise | JPL NHATS, SBDB, publications |
| 3D / VR explorer | Tiered model (published / reconstruction from measured dimensions / illustrative), real rotation, scale comparison, surface view, WebXR | JPL SBDB |
| Planetary defense | Upcoming close approaches, Sentry, fireballs | CNEOS |
| Validation & sources | Measured results for every preloaded case, source matrix, evidence levels, roadmap | — |

## Adding more data

- **More real SPHEREx frames:** in the viewer, click **＋ Load more real frames**. It downloads up to 40 real exposures of the same region from IRSA. You can also raise *Max. frames* or pick another detector.
- **Your own preloaded cases:** after any search, use **Save & share → Save case**. The series is stored locally, so it works offline later. Cases that come from a SIMBAD name can be validated for proper motion or variability. Delete them with ✕.
- **More catalogs in the viewer:** under *Add more catalogs*, type any VizieR catalog ID. Examples: `II/328/allwise`, `II/246/out` (2MASS), `II/349/ps1`, `B/vsx/vsx`. You can also **upload your own CSV** with columns `ra, dec` and optional `name, pmra, pmdec, epoch`.
- **Orbital catalog:** in the 3D Solar System tab, **⟳ Update orbits from NASA/JPL SBDB** re-downloads every known orbit. **Add my own orbits (CSV)** takes columns `name, a, e, i, om, w, ma, epoch`.
- **From the command line:** `backend\scripts\precache_demo.py` rebuilds the built-in cases. Add entries to its `EXTRA` list to preload more objects.

## Preloaded cases (16)

- **Challenge targets:** Barnard's Star, Epsilon Indi B, WISE 0855−0714, RW Aurigae, R Draconis, and asteroid 16 Psyche in motion.
- **More objects:** Proxima Centauri, Luhman 16, Kapteyn's Star, Wolf 359, Teegarden's Star, van Maanen 2, Groombridge 1830, SCR J1845−6357, T Tauri, EX Lupi.

Measured results for each case are in the *Validation & sources* tab and in `data/processed/validation_report.json`.

Method: 2D Gaussian centroid, each frame registered against Gaia DR3 stars, least-squares fit.
**validated** means a significant measurement (σ ≤ μ/3) with |Δμ| ≤ max(3σ, 150 mas/yr).
The challenge coordinates for WISE 0855 are roughly at the WISE epoch (~2010). The app propagates every object by its proper motion to 2026 (212″ for WISE 0855).

## Demo script (120 s)

1. **0–15 s** Viewer → *Barnard's Star* (local backup, instant). ▶ Play: real images from 3 seasons.
2. **15–40 s** **Difference** mode: the blue/red dipole shows the northward motion. Real dates and gaps are visible.
3. **40–60 s** Click the star → *Follow through all dates* (measured motion) → *Spectrum (102 channels)*.
4. **60–80 s** *Asteroid 16 Psyche in motion* + *Known asteroids (JPL)* layer: Psyche crosses the field inside its box → *Orbit and composition*.
5. **80–100 s** 3D Solar System (1.58 M bodies) → Prospecting: weighted ranking, Bennu card (OSIRIS-REx samples), porkchop.
6. **100–120 s** Bennu 3D explorer with scale comparison → Validation tab.

## Architecture

- `backend/app` (FastAPI, Python):
  - `spherex.py`: SIA queries, cutouts, common TAN grid, binning.
  - `hips_spectrum.py`: spectrum via HTTP Range.
  - `catalogs.py`: Gaia, CatWISE, SIMBAD and any VizieR catalog.
  - `cases.py`: building, validating and saving cases, plus background jobs.
  - `jpl.py`, `astro.py` (Kepler, Lambert, Tsiolkovsky), `prospect.py`, `validate.py`, `coords.py`, `schemas.py` (Pydantic contracts).
- `frontend/src` (React + Vite + TypeScript + Tailwind, Three.js/R3F, @react-three/xr, Aladin Lite). `types.ts` mirrors the backend contracts.
- `data/catalog` holds the binary orbital catalog. `data/processed` holds the demo backups, each with its generation date. `data/cache` is an on-disk cache that serves the last good answer if an archive is down.
- Tests: `backend/tests` (13), including Lambert checked against Curtis Example 5.2.

## Known limitations

- The HiPS spectrum is for visualization only (per IRSA). It is never converted to reflectance or composition.
- Orbits use two-body propagation without perturbations. The porkchop is one-way, from a 400 km LEO.
- Asteroid predictions are geocentric. SPHEREx is in low Earth orbit, so there is some parallax for very close NEOs.
- Composition is limited to taxonomy hints: only 23 of the 7,212 NHATS objects have a spectral class. No percentages, reserves or profitability are given.
- During development the CDS main site was down, so the Harvard and IRSA mirrors are used. IRSA's SIA service also returned sporadic 502 errors; the app retries and falls back to its cache.
