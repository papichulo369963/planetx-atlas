import type { Spectrum } from "../../types";

const FEATURES = [
  { um: 1.88, label: "Pa-α" },
  { um: 3.0, label: "H₂O/OH (hydration)" },
  { um: 3.3, label: "PAH / CH₄" },
  { um: 4.26, label: "CO₂" },
  { um: 4.67, label: "CO" },
];

export default function SpectrumChart({ spec }: { spec: Spectrum }) {
  const W = 640, H = 220, P = { l: 52, r: 12, t: 12, b: 34 };
  const pts = spec.wavelength_um.map((w, i) => ({ w, f: spec.flux_mjy[i], e: spec.err_mjy[i] })).filter((p) => p.f !== null) as { w: number; f: number; e: number | null }[];
  if (!pts.length) return <p className="text-sm text-slate-400">No valid spectral data.</p>;
  const fmax = Math.max(...pts.map((p) => p.f + (p.e ?? 0))), fmin = Math.min(0, ...pts.map((p) => p.f - (p.e ?? 0)));
  const x = (w: number) => P.l + ((w - 0.7) / (5.1 - 0.7)) * (W - P.l - P.r);
  const y = (f: number) => P.t + (1 - (f - fmin) / (fmax - fmin || 1)) * (H - P.t - P.b);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.w).toFixed(1)},${y(p.f).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="102-channel spectrum">
      {FEATURES.map((f) => (
        <g key={f.um}>
          <line x1={x(f.um)} x2={x(f.um)} y1={P.t} y2={H - P.b} stroke="#475569" strokeDasharray="3 3" />
          <text x={x(f.um) + 3} y={P.t + 10} fill="#94a3b8" fontSize={9}>{f.label}</text>
        </g>
      ))}
      {pts.map((p, i) => p.e !== null && <line key={i} x1={x(p.w)} x2={x(p.w)} y1={y(p.f - p.e)} y2={y(p.f + p.e)} stroke="#7dd3fc55" />)}
      <path d={path} fill="none" stroke="#7dd3fc" strokeWidth={1.6} />
      {pts.map((p, i) => <circle key={i} cx={x(p.w)} cy={y(p.f)} r={1.8} fill="#7dd3fc" />)}
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="#64748b" />
      <line x1={P.l} x2={P.l} y1={P.t} y2={H - P.b} stroke="#64748b" />
      {[1, 2, 3, 4, 5].map((w) => <text key={w} x={x(w)} y={H - P.b + 14} fill="#94a3b8" fontSize={10} textAnchor="middle">{w}</text>)}
      <text x={(W + P.l) / 2} y={H - 4} fill="#94a3b8" fontSize={10} textAnchor="middle">Wavelength [µm]</text>
      {[0, 0.5, 1].map((t) => { const v = fmin + t * (fmax - fmin); return <text key={t} x={P.l - 6} y={y(v) + 3} fill="#94a3b8" fontSize={10} textAnchor="end">{v.toPrecision(3)}</text>; })}
      <text x={12} y={H / 2} fill="#94a3b8" fontSize={10} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">Flux [mJy]</text>
    </svg>
  );
}
