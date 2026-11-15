import { Html, OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createXRStore, XR } from "@react-three/xr";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getJSON } from "../../api";

const store = createXRStore({ emulate: false });
const PUBLISHED: Record<string, { name: string; url: string }> = {
  "101955": { name: "Bennu (OSIRIS-REx)", url: "https://science.nasa.gov/resource/asteroid-bennu-3d-model/" },
  "162173": { name: "Ryugu (Hayabusa2)", url: "https://www.darts.isas.jaxa.jp/planet/project/hayabusa2/" },
  "25143": { name: "Itokawa (Hayabusa)", url: "https://sbn.psi.edu/pds/shape-models/" },
  "433": { name: "Eros (NEAR)", url: "https://sbn.psi.edu/pds/shape-models/" },
};
const COMPARE = [
  { id: "persona", label: "Person (1.75 m)", h: 1.75, w: 0.5 },
  { id: "nave", label: "OSIRIS-REx-class spacecraft (~6 m)", h: 3.2, w: 6.2 },
  { id: "estadio", label: "Football pitch (105 m)", h: 30, w: 105 },
  { id: "eiffel", label: "Eiffel Tower (330 m)", h: 330, w: 125 },
];

// Deterministic value noise seeded by the designation (procedural relief, illustrative).
function hash(n: number) { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }
function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t: number) => t * t * (3 - 2 * t);
  let v = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    const h = hash((xi + dx) * 157 + (yi + dy) * 311 + (zi + dz) * 541 + seed * 13.1);
    v += h * (dx ? f(xf) : 1 - f(xf)) * (dy ? f(yf) : 1 - f(yf)) * (dz ? f(zf) : 1 - f(zf));
  }
  return v;
}

