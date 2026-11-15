import { useEffect, useRef, useState } from "react";
import { getJSON, qs } from "../../api";
import type { Overlay } from "../../types";

// HiPS maps mirrored by NASA/IPAC IRSA (verified reachable; CDS main site was unavailable).
const SURVEYS = [
  { id: "2mass", name: "2MASS color (J,H,K)", url: "https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color" },
  { id: "allwise", name: "AllWISE color (W1,W2,W4)", url: "https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1" },
  { id: "w1", name: "AllWISE W1 3.4 µm", url: "https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W1" },
  { id: "w2", name: "AllWISE W2 4.6 µm", url: "https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W2" },
  { id: "dss", name: "DSS2 color (optical)", url: "https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color" },
  { id: "irac1", name: "Spitzer IRAC 3.6 µm", url: "https://irsa.ipac.caltech.edu/data/hips/CDS/SPITZER/IRAC1" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

export default function AtlasView({ ra, dec }: { ra: number; dec: number }) {
  const el = useRef<HTMLDivElement>(null);
  const al = useRef<AnyObj>(null);
  const A = useRef<AnyObj>(null);
  const [survey, setSurvey] = useState(SURVEYS[0].id);
  const [status, setStatus] = useState("Loading Aladin Lite…");
  const [gaiaN, setGaiaN] = useState<number | null>(null);
  const [fov, setFov] = useState(0.5);

  useEffect(() => {
    let cancelled = false;
    import("aladin-lite").then(async (mod) => {
      const lib = mod.default as AnyObj;
      await lib.init;
      if (cancelled || !el.current) return;
      A.current = lib;
      al.current = lib.aladin(el.current, { fov, target: `${ra} ${dec}`, survey: SURVEYS[0].url, log: false, showReticle: true, showCooGrid: false, showFullscreenControl: true, showLayersControl: true, showProjectionControl: false, showFrame: true, cooFrame: "ICRS" });
      setSurveyUrl(SURVEYS[0]);
      setStatus("");
    }).catch((e) => setStatus(`Could not start Aladin Lite: ${e}`));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { al.current?.gotoRaDec?.(ra, dec); }, [ra, dec]);

  const setSurveyUrl = (s: (typeof SURVEYS)[number]) => {
    const a = al.current, lib = A.current;
    if (!a || !lib) return;
    try {
      const layer = lib.imageHiPS ? lib.imageHiPS(s.url, { name: s.name }) : a.newImageSurvey(s.url, { name: s.name });
      a.setBaseImageLayer(layer);
    } catch (e) { setStatus(`Layer ${s.name}: ${e}`); }
  };

  const addGaia = async () => {
    const lib = A.current, a = al.current;
    if (!lib || !a) return;
    const [cra, cdec] = a.getRaDec();
    const f = Math.min(0.5, (a.getFov?.()[0] ?? 0.4));
    try {
      const ov = await getJSON<Overlay>(`/api/overlay/gaia?${qs({ ra: cra, dec: cdec, fov: f, mjd: 61000 })}`);
      const cat = lib.catalog({ name: "Gaia DR3 (J2016.0)", sourceSize: 10, color: "#34d399" });
      a.addCatalog(cat);
      cat.addSources(ov.points.map((p) => lib.source(Number(p.extra.ra0), Number(p.extra.dec0), { name: p.label, pmra: p.extra.pmra, pmdec: p.extra.pmdec })));
      setGaiaN(ov.points.length);
    } catch (e) { setStatus(`Gaia: ${(e as Error).message}`); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="panel p-2 relative">
        <div ref={el} style={{ width: "100%", height: "70vh", minHeight: 420 }} />
        {status && <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">{status}</div>}
      </div>
      <aside className="panel p-4 space-y-3 text-sm">
        <h2 className="font-semibold text-ion">Multi-mission atlas</h2>
        <p className="text-xs text-slate-400">All-sky HiPS maps served by NASA/IPAC IRSA. Pan with the mouse and compare the same region in optical and infrared light.</p>
        <label className="block"><span className="label">Base map</span>
          <select className="input" value={survey} onChange={(e) => { setSurvey(e.target.value); setSurveyUrl(SURVEYS.find((s) => s.id === e.target.value)!); }}>
            {SURVEYS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className="block"><span className="label">Field ({fov}°)</span><input type="range" min={0.05} max={10} step={0.05} value={fov} onChange={(e) => { const v = Number(e.target.value); setFov(v); al.current?.setFoV?.(v); }} className="w-full" /></label>
        <button className="btn w-full" onClick={addGaia}>Overlay Gaia DR3 at the centre</button>
        {gaiaN !== null && <p className="text-xs text-emerald-300">{gaiaN} Gaia DR3 sources (J2016.0 positions, not propagated)</p>}
        <div className="rounded-lg bg-space-800 p-3 text-xs space-y-1">
          <div className="label">Cross-match criteria</div>
          <p>Gaia DR3 is at J2016.0, CatWISE2020 at ~2015.4 and SIMBAD at J2000. In the SPHEREx viewer they are propagated by proper motion to each exposure date before matching, with a 2 px (12″) radius.</p>
        </div>
        <a className="text-xs text-ion underline block" href={`https://irsa.ipac.caltech.edu/applications/spherex/?__action=layout.showDropDown&`} target="_blank" rel="noreferrer">Open the official IRSA SPHEREx viewer ↗</a>
        <a className="text-xs text-ion underline block" href="http://byw.tools/wiseview" target="_blank" rel="noreferrer">WiseView (WISE/NEOWISE) ↗</a>
      </aside>
    </div>
  );
}
