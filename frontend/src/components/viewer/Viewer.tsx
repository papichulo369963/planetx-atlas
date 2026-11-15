import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeSeries, getJSON, LIVE_ONLY, qs, STATIC } from "../../api";
import { bgSub, combine, diff, percentile, renderRGBA, type Stretch } from "../../lib/image";
import { fmtDec, fmtRA, mjdToJyear, pixToWorld, propagate, worldToPix } from "../../lib/wcs";
import type { Annotation, DecodedFrame, DemoCase, Job, Overlay, OverlayPoint, Series, Spectrum, Target } from "../../types";
import CatalogLayers, { type CustomLayer } from "./CatalogLayers";
import FrameCanvas, { type Marker } from "./FrameCanvas";
import SpectrumChart from "./SpectrumChart";
import Timeline from "./Timeline";
import { analyse, trackSource, type TrackResult } from "./track";

type Mode = "play" | "blink" | "slider" | "diff" | "sum";
const TONE: Record<string, string> = { slate: "text-slate-300", rose: "text-rose-300", sky: "text-sky-300", emerald: "text-emerald-300", amber: "text-amber-300", violet: "text-violet-300" };
const DETECTORS = ["All (mixed λ)", "D1 0.75–1.11 µm", "D2 1.10–1.64 µm", "D3 1.63–2.42 µm", "D4 2.42–3.82 µm", "D5 3.82–4.42 µm", "D6 4.42–5.00 µm"];
const CHALLENGE = new Set(["barnard", "eps-ind-b", "wise-0855", "rw-aur", "r-dra", "psyche-2025-09"]);

function readUrl() {
  const p = new URLSearchParams(location.search);
  return {
    name: p.get("name") ?? "", ra: p.get("ra") ?? "", dec: p.get("dec") ?? "",
    fov: Number(p.get("fov") ?? 0.1), det: Number(p.get("det") ?? 2), frames: Number(p.get("frames") ?? 16),
    caseId: p.get("case") ?? "", tmin: p.get("tmin") ?? "", tmax: p.get("tmax") ?? "",
  };
}

function loadCsvLayers(): CustomLayer[] {
  try { return JSON.parse(localStorage.getItem("px-csv-layers") || "[]"); } catch { return []; }
}