function makeGeometry(extent: [number, number, number], seed: number, layer: boolean) {
  const g = new THREE.IcosahedronGeometry(1, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 0, amp = 0.18, fr = 1.6;
    for (let o = 0; o < 4; o++) { d += amp * (noise3(v.x * fr + 5, v.y * fr + 5, v.z * fr + 5, seed) - 0.5); amp *= 0.5; fr *= 2.2; }
    const crater = Math.max(0, noise3(v.x * 3 + 9, v.y * 3 + 9, v.z * 3 + 9, seed + 7) - 0.72) * -0.6;
    const r = 1 + d + crater;
    p.setXYZ(i, v.x * r * extent[0] / 2, v.y * r * extent[2] / 2, v.z * r * extent[1] / 2);
    const base = 0.32 + d * 0.6;
    const t = noise3(v.x * 2 + 1, v.y * 2 + 1, v.z * 2 + 1, seed + 3);
    if (layer) { colors[3 * i] = 0.2 + 0.6 * t; colors[3 * i + 1] = 0.35; colors[3 * i + 2] = 0.9 - 0.6 * t; }
    else { colors[3 * i] = base; colors[3 * i + 1] = base * 0.97; colors[3 * i + 2] = base * 0.92; }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function Body({ extent, seed, periodH, timeScale, layer }: { extent: [number, number, number]; seed: number; periodH: number; timeScale: number; layer: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const geom = useMemo(() => makeGeometry(extent, seed, layer), [extent, seed, layer]);
  useFrame((_, dt) => { if (ref.current && periodH > 0) ref.current.rotation.y += (2 * Math.PI * dt * timeScale) / (periodH * 3600); });
  return <mesh ref={ref} geometry={geom}><meshStandardMaterial vertexColors roughness={0.95} metalness={0.05} flatShading /></mesh>;
}

function CameraRig({ mode, size }: { mode: "orbit" | "surface"; size: number }) {
  const { camera } = useThree();
  useEffect(() => {
    if (mode === "surface") { camera.position.set(0, size * 0.55, size * 0.08); camera.lookAt(size, size * 0.3, 0); }
    else { camera.position.set(size * 1.6, size * 0.8, size * 1.6); camera.lookAt(0, 0, 0); }
  }, [mode, size, camera]);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sbdb = any;

export default function Explorer({ des }: { des: string | null }) {
  const [q, setQ] = useState(des ?? "101955");
  const [sb, setSb] = useState<Sbdb | null>(null);
  const [err, setErr] = useState("");
  const [cmp, setCmp] = useState("estadio");
  const [timeScale, setTimeScale] = useState(600);
  const [layer, setLayer] = useState(false);
  const [mode, setMode] = useState<"orbit" | "surface">("orbit");
  const [xrOk, setXrOk] = useState<boolean | null>(null);

  const load = (d: string) => { setErr(""); getJSON<Sbdb>(`/api/sbdb/${encodeURIComponent(d)}`).then(setSb).catch((e) => setErr(e.message)); };
  useEffect(() => { load(des ?? "101955"); setQ(des ?? "101955"); }, [des]);
  useEffect(() => { (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr?.isSessionSupported("immersive-vr").then(setXrOk).catch(() => setXrOk(false)) ?? setXrOk(false); }, []);

  const phys: Record<string, { value: string; ref?: string }> = {};
  (sb?.phys_par ?? []).forEach((p: { name: string; value: string; ref?: string }) => (phys[p.name] = p));
  const objDes: string = sb?.object?.des ?? "";
  const H = Number(phys.H?.value ?? 20);
  let extent: [number, number, number]; let tier: "A" | "B" | "C"; let tierText: string;
  if (phys.extent) {
    const e = phys.extent.value.split("x").map((s: string) => parseFloat(s) * 1000);
    extent = [e[0], e[1] ?? e[0], e[2] ?? e[1] ?? e[0]]; tier = PUBLISHED[objDes] ? "A" : "B";
    tierText = "Triaxial ellipsoid with the measured dimensions (SBDB). The relief is procedural and illustrative.";
  } else if (phys.diameter) {
    const d = parseFloat(phys.diameter.value) * 1000; extent = [d * 1.1, d, d * 0.9]; tier = "C";
    tierText = "Only the equivalent diameter is known. The shape is illustrative (10% flattening assumed).";
  } else {
    const d = (1329 / Math.sqrt(0.14)) * Math.pow(10, -H / 5) * 1000; extent = [d * 1.1, d, d * 0.9]; tier = "C";
    tierText = "Diameter estimated from H with an assumed albedo of 0.14 (D = 1329 km/√p · 10^(−H/5)). Illustrative shape.";
  }
  const size = Math.max(...extent);
  const period = Number(phys.rot_per?.value ?? 0);
  const seed = [...objDes].reduce((a, c) => a + c.charCodeAt(0), 0) || 7;
  const c = COMPARE.find((x) => x.id === cmp)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="panel relative overflow-hidden" style={{ height: "74vh", minHeight: 460 }}>
        <Canvas camera={{ position: [size * 1.6, size * 0.8, size * 1.6], fov: 50, near: 0.05, far: size * 200 }}>
          <XR store={store}>
            <color attach="background" args={["#020309"]} />
            <Stars radius={size * 50} depth={size * 5} count={3000} factor={size * 0.8} fade />
            <ambientLight intensity={0.15} />
            <directionalLight position={[size * 3, size, size]} intensity={2.2} />
            {sb && <Body extent={extent} seed={seed} periodH={period} timeScale={timeScale} layer={layer} />}
            {sb && (
              <group position={[size * 0.75, -extent[2] / 2, 0]}>
                <mesh position={[0, c.h / 2, 0]}><boxGeometry args={[c.w, c.h, Math.max(0.3, c.w * 0.3)]} /><meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.4} /></mesh>
                <Html position={[0, c.h + size * 0.03, 0]}><div className="whitespace-nowrap text-[11px] text-sky-300">{c.label}</div></Html>
              </group>
            )}
            <CameraRig mode={mode} size={size} />
            <OrbitControls makeDefault enableDamping minDistance={0.5} maxDistance={size * 20} />
          </XR>
        </Canvas>
        <div className="absolute left-3 top-3 flex gap-2">
          <button className="btn text-xs" onClick={() => setMode(mode === "orbit" ? "surface" : "orbit")}>{mode === "orbit" ? "Surface view" : "Orbital view"}</button>
          <button className="btn-primary text-xs" disabled={!xrOk} onClick={() => store.enterVR()} title={xrOk ? "" : "No WebXR headset detected; the full experience works in the browser"}>Enter VR</button>
        </div>
        <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-space-950/70 p-2 text-[11px] text-slate-300">
          Level {tier}: {tierText} {tier === "A" && PUBLISHED[objDes] && <>A <a className="text-ion underline" href={PUBLISHED[objDes].url} target="_blank" rel="noreferrer">published model ({PUBLISHED[objDes].name})</a> exists; the approximate reconstruction is shown here.</>} <span className={tier === "C" ? "ev-illustrative" : "ev-inferred"}>{tier === "C" ? "illustrative" : "approximate reconstruction"}</span>
        </div>
      </div>
      <aside className="panel p-4 space-y-3 text-sm">
        <h2 className="font-semibold text-ion">Asteroid explorer</h2>
        <div className="flex gap-2"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} placeholder="Bennu, Ryugu, 433…" /><button className="btn" onClick={() => load(q)}>Load</button></div>
        {err && <p className="text-xs text-rose-300">{err}</p>}
        {sb && (
          <div className="text-xs space-y-1">
            <div className="text-base font-semibold">{sb.object?.fullname}</div>
            <div>Dimensions: <span className="font-mono">{extent.map((v) => (v >= 1000 ? (v / 1000).toFixed(2) + " km" : v.toFixed(0) + " m")).join(" × ")}</span></div>
            <div>Rotation: {period ? `${period} h` : "unknown"} {period > 0 && <span className="ev-observed">observed</span>}</div>
            <div>Spectral class: {sb.phys_par?.find((p: { name: string }) => p.name === "spec_B")?.value ?? sb.phys_par?.find((p: { name: string }) => p.name === "spec_T")?.value ?? "unknown"}</div>
          </div>
        )}
        <label className="block text-xs"><span className="label">Compare size with</span>
          <select className="input" value={cmp} onChange={(e) => setCmp(e.target.value)}>{COMPARE.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <label className="block text-xs"><span className="label">Rotation speed ×{timeScale}</span><input type="range" min={1} max={5000} step={1} value={timeScale} onChange={(e) => setTimeScale(Number(e.target.value))} className="w-full" /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={layer} onChange={(e) => setLayer(e.target.checked)} /> Composition layer <span className="ev-illustrative">illustrative, not a measured map</span></label>
        <div className="rounded-lg bg-space-800 p-3 text-xs text-slate-300 space-y-1">
          <div className="label">VR</div>
          <p>{xrOk === null ? "Detecting WebXR…" : xrOk ? "Compatible headset detected. VR uses seated mode; recenter with the headset button." : "No WebXR headset. Full exploration works with mouse or touch."}</p>
          <p className="text-slate-500">A detailed 3D shape, distance or interior is never inferred from 2D sky images.</p>
        </div>
      </aside>
    </div>
  );
}
