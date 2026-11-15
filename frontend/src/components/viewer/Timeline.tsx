import type { DecodedFrame } from "../../types";

/** Real-time axis: tick spacing is proportional to the actual dates (gaps stay visible). */
export default function Timeline({ frames, index, onSelect, a, b }: { frames: DecodedFrame[]; index: number; onSelect: (i: number) => void; a?: number; b?: number }) {
  if (!frames.length) return null;
  const t0 = frames[0].mjd, t1 = frames[frames.length - 1].mjd;
  const span = Math.max(t1 - t0, 1e-3);
  const W = 1000;
  const gaps: { x0: number; x1: number; days: number }[] = [];
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].mjd - frames[i - 1].mjd;
    if (d > 20) gaps.push({ x0: ((frames[i - 1].mjd - t0) / span) * W, x1: ((frames[i].mjd - t0) / span) * W, days: d });
  }
  const lam = (f: DecodedFrame) => f.wavelength_um;
  const lmin = Math.min(...frames.map(lam)), lmax = Math.max(...frames.map(lam));
  const color = (f: DecodedFrame) => {
    const t = lmax > lmin ? (lam(f) - lmin) / (lmax - lmin) : 0.5;
    return `hsl(${220 - 220 * t} 90% 65%)`;
  };
  return (
    <div className="w-full">
      <svg viewBox={`-10 0 ${W + 20} 46`} className="w-full h-12" role="list" aria-label="Timeline of real observations">
        <line x1={0} x2={W} y1={22} y2={22} stroke="#2a3a6e" strokeWidth={2} />
        {gaps.map((g, k) => (
          <g key={k}>
            <line x1={g.x0} x2={g.x1} y1={22} y2={22} stroke="#475569" strokeDasharray="4 4" strokeWidth={2} />
            <text x={(g.x0 + g.x1) / 2} y={40} fill="#64748b" fontSize={10} textAnchor="middle">no data · {Math.round(g.days)} d</text>
          </g>
        ))}
        {frames.map((f, i) => {
          const x = ((f.mjd - t0) / span) * W;
          const sel = i === index;
          return (
            <g key={f.id} onClick={() => onSelect(i)} style={{ cursor: "pointer" }} role="listitem">
              <title>{f.date_utc} · λ {f.wavelength_um.toFixed(3)} µm · D{f.detector}</title>
              <line x1={x} x2={x} y1={sel ? 6 : 12} y2={sel ? 38 : 32} stroke={color(f)} strokeWidth={sel ? 3 : 1.6} />
              {(i === a || i === b) && <text x={x} y={8} fill="#fbbf24" fontSize={10} textAnchor="middle">{i === a ? "A" : "B"}</text>}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-slate-400 font-mono">
        <span>{frames[0].date_utc.slice(0, 10)}</span>
        <span>color = wavelength ({lmin.toFixed(2)}–{lmax.toFixed(2)} µm)</span>
        <span>{frames[frames.length - 1].date_utc.slice(0, 10)}</span>
      </div>
    </div>
  );
}
