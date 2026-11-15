import { useEffect, useState } from "react";
import { getJSON } from "../../api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Case = any;

const SOURCES: [string, string, string, string][] = [
  ["SPHEREx DR1/QR3 (L2 spectral images)", "NASA/IPAC IRSA · SIA v2 + IBE cutout service", "Images in MJy/sr, flags, variance, λ per pixel", "verified live"],
  ["SPHEREx DR1 HiPS cube (102 channels)", "IRSA · HTTP Range reads", "Instant quick-look spectrum", "verified live"],
  ["Gaia DR3", "ESA Gaia Archive TAP", "Position, proper motion, parallax (J2016.0)", "verified live"],
  ["CatWISE2020", "VizieR (CfA Harvard mirror)", "WISE sources with proper motion", "verified live"],
  ["Any VizieR catalog", "VizieR cone search (user-selected)", "Extra overlay layers (AllWISE, 2MASS, Pan-STARRS, VSX…)", "verified live"],
  ["SIMBAD", "TAP (Harvard mirror; CDS main site was down during testing)", "Name resolution, proper motion", "verified live"],
  ["2MASS / AllWISE / DSS2 / Spitzer HiPS maps", "IRSA mirror", "Multi-mission atlas", "verified live"],
  ["JPL Small-Body Identification", "ssd-api.jpl.nasa.gov/sb_ident", "Known asteroids in the field", "verified live"],
  ["JPL SBDB + SBDB Query", "ssd-api.jpl.nasa.gov", "1,582,561 orbits, physical data and taxonomy", "verified live"],
  ["JPL NHATS", "ssd-api.jpl.nasa.gov/nhats", "Round-trip Δv and duration for 7,212 NEOs", "verified live"],
  ["JPL Horizons", "ssd.jpl.nasa.gov/api/horizons", "Ephemerides (Psyche case search)", "verified live"],
  ["CNEOS CAD / Sentry / Fireball", "ssd-api.jpl.nasa.gov", "Planetary defense", "verified live"],
  ["Standish planetary elements", "JPL SSD (Table 1, 1800-2050)", "Planet positions", "published formula"],
];

const ROADMAP = [
  "Integrate the official SPHEREx spectrophotometry tool for science-grade spectra (today: HiPS quick-look spectrum, visualization only).",
  "Automatic moving-object detection, validated with known cases and a measured false-positive rate.",
  "Load published shape models (Bennu, Ryugu, Itokawa, Eros) in the 3D explorer instead of linking to them.",
  "Spacecraft trajectories (Horizons) in the 3D Solar System and planetary perturbations (n-body) for distant epochs.",
  "SPHEREx observatory code for topocentric predictions of very close NEOs (today: geocentric).",
  "Guided submission of candidates to the Minor Planet Center (ADES format) after volunteer review.",
];

export default function ValidationView() {
  const [rep, setRep] = useState<{ generated_utc?: string; cases: Case[] }>({ cases: [] });
  useEffect(() => { getJSON<{ cases: Case[] }>("/api/validation").then(setRep).catch(() => null); }, []);
  const tone = (s: string) => (s === "validated" || s === "change observed" ? "ev-observed" : ["pending", "no clear change", "inconclusive", "stored"].includes(s) ? "ev-unknown" : "ev-inferred");
  return (
    <div className="space-y-4">
      <section className="panel p-4 space-y-3">
        <h2 className="font-semibold text-ion">Validation with real SPHEREx data</h2>
        <p className="text-xs text-slate-400">Automatic measurement on real SPHEREx images: 2D Gaussian centroid, each frame registered against Gaia DR3 reference stars, least-squares motion fit, compared with the SIMBAD/Gaia proper motion. <b>validated</b> = significant measurement (σ ≤ μ/3) and |Δμ| ≤ max(3σ, 150 mas/yr) on both axes; <b>inconclusive</b> = σ too large. Generated: {rep.generated_utc ?? "—"}.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rep.cases.map((c) => (
            <div key={c.id} className="rounded-lg bg-space-800 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2"><b className="text-sm">{c.title}</b><span className={tone(c.verdict?.status)}>{c.verdict?.status}</span></div>
              <div className="text-slate-400">{c.kind} · {c.frames ?? 0} frames</div>
              <div>Expected: {c.expected}</div>
              {c.catalog_pm && <div className="font-mono">Catalog μ = ({c.catalog_pm[0]?.toFixed?.(0)}, {c.catalog_pm[1]?.toFixed?.(0)}) mas/yr</div>}
              {c.measured && <div className="font-mono text-ion">Measured μ = ({c.measured.pmra_masyr} ± {c.measured.pmra_err}, {c.measured.pmdec_masyr} ± {c.measured.pmdec_err}) mas/yr · baseline {c.measured.baseline_yr} yr</div>}
              {c.verdict?.flux_ratio_max_min && <div>Max/min flux ratio: {c.verdict.flux_ratio_max_min}. {c.verdict.caveat}</div>}
              {c.verdict?.median_offset_arcsec !== undefined && <div className="font-mono text-ion">Psyche measured {c.verdict.median_offset_arcsec}″ (median) from the JPL position in {c.verdict.frames_matched}/{c.verdict.frames} frames · pixel {c.verdict.pixel_arcsec}″</div>}
              {c.verdict?.criterion && <div className="text-slate-400">Criterion: {c.verdict.criterion}</div>}
              {c.verdict?.reason && <div className="text-slate-400">{c.verdict.reason}</div>}
              {c.seasons && <div className="text-slate-500">Seasons: {c.seasons.map((s: { start: string; end: string }) => `${s.start}→${s.end}`).join(", ")}</div>}
            </div>
          ))}
        </div>
      </section>
      <section className="panel p-4">
        <h2 className="font-semibold text-ion mb-2">Data source matrix</h2>
        <div className="overflow-auto"><table className="w-full text-xs"><thead className="text-slate-400"><tr><th className="text-left">Source</th><th className="text-left">Service</th><th className="text-left">What it provides</th><th className="text-left">Status</th></tr></thead>
          <tbody>{SOURCES.map((s) => <tr key={s[0]} className="border-t border-white/5"><td className="py-1">{s[0]}</td><td>{s[1]}</td><td>{s[2]}</td><td><span className={s[3].startsWith("verified") ? "ev-observed" : "ev-calculated"}>{s[3]}</span></td></tr>)}</tbody></table></div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4 text-sm space-y-2">
          <h2 className="font-semibold text-ion">How we know this: evidence levels</h2>
          <ul className="space-y-1 text-xs">
            <li><span className="ev-observed">observed</span> Measured by an instrument: SPHEREx images, mission samples, radar or occultation diameters.</li>
            <li><span className="ev-calculated">calculated</span> Output of an explicit physical model: Keplerian orbits, Lambert, Δv, proper-motion propagation.</li>
            <li><span className="ev-inferred">inferred</span> Indirect deduction: size from H, composition by taxonomic analogy.</li>
            <li><span className="ev-illustrative">illustrative</span> Visual representation with no measurement value: procedural relief, lunar distances, composition layer.</li>
            <li><span className="ev-unknown">unknown</span> No data; stated explicitly.</li>
          </ul>
          <p className="text-xs text-slate-400">A visual difference is not a confirmed discovery. Frames are never interpolated. Local backups show their generation date.</p>
        </div>
        <div className="panel p-4 text-sm space-y-2">
          <h2 className="font-semibold text-ion">Roadmap (not in the demo)</h2>
          <ul className="list-disc ml-4 text-xs space-y-1">{ROADMAP.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      </section>
    </div>
  );
}
