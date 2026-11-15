import type { DecodedFrame, Frame, Series } from "./types";

/**
 * Static showcase mode (GitHub Pages): no Python backend, so every /api/* request is mapped to a
 * pre-exported JSON snapshot of REAL data (backend/scripts/export_static.py). Live-only features
 * (new SPHEREx searches, saving cases, VizieR layers, catalog refresh) explain how to run them locally.
 */
export const STATIC = import.meta.env.VITE_STATIC === "1";
export const REPO_URL = "https://github.com/" + (import.meta.env.VITE_REPO ?? "");
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
export const LIVE_ONLY = "This needs the live backend. In the online showcase you can open every preloaded case; to search any position of the sky, run PlanetX Atlas locally (see the GitHub repository).";

interface StaticCase { id: string; ra: number; dec: number }
let caseIndex: Promise<StaticCase[]> | null = null;
const cases = () => (caseIndex ??= fetch(`${BASE}/static-api/demo.json`).then((r) => r.json()).catch(() => []));

async function nearestCase(ra: number, dec: number): Promise<string | null> {
  const list = await cases();
  let best: string | null = null, bd = 0.05;
  for (const c of list) {
    const d = Math.hypot((c.ra - ra) * Math.cos((dec * Math.PI) / 180), c.dec - dec);
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}

/** Map an /api/... URL to a static snapshot path, or throw a friendly live-only error. */
export async function staticPath(url: string): Promise<string> {
  const u = new URL(url, "http://x");
  const p = u.pathname.replace(/^\/api\//, "");
  const q = u.searchParams;
  const file = (name: string) => `${BASE}/static-api/${name}`;
  const simple = ["demo", "validation", "catalog/meta", "prospect", "knowledge", "defense/cad", "defense/sentry", "defense/fireballs", "health"];
  if (simple.includes(p)) return file(`${p}.json`);
  if (p === "catalog/orbits.bin" || p === "catalog/classes.bin") return file(p);
  if (p.startsWith("demo/")) return file(`${p}.json`);
  if (p.startsWith("sbdb/")) return file(`sbdb/${decodeURIComponent(p.slice(5)).toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`);
  if (p === "porkchop") return file(`porkchop/${(q.get("des") ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`);
  if (p === "catalog-find") return file(`find/${(q.get("q") ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`);
  if (p.startsWith("overlay/") || p === "spherex/spectrum") {
    const id = await nearestCase(Number(q.get("ra")), Number(q.get("dec")));
    if (!id) throw new Error(LIVE_ONLY);
    if (p === "spherex/spectrum") return file(`spectrum/${id}.json`);
    const kind = p.slice(8);
    if (kind === "vizier") throw new Error(LIVE_ONLY);
    if (kind === "asteroids") return file(`overlay/${id}_asteroids_${Number(q.get("mjd")).toFixed(3)}.json`);
    return file(`overlay/${id}_${kind}.json`);
  }
  throw new Error(LIVE_ONLY);
}

export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (STATIC && url.startsWith("/api/")) {
    const path = await staticPath(url);
    const r = await fetch(path, { signal });
    if (!r.ok) throw new Error(r.status === 404 ? "Not included in the online snapshot. " + LIVE_ONLY : `${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
  }
  const r = await fetch(url, { signal });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* not json */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

/** Binary download (orbital catalog) that works in both modes. */
export async function getBinary(url: string): Promise<ArrayBuffer> {
  const r = await fetch(STATIC && url.startsWith("/api/") ? await staticPath(url) : url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.arrayBuffer();
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.set(k, String(v));
  return u.toString();
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeFrame(f: Frame): DecodedFrame {
  const img = new Float32Array(b64ToBytes(f.data).buffer);
  const badMask = b64ToBytes(f.bad);
  return { ...f, data: "", bad: "", img, badMask };
}

export function decodeSeries(s: Series): DecodedFrame[] {
  return s.frames.map(decodeFrame);
}
