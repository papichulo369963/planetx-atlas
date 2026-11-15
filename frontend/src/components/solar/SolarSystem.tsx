import { Html, OrbitControls, Line, Stars } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getBinary, getJSON, LIVE_ONLY, STATIC } from "../../api";
import type { Job } from "../../types";
import { dateToJD, elementsToXYZ, jdToDate, orbitPath, PLANET_INFO, PLANETS, planetElements, planetXYZ } from "../../lib/kepler";

const SCALE = 10; // scene units per au
const CLASS_INFO: [string, string, string][] = [
  ["MBA", "Main belt", "#64748b"], ["IMB", "Inner main belt", "#94a3b8"], ["OMB", "Outer main belt", "#78716c"],
  ["APO", "NEO Apollo", "#f87171"], ["ATE", "NEO Aten", "#fb923c"], ["AMO", "NEO Amor", "#facc15"], ["IEO", "NEO Atira", "#f472b6"],
  ["MCA", "Mars-crossers", "#c084fc"], ["TJN", "Jupiter Trojans", "#4ade80"], ["CEN", "Centaurs", "#2dd4bf"],
  ["TNO", "Trans-Neptunian objects", "#60a5fa"], ["PAA", "Parabolic", "#e5e7eb"], ["HYA", "Hyperbolic", "#e5e7eb"], ["AST", "Other asteroids", "#a3a3a3"],
  ["JFc", "Jupiter-family comets", "#22d3ee"], ["JFC", "Jupiter-family comets", "#22d3ee"], ["HTC", "Halley-type comets", "#a5f3fc"],
  ["ETc", "Encke-type comets", "#67e8f9"], ["CTc", "Chiron-type comets", "#67e8f9"], ["COM", "Comets", "#cffafe"],
  ["PAR", "Parabolic", "#fff"], ["HYP", "Hyperbolic", "#fff"], ["OTHER", "Other", "#888"],
];

