import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON, qs } from "../../api";
import type { Porkchop, ProspectRow } from "../../types";

type Weights = { access: number; size: number; volatile: number; metal: number; evidence: number; windows: number };
const LABELS: Record<keyof Weights, [string, string]> = {
  access: ["Accessibility (NHATS Δv)", "calculated"], size: ["Size", "observed/inferred"],
  volatile: ["Hydration hint (taxonomy)", "inferred"], metal: ["Metal hint (taxonomy)", "inferred"],
  evidence: ["Evidence quality", "calculated"], windows: ["Launch-window frequency", "calculated"],
};
interface Knowledge { bodies: { des: string; name: string; mission: string; type: string; facts: { text: string; evidence: string; ref: string }[] }[]; meteorite_analogs: { taxonomy: string; meteorites: string; note: string }[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sbdb = any;

export default function ProspectView({ focus, onShow3D, onExplore }: { focus: string | null; onShow3D: (des: string) => void; onExplore: (des: string) => void }) {
  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [meta, setMeta] = useState<{ disclaimer: string; sources: string[] } | null>(null);
  const [err, setErr] = useState("");
  const [w, setW] = useState<Weights>({ access: 3, size: 1, volatile: 2, metal: 1, evidence: 1, windows: 1 });
  const [unknown, setUnknown] = useState<"zero" | "exclude">("zero");
  const [filter, setFilter] = useState("");
  const [sel, setSel] = useState<string | null>(focus);
  const [kb, setKb] = useState<Knowledge | null>(null);

  useEffect(() => {
    getJSON<{ rows: ProspectRow[]; disclaimer: string; sources: string[] }>("/api/prospect").then((d) => { setRows(d.rows); setMeta(d); }).catch((e) => setErr(e.message));
    getJSON<Knowledge>("/api/knowledge").then(setKb).catch(() => null);
  }, []);
  useEffect(() => { if (focus) setSel(focus); }, [focus]);

  const ranked = useMemo(() => {
    const tot = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return rows.map((r) => {
      let s = 0, unk = 0;
      (Object.keys(w) as (keyof Weights)[]).forEach((k) => { const v = r.c[k]; if (v === null) unk += w[k]; else s += w[k] * v; });
      return { r, score: s / tot, unkFrac: unk / tot };
    }).filter((x) => (unknown === "exclude" ? x.unkFrac === 0 : true))
      .filter((x) => !filter || x.r.name.toLowerCase().includes(filter.toLowerCase()) || (x.r.taxonomy ?? "").toLowerCase() === filter.toLowerCase())
      .sort((a, b) => b.score - a.score);
  }, [rows, w, unknown, filter]);

  const detail = rows.find((r) => r.des === sel) ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
      <section className="panel p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="font-semibold text-ion">Highest-interest prospecting candidates</h2>
            <p className="text-xs text-slate-400">{rows.length.toLocaleString("en")} NEOs accessible according to NHATS (JPL). Move the weights: the ranking updates instantly.</p>
          </div>
          <input className="input max-w-56 ml-auto" placeholder="Filter by name or class (C, S, X)…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {meta && <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs text-amber-200">{meta.disclaimer}</div>}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        {!rows.length && !err && <p className="text-sm text-slate-400">Loading NHATS and SBDB taxonomy…</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(Object.keys(LABELS) as (keyof Weights)[]).map((k) => (
            <label key={k} className="text-xs"><span className="label">{LABELS[k][0]} · {w[k]}</span>
              <input type="range" min={0} max={5} step={0.5} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="w-full" />
              <span className={`ev-${LABELS[k][1].split("/")[0]}`}>{LABELS[k][1]}</span></label>
          ))}
        </div>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1"><input type="radio" checked={unknown === "zero"} onChange={() => setUnknown("zero")} /> Unknown counts as 0</label>
          <label className="flex items-center gap-1"><input type="radio" checked={unknown === "exclude"} onChange={() => setUnknown("exclude")} /> Only objects with complete data</label>
        </div>
        <div className="overflow-auto max-h-[52vh] rounded-lg border border-white/10">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-space-800 text-slate-300"><tr>
              {["#", "Object", "Index", "Min Δv (km/s)", "Duration (d)", "Size (m)", "Class", "Components"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {ranked.slice(0, 200).map(({ r, score, unkFrac }, i) => (
                <tr key={r.des} className={`cursor-pointer border-t border-white/5 hover:bg-space-700/50 ${sel === r.des ? "bg-ion/10" : ""}`} onClick={() => setSel(r.des)}>
                  <td className="px-2 py-1 text-slate-500">{i + 1}</td>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1 font-mono">{score.toFixed(3)}{unkFrac > 0 && <span className="text-slate-500" title="weight fraction with unknown data"> ·{Math.round(unkFrac * 100)}%?</span>}</td>
                  <td className="px-2 py-1 font-mono">{r.dv_min.toFixed(2)}</td>
                  <td className="px-2 py-1 font-mono">{r.dur_at_min_dv}</td>
                  <td className="px-2 py-1 font-mono" title={r.size_source}>{r.size_m === null ? "—" : r.size_m < 1000 ? r.size_m.toFixed(0) : (r.size_m / 1000).toFixed(2) + " km"}</td>
                  <td className="px-2 py-1">{r.taxonomy ?? <span className="text-slate-500">—</span>}</td>
                  <td className="px-2 py-1"><Bars c={r.c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">Sources: {meta?.sources.join(" · ")}. Formula: Σ wᵢ·cᵢ / Σ wᵢ with cᵢ ∈ [0,1]. Each component is defined in backend/app/prospect.py and in the Validation tab.</p>
      </section>
      <aside className="space-y-4">
        {detail ? <Detail r={detail} kb={kb} onShow3D={onShow3D} onExplore={onExplore} /> : <div className="panel p-4 text-sm text-slate-400">Select an object to see its composition with evidence, its accessibility, and to plan a mission.</div>}
        <RocketBox dv={detail?.dv_min ?? 6} />
      </aside>
    </div>
  );
}

function Bars({ c }: { c: ProspectRow["c"] }) {
  const keys: (keyof ProspectRow["c"])[] = ["access", "size", "volatile", "metal", "evidence", "windows"];
  const col = ["#7dd3fc", "#a78bfa", "#34d399", "#fbbf24", "#94a3b8", "#f472b6"];
  return <div className="flex gap-0.5 items-end h-4">{keys.map((k, i) => <div key={k} title={`${k}: ${c[k] ?? "unknown"}`} style={{ width: 6, height: c[k] === null ? 3 : 2 + 14 * (c[k] as number), background: c[k] === null ? "#334155" : col[i] }} />)}</div>;
}

function Detail({ r, kb, onShow3D, onExplore }: { r: ProspectRow; kb: Knowledge | null; onShow3D: (d: string) => void; onExplore: (d: string) => void }) {
  const [sb, setSb] = useState<Sbdb | null>(null);
  const [pc, setPc] = useState<Porkchop | null>(null);
  const [pcLoading, setPcLoading] = useState(false);
  const [range, setRange] = useState({ start: "2027-01-01", end: "2032-12-31" });
  useEffect(() => { setSb(null); setPc(null); getJSON<Sbdb>(`/api/sbdb/${encodeURIComponent(r.des)}`).then(setSb).catch(() => null); }, [r.des]);
  const k = kb?.bodies.find((b) => b.des === r.des);
  const phys: Record<string, { value: string; units?: string; ref?: string }> = {};
  (sb?.phys_par ?? []).forEach((p: { name: string; value: string; units?: string; ref?: string }) => { phys[p.name] = p; });
  const analog = r.taxonomy ? kb?.meteorite_analogs.find((a) => {
    const keys = a.taxonomy.split(/[ /]+/);
    const t = r.taxonomy!.replace(/:$/, "");
    return keys.includes(t) || keys.includes(t.slice(0, 2)) || keys.includes(t[0]);
  }) : undefined;
  const runPc = async () => {
    setPcLoading(true);
    try { setPc(await getJSON<Porkchop>(`/api/porkchop?${qs({ des: r.des, start: range.start, end: range.end, tof_min: 60, tof_max: 500 })}`)); }
    finally { setPcLoading(false); }
  };
  return (
    <div className="panel p-4 space-y-3 text-sm">
      <div>
        <h3 className="font-semibold text-lg">{r.name}</h3>
        <div className="flex flex-wrap gap-1 mt-1">
          <button className="btn text-xs" onClick={() => onShow3D(r.des)}>View orbit in 3D</button>
          <button className="btn text-xs" onClick={() => onExplore(r.des)}>Explore in 3D / VR</button>
        </div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          <Row k="Minimum round-trip Δv" v={`${r.dv_min.toFixed(2)} km/s in ${r.dur_at_min_dv} d`} ev="calculated" src="NHATS" />
          <Row k="Shortest mission" v={`${r.dur_min} d with ${r.dv_at_min_dur.toFixed(2)} km/s`} ev="calculated" src="NHATS" />
          <Row k="Diameter" v={phys.diameter ? `${phys.diameter.value} km` : r.size_m === null ? "unknown" : `${r.size_m.toFixed(0)} m`} ev={phys.diameter ? "observed" : r.size_m === null ? "unknown" : "inferred"} src={phys.diameter?.ref ?? r.size_source} />
          {phys.extent && <Row k="Dimensions" v={`${phys.extent.value} km`} ev="observed" src={phys.extent.ref} />}
          <Row k="Albedo" v={phys.albedo?.value ?? (r.albedo ?? "unknown")} ev={phys.albedo ? "observed" : "unknown"} src={phys.albedo?.ref} />
          <Row k="Spectral class" v={r.taxonomy ?? "unknown"} ev={r.taxonomy ? "observed" : "unknown"} src="SBDB (SMASS/Tholen)" />
          {phys.rot_per && <Row k="Rotation" v={`${phys.rot_per.value} h`} ev="observed" src={phys.rot_per.ref} />}
          {phys.density && <Row k="Density" v={`${phys.density.value} g/cm³`} ev="observed" src={phys.density.ref} />}
          <Row k="Orbit quality (OCC)" v={`${r.occ} (0 = best)`} ev="calculated" src="SBDB" />
          {r.next_obs && <Row k="Next observing window" v={r.next_obs} ev="calculated" src="NHATS" />}
        </tbody>
      </table>
      <div className="rounded-lg bg-space-800 p-3 text-xs space-y-1">
        <div className="label">Composition: what we know and what we do not</div>
        {k ? (<>
          <div className="text-slate-300">Mission: <b>{k.mission}</b> · type {k.type}</div>
          <ul className="space-y-1">{k.facts.map((f, i) => <li key={i}><span className={`ev-${f.evidence.startsWith("measured") || f.evidence.startsWith("observed") ? "observed" : f.evidence.startsWith("inferred") ? "inferred" : "unknown"}`}>{f.evidence}</span> {f.text} <span className="text-slate-500">({f.ref})</span></li>)}</ul>
        </>) : <p className="text-slate-400">No spacecraft visits or samples. What is known comes from telescopes.</p>}
        {analog && <p><span className="ev-inferred">inferred by analogy</span> Class {r.taxonomy} ↔ {analog.meteorites}. {analog.note}</p>}
        {!r.taxonomy && <p><span className="ev-unknown">unknown</span> No measured spectral class: nothing can be said about its composition.</p>}
        <p className="text-slate-500">No water or metal percentages are assigned. Hydrated minerals are not extractable free water. No reserves or economic value are estimated.</p>
      </div>
      <div className="space-y-2">
        <div className="label">Planner: launch windows (porkchop)</div>
        <div className="flex gap-2 text-xs">
          <input className="input" type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
          <input className="input" type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          <button className="btn-primary whitespace-nowrap" onClick={runPc} disabled={pcLoading}>{pcLoading ? "Calculating…" : "Calculate"}</button>
        </div>
        {pc && <PorkchopChart pc={pc} />}
      </div>
    </div>
  );
}

function Row({ k, v, ev, src }: { k: string; v: string | number; ev: string; src?: string }) {
  return <tr className="border-t border-white/5"><td className="py-1 pr-2 text-slate-400">{k}</td><td className="py-1">{v} <span className={`ev-${ev}`}>{ev}</span>{src && <div className="text-[10px] text-slate-500">{src}</div>}</td></tr>;
}

function PorkchopChart({ pc }: { pc: Porkchop }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const vals = pc.dv_total.flat().filter((v): v is number => v !== null);
  const vmin = Math.min(...vals), vmax = Math.min(vmin + 10, Math.max(...vals));
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ny = pc.tof_days.length, nx = pc.departures_jd.length;
    c.width = nx; c.height = ny;
    const ctx = c.getContext("2d")!; const img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = pc.dv_total[j][i], o = ((ny - 1 - j) * nx + i) * 4;
      if (v === null) { img.data[o + 3] = 0; continue; }
      const t = Math.min(1, (v - vmin) / (vmax - vmin || 1));
      img.data[o] = 255 * t; img.data[o + 1] = 220 * (1 - Math.abs(t - 0.4)); img.data[o + 2] = 255 * (1 - t); img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [pc, vmin, vmax]);
  const d0 = new Date((pc.departures_jd[0] - 2440587.5) * 864e5), d1 = new Date((pc.departures_jd[pc.departures_jd.length - 1] - 2440587.5) * 864e5);
  return (
    <div className="text-xs space-y-1">
      <div className="relative">
        <canvas ref={ref} className="w-full rounded border border-white/10" style={{ imageRendering: "pixelated", aspectRatio: "1.4" }} />
        <span className="absolute left-1 top-1 text-[10px] text-slate-200 bg-space-950/60 px-1">↑ time of flight {pc.tof_days[0]}–{pc.tof_days[pc.tof_days.length - 1]} d</span>
      </div>
      <div className="flex justify-between text-[10px] text-slate-400"><span>{d0.toISOString().slice(0, 10)}</span><span>departure date →</span><span>{d1.toISOString().slice(0, 10)}</span></div>
      <div className="text-[10px] text-slate-400">Color: total Δv {vmin.toFixed(1)} (blue) → {vmax.toFixed(1)} km/s (red).</div>
      {pc.best && <div className="rounded bg-ion/10 p-2">Best window: depart <b>{pc.best.departure_iso}</b>, flight {pc.best.tof_days.toFixed(0)} d, Δv {pc.best.dv_total.toFixed(2)} km/s (C3 {pc.best.c3.toFixed(1)} km²/s²) <span className="ev-calculated">calculated</span></div>}
      <p className="text-[10px] text-slate-500">{pc.method}</p>
    </div>
  );
}

function RocketBox({ dv }: { dv: number }) {
  const [isp, setIsp] = useState(450);
  const [dvv, setDvv] = useState(dv);
  useEffect(() => setDvv(Number(dv.toFixed(2))), [dv]);
  const ratio = Math.exp((dvv * 1000) / (isp * 9.80665));
  const fromEarthLEO = 9.4; // km/s typical to reach LEO incl. losses (educational value)
  const toCislunar = 3.9; // km/s LEO -> lunar orbit vicinity (approx., educational)
  return (
    <div className="panel p-4 space-y-2 text-sm">
      <h3 className="font-semibold text-ion">Exercise: “bringing resources back”</h3>
      <p className="text-xs text-slate-400">Tsiolkovsky rocket equation: m₀/m_f = exp(Δv / (Isp·g₀)). An educational exercise, not an economic plan.</p>
      <label className="text-xs block"><span className="label">Mission Δv: {dvv} km/s</span><input type="range" min={0.5} max={15} step={0.1} value={dvv} onChange={(e) => setDvv(Number(e.target.value))} className="w-full" /></label>
      <label className="text-xs block"><span className="label">Isp: {isp} s</span>
        <select className="input" value={isp} onChange={(e) => setIsp(Number(e.target.value))}>
          <option value={320}>320 s · hypergolic</option><option value={450}>450 s · H₂/O₂</option><option value={900}>900 s · nuclear thermal</option><option value={3000}>3000 s · electric (Hall)</option>
        </select></label>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-space-800 p-2"><div className="label">Initial / final mass</div><div className="font-mono text-lg">{ratio.toFixed(2)}</div></div>
        <div className="rounded bg-space-800 p-2"><div className="label">Propellant per t of payload</div><div className="font-mono text-lg">{(ratio - 1).toFixed(2)} t</div></div>
      </div>
      <p className="text-xs text-slate-300">Comparison: lifting 1 t to cislunar orbit <b>from Earth's surface</b> needs ~{(fromEarthLEO + toCislunar).toFixed(1)} km/s (m₀/m_f ≈ {Math.exp(((fromEarthLEO + toCislunar) * 1000) / (450 * 9.80665)).toFixed(0)} with H₂/O₂). That is why water from an accessible asteroid, turned into propellant in space, is a concept under study. <span className="ev-illustrative">approximate typical values</span></p>
    </div>
  );
}
