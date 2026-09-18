"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { muscleLabel, num } from "@/lib/format";
import { BODY_BACK, BODY_FRONT, type BodyShape } from "@/lib/body-paths";

export type MuscleState = { sets: number; target: { min: number; max: number } | null };

/** Colour by status vs target: none → under → in range → over. Identity is also given by label/legend. */
export function muscleColor(st: MuscleState | undefined) {
  if (!st || st.sets <= 0) return "var(--color-surface-2)";
  if (!st.target) return "color-mix(in oklab, var(--color-ink-3) 55%, transparent)";
  if (st.sets < st.target.min * 0.5) return "color-mix(in oklab, var(--color-warm) 45%, var(--color-surface-2))";
  if (st.sets < st.target.min) return "var(--color-warm)";
  if (st.sets <= st.target.max) return "var(--color-accent)";
  return "var(--color-sky)";
}

function statusLabel(st: MuscleState | undefined) {
  if (!st || st.sets <= 0) return "Ingen volym";
  if (!st.target) return "Inget mål";
  if (st.sets < st.target.min * 0.5) return "Långt under mål";
  if (st.sets < st.target.min) return "Under mål";
  if (st.sets <= st.target.max) return "I mål";
  return "Över mål";
}

const BASE = "color-mix(in oklab, var(--color-surface-2) 70%, var(--color-bg))"; // head, hands, knees …
const IDLE = "color-mix(in oklab, var(--color-line) 75%, var(--color-surface-2))"; // muscle with no sets
const VIEWBOX = "40 150 648 1215";

export default function MuscleMap({ data }: { data: Record<string, MuscleState> }) {
  const [active, setActive] = useState<string | null>(null);
  const st = active ? data[active] : undefined;

  const fillFor = (m: string | null) => {
    if (!m) return BASE;
    const s = data[m];
    return !s || s.sets <= 0 ? IDLE : muscleColor(s);
  };

  const figure = (shapes: BodyShape[], label: string, offset: number) => (
    <figure className="relative flex flex-1 flex-col items-center">
      {/* floor glow */}
      <div className="pointer-events-none absolute bottom-7 left-1/2 h-4 w-2/3 -translate-x-1/2 rounded-[50%] bg-black/50 blur-md" />
      <svg viewBox={VIEWBOX} className="relative w-full max-w-[210px] overflow-visible" role="img" aria-label={`Muskelkarta ${label}`}>
        <defs>
          <linearGradient id={`sheen-${label}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        {shapes.map((s, i) => {
          const lit = !!s.m && (data[s.m]?.sets ?? 0) > 0;
          const isActive = !!s.m && s.m === active;
          const dim = !!active && !isActive;
          return (
            <path
              key={i}
              d={s.d}
              fill={fillFor(s.m)}
              stroke={isActive ? "var(--color-ink)" : "var(--color-bg)"}
              strokeWidth={isActive ? 4 : 2.5}
              strokeLinejoin="round"
              className="muscle-in"
              style={{
                animationDelay: `${Math.round((offset + (s.m ? 0.15 + (i % 24) * 0.018 : 0)) * 1000)}ms`,
                opacity: dim ? 0.4 : 1,
                filter: lit && !dim ? `drop-shadow(0 0 10px color-mix(in oklab, ${fillFor(s.m)} 45%, transparent))` : undefined,
                cursor: s.m ? "pointer" : "default",
              }}
              onPointerEnter={(e) => s.m && e.pointerType === "mouse" && setActive(s.m)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
              onClick={() => s.m && setActive(active === s.m ? null : s.m)}
            />
          );
        })}
        {/* soft 3D sheen over the whole body */}
        <g pointerEvents="none" style={{ mixBlendMode: "soft-light" }}>
          {shapes.map((s, i) => (
            <path key={i} d={s.d} fill={`url(#sheen-${label})`} />
          ))}
        </g>
      </svg>
      <figcaption className="eyebrow mt-2">{label}</figcaption>
    </figure>
  );

  return (
    <div>
      <div className="relative -mx-2 flex items-end gap-1 rounded-2xl bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-accent)_7%,transparent),transparent_70%)] px-2 pt-2">
        {figure(BODY_FRONT, "Framsida", 0)}
        {figure(BODY_BACK, "Baksida", 0.12)}
      </div>

      {/* selected muscle */}
      <div className="mt-3 h-12">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="flex h-full items-center gap-3 rounded-xl border border-line bg-surface-2/70 px-3"
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: fillFor(active), boxShadow: `0 0 10px ${fillFor(active)}` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{muscleLabel(active)}</div>
                <div className="text-xs text-ink-3">{statusLabel(st)}</div>
              </div>
              <div className="text-right tabular-nums">
                <div className="text-sm font-semibold">{num(st?.sets ?? 0)} set</div>
                {st?.target && (
                  <div className="text-xs text-ink-3">
                    mål {st.target.min}–{st.target.max}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="legend"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-wrap content-center items-center justify-center gap-x-3.5 gap-y-1 text-xs text-ink-2"
            >
              {[
                [IDLE, "Inget"],
                [muscleColor({ sets: 1, target: { min: 10, max: 12 } }), "Långt under"],
                ["var(--color-warm)", "Under mål"],
                ["var(--color-accent)", "I mål"],
                ["var(--color-sky)", "Över mål"],
              ].map(([c, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-1 text-center text-[11px] text-ink-3">Tryck på en muskel för detaljer</p>
    </div>
  );
}
