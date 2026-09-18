"use client";

import { useMemo, useRef, useState } from "react";

type Pt = { x: number; y: number; label: string; value: string };

/** Single-series line chart with crosshair + tooltip. x is a timestamp (ms). */
export function LineChart({ points, height = 180, yUnit = "" }: { points: Pt[]; height?: number; yUnit?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 360;
  const H = height;
  const pad = { l: 34, r: 8, t: 10, b: 20 };

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    const span = y1 - y0 || Math.max(1, y1 * 0.1);
    y0 = Math.max(0, y0 - span * 0.12);
    y1 = y1 + span * 0.12;
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs) === x0 ? x0 + 1 : Math.max(...xs);
    const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
    const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    const ticks = niceTicks(y0, y1, 4);
    const xTicks = timeTicks(x0, x1);
    return { sx, sy, ticks, xTicks };
  }, [points, H]);

  if (!geo) return <Empty />;
  const { sx, sy, ticks, xTicks } = geo;
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
  const hp = hover != null ? points[hover] : null;

  function onMove(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const dd = Math.abs(sx(p.x) - x);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={10} fill="var(--color-ink-3)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t.x} x={sx(t.x)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
            {t.label}
          </text>
        ))}
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 40 &&
          points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />)}
        {hp && (
          <g>
            <line x1={sx(hp.x)} x2={sx(hp.x)} y1={pad.t} y2={H - pad.b} stroke="var(--color-ink-3)" strokeDasharray="3 3" />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r={4} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(sx(hp.x) / W) * 100}%`, transform: `translateX(${sx(hp.x) > W / 2 ? "-105%" : "5%"})` }}
        >
          <div className="text-ink-3">{hp.label}</div>
          <div className="font-semibold text-ink">
            {hp.value}
            {yUnit}
          </div>
        </div>
      )}
    </div>
  );
}

/** Vertical bars, one series. */
export function BarChart({ bars, height = 160 }: { bars: { key: string; label: string; value: number; tip: string }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!bars.length) return <Empty />;
  const W = 360;
  const H = height;
  const pad = { l: 28, r: 4, t: 8, b: 20 };
  const max = Math.max(...bars.map((b) => b.value), 1);
  const ticks = niceTicks(0, max, 3);
  const top = ticks[ticks.length - 1] || max;
  const bw = (W - pad.l - pad.r) / bars.length;
  const sy = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const hb = hover != null ? bars[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" onPointerLeave={() => setHover(null)} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-line)" />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={10} fill="var(--color-ink-3)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = pad.l + i * bw + 2;
          const w = Math.max(2, bw - 4);
          const y = sy(b.value);
          const h = H - pad.b - y;
          return (
            <g key={b.key} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && <path d={roundedTop(x, y, w, h, Math.min(4, w / 2))} fill={hover === i ? "var(--color-ink)" : "var(--color-accent)"} />}
              {(bars.length <= 8 || i % Math.ceil(bars.length / 6) === (bars.length - 1) % Math.ceil(bars.length / 6)) && (
                <text x={x + w / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hb && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${((pad.l + hover! * bw + bw / 2) / W) * 100}%`, transform: `translateX(${hover! > bars.length / 2 ? "-105%" : "5%"})` }}
        >
          {hb.tip}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Empty() {
  return <div className="flex h-32 items-center justify-center text-sm text-ink-3">Ingen data ännu</div>;
}

function fmt(n: number) {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : Number(n.toFixed(1)).toLocaleString("sv-SE");
}

function niceTicks(min: number, max: number, count: number) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

function timeTicks(x0: number, x1: number) {
  const days = (x1 - x0) / 864e5;
  const out: { x: number; label: string }[] = [];
  const d = new Date(x0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  const stepMonths = days > 1100 ? 12 : days > 500 ? 6 : days > 200 ? 3 : days > 60 ? 1 : 0;
  if (stepMonths === 0) {
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      out.push({ x, label: new Date(x).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) });
    }
    return out;
  }
  if (stepMonths === 12) d.setMonth(0);
  while (d.getTime() <= x1) {
    if (d.getTime() >= x0) {
      out.push({
        x: d.getTime(),
        label: stepMonths === 12 ? String(d.getFullYear()) : d.toLocaleDateString("sv-SE", { month: "short", year: "2-digit" }),
      });
    }
    d.setMonth(d.getMonth() + stepMonths);
  }
  return out;
}
