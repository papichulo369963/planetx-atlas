import { Suspense, useEffect, useState } from "react";
import { getJSON, REPO_URL, STATIC } from "./api";
import Viewer from "./components/viewer/Viewer";
import { lazyWithReload as lazy, ServerStatus, TabBoundary } from "./components/Resilience";

const AtlasView = lazy(() => import("./components/atlas/AtlasView"));
const SolarSystem = lazy(() => import("./components/solar/SolarSystem"));
const ProspectView = lazy(() => import("./components/prospect/ProspectView"));
const Explorer = lazy(() => import("./components/explorer/Explorer"));
const DefenseView = lazy(() => import("./components/defense/DefenseView"));
const ValidationView = lazy(() => import("./components/about/ValidationView"));

const TABS = [
  { id: "visor", label: "SPHEREx viewer", icon: "🔭" },
  { id: "atlas", label: "Multi-mission atlas", icon: "🗺️" },
  { id: "solar", label: "3D Solar System", icon: "🪐" },
  { id: "prospect", label: "Prospecting & missions", icon: "⛏️" },
  { id: "explorer", label: "3D / VR explorer", icon: "🥽" },
  { id: "defense", label: "Planetary defense", icon: "🛡️" },
  { id: "validation", label: "Validation & sources", icon: "✅" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface Kpis { catalog: number; nhats: number; cases: number; validated: number; refreshed: string }

export default function App() {
  const params = new URLSearchParams(location.search);
  const embed = params.get("embed") === "1";
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "visor");
  const [atlasPos, setAtlasPos] = useState<[number, number]>([269.446, 4.768]);
  const [focusBody, setFocusBody] = useState<string | null>(null);
  const [kpi, setKpi] = useState<Kpis | null>(null);

  useEffect(() => {
    Promise.allSettled([
      getJSON<{ count: number; retrieved_utc: string }>("/api/catalog/meta"),
      getJSON<{ cases: { verdict?: { status: string } }[] }>("/api/validation"),
      getJSON<unknown[]>("/api/demo"),
    ]).then(([m, v, d]) => {
      const meta = m.status === "fulfilled" ? m.value : null;
      const val = v.status === "fulfilled" ? v.value.cases : [];
      setKpi({
        catalog: meta?.count ?? 0, nhats: 7212, cases: d.status === "fulfilled" ? d.value.length : 0,
        validated: val.filter((c) => c.verdict?.status === "validated" || c.verdict?.status === "change observed").length,
        refreshed: meta?.retrieved_utc?.slice(0, 10) ?? "—",
      });
    });
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    const p = new URLSearchParams(location.search); p.set("tab", t);
    history.replaceState(null, "", `?${p}`);
  };

  if (embed) return <main className="p-3"><Viewer embed onOpenAtlas={() => null} onOpenBody={() => null} /></main>;

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-space-950/85 backdrop-blur">
        <div className="mx-auto max-w-[1700px] px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9" />
            <div>
              <h1 className="text-lg font-bold leading-tight">PlanetX Atlas</h1>
              <p className="text-[11px] text-slate-400 leading-tight">From a moving dot to a mission destination · NASA Space Apps · Planet X and SPHEREx</p>
            </div>
          </div>
          <div className="ml-auto grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <Kpi v={kpi ? kpi.catalog.toLocaleString("en") : "…"} l="bodies with orbits" />
            <Kpi v={kpi ? kpi.nhats.toLocaleString("en") : "…"} l="accessible NEOs (NHATS)" />
            <Kpi v="102" l="SPHEREx bands" />
            <Kpi v={kpi ? `${kpi.validated}/${kpi.cases}` : "…"} l="cases with a result" />
          </div>
        </div>
        <nav className="mx-auto max-w-[1700px] px-4 flex gap-1 overflow-x-auto pb-2" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => go(t.id)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${tab === t.id ? "bg-ion text-space-950 font-semibold" : "text-slate-300 hover:bg-space-700"}`}>
              <span aria-hidden>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
      </header>
      <ServerStatus />
      {STATIC && (
        <div className="mx-auto max-w-[1700px] px-4 pt-3">
          <div className="rounded-lg border border-ion/40 bg-ion/10 p-3 text-sm text-slate-200">
            <b className="text-ion">Online showcase.</b> Everything here uses <b>real</b> NASA/ESA data captured from the live archives: 16 preloaded SPHEREx cases, 1.58 million orbits, 7,212 NHATS asteroids and their validation. Searching new sky positions, saving cases and VizieR layers need the full app, which runs on any PC from the <a className="text-ion underline" href={REPO_URL} target="_blank" rel="noreferrer">GitHub repository</a>.
          </div>
        </div>
      )}
      <main className="mx-auto max-w-[1700px] p-4">
        <div className={tab === "visor" ? "" : "hidden"}>
          <TabBoundary name="SPHEREx viewer"><Viewer embed={false} onOpenAtlas={(ra, dec) => { setAtlasPos([ra, dec]); go("atlas"); }} onOpenBody={(name) => { setFocusBody(name.replace(/^\d+\s+/, "").replace(/\s*\(.*\)$/, "") || name); go("solar"); }} /></TabBoundary>
        </div>
        <Suspense fallback={<div className="panel p-8 text-center text-slate-400">Loading module…</div>}>
          {tab === "atlas" && <TabBoundary name="Multi-mission atlas"><AtlasView ra={atlasPos[0]} dec={atlasPos[1]} /></TabBoundary>}
          {tab === "solar" && <TabBoundary name="3D Solar System"><SolarSystem focus={focusBody} onOpenProspect={(d) => { setFocusBody(d); go("prospect"); }} /></TabBoundary>}
          {tab === "prospect" && <TabBoundary name="Prospecting & missions"><ProspectView focus={focusBody} onShow3D={(d) => { setFocusBody(d); go("solar"); }} onExplore={(d) => { setFocusBody(d); go("explorer"); }} /></TabBoundary>}
          {tab === "explorer" && <TabBoundary name="3D / VR explorer"><Explorer des={focusBody} /></TabBoundary>}
          {tab === "defense" && <TabBoundary name="Planetary defense"><DefenseView /></TabBoundary>}
          {tab === "validation" && <TabBoundary name="Validation & sources"><ValidationView /></TabBoundary>}
        </Suspense>
      </main>
      <footer className="mx-auto max-w-[1700px] px-4 pb-6 text-[11px] text-slate-500">
        Data: NASA/IPAC IRSA (SPHEREx, 2MASS, WISE), ESA Gaia DR3, NASA/JPL SSD and CNEOS, SIMBAD/VizieR. Orbital catalog downloaded on {kpi?.refreshed}. No sign-up and no cookies; annotations stay in your browser only. Demonstration software for NASA Space Apps; not an official NASA product.
      </footer>
    </div>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return <div className="rounded-lg border border-white/10 bg-space-900/80 px-3 py-1"><div className="font-mono text-base font-semibold text-ion">{v}</div><div className="text-[10px] text-slate-400">{l}</div></div>;
}
