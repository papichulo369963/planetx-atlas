import { useEffect, useState } from "react";
import { getJSON } from "../../api";

interface Api { fields: string[]; data: (string | null)[][]; count?: string | number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sentry = { data: any[] };

function rows(api: Api | null) { return api ? api.data.map((r) => Object.fromEntries(api.fields.map((f, i) => [f, r[i]]))) : []; }

export default function DefenseView() {
  const [cad, setCad] = useState<Api | null>(null);
  const [sentry, setSentry] = useState<Sentry | null>(null);
  const [fb, setFb] = useState<Api | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    getJSON<Api>("/api/defense/cad").then(setCad).catch((e) => setErr(e.message));
    getJSON<Sentry>("/api/defense/sentry").then(setSentry).catch((e) => setErr(e.message));
    getJSON<Api>("/api/defense/fireballs").then(setFb).catch((e) => setErr(e.message));
  }, []);
  const ca = rows(cad).slice(0, 25);
  const fbs = rows(fb);
  const sen = (sentry?.data ?? []).slice().sort((a, b) => Number(b.ps_max) - Number(a.ps_max)).slice(0, 15);
  const LD = 384400 / 149597870.7;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {err && <p className="text-rose-300 text-sm">{err}</p>}
      <section className="panel p-4 space-y-2">
        <h2 className="font-semibold text-ion">Upcoming Earth close approaches (60 days, &lt; 0.05 au)</h2>
        <p className="text-xs text-slate-400">NASA/JPL CNEOS Close-Approach Data API. 1 LD = mean lunar distance. <span className="ev-calculated">calculated</span></p>
        <div className="overflow-auto max-h-[60vh]"><table className="w-full text-xs"><thead className="text-slate-400"><tr><th className="text-left">Object</th><th className="text-left">Date (TDB)</th><th>Distance</th><th>v rel.</th><th>H</th></tr></thead>
          <tbody>{ca.map((r, i) => <tr key={i} className="border-t border-white/5"><td>{String(r.fullname ?? r.des).trim()}</td><td className="font-mono">{r.cd}</td><td className="font-mono text-center">{(Number(r.dist) / LD).toFixed(2)} LD</td><td className="font-mono text-center">{Number(r.v_rel).toFixed(1)} km/s</td><td className="text-center">{r.h}</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel p-4 space-y-2">
        <h2 className="font-semibold text-ion">Sentry: objects with a non-zero impact probability</h2>
        <p className="text-xs text-slate-400">Sorted by maximum Palermo scale. A small probability does not imply a threat: it usually drops to zero with more observations. <span className="ev-calculated">calculated</span></p>
        <div className="overflow-auto max-h-[60vh]"><table className="w-full text-xs"><thead className="text-slate-400"><tr><th className="text-left">Object</th><th>Years</th><th>Cumulative prob.</th><th>Max Palermo</th><th>Diameter</th></tr></thead>
          <tbody>{sen.map((r, i) => <tr key={i} className="border-t border-white/5"><td>{r.fullname}</td><td className="text-center">{r.range}</td><td className="font-mono text-center">{Number(r.ip).toExponential(1)}</td><td className="font-mono text-center">{Number(r.ps_max).toFixed(2)}</td><td className="text-center">{r.diameter ? `${(Number(r.diameter) * 1000).toFixed(0)} m` : "—"}</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel p-4 space-y-2 xl:col-span-2">
        <h2 className="font-semibold text-ion">Recorded fireballs ({fbs.length} most recent with location)</h2>
        <p className="text-xs text-slate-400">CNEOS Fireball API (US government sensors). Dot size ∝ estimated impact energy. <span className="ev-observed">observed</span></p>
        <svg viewBox="-180 -90 360 180" className="w-full rounded-lg bg-space-950" style={{ maxHeight: 360 }}>
          {[-120, -60, 0, 60, 120].map((x) => <line key={x} x1={x} x2={x} y1={-90} y2={90} stroke="#1b2750" />)}
          {[-60, -30, 0, 30, 60].map((y) => <line key={y} x1={-180} x2={180} y1={y} y2={y} stroke="#1b2750" />)}
          {fbs.map((r, i) => {
            const lat = Number(r.lat) * (r["lat-dir"] === "S" ? -1 : 1), lon = Number(r.lon) * (r["lon-dir"] === "W" ? -1 : 1);
            const e = Number(r["impact-e"] ?? 0.1);
            return <circle key={i} cx={lon} cy={-lat} r={Math.min(6, 0.8 + Math.log10(1 + e * 10))} fill="#f97316" opacity={0.65}><title>{r.date} · {e} kt</title></circle>;
          })}
        </svg>
      </section>
    </div>
  );
}
