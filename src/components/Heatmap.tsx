"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** GitHub-style calendar of the last ~53 weeks, one hue (accent) light→dark by working sets. */
export default function Heatmap({ days }: { days: { day: string; sets: number }[] }) {
  const [hover, setHover] = useState<{ day: string; sets: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // show the most recent weeks first on narrow screens
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [days]);
  const { weeks, max, months, total, active } = useMemo(() => {
    const map = new Map(days.map((d) => [d.day, Number(d.sets)]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // start on the Monday 52 weeks back
    const start = new Date(today);
    start.setDate(start.getDate() - 364 - ((today.getDay() + 6) % 7));
    const weeks: { day: string; sets: number; future: boolean }[][] = [];
    const months: { i: number; label: string }[] = [];
    const cur = new Date(start);
    let lastMonth = -1;
    for (let w = 0; cur <= today; w++) {
      const col: { day: string; sets: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        col.push({ day: key, sets: map.get(key) ?? 0, future: cur > today });
        if (d === 0 && cur.getMonth() !== lastMonth) {
          months.push({ i: w, label: cur.toLocaleDateString("sv-SE", { month: "short" }) });
          lastMonth = cur.getMonth();
        }
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(col);
    }
    const vals = [...map.values()];
    return { weeks, max: Math.max(1, ...vals), months, total: vals.length, active: vals.reduce((a, b) => a + b, 0) };
  }, [days]);

  const level = (v: number) => (v <= 0 ? 0 : v < max * 0.25 ? 1 : v < max * 0.5 ? 2 : v < max * 0.75 ? 3 : 4);
  const fill = ["var(--color-surface-2)", "color-mix(in oklab, var(--color-accent) 30%, var(--color-surface-2))", "color-mix(in oklab, var(--color-accent) 55%, var(--color-surface-2))", "color-mix(in oklab, var(--color-accent) 80%, var(--color-surface-2))", "var(--color-accent)"];
  const cell = 11;
  const gap = 2;
  const W = weeks.length * (cell + gap) + 18;
  const H = 7 * (cell + gap) + 16;

  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-ink-2">
          <b className="font-semibold text-ink">{total}</b> träningsdagar · {active.toLocaleString("sv-SE")} set senaste året
        </span>
        <span className="text-xs text-ink-3">{hover ? `${new Date(hover.day).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}: ${hover.sets} set` : "Tryck på en dag"}</span>
      </div>
      <div ref={scroller} className="-mx-1 overflow-x-auto px-1">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} onPointerLeave={() => setHover(null)}>
          {months.map((m) => (
            <text key={m.i} x={18 + m.i * (cell + gap)} y={9} fontSize={9} fill="var(--color-ink-3)">
              {m.label}
            </text>
          ))}
          {["M", "", "O", "", "F", "", "S"].map((l, i) => (
            <text key={i} x={0} y={16 + i * (cell + gap) + 9} fontSize={8} fill="var(--color-ink-3)">
              {l}
            </text>
          ))}
          {weeks.map((col, w) =>
            col.map((c, d) =>
              c.future ? null : (
                <rect
                  key={c.day}
                  x={18 + w * (cell + gap)}
                  y={14 + d * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={2.5}
                  fill={fill[level(c.sets)]}
                  stroke={hover?.day === c.day ? "var(--color-ink)" : "none"}
                  onPointerEnter={() => setHover(c)}
                  onPointerDown={() => setHover(c)}
                />
              ),
            ),
          )}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-ink-3">
        Mindre
        {fill.map((f, i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: f }} />
        ))}
        Mer
      </div>
    </div>
  );
}
