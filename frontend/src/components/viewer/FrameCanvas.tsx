import { useEffect, useRef } from "react";
import type { OverlayPoint } from "../../types";

export interface Marker { x: number; y: number; color: string; label?: string; ring?: number; cross?: boolean }

interface Props {
  image: ImageData | null;
  imageB?: ImageData | null;           // for slider comparison
  slider?: number;                     // 0..1 split position
  n: number;
  overlays: OverlayPoint[];
  markers: Marker[];
  showLabels: boolean;
  onPick?: (x: number, y: number) => void; // data coords (x right, y north)
  onHover?: (x: number, y: number) => void;
  size?: number;
}

const COLORS: Record<string, string> = { gaia: "#34d399", catwise: "#fbbf24", simbad: "#f472b6", asteroid: "#38bdf8", comet: "#a78bfa" };

/** Draws a frame scaled with nearest-neighbour, plus catalog overlays in data pixel coords. */
export default function FrameCanvas({ image, imageB, slider = 0.5, n, overlays, markers, showLabels, onPick, onHover, size = 560 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const offB = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#050813"; ctx.fillRect(0, 0, size, size);
    if (!image) return;
    const draw = (img: ImageData, holder: React.MutableRefObject<HTMLCanvasElement | null>) => {
      if (!holder.current) holder.current = document.createElement("canvas");
      holder.current.width = img.width; holder.current.height = img.height;
      holder.current.getContext("2d")!.putImageData(img, 0, 0);
      return holder.current;
    };
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(draw(image, off), 0, 0, size, size);
    if (imageB) {
      const cut = size * slider;
      ctx.save(); ctx.beginPath(); ctx.rect(cut, 0, size - cut, size); ctx.clip();
      ctx.drawImage(draw(imageB, offB), 0, 0, size, size); ctx.restore();
      ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cut, 0); ctx.lineTo(cut, size); ctx.stroke();
    }
    const k = size / n;
    const toScreen = (x: number, y: number): [number, number] => [(x + 0.5) * k, (n - 1 - y + 0.5) * k];
    ctx.font = "11px Inter, sans-serif";
    for (const p of overlays) {
      if (p.x < -2 || p.y < -2 || p.x > n + 1 || p.y > n + 1) continue;
      const [sx, sy] = toScreen(p.x, p.y);
      const col = (p.extra?.color as string | undefined) ?? COLORS[p.kind] ?? "#fff";
      ctx.strokeStyle = col; ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (p.kind === "asteroid") { ctx.rect(sx - 7, sy - 7, 14, 14); } else if (p.kind === "custom" || p.kind === "vizier") { ctx.moveTo(sx - 6, sy); ctx.lineTo(sx, sy - 6); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 6); ctx.closePath(); } else ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (showLabels) { ctx.fillStyle = col; ctx.fillText(p.label.slice(0, 32), sx + 8, sy - 6); }
    }
    for (const m of markers) {
      const [sx, sy] = toScreen(m.x, m.y);
      ctx.strokeStyle = m.color; ctx.lineWidth = 2;
      if (m.cross) { ctx.beginPath(); ctx.moveTo(sx - 10, sy); ctx.lineTo(sx - 4, sy); ctx.moveTo(sx + 4, sy); ctx.lineTo(sx + 10, sy); ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy - 4); ctx.moveTo(sx, sy + 4); ctx.lineTo(sx, sy + 10); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(sx, sy, (m.ring ?? 2.5) * k, 0, Math.PI * 2); ctx.stroke(); }
      if (m.label) { ctx.fillStyle = m.color; ctx.fillText(m.label, sx + 10, sy + 14); }
    }
    // compass
    ctx.fillStyle = "#94a3b8"; ctx.font = "bold 11px Inter";
    ctx.fillText("N", size - 22, 18); ctx.fillText("E", size - 44, 38);
    ctx.strokeStyle = "#94a3b8"; ctx.beginPath(); ctx.moveTo(size - 18, 40); ctx.lineTo(size - 18, 22); ctx.moveTo(size - 18, 40); ctx.lineTo(size - 34, 40); ctx.stroke();
  }, [image, imageB, slider, n, overlays, markers, showLabels, size]);

  const toData = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const k = r.width / n;
    const x = (e.clientX - r.left) / k - 0.5;
    const y = n - 1 - ((e.clientY - r.top) / k - 0.5);
    return [x, y] as const;
  };
  return (
    <canvas
      ref={ref}
      style={{ width: "100%", maxWidth: size, aspectRatio: "1 / 1", cursor: "crosshair", imageRendering: "pixelated" }}
      className="rounded-lg border border-white/10"
      onClick={(e) => { const [x, y] = toData(e); onPick?.(x, y); }}
      onMouseMove={(e) => { const [x, y] = toData(e); onHover?.(x, y); }}
      aria-label="SPHEREx image on the common grid (north up, east left)"
    />
  );
}
