# AI Usage Log — PlanetX Atlas

NASA Space Apps requirement: disclose AI assistance.

| Date | Tool | What the AI did | Human validation pending / done |
|---|---|---|---|
| 2026-11-14 | Claude Code (Claude Opus 5.5) | Proposal design and rewrite of the project prompt | Reviewed by the team |
| 2026-11-14 | Claude Code (Claude Opus 5.5) | Live verification of services: IRSA SIA/IBE/HiPS, Gaia TAP, SIMBAD (Harvard mirror), VizieR (CfA), JPL SBDB/NHATS/sb_ident/Horizons/CNEOS | Endpoints tested with real responses (see `README.md`) |
| 2026-11-14 | Claude Code (Claude Opus 5.5) | Full backend (FastAPI) and frontend (React/Three.js) code | 13 automated tests; Lambert validated against Curtis (2014) Ex. 5.2; **review the code before submission** |
| 2026-11-14 | Claude Code (Claude Opus 5.5) | Automatic scientific validation of the preloaded cases (centroids, Gaia registration, photometry) | Results in `data/processed/validation_report.json`; **the team should review the criteria** |
| 2026-11-14 | Claude Code (Claude Opus 5.5) | Mission knowledge base (`data/knowledge/bodies.json`) with bibliographic references | **Check every citation before presenting it** |
| 2026-11-15 | Claude Code (Claude Opus 5.5) | English translation of the whole app; 10 extra preloaded objects; save-as-case, load-more-frames, VizieR/CSV catalog layers, orbital catalog refresh and custom orbits | Tested in the browser and via the API; **review the new cases' results** |

AI-generated modules: everything in `backend/app`, `backend/scripts`, `backend/tests` and `frontend/src`.
Data: everything comes from public NASA/ESA/CDS archives; the AI did not generate any observational data.