const vert = /* glsl */ `
attribute vec3 elA; attribute vec3 elB; attribute float cls; attribute float hmag;
uniform float uDays; uniform float uScale; uniform float uVisible[23]; uniform vec3 uColors[23];
uniform float uHmax; uniform float uSize; varying vec3 vColor; varying float vAlpha;
void main() {
  int c = int(cls + 0.5);
  float a = elA.x; float e = elA.y;
  if (uVisible[c] < 0.5 || hmag > uHmax || a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float n = 0.9856076686 / pow(a, 1.5);
  float M = radians(mod(elB.z + n * uDays, 360.0));
  float E = M + e * sin(M);
  for (int k = 0; k < 8; k++) { E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E)); }
  float xp = a * (cos(E) - e); float yp = a * sqrt(max(0.0, 1.0 - e * e)) * sin(E);
  float I = radians(elA.z); float O = radians(elB.x); float W = radians(elB.y);
  float cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I), cW = cos(W), sW = sin(W);
  float x = (cO*cW - sO*sW*cI) * xp + (-cO*sW - sO*cW*cI) * yp;
  float y = (sO*cW + cO*sW*cI) * xp + (-sO*sW + cO*cW*cI) * yp;
  float z = (sW*sI) * xp + (cW*sI) * yp;
  vec4 mv = modelViewMatrix * vec4(vec3(x, z, -y) * uScale, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (c >= 3 && c <= 6 ? 1.8 : 1.0);
  vColor = uColors[c]; vAlpha = (c >= 3 && c <= 6) ? 0.9 : 0.16;
}`;
const frag = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vColor, vAlpha); }`;

interface Catalog { orbits: Float32Array; classes: Uint8Array; count: number; meta: { ref_epoch_jd_tdb: number; retrieved_utc: string; count: number } }

function toScene(p: [number, number, number]): THREE.Vector3 { return new THREE.Vector3(p[0] * SCALE, p[2] * SCALE, -p[1] * SCALE); }

function Asteroids({ cat, jd, visible, hmax, size }: { cat: Catalog; jd: number; visible: boolean[]; hmax: number; size: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const N = cat.count, o = cat.orbits;
    const elA = new Float32Array(N * 3), elB = new Float32Array(N * 3), h = new Float32Array(N), cls = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      elA[3 * k] = o[7 * k]; elA[3 * k + 1] = o[7 * k + 1]; elA[3 * k + 2] = o[7 * k + 2];
      elB[3 * k] = o[7 * k + 3]; elB[3 * k + 1] = o[7 * k + 4]; elB[3 * k + 2] = o[7 * k + 5];
      h[k] = o[7 * k + 6]; cls[k] = cat.classes[k];
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("elA", new THREE.BufferAttribute(elA, 3));
    g.setAttribute("elB", new THREE.BufferAttribute(elB, 3));
    g.setAttribute("hmag", new THREE.BufferAttribute(h, 1));
    g.setAttribute("cls", new THREE.BufferAttribute(cls, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [cat]);
  const uniforms = useMemo(() => ({
    uDays: { value: 0 }, uScale: { value: SCALE }, uHmax: { value: 99 }, uSize: { value: 1.5 },
    uVisible: { value: new Array(23).fill(1) },
    uColors: { value: CLASS_INFO.map(([, , c]) => new THREE.Color(c)).map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
  }), []);
  useFrame(() => {
    if (!mat.current) return;
    mat.current.uniforms.uDays.value = jd - cat.meta.ref_epoch_jd_tdb;
    mat.current.uniforms.uVisible.value = visible.map((v) => (v ? 1 : 0));
    mat.current.uniforms.uHmax.value = hmax;
    mat.current.uniforms.uSize.value = size;
  });
  return (
    <points geometry={geom} frustumCulled={false}>
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Planets({ jd, showMoons }: { jd: number; showMoons: boolean }) {
  return (
    <>
      <mesh><sphereGeometry args={[0.6, 32, 32]} /><meshBasicMaterial color="#fbbf24" /></mesh>
      <pointLight intensity={2} distance={0} decay={0} />
      {Object.keys(PLANETS).map((name) => {
        const el = planetElements(name, jd);
        const pos = toScene(planetXYZ(name, jd));
        const info = PLANET_INFO[name];
        const r = 0.12 + Math.log10(info.radiusKm / 2000) * 0.25;
        const path = orbitPath(el[0], el[1], el[2], el[3], el[4], 256).map(toScene);
        return (
          <group key={name}>
            <Line points={path} color={info.color} lineWidth={1} transparent opacity={0.35} />
            <mesh position={pos}><sphereGeometry args={[r, 24, 24]} /><meshStandardMaterial color={info.color} emissive={info.color} emissiveIntensity={0.25} /></mesh>
            <Html position={pos} distanceFactor={undefined} style={{ pointerEvents: "none" }}><div className="translate-x-3 -translate-y-3 text-[11px] text-slate-200 whitespace-nowrap">{name}</div></Html>
            {showMoons && info.moons.map((m) => {
              const ang = ((jd - 2451545) / m.periodD) * 2 * Math.PI;
              const d = r + 0.25 + Math.log10(m.aKm / 5000) * 0.35; // display distance (illustrative)
              const mp = pos.clone().add(new THREE.Vector3(Math.cos(ang) * d, 0, Math.sin(ang) * d));
              return (
                <group key={m.name}>
                  <mesh position={mp}><sphereGeometry args={[0.05, 12, 12]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
                  <Html position={mp} style={{ pointerEvents: "none" }}><div className="translate-x-2 text-[9px] text-slate-400 whitespace-nowrap">{m.name}</div></Html>
                </group>
              );
            })}
          </group>
        );
      })}
    </>
  );
}

function Selected({ el, jd, label, epoch = 2461000.5, color = "#f472b6" }: { el: number[]; jd: number; label: string; epoch?: number; color?: string }) {
  const [a, e, i, om, w, M0] = el;
  const n = 0.9856076686 / Math.pow(a, 1.5);
  const pos = toScene(elementsToXYZ(a, e, i, om, w, M0 + n * (jd - epoch)));
  const path = useMemo(() => orbitPath(a, e, i, om, w, 400).map(toScene), [a, e, i, om, w]);
  return (
    <>
      <Line points={path} color={color} lineWidth={2.5} depthTest={false} renderOrder={10} />
      <mesh position={pos} renderOrder={11}><sphereGeometry args={[0.18, 16, 16]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>
      <Html position={pos}><div className="translate-x-3 -translate-y-4 rounded bg-space-950/70 px-1.5 text-xs whitespace-nowrap border" style={{ color, borderColor: color }}>{label}</div></Html>
    </>
  );
}

interface CustomBody { name: string; el: number[]; epoch: number }

/** CSV with header: name,a,e,i,om,w,ma,epoch (au, deg, JD TDB), e.g. exported from the JPL SBDB Query tool. */
function parseOrbitsCSV(text: string): CustomBody[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  const sep = lines[0]?.includes(";") ? ";" : ",";
  const head = (lines[0] ?? "").split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const need = ["a", "e", "i", "om", "w", "ma", "epoch"];
  const idx = need.map((k) => head.indexOf(k));
  if (idx.some((k) => k < 0)) throw new Error("Required columns: name, a, e, i, om, w, ma, epoch (au, degrees, JD).");
  const iName = Math.max(head.indexOf("name"), head.indexOf("full_name"), head.indexOf("pdes"));
  const out: CustomBody[] = [];
  for (const l of lines.slice(1)) {
    const c = l.split(sep).map((x) => x.trim().replace(/"/g, ""));
    const v = idx.map((k) => Number(c[k]));
    if (v.some((x) => !Number.isFinite(x)) || v[0] <= 0 || v[1] >= 1) continue;
    out.push({ name: iName >= 0 ? c[iName] : `body ${out.length + 1}`, el: v.slice(0, 6), epoch: v[6] });
  }
  if (!out.length) throw new Error("No valid elliptical orbits were found in the file.");
  return out.slice(0, 200);
}

export default function SolarSystem({ focus, onOpenProspect }: { focus: string | null; onOpenProspect: (des: string) => void }) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [loadMsg, setLoadMsg] = useState("Downloading the orbital catalog (SBDB, 1.58 million bodies)…");
  const [jd, setJd] = useState(dateToJD(new Date()));
  const [speed, setSpeed] = useState(0);
  const [visible, setVisible] = useState<boolean[]>(CLASS_INFO.map(() => true));
  const [hmax, setHmax] = useState(30);
  const [size, setSize] = useState(1.3);
  const [moons, setMoons] = useState(true);
  const [query, setQuery] = useState(focus ?? "");
  const [sel, setSel] = useState<{ el: number[]; label: string; pdes: string } | null>(null);
  const [customBodies, setCustomBodies] = useState<CustomBody[]>([]);
  const [refresh, setRefresh] = useState<Job | null>(null);
  const [err, setErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [meta, ob, cl] = await Promise.all([
          getJSON<Catalog["meta"]>("/api/catalog/meta"),
          getBinary(`/api/catalog/orbits.bin?v=${reloadKey}`),
          getBinary(`/api/catalog/classes.bin?v=${reloadKey}`),
        ]);
        setCat({ orbits: new Float32Array(ob), classes: new Uint8Array(cl), count: meta.count, meta });
        setLoadMsg("");
      } catch (e) { setLoadMsg(`Could not load the catalog: ${(e as Error).message}`); }
    })();
  }, [reloadKey]);

  useEffect(() => {
    if (!speed) return;
    let last = performance.now(), raf = 0;
    const tick = (t: number) => { setJd((d) => d + ((t - last) / 1000) * speed); last = t; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  const find = async (q: string) => {
    if (!cat || !q.trim()) return;
    setErr("");
    try {
      const r = await getJSON<{ index: number; pdes: string }>(`/api/catalog-find?q=${encodeURIComponent(q)}`);
      const o = cat.orbits.subarray(r.index * 7, r.index * 7 + 7);
      setSel({ el: Array.from(o), label: `${q} (${r.pdes})`, pdes: r.pdes });
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { if (focus && cat) { setQuery(focus); find(focus); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [focus, cat]);

  const refreshCatalog = async () => {
    if (STATIC) { setErr(LIVE_ONLY); return; }
    if (!confirm("Download every known asteroid and comet orbit again from NASA/JPL SBDB? It takes a few minutes (~60 MB).")) return;
    const r = await fetch("/api/catalog/refresh", { method: "POST" });
    const { job } = await r.json();
    setRefresh({ id: job, kind: "catalog", status: "running", log: [] });
    const poll = setInterval(async () => {
      const j = await getJSON<Job>(`/api/jobs/${job}`);
      setRefresh(j);
      if (j.status !== "running") { clearInterval(poll); if (j.status === "done") { setLoadMsg("Reloading the updated catalog…"); setReloadKey((k) => k + 1); } }
    }, 3000);
  };
  const uploadOrbits = async (f: File) => {
    setErr("");
    try { setCustomBodies(parseOrbitsCSV(await f.text())); } catch (e) { setErr((e as Error).message); }
  };

  const groups: [string, number[]][] = [["NEOs (near-Earth)", [3, 4, 5, 6]], ["Main belt", [0, 1, 2, 13]], ["Mars-crossers", [7]], ["Trojans", [8]], ["Centaurs and TNOs", [9, 10]], ["Comets", [14, 15, 16, 17, 18, 19, 20, 21, 11, 12]]];
  const date = jdToDate(jd);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="panel relative overflow-hidden" style={{ height: "74vh", minHeight: 460 }}>
        <Canvas camera={{ position: [0, 45, 70], fov: 50, near: 0.01, far: 50000 }} dpr={[1, 2]}>
          <color attach="background" args={["#03050c"]} />
          <ambientLight intensity={0.25} />
          <Stars radius={8000} depth={50} count={4000} factor={60} fade />
          {cat && <Asteroids cat={cat} jd={jd} visible={visible} hmax={hmax} size={size} />}
          <Planets jd={jd} showMoons={moons} />
          {sel && <Selected el={sel.el} jd={jd} label={sel.label} />}
          {customBodies.map((b) => <Selected key={b.name} el={b.el} jd={jd} label={b.name} epoch={b.epoch} color="#fbbf24" />)}
          <OrbitControls makeDefault enableDamping maxDistance={5000} />
        </Canvas>
        {loadMsg && <div className="absolute inset-0 grid place-items-center text-sm text-slate-200 bg-space-950/60">{loadMsg}</div>}
        <div className="absolute left-3 top-3 rounded-lg bg-space-950/70 px-3 py-2 text-xs font-mono">
          {date.toISOString().slice(0, 10)} · {cat ? `${cat.count.toLocaleString("en")} bodies` : "…"}
        </div>
        <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-space-950/70 px-3 py-2 text-[11px] text-slate-400">
          Positions <span className="ev-calculated">calculated</span> with two-body Keplerian propagation on the GPU (SBDB elements retrieved {cat?.meta.retrieved_utc.slice(0, 10)}; planets: Standish/JPL mean elements). No perturbations: accuracy degrades years away from the epoch. Planet and moon sizes are enlarged and lunar distances are <span className="ev-illustrative">illustrative</span>.
        </div>
      </div>
      <aside className="panel p-4 space-y-3 text-sm">
        <h2 className="font-semibold text-ion">Living Solar System</h2>
        <div className="flex gap-2">
          <input className="input" placeholder="Bennu, Psyche, 433, 2024 YR4…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find(query)} />
          <button className="btn" onClick={() => find(query)}>Go</button>
        </div>
        {err && <p className="text-xs text-rose-300">{err}</p>}
        {sel && (
          <div className="rounded-lg bg-space-800 p-3 text-xs space-y-1">
            <div className="font-semibold text-pink-200">{sel.label}</div>
            <div className="font-mono">a={sel.el[0].toFixed(3)} au · e={sel.el[1].toFixed(3)} · i={sel.el[2].toFixed(2)}° · H={sel.el[6].toFixed(1)}</div>
            <button className="btn text-xs mt-1" onClick={() => onOpenProspect(sel.pdes)}>Composition, accessibility and mission →</button>
          </div>
        )}
        <div>
          <span className="label">Date</span>
          <input type="range" className="w-full" min={dateToJD(new Date("1990-01-01"))} max={dateToJD(new Date("2100-01-01"))} step={1} value={jd} onChange={(e) => setJd(Number(e.target.value))} aria-label="Date" />
          <div className="flex flex-wrap gap-1">
            {[["⏸", 0], ["1 d/s", 1], ["30 d/s", 30], ["1 yr/s", 365]].map(([l, v]) => <button key={l} className={`btn text-xs ${speed === v ? "btn-on" : ""}`} onClick={() => setSpeed(Number(v))}>{l}</button>)}
            <button className="btn text-xs" onClick={() => { setJd(dateToJD(new Date())); setSpeed(0); }}>Today</button>
          </div>
        </div>
        <div>
          <span className="label">Populations</span>
          {groups.map(([label, idx]) => (
            <label key={label} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={idx.every((k) => visible[k])} onChange={(e) => { const v = [...visible]; idx.forEach((k) => (v[k] = e.target.checked)); setVisible(v); }} />
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CLASS_INFO[idx[0]][2] }} />{label}
            </label>
          ))}
        </div>
        <label className="block"><span className="label">Absolute magnitude H ≤ {hmax} (size filter)</span><input type="range" className="w-full" min={5} max={30} step={0.5} value={hmax} onChange={(e) => setHmax(Number(e.target.value))} /></label>
        <label className="block"><span className="label">Point size</span><input type="range" className="w-full" min={0.5} max={4} step={0.1} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={moons} onChange={(e) => setMoons(e.target.checked)} /> Major moons (illustrative)</label>
        <div className="space-y-2 border-t border-white/10 pt-2">
          <div className="label">Catalog</div>
          <button className="btn text-xs w-full" onClick={refreshCatalog} disabled={refresh?.status === "running"}>⟳ Update orbits from NASA/JPL SBDB</button>
          {refresh && <p className={`text-[11px] ${refresh.status === "error" ? "text-rose-300" : "text-slate-400"}`}>{refresh.status === "running" ? "Working: " : refresh.status === "done" ? "Done: " : "Error: "}{refresh.error ?? refresh.log[refresh.log.length - 1] ?? "starting…"}</p>}
          <label className="btn text-xs w-full inline-block text-center cursor-pointer">Add my own orbits (CSV)
            <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && uploadOrbits(e.target.files[0])} />
          </label>
          <p className="text-[11px] text-slate-500">CSV columns: <code>name, a, e, i, om, w, ma, epoch</code> (au, degrees, JD TDB), as exported by the JPL SBDB Query tool. Up to 200 bodies, drawn in yellow.</p>
          {customBodies.length > 0 && <p className="text-xs text-amber-300">{customBodies.length} custom orbits shown. <button className="underline" onClick={() => setCustomBodies([])}>Clear</button></p>}
        </div>
        <p className="text-[11px] text-slate-500">NEOs are drawn larger and brighter. Scale: 1 au = {SCALE} units. Drag to rotate, scroll to zoom.</p>
      </aside>
    </div>
  );
}
