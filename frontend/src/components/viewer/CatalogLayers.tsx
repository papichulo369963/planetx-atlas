import { useState } from "react";
import { getJSON, qs } from "../../api";
import type { Overlay } from "../../types";

/** A user-supplied catalog row: position at its own epoch plus optional proper motion. */
export interface CustomSource { name: string; ra: number; dec: number; pmra?: number; pmdec?: number; epoch?: number }
export interface CustomLayer { id: string; label: string; color: string; kind: "vizier" | "csv"; sources?: CustomSource[]; overlay?: Overlay; cat?: string }

export const VIZIER_PRESETS: [string, string][] = [
  ["II/328/allwise", "AllWISE (3.4–22 µm)"],
  ["II/363/unwise", "unWISE (deep WISE coadds)"],
  ["II/246/out", "2MASS point sources (J, H, K)"],
  ["I/355/gaiadr3", "Gaia DR3 (full columns)"],
  ["II/349/ps1", "Pan-STARRS1 DR1 (optical)"],
  ["J/ApJS/240/19", "CatWISE motion survey candidates"],
  ["B/vsx/vsx", "AAVSO VSX variable stars"],
];
const COLORS = ["#a78bfa", "#f97316", "#22d3ee", "#facc15", "#fb7185", "#4ade80"];

/** Parse CSV with header containing ra, dec and optional name, pmra, pmdec, epoch (deg, mas/yr, Julian year). */
export function parseCSV(text: string): CustomSource[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length < 2) throw new Error("The file needs a header row and at least one data row.");
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iRa = col("ra", "ra_deg", "raj2000", "ra_icrs"), iDec = col("dec", "dec_deg", "dej2000", "de_icrs", "decl");
  if (iRa < 0 || iDec < 0) throw new Error("Columns 'ra' and 'dec' (decimal degrees) are required.");
  const iName = col("name", "id", "designation"), iPmra = col("pmra"), iPmdec = col("pmdec"), iEp = col("epoch");
  const out: CustomSource[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(sep).map((x) => x.trim());
    const ra = Number(c[iRa]), dec = Number(c[iDec]);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    out.push({ name: iName >= 0 ? c[iName] : `#${out.length + 1}`, ra, dec,
      pmra: iPmra >= 0 ? Number(c[iPmra]) || 0 : undefined, pmdec: iPmdec >= 0 ? Number(c[iPmdec]) || 0 : undefined,
      epoch: iEp >= 0 ? Number(c[iEp]) || undefined : undefined });
  }
  if (!out.length) throw new Error("No valid rows were found.");
  return out;
}

export default function CatalogLayers({ ra, dec, fov, mjd, layers, onChange }: { ra: number; dec: number; fov: number; mjd: number; layers: CustomLayer[]; onChange: (l: CustomLayer[]) => void }) {
  const [cat, setCat] = useState(VIZIER_PRESETS[0][0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const addVizier = async () => {
    setBusy(true); setErr("");
    try {
      const ov = await getJSON<Overlay>(`/api/overlay/vizier?${qs({ cat, ra, dec, fov, mjd })}`);
      onChange([...layers.filter((l) => l.id !== `vz-${cat}`), { id: `vz-${cat}`, label: `${cat} (${ov.points.length})`, color: COLORS[layers.length % COLORS.length], kind: "vizier", overlay: ov, cat }]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const addCSV = async (file: File) => {
    setErr("");
    try {
      const sources = parseCSV(await file.text());
      const next = [...layers, { id: `csv-${file.name}-${Date.now()}`, label: `${file.name} (${sources.length})`, color: COLORS[layers.length % COLORS.length], kind: "csv" as const, sources }];
      onChange(next);
      try { localStorage.setItem("px-csv-layers", JSON.stringify(next.filter((l) => l.kind === "csv"))); } catch { /* storage blocked */ }
    } catch (e) { setErr((e as Error).message); }
  };
  const remove = (id: string) => {
    const next = layers.filter((l) => l.id !== id);
    onChange(next);
    try { localStorage.setItem("px-csv-layers", JSON.stringify(next.filter((l) => l.kind === "csv"))); } catch { /* storage blocked */ }
  };

  return (
    <div className="space-y-2 border-t border-white/10 pt-2">
      <div className="label">Add more catalogs</div>
      <div className="flex gap-1">
        <input className="input font-mono text-xs" list="vz-presets" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Any VizieR ID, e.g. II/328/allwise" />
        <datalist id="vz-presets">{VIZIER_PRESETS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</datalist>
        <button className="btn text-xs whitespace-nowrap" onClick={addVizier} disabled={busy}>{busy ? "…" : "Add"}</button>
      </div>
      <p className="text-[11px] text-slate-500">Any of the ~25,000 VizieR catalogs works. Suggestions: {VIZIER_PRESETS.slice(0, 4).map(([id, l]) => <button key={id} className="underline mr-1" onClick={() => setCat(id)} title={l}>{id}</button>)}</p>
      <label className="btn text-xs inline-block cursor-pointer">Upload my catalog (CSV)
        <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => e.target.files?.[0] && addCSV(e.target.files[0])} />
      </label>
      <p className="text-[11px] text-slate-500">CSV columns: <code>ra, dec</code> (degrees) and optional <code>name, pmra, pmdec</code> (mas/yr), <code>epoch</code> (year). With proper motion, positions are propagated to each frame date. Stays in this browser only.</p>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      {layers.map((l) => (
        <div key={l.id} className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
          <span className="truncate" title={l.overlay?.source}>{l.label}</span>
          <button className="ml-auto text-slate-400 hover:text-rose-300" onClick={() => remove(l.id)} aria-label={`Remove ${l.label}`}>✕</button>
        </div>
      ))}
    </div>
  );
}
