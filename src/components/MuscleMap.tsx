"use client";

import { useState } from "react";
import { muscleLabel, num } from "@/lib/format";

export type MuscleState = { sets: number; target: { min: number; max: number } | null };

/** Colour by status vs target: none → under → in range → over. Identity is also given by label/legend. */
export function muscleColor(st: MuscleState | undefined) {
  if (!st || st.sets <= 0) return "var(--color-surface-2)";
  if (!st.target) return "color-mix(in oklab, var(--color-ink-3) 55%, transparent)";
  if (st.sets < st.target.min * 0.5) return "color-mix(in oklab, var(--color-warm) 40%, transparent)";
  if (st.sets < st.target.min) return "var(--color-warm)";
  if (st.sets <= st.target.max) return "var(--color-accent)";
  return "var(--color-sky)";
}

type Shape = { m: string; d: string };

// Stylised body, drawn from simple shapes. viewBox 0 0 120 250 (one figure).
const SILHOUETTE =
  "M60 6c8 0 13 6 13 14s-5 15-13 15-13-7-13-15 5-14 13-14z" + // head
  "M53 34h14v8H53z" + // neck
  "M34 42c8-4 44-4 52 0l10 6c4 3 6 8 7 14l5 40c1 6-1 10-4 20l-3 14c-1 3-4 3-5 0l-2-22-4-30-2 30v28l-3 26 4 40c1 8 0 14-2 20h-11l-1-24-4-32-2-26h-2l-2 26-4 32-1 24H45c-2-6-3-12-2-20l4-40-3-26v-28l-2-30-4 30-2 22c-1 3-4 3-5 0l-3-14c-3-10-5-14-4-20l5-40c1-6 3-11 7-14z";

const FRONT: Shape[] = [
  { m: "shoulders", d: "M31 48c5-5 12-6 16-4l-2 12c-5 1-11 3-15 6-1-6-1-10 1-14zM89 48c-5-5-12-6-16-4l2 12c5 1 11 3 15 6 1-6 1-10-1-14z" },
  { m: "chest", d: "M47 46c5-2 10-2 12 0v20c-5 2-11 2-16-1-2-6-1-13 4-19zM73 46c-5-2-10-2-12 0v20c5 2 11 2 16-1 2-6 1-13-4-19z" },
  { m: "biceps", d: "M29 64c4-3 10-4 13-2l-2 22c-4 2-9 2-13-1 0-7 0-13 2-19zM91 64c-4-3-10-4-13-2l2 22c4 2 9 2 13-1 0-7 0-13-2-19z" },
  { m: "forearms", d: "M26 88c4 2 9 2 13 0l-3 28c-3 2-6 2-9 0-2-10-2-19-1-28zM94 88c-4 2-9 2-13 0l3 28c3 2 6 2 9 0 2-10 2-19 1-28z" },
  { m: "abdominals", d: "M50 70h20v44c-6 4-14 4-20 0z" },
  { m: "quadriceps", d: "M44 126c4-3 10-3 14 0l-1 46c-4 3-8 3-11 0-3-15-4-31-2-46zM76 126c-4-3-10-3-14 0l1 46c4 3 8 3 11 0 3-15 4-31 2-46z" },
  { m: "adductors", d: "M56 124h3l-1 26-3-2zM64 124h-3l1 26 3-2z" },
  { m: "calves", d: "M46 186c3-2 7-2 9 0l-1 34c-2 2-5 2-7 0-2-12-2-23-1-34zM74 186c-3-2-7-2-9 0l1 34c2 2 5 2 7 0 2-12 2-23 1-34z" },
];

const BACK: Shape[] = [
  { m: "traps", d: "M60 36l14 8-6 18h-16l-6-18z" },
  { m: "shoulders", d: "M31 48c5-5 12-6 16-4l-2 12c-5 1-11 3-15 6-1-6-1-10 1-14zM89 48c-5-5-12-6-16-4l2 12c5 1 11 3 15 6 1-6 1-10-1-14z" },
  { m: "middle back", d: "M52 62h16l-2 20h-12z" },
  { m: "lats", d: "M46 58l6 4 2 20 4 12-9 6c-4-10-6-26-3-42zM74 58l-6 4-2 20-4 12 9 6c4-10 6-26 3-42z" },
  { m: "lower back", d: "M54 86h12l3 22h-18z" },
  { m: "triceps", d: "M29 64c4-3 10-4 13-2l-2 22c-4 2-9 2-13-1 0-7 0-13 2-19zM91 64c-4-3-10-4-13-2l2 22c4 2 9 2 13-1 0-7 0-13-2-19z" },
  { m: "forearms", d: "M26 88c4 2 9 2 13 0l-3 28c-3 2-6 2-9 0-2-10-2-19-1-28zM94 88c-4 2-9 2-13 0l3 28c3 2 6 2 9 0 2-10 2-19 1-28z" },
  { m: "glutes", d: "M45 110c5-2 11-2 15 1v18c-5 3-11 3-16 0-1-7-1-13 1-19zM75 110c-5-2-11-2-15 1v18c5 3 11 3 16 0 1-7 1-13-1-19z" },
  { m: "hamstrings", d: "M44 132c4 2 9 2 13 0l-1 40c-4 3-8 3-11 0-2-13-2-27-1-40zM76 132c-4 2-9 2-13 0l1 40c4 3 8 3 11 0 2-13 2-27 1-40z" },
  { m: "calves", d: "M45 180c4-3 8-3 11 0l-1 32c-3 3-7 3-9 0-2-11-2-22-1-32zM75 180c-4-3-8-3-11 0l1 32c3 3 7 3 9 0 2-11 2-22 1-32z" },
];

export default function MuscleMap({ data }: { data: Record<string, MuscleState> }) {
  const [hover, setHover] = useState<string | null>(null);
  const h = hover ? data[hover] : null;

  const figure = (shapes: Shape[], label: string) => (
    <figure className="flex flex-1 flex-col items-center">
      <svg viewBox="0 0 120 250" className="w-full max-w-[170px]" role="img" aria-label={`Muskelkarta ${label}`}>
        <path d={SILHOUETTE} fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth={1.5} />
        {shapes.map((s) => (
          <path
            key={s.m + s.d.slice(0, 8)}
            d={s.d}
            fill={muscleColor(data[s.m])}
            stroke={hover === s.m ? "var(--color-ink)" : "var(--color-bg)"}
            strokeWidth={hover === s.m ? 1.5 : 1}
            onPointerEnter={() => setHover(s.m)}
            onPointerDown={() => setHover(s.m)}
            onPointerLeave={() => setHover(null)}
            className="cursor-pointer transition-colors"
          />
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-ink-3">{label}</figcaption>
    </figure>
  );

  return (
    <div>
      <div className="relative flex gap-2">
        {figure(FRONT, "Framsida")}
        {figure(BACK, "Baksida")}
        {hover && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg">
            <div className="font-semibold text-ink">{muscleLabel(hover)}</div>
            <div className="text-ink-2">
              {num(h?.sets ?? 0)} set{h?.target ? ` · mål ${h.target.min}–${h.target.max}` : ""}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-ink-2">
        {[
          ["var(--color-surface-2)", "Inget"],
          ["color-mix(in oklab, var(--color-warm) 40%, transparent)", "Långt under"],
          ["var(--color-warm)", "Under mål"],
          ["var(--color-accent)", "I mål"],
          ["var(--color-sky)", "Över mål"],
        ].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-line" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
