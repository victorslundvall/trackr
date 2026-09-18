"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { mmss } from "@/lib/format";
import { haptic, spring } from "./motion";

const R = 22;
const C = 2 * Math.PI * R;

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
    if (done) haptic([200, 100, 200]);
  }, [done]);

  const frac = Math.min(1, Math.max(0, left / total));

  return (
    <motion.div
      initial={{ y: "120%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "120%", opacity: 0 }}
      transition={spring}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div
        className={`mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border bg-surface/85 p-2.5 pr-3 shadow-[0_16px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-colors duration-500 ${
          done ? "border-accent/60" : "border-line"
        }`}
      >
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
            <circle cx={28} cy={28} r={R} fill="none" stroke="var(--color-line)" strokeWidth={4} />
            <circle
              cx={28}
              cy={28}
              r={R}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              style={{ transition: "stroke-dashoffset 0.25s linear", filter: "drop-shadow(0 0 4px color-mix(in oklab, var(--color-accent) 60%, transparent))" }}
            />
          </svg>
          {done && (
            <motion.span
              className="absolute inset-0 rounded-full bg-accent/30"
              initial={{ scale: 0.6, opacity: 0.8 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{done ? "Vila klar – kör!" : "Vila"}</div>
          <motion.div
            animate={done ? { scale: [1, 1.08, 1] } : {}}
            transition={{ duration: 0.8, repeat: done ? Infinity : 0 }}
            className={`origin-left font-mono text-[1.7rem] font-semibold leading-tight tabular-nums ${done ? "text-accent" : ""}`}
          >
            {mmss(left)}
          </motion.div>
        </div>
        <button className="btn-ghost h-10 px-2.5 text-xs" onClick={() => onAdjust(-15)}>−15</button>
        <button className="btn-ghost h-10 px-2.5 text-xs" onClick={() => onAdjust(15)}>+15</button>
        <button className="btn-primary h-10 px-3.5" onClick={onDone}>{done ? "Stäng" : "Hoppa"}</button>
      </div>
    </motion.div>
  );
}