export default function Viewer({ embed, onOpenAtlas, onOpenBody }: { embed: boolean; onOpenAtlas: (ra: number, dec: number) => void; onOpenBody: (name: string) => void }) {
  const init = useMemo(readUrl, []);
  const [name, setName] = useState(init.name);
  const [raIn, setRaIn] = useState(init.ra);
  const [decIn, setDecIn] = useState(init.dec);
  const [fov, setFov] = useState(init.fov);
  const [det, setDet] = useState(init.det);
  const [maxFrames, setMaxFrames] = useState(init.frames);
  const [tmin, setTmin] = useState(init.tmin);
  const [tmax, setTmax] = useState(init.tmax);
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [frames, setFrames] = useState<DecodedFrame[]>([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(2);
  const [mode, setMode] = useState<Mode>("play");
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [slider, setSlider] = useState(0.5);
  const [stretch, setStretch] = useState<Stretch>("asinh");
  const [pLo, setPLo] = useState(5);
  const [pHi, setPHi] = useState(99.7);
  const [subBg, setSubBg] = useState(true);
  const [showBad, setShowBad] = useState(false);
  const [wlRange, setWlRange] = useState<[number, number]>([0, 9]);
  const [layers, setLayers] = useState<Record<string, boolean>>({ gaia: false, catwise: false, simbad: false, asteroids: false });
  const [overlays, setOverlays] = useState<Record<string, Overlay | null>>({});
  const [astByMjd, setAstByMjd] = useState<Record<string, Overlay>>({});
  const [custom, setCustom] = useState<CustomLayer[]>(loadCsvLayers);
  const [labels, setLabels] = useState(true);
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [track, setTrack] = useState<TrackResult | null>(null);
  const [spec, setSpec] = useState<Spectrum | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveKind, setSaveKind] = useState("custom");
  const [job, setJob] = useState<Job | null>(null);
  const [lastQuery, setLastQuery] = useState<{ ra: number; dec: number; tmin?: string; tmax?: string } | null>(null);
  const [notes, setNotes] = useState<Annotation[]>(() => { try { return JSON.parse(localStorage.getItem("px-annotations") || "[]"); } catch { return []; } });
  const abort = useRef<AbortController | null>(null);

  const refreshCases = useCallback(() => { getJSON<DemoCase[]>("/api/demo").then(setCases).catch(() => setCases([])); }, []);
  useEffect(refreshCases, [refreshCases]);

  const visible = useMemo(() => frames.filter((f) => f.wavelength_um >= wlRange[0] && f.wavelength_um <= wlRange[1]), [frames, wlRange]);
  const n = series?.n ?? 0;
  const pix = series?.pixel_arcsec ?? 6.15;
  const cur = visible[Math.min(idx, visible.length - 1)];

  const loadSeries = useCallback(async (opts: { ra: number; dec: number; caseId?: string; fovOverride?: number; detOverride?: number; frames?: number; tmin?: string; tmax?: string }) => {
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    setError(""); setTrack(null); setSpec(null); setPick(null); setOverlays({}); setAstByMjd({});
    setLoading(opts.caseId ? "Opening preloaded case (local backup)…" : "Querying IRSA (SIA) and downloading real SPHEREx cutouts… the first time can take 20–60 s");
    try {
      const url = opts.caseId ? `/api/demo/${opts.caseId}` : `/api/spherex/series?${qs({ ra: opts.ra, dec: opts.dec, fov: opts.fovOverride ?? fov, detector: opts.detOverride ?? det, max_frames: opts.frames ?? maxFrames, mjd_min: opts.tmin, mjd_max: opts.tmax })}`;
      const s = await getJSON<Series>(url, ctl.signal);
      if (!s.frames.length) throw new Error("No SPHEREx images exist for this region and settings.");
      const dec = decodeSeries(s);
      setSeries(s); setFrames(dec); setIdx(0); setA(0); setB(dec.length - 1);
      const wls = dec.map((f) => f.wavelength_um);
      setWlRange([Math.min(...wls) - 0.001, Math.max(...wls) + 0.001]);
      setFov(s.fov_deg); setDet(s.detector);
      setLastQuery({ ra: s.ra, dec: s.dec, tmin: opts.tmin, tmax: opts.tmax });
      if (opts.frames) setMaxFrames(opts.frames);
      const p = new URLSearchParams();
      p.set("ra", s.ra.toFixed(6)); p.set("dec", s.dec.toFixed(6)); p.set("fov", String(s.fov_deg)); p.set("det", String(s.detector));
      if (opts.caseId) p.set("case", opts.caseId);
      if (opts.tmin) p.set("tmin", opts.tmin);
      if (opts.tmax) p.set("tmax", opts.tmax);
      const keep = new URLSearchParams(location.search);
      if (keep.get("embed")) p.set("embed", "1");
      if (keep.get("tab")) p.set("tab", keep.get("tab")!);
      history.replaceState(null, "", `?${p}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally { setLoading(""); }
  }, [fov, det, maxFrames]);

  const search = async () => {
    setError("");
    try {
      if (name.trim()) {
        setLoading(`Resolving "${name}" in SIMBAD and propagating its proper motion…`);
        const t = await getJSON<Target>(`/api/resolve?${qs({ name, epoch: 2026.0 })}`);
        setTarget(t); setRaIn(t.ra.toFixed(6)); setDecIn(t.dec.toFixed(6));
        await loadSeries({ ra: t.ra, dec: t.dec, tmin, tmax });
      } else {
        const c = await getJSON<{ ra: number; dec: number }>(`/api/parse?${qs({ ra: raIn, dec: decIn })}`);
        setTarget(null);
        await loadSeries({ ra: c.ra, dec: c.dec, tmin, tmax });
      }
    } catch (e) { setError((e as Error).message); setLoading(""); }
  };

  const loadMore = () => {
    if (!series) return;
    if (STATIC) { setError(LIVE_ONLY); return; }
    const more = Math.min(40, Math.max(maxFrames, frames.length) + 12);
    loadSeries({ ra: series.ra, dec: series.dec, frames: more, detOverride: series.detector, fovOverride: series.fov_deg, tmin: lastQuery?.tmin, tmax: lastQuery?.tmax });
  };

  const saveCase = async () => {
    if (!series || !saveTitle.trim()) return;
    if (STATIC) { setError(LIVE_ONLY); return; }
    setError("");
    try {
      const body = { title: saveTitle.trim(), name: target?.query ?? null, ra: target ? null : series.ra, dec: target ? null : series.dec,
        fov: series.fov_deg, detector: series.detector, max_frames: Math.max(maxFrames, frames.length),
        mjd_min: lastQuery?.tmin ? Number(lastQuery.tmin) : null, mjd_max: lastQuery?.tmax ? Number(lastQuery.tmax) : null,
        kind: target ? saveKind : "custom", expected: "" };
      const r = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      const { job: id } = await r.json();
      setJob({ id, kind: "case", status: "running", log: [] });
      const poll = setInterval(async () => {
        const j = await getJSON<Job>(`/api/jobs/${id}`);
        setJob(j);
        if (j.status !== "running") { clearInterval(poll); refreshCases(); }
      }, 2000);
    } catch (e) { setError(`Save case: ${(e as Error).message}`); }
  };

  const deleteCase = async (id: string) => {
    if (!confirm("Delete this preloaded case from this computer? This cannot be undone.")) return;
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    refreshCases();
  };

  useEffect(() => { // restore from URL (shareable links / embeds)
    if (init.caseId) loadSeries({ ra: 0, dec: 0, caseId: init.caseId });
    else if (init.ra && init.dec) loadSeries({ ra: Number(init.ra), dec: Number(init.dec), tmin: init.tmin, tmax: init.tmax });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { // playback
    if (!playing || visible.length < 2) return;
    const id = setInterval(() => {
      if (mode === "blink") setIdx((i) => (i === a ? b : a));
      else setIdx((i) => (i + 1) % visible.length);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, visible.length, mode, a, b]);

  const prepared = useMemo(() => visible.map((f) => (subBg ? bgSub(f.img) : f.img)), [visible, subBg]);
  const levels = useMemo(() => { // one common stretch for every frame (comparable treatment)
    if (!prepared.length) return [0, 1];
    const all = combine(prepared, "mean");
    return [percentile(all, pLo), percentile(all, pHi)];
  }, [prepared, pLo, pHi]);

  const view = useMemo((): { img: ImageData | null; imgB: ImageData | null; caption: string } => {
    if (!prepared.length || !n) return { img: null, imgB: null, caption: "" };
    const [lo, hi] = levels;
    const i = Math.min(idx, prepared.length - 1);
    const fA = Math.min(a, prepared.length - 1), fB = Math.min(b, prepared.length - 1);
    if (mode === "diff") {
      const d = diff(prepared[fA], prepared[fB]);
      const m = percentile(d.map(Math.abs), 99.5);
      return { img: renderRGBA(d, n, -m, m, stretch, true), imgB: null, caption: `Difference B − A (${visible[fB].date_utc.slice(0, 10)} − ${visible[fA].date_utc.slice(0, 10)}). Red: brighter in B; blue: brighter in A.` };
    }
    if (mode === "sum") {
      const s = combine(prepared, "mean");
      return { img: renderRGBA(s, n, percentile(s, pLo), percentile(s, pHi), stretch), imgB: null, caption: `Average of ${prepared.length} compatible exposures (improves S/N; erases whatever moves).` };
    }
    if (mode === "slider") {
      return { img: renderRGBA(prepared[fA], n, lo, hi, stretch, false, visible[fA].badMask, showBad), imgB: renderRGBA(prepared[fB], n, lo, hi, stretch, false, visible[fB].badMask, showBad), caption: `Slider: left A (${visible[fA].date_utc.slice(0, 10)}) · right B (${visible[fB].date_utc.slice(0, 10)})` };
    }
    return { img: renderRGBA(prepared[i], n, lo, hi, stretch, false, visible[i].badMask, showBad), imgB: null, caption: "" };
  }, [prepared, levels, idx, mode, a, b, n, stretch, showBad, visible, pLo, pHi]);

  // ---------- overlays ----------
  useEffect(() => {
    if (!series) return;
    for (const k of ["gaia", "catwise", "simbad"]) {
      if (layers[k] && overlays[k] === undefined) {
        setOverlays((o) => ({ ...o, [k]: null }));
        getJSON<Overlay>(`/api/overlay/${k}?${qs({ ra: series.ra, dec: series.dec, fov: series.fov_deg, mjd: frames[0]?.mjd })}`)
          .then((ov) => setOverlays((o) => ({ ...o, [k]: ov }))).catch((e) => setError(`Layer ${k}: ${e.message}`));
      }
    }
  }, [layers, series, frames, overlays]);

  const curKey = cur ? cur.mjd.toFixed(3) : "";
  useEffect(() => {
    if (!series || !layers.asteroids || !cur || astByMjd[curKey]) return;
    getJSON<Overlay>(`/api/overlay/asteroids?${qs({ ra: series.ra, dec: series.dec, fov: series.fov_deg, mjd: cur.mjd })}`)
      .then((ov) => setAstByMjd((m) => ({ ...m, [curKey]: ov }))).catch((e) => setError(`JPL asteroids: ${e.message}`));
  }, [layers.asteroids, series, cur, curKey, astByMjd]);

  const shownOverlays = useMemo((): OverlayPoint[] => {
    if (!series || !cur) return [];
    const ep = mjdToJyear(cur.mjd);
    const out: OverlayPoint[] = [];
    const project = (ra: number, dec: number) => worldToPix(ra, dec, series.ra, series.dec, series.n, series.pixel_arcsec);
    for (const k of ["gaia", "catwise", "simbad"]) {
      const ov = overlays[k];
      if (!layers[k] || !ov) continue;
      for (const p of ov.points) {
        const e0 = p.extra.epoch0 as number | null;
        if (e0 && p.extra.ra0 !== undefined) {
          const [r, d] = propagate(Number(p.extra.ra0), Number(p.extra.dec0), Number(p.extra.pmra ?? 0), Number(p.extra.pmdec ?? 0), ep - e0);
          const [x, y] = project(r, d);
          out.push({ ...p, x, y });
        } else out.push(p);
      }
    }
    if (layers.asteroids && astByMjd[curKey]) out.push(...astByMjd[curKey].points);
    for (const l of custom) {
      if (l.kind === "vizier" && l.overlay) {
        for (const p of l.overlay.points) { const [x, y] = project(Number(p.extra.ra0), Number(p.extra.dec0)); out.push({ ...p, x, y, kind: "vizier", extra: { ...p.extra, color: l.color } }); }
      } else for (const s of l.sources ?? []) {
        const [r, d] = s.pmra || s.pmdec ? propagate(s.ra, s.dec, s.pmra ?? 0, s.pmdec ?? 0, ep - (s.epoch ?? 2000)) : [s.ra, s.dec];
        const [x, y] = project(r, d);
        if (x > -5 && y > -5 && x < series.n + 5 && y < series.n + 5) out.push({ id: s.name, x, y, label: s.name, kind: "custom", extra: { color: l.color } });
      }
    }
    return out;
  }, [overlays, layers, astByMjd, curKey, series, cur, custom]);

  // ---------- inspector ----------
  const doTrack = () => {
    if (!pick || !series) return;
    const moving = visible.length > 1 && visible[visible.length - 1].mjd - visible[0].mjd < 5;
    const pts = trackSource(visible, n, pick.x, pick.y, pix, moving);
    const ast = Object.values(astByMjd).flatMap((o) => o.points);
    setTrack(analyse(pts, pix, (overlays.gaia?.points ?? []), ast));
  };
  const doSpectrum = async () => {
    if (!series) return;
    const [r, d] = pick ? pixToWorld(pick.x, pick.y, series.ra, series.dec, n, pix) : [series.ra, series.dec];
    setSpecLoading(true); setSpec(null);
    try { setSpec(await getJSON<Spectrum>(`/api/spherex/spectrum?${qs({ ra: r, dec: d })}`)); }
    catch (e) { setError(`Spectrum: ${(e as Error).message}`); } finally { setSpecLoading(false); }
  };
  const addNote = () => {
    if (!pick || !series || !cur) return;
    const [r, d] = pixToWorld(pick.x, pick.y, series.ra, series.dec, n, pix);
    const note = prompt("Note for this candidate (stored only in this browser):", "Source that changes between epochs");
    if (note === null) return;
    const next = [...notes, { id: crypto.randomUUID(), ra: r, dec: d, note, created: new Date().toISOString(), status: "flagged by user" as const, field: location.search, frameDate: cur.date_utc }];
    setNotes(next);
    try { localStorage.setItem("px-annotations", JSON.stringify(next)); } catch { /* storage blocked */ }
  };

  const markers: Marker[] = [];
  if (series) markers.push({ x: (n - 1) / 2, y: (n - 1) / 2, color: "#fbbf2499", cross: true });
  if (pick) markers.push({ x: pick.x, y: pick.y, color: "#f472b6", ring: 2.2, label: "selection" });
  if (track && cur) { const tp = track.points.find((p) => p.i === visible.indexOf(cur)); if (tp) markers.push({ x: tp.x, y: tp.y, color: "#34d399", ring: 1.5 }); }

  const pickWorld = pick && series ? pixToWorld(pick.x, pick.y, series.ra, series.dec, n, pix) : null;
  const hoverWorld = hover && series ? pixToWorld(hover.x, hover.y, series.ra, series.dec, n, pix) : null;
  const hoverVal = hover && cur && n ? cur.img[Math.round(hover.y) * n + Math.round(hover.x)] : undefined;
  const nearPick = pick ? shownOverlays.filter((o) => Math.hypot(o.x - pick.x, o.y - pick.y) <= 2).slice(0, 6) : [];
  const share = () => { navigator.clipboard?.writeText(location.href); };
  const embedCode = `<iframe src="${location.origin}/${location.search}${location.search ? "&" : "?"}embed=1" width="720" height="760" style="border:0"></iframe>`;
  const groups: [string, DemoCase[]][] = [
    ["Challenge targets", cases.filter((c) => CHALLENGE.has(c.id))],
    ["More objects", cases.filter((c) => !CHALLENGE.has(c.id) && !c.user)],
    ["My saved cases", cases.filter((c) => c.user)],
  ];

  return (
    <div className={`grid gap-4 ${embed ? "" : "xl:grid-cols-[320px_1fr_360px]"}`}>
      {!embed && (
        <aside className="panel p-4 space-y-4 h-fit">
          <div>
            <h2 className="text-sm font-semibold text-ion">1 · Find a region of the sky</h2>
            <p className="text-xs text-slate-400">Object name (SIMBAD) or ICRS coordinates. RA in degrees or in hours (08h55m10.8s).</p>
          </div>
          <label className="block"><span className="label">Object name</span>
            <input className="input" placeholder="Barnard star, RW Aur, eps Ind B…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">Right ascension</span><input className="input font-mono" placeholder="269.4463" value={raIn} onChange={(e) => { setRaIn(e.target.value); setName(""); }} /></label>
            <label><span className="label">Declination</span><input className="input font-mono" placeholder="+4.7682" value={decIn} onChange={(e) => { setDecIn(e.target.value); setName(""); }} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">Field of view</span>
              <select className="input" value={fov} onChange={(e) => setFov(Number(e.target.value))}>
                {[0.05, 0.1, 0.2, 0.3, 0.45, 0.6].map((v) => <option key={v} value={v}>{v}° ({Math.round(v * 60)}′)</option>)}
              </select></label>
            <label><span className="label">Max. frames</span>
              <select className="input" value={maxFrames} onChange={(e) => setMaxFrames(Number(e.target.value))}>{[8, 12, 16, 24, 32, 40].map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <label className="block"><span className="label">Detector / band</span>
            <select className="input" value={det} onChange={(e) => setDet(Number(e.target.value))}>{DETECTORS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>
          <details className="text-xs text-slate-300">
            <summary className="cursor-pointer text-slate-400">Time window (fast movers)</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input className="input font-mono" placeholder="MJD min" value={tmin} onChange={(e) => setTmin(e.target.value)} />
              <input className="input font-mono" placeholder="MJD max" value={tmax} onChange={(e) => setTmax(e.target.value)} />
            </div>
            <p className="mt-1 text-slate-500">With a window, one image per exposure is used instead of one per day. A wider field tracks fast movers better but downloads more data.</p>
          </details>
          <button className="btn-primary w-full" onClick={search} disabled={!!loading}>Show real SPHEREx images</button>
          {target && (
            <div className="rounded-lg bg-space-800 p-3 text-xs space-y-1">
              <div className="font-semibold">{target.main_id} <span className="text-slate-400">({target.otype})</span></div>
              <div className="font-mono text-slate-300">J2000: {target.ra_catalog.toFixed(5)}, {target.dec_catalog.toFixed(5)}</div>
              <div className="font-mono text-ion">2026.0: {target.ra.toFixed(5)}, {target.dec.toFixed(5)}</div>
              {target.moved_arcsec > 1 && <div className="text-amber-300">It moved {target.moved_arcsec.toFixed(1)}″ since J2000 through proper motion: the viewer uses the propagated position.</div>}
              <span className="ev-calculated">calculated · {target.source}</span>
            </div>
          )}
          {groups.map(([title, list]) => (list.length > 0 || title === "Challenge targets") && (
            <div key={title}>
              <h3 className="label mb-2">{title} ({list.length})</h3>
              <div className="flex flex-wrap gap-1.5">
                {list.map((c) => c.failed || !c.file
                  ? <span key={c.id} className="btn text-xs opacity-40" title={c.failed}>{c.title} (pending)</span>
                  : <span key={c.id} className="inline-flex">
                      <button className="btn text-xs" title={`${c.expected}\n${c.frames} frames · generated ${c.generated_utc}`} onClick={() => loadSeries({ ra: c.ra, dec: c.dec, caseId: c.id })}>{c.title}</button>
                      {c.user && <button className="text-slate-500 hover:text-rose-300 px-1" onClick={() => deleteCase(c.id)} aria-label={`Delete ${c.title}`}>✕</button>}
                    </span>)}
                {!list.length && <span className="text-xs text-slate-500">Generating cases…</span>}
              </div>
            </div>
          ))}
          {notes.length > 0 && (
            <div>
              <h3 className="label mb-1">My candidates ({notes.length})</h3>
              <ul className="space-y-1 max-h-40 overflow-auto text-xs">
                {notes.map((nt) => <li key={nt.id} className="rounded bg-space-800 p-2"><span className="ev-illustrative">{nt.status}</span> <span className="font-mono">{nt.ra.toFixed(4)}, {nt.dec.toFixed(4)}</span><div className="text-slate-400">{nt.note}</div></li>)}
              </ul>
            </div>
          )}
        </aside>
      )}

      <section className="panel p-4 space-y-3 min-w-0">
        {series?.fallback && <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">Local backup, not a live query. {series.fallback_reason}</div>}
        {error && <div role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/10 p-2 text-sm text-rose-200">{error}</div>}
        {loading && <div className="flex items-center gap-3 rounded-lg bg-space-800 p-3 text-sm"><span className="h-4 w-4 animate-spin rounded-full border-2 border-ion border-t-transparent" />{loading}</div>}
        {!series && !loading && (
          <div className="grid place-items-center text-center py-20 text-slate-400">
            <div className="text-5xl mb-3">🔭</div>
            <p className="max-w-md">Type an object or coordinates, or open one of the preloaded cases. You will see <b>real</b> SPHEREx images from different dates, played back like a video.</p>
          </div>
        )}
        {series && cur && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(["play", "blink", "slider", "diff", "sum"] as Mode[]).map((m) => (
                <button key={m} className={`btn ${mode === m ? "btn-on" : ""}`} onClick={() => setMode(m)}>
                  {{ play: "▶ Animation", blink: "◐ Blink A/B", slider: "⇆ Slider", diff: "− Difference", sum: "Σ Sum" }[m]}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-400">{visible.length} real frames · {n}×{n} px · {pix.toFixed(2)}″/px</span>
            </div>
            <div className="flex justify-center"><FrameCanvas image={view.img} imageB={view.imgB} slider={slider} n={n} overlays={mode === "sum" || mode === "diff" ? [] : shownOverlays} markers={markers} showLabels={labels} onPick={(x, y) => setPick({ x, y })} onHover={(x, y) => setHover({ x, y })} /></div>
            {view.caption && <p className="text-center text-xs text-slate-300">{view.caption}</p>}
            {mode === "slider" && <input type="range" min={0} max={1} step={0.01} value={slider} onChange={(e) => setSlider(Number(e.target.value))} className="w-full" aria-label="Slider position" />}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn" onClick={() => setIdx((i) => (i - 1 + visible.length) % visible.length)} aria-label="Previous frame">⏮</button>
              <button className="btn-primary w-24" onClick={() => setPlaying((p) => !p)}>{playing ? "⏸ Pause" : "▶ Play"}</button>
              <button className="btn" onClick={() => setIdx((i) => (i + 1) % visible.length)} aria-label="Next frame">⏭</button>
              <label className="flex items-center gap-2 text-xs text-slate-300">Speed <input type="range" min={0.5} max={10} step={0.5} value={fps} onChange={(e) => setFps(Number(e.target.value))} /> {fps} fps</label>
              <button className="btn text-xs" onClick={() => setA(idx)}>Set A</button>
              <button className="btn text-xs" onClick={() => setB(idx)}>Set B</button>
              <button className="btn text-xs ml-auto" onClick={loadMore} disabled={!!loading || maxFrames >= 40} title="Downloads more real SPHEREx exposures of this same region from IRSA">＋ Load more real frames</button>
            </div>
            <Timeline frames={visible} index={Math.min(idx, visible.length - 1)} onSelect={(i) => { setIdx(i); setPlaying(false); }} a={a} b={b} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg bg-space-800/60 p-3 text-xs">
              <div><div className="label">Date (UTC)</div><div className="font-mono text-sm">{cur.date_utc.replace("T", " ")}</div></div>
              <div><div className="label">Wavelength</div><div className="font-mono text-sm">{cur.wavelength_um.toFixed(3)} ± {(cur.bandwidth_um / 2).toFixed(3)} µm</div></div>
              <div><div className="label">Detector · collection</div><div className="font-mono text-sm">D{cur.detector} · {cur.collection}</div></div>
              <div><div className="label">Provenance</div><a className="text-ion underline" href={cur.url} target="_blank" rel="noreferrer">Original FITS (IRSA)</a> <span className="ev-observed">observed</span></div>
            </div>
            {Object.keys(cur.flag_counts).length > 0 && <p className="text-[11px] text-slate-500">Quality flags in this frame (pixels): {Object.entries(cur.flag_counts).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
          </>
        )}
      </section>

      {series && cur && (
        <aside className="space-y-4">
          <div className="panel p-4 space-y-3">
            <h2 className="text-sm font-semibold text-ion">Display treatment</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label><span className="label">Stretch</span><select className="input" value={stretch} onChange={(e) => setStretch(e.target.value as Stretch)}>{["asinh", "linear", "sqrt", "log"].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="flex items-end gap-2"><input type="checkbox" checked={subBg} onChange={(e) => setSubBg(e.target.checked)} /> Subtract background (median)</label>
              <label><span className="label">Black (percentile {pLo})</span><input type="range" min={0} max={50} step={0.5} value={pLo} onChange={(e) => setPLo(Number(e.target.value))} className="w-full" /></label>
              <label><span className="label">White (percentile {pHi})</span><input type="range" min={90} max={100} step={0.1} value={pHi} onChange={(e) => setPHi(Number(e.target.value))} className="w-full" /></label>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={showBad} onChange={(e) => setShowBad(e.target.checked)} /> Mark pixels with quality flags (pink)</label>
            </div>
            <div>
              <span className="label">Filter by wavelength ({wlRange[0].toFixed(2)}–{wlRange[1].toFixed(2)} µm)</span>
              <div className="flex gap-2">
                <input type="range" className="w-full" min={Math.min(...frames.map((f) => f.wavelength_um)) - 0.01} max={Math.max(...frames.map((f) => f.wavelength_um)) + 0.01} step={0.005} value={wlRange[0]} onChange={(e) => { setWlRange([Number(e.target.value), wlRange[1]]); setIdx(0); }} aria-label="Minimum wavelength" />
                <input type="range" className="w-full" min={Math.min(...frames.map((f) => f.wavelength_um)) - 0.01} max={Math.max(...frames.map((f) => f.wavelength_um)) + 0.01} step={0.005} value={wlRange[1]} onChange={(e) => { setWlRange([wlRange[0], Number(e.target.value)]); setIdx(0); }} aria-label="Maximum wavelength" />
              </div>
              <p className="text-[11px] text-slate-500">SPHEREx linear variable filters give each exposure a different λ at the same sky position. Narrow the λ range to compare brightness more fairly.</p>
            </div>
            <p className="text-[11px] text-slate-500">The same stretch is applied to every frame. Processing: {series.processing.join(" ")}</p>
          </div>

          <div className="panel p-4 space-y-2">
            <h2 className="text-sm font-semibold text-ion">Layers from other telescopes</h2>
            {[["gaia", "Gaia DR3 (propagated to the date)", "text-emerald-300"], ["catwise", "CatWISE2020 (WISE)", "text-amber-300"], ["simbad", "SIMBAD", "text-pink-300"], ["asteroids", "Known asteroids (JPL)", "text-sky-300"]].map(([k, l, c]) => (
              <label key={k} className={`flex items-center gap-2 text-sm ${c}`}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{l}
                {k !== "asteroids" && layers[k] && overlays[k] === null && <span className="text-xs text-slate-400">loading…</span>}
                {k !== "asteroids" && overlays[k] && <span className="text-xs text-slate-400">{overlays[k]!.points.length}</span>}
                {k === "asteroids" && layers.asteroids && <span className="text-xs text-slate-400">{astByMjd[curKey] ? astByMjd[curKey].points.length : "querying…"}</span>}
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Show labels</label>
            <CatalogLayers ra={series.ra} dec={series.dec} fov={series.fov_deg} mjd={frames[0]?.mjd ?? 61000} layers={custom} onChange={setCustom} />
            <a className="text-xs text-ion underline" href={`http://byw.tools/wiseview#ra=${series.ra}&dec=${series.dec}&size=176&band=3&speed=164.22&minbright=-15&maxbright=1500&window=0.5&diff_by_window=1&linear=1&color=gray&zoom=9&border=1&gaia=1&invert=1&maxdyr=0&scandir=0&neowise=0&diff=0&outer_epochs=0&unique_window=1&smooth_scan=0&shift=0&pmra=0&pmdec=0`} target="_blank" rel="noreferrer">Compare with WISE in WiseView ↗</a>
          </div>

          <div className="panel p-4 space-y-2">
            <h2 className="text-sm font-semibold text-ion">Source inspector</h2>
            {hoverWorld && <p className="font-mono text-[11px] text-slate-400">cursor: {fmtRA(hoverWorld[0])} {fmtDec(hoverWorld[1])} · {hoverVal !== undefined && Number.isFinite(hoverVal) ? `${hoverVal.toFixed(3)} MJy/sr` : "—"}</p>}
            {!pick && <p className="text-xs text-slate-400">Click a source to inspect it, follow it through every date or extract its spectrum.</p>}
            {pick && pickWorld && (
              <div className="space-y-2 text-xs">
                <div className="font-mono">{fmtRA(pickWorld[0])} {fmtDec(pickWorld[1])}<br /><span className="text-slate-400">({pickWorld[0].toFixed(5)}°, {pickWorld[1].toFixed(5)}°) · reference date {cur.date_utc.slice(0, 10)}</span></div>
                {nearPick.length > 0 ? (
                  <div>
                    <div className="label">Catalogued sources within 2 px</div>
                    <ul className="list-disc ml-4">{nearPick.map((o) => <li key={o.kind + o.id}>{o.label} <span className="text-slate-500">({Math.hypot(o.x - pick.x, o.y - pick.y).toFixed(1)} px)</span></li>)}</ul>
                    <p className="text-slate-500">A nearby match is not a secure identification. Criterion used: position propagated to the frame date and a 2-pixel radius (≈ SPHEREx resolution).</p>
                  </div>
                ) : <p className="text-slate-500">No matches in the active layers (turn them on above).</p>}
                <div className="flex flex-wrap gap-1.5">
                  <button className="btn text-xs" onClick={doTrack}>Follow through all dates</button>
                  <button className="btn text-xs" onClick={doSpectrum}>Spectrum (102 channels)</button>
                  <button className="btn text-xs" onClick={addNote}>Flag candidate</button>
                  <button className="btn text-xs" onClick={() => onOpenAtlas(pickWorld[0], pickWorld[1])}>View in Atlas</button>
                  {nearPick.find((o) => o.kind === "asteroid") && <button className="btn text-xs" onClick={() => onOpenBody(String(nearPick.find((o) => o.kind === "asteroid")!.id))}>Orbit and composition →</button>}
                </div>
              </div>
            )}
            {track && (
              <div className="rounded-lg bg-space-800 p-3 text-xs space-y-1">
                <div className={`font-semibold ${TONE[track.verdict.tone] ?? "text-slate-200"}`}>{track.verdict.label}</div>
                <ul className="list-disc ml-4 text-slate-300">{track.verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                <LightCurve track={track} />
              </div>
            )}
            {(spec || specLoading) && (
              <div className="rounded-lg bg-space-800 p-3 text-xs space-y-1">
                <div className="font-semibold">SPHEREx quick-look spectrum (102 channels)</div>
                {specLoading ? <p>Reading only the bytes needed from the IRSA DR1 HiPS cube…</p> : spec && (<>
                  <SpectrumChart spec={spec} />
                  <p className="text-slate-400">{spec.method} Mosaic pixel {spec.pixel_arcsec}″. <span className="ev-observed">observed</span> Per IRSA, this spectrum is for visualization only; for science use the SPHEREx spectrophotometry tool. It is never converted to reflectance or composition.</p>
                </>)}
              </div>
            )}
          </div>

          {!embed && (
            <div className="panel p-4 space-y-2 text-xs">
              <h2 className="text-sm font-semibold text-ion">Save & share</h2>
              <div className="space-y-1">
                <span className="label">Save this search as a preloaded case</span>
                <input className="input" placeholder="Title, e.g. Wolf 359 in D3" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} />
                {target && (
                  <select className="input" value={saveKind} onChange={(e) => setSaveKind(e.target.value)}>
                    <option value="custom">No automatic validation</option>
                    <option value="proper motion">Validate proper motion vs SIMBAD</option>
                    <option value="variability">Measure brightness variability</option>
                  </select>
                )}
                <button className="btn-primary w-full" onClick={saveCase} disabled={!saveTitle.trim() || job?.status === "running"}>Save case (works offline afterwards)</button>
                {job && <div className={`rounded p-2 ${job.status === "error" ? "bg-rose-400/10 text-rose-200" : "bg-space-800 text-slate-300"}`}>{job.status === "running" ? "Working: " : job.status === "done" ? "Saved. " : "Error: "}{job.error ?? job.log[job.log.length - 1] ?? "starting…"}</div>}
              </div>
              <button className="btn text-xs" onClick={share}>Copy link with coordinates</button>
              <details><summary className="cursor-pointer text-slate-400">Embed code (iframe)</summary><code className="block break-all rounded bg-space-950 p-2 font-mono text-[10px]">{embedCode}</code></details>
              <div className="text-slate-500">Availability: {series.available.total} images in {series.available.seasons.length} seasons ({series.available.seasons.map((s) => `${s.start}→${s.end}`).join(", ")}).</div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function LightCurve({ track }: { track: TrackResult }) {
  const pts = track.points.filter((p) => p.flux !== null) as (TrackResult["points"][number] & { flux: number })[];
  if (pts.length < 2) return null;
  const W = 300, H = 110, t0 = pts[0].mjd, t1 = pts[pts.length - 1].mjd;
  const f0 = Math.min(...pts.map((p) => p.flux)), f1 = Math.max(...pts.map((p) => p.flux));
  const x = (m: number) => 30 + ((m - t0) / (t1 - t0 || 1)) * (W - 40);
  const y = (f: number) => 10 + (1 - (f - f0) / (f1 - f0 || 1)) * (H - 30);
  const l0 = Math.min(...pts.map((p) => p.wl)), l1 = Math.max(...pts.map((p) => p.wl));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Light curve">
      {pts.map((p) => <circle key={p.i} cx={x(p.mjd)} cy={y(p.flux)} r={3} fill={`hsl(${220 - 220 * ((p.wl - l0) / (l1 - l0 || 1))} 90% 65%)`}><title>{p.date.slice(0, 10)} · {p.flux.toFixed(2)} mJy · {p.wl.toFixed(3)} µm</title></circle>)}
      <text x={30} y={H - 4} fill="#94a3b8" fontSize={9}>Light curve (mJy, 2 px aperture) · color = λ</text>
      <text x={2} y={14} fill="#94a3b8" fontSize={9}>{f1.toPrecision(3)}</text>
      <text x={2} y={H - 18} fill="#94a3b8" fontSize={9}>{f0.toPrecision(3)}</text>
    </svg>
  );
}
