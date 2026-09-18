"use client";

import { useEffect, useState } from "react";
import { mmss } from "@/lib/format";

export default function RestTimer({
  endsAt,
  total,
  onAdjust,
  onDone,
}: {
  endsAt: number;
  total: number;
  onAdjust: (deltaSec: number) => void;
  onDone: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, (endsAt - now) / 1000);
  const done = left <= 0;

  useEffect(() => {
    if (done) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
    }
  }, [done]);

  const pct = Math.min(100, Math.max(0, 100 - (left / total) * 100));

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="h-1 bg-line">
        <div className="h-1 bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-ink-3">{done ? "Vila klar" : "Vila"}</div>
          <div className={`text-2xl font-bold tabular-nums ${done ? "text-accent" : ""}`}>{mmss(left)}</div>
        </div>
        <button className="btn-ghost px-3" onClick={() => onAdjust(-15)}>−15</button>
        <button className="btn-ghost px-3" onClick={() => onAdjust(15)}>+15</button>
        <button className="btn-primary" onClick={onDone}>{done ? "Stäng" : "Hoppa över"}</button>
      </div>
    </div>
  );
}
