"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProgramDraft } from "@/lib/coach/program";
import { weeklyVolume } from "@/lib/coach/program";
import { muscleLabel, num } from "@/lib/format";

/** Read-only rendering of a program (AI draft or saved). */
export default function ProgramView({ draft, initiallyOpen = false }: { draft: ProgramDraft; initiallyOpen?: boolean }) {
  const [openDay, setOpenDay] = useState<number | null>(initiallyOpen ? 0 : null);
  const [showVol, setShowVol] = useState(false);
  const vol = weeklyVolume(draft);
  const totalSets = (d: ProgramDraft["days"][number]) => d.exercises.reduce((a, e) => a + e.sets, 0);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-lg font-bold leading-tight">{draft.name}</div>
        {draft.description && <p className="mt-1 text-sm text-ink-2">{draft.description}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="chip">{draft.days_per_week} dagar/vecka</span>
          <span className="chip">{draft.weeks} veckor</span>
          {draft.week_plan.some((w) => w.deload) && <span className="chip">inkl. deload</span>}
        </div>
      </div>

      <ul className="space-y-2">
        {draft.days.map((d, i) => {
          const open = openDay === i;
          return (
            <li key={i} className="overflow-hidden rounded-xl border border-line bg-surface-2">
              <button onClick={() => setOpenDay(open ? null : i)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-xs font-bold text-accent">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{d.name}</div>
                  <div className="truncate text-xs text-ink-3">
                    {d.exercises.length} övningar · {totalSets(d)} set{d.focus ? ` · ${d.focus}` : ""}
                  </div>
                </div>
                <ChevronDown size={18} className={`shrink-0 text-ink-3 transition ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <ol className="divide-y divide-line border-t border-line">
                  {d.exercises.map((e, j) => (
                    <li key={j} className="px-3.5 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">
                          {e.superset_group != null && (
                            <span className="mr-1.5 rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                              SS{String.fromCharCode(64 + Math.max(1, e.superset_group))}
                            </span>
                          )}
                          {e.name}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-ink-2">
                          {e.sets} × {e.rep_min === e.rep_max ? e.rep_min : `${e.rep_min}–${e.rep_max}`}
                          {e.rir ? <span className="text-ink-3"> · {e.rir} RIR</span> : null}
                        </span>
                      </div>
                      <div className="text-xs text-ink-3">
                        {e.primary_muscles.map(muscleLabel).join(", ")}
                        {e.start_weight ? ` · start ~${num(e.start_weight)} kg` : ""}
                      </div>
                      {e.rationale && <p className="mt-1 text-sm text-ink-2">{e.rationale}</p>}
                      {e.notes && <p className="mt-0.5 text-xs italic text-ink-3">{e.notes}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>

      {draft.week_plan.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Veckoplan</div>
          <ol className="space-y-1">
            {draft.week_plan.map((w) => (
              <li key={w.week} className={`flex gap-3 rounded-lg px-3 py-1.5 text-sm ${w.deload ? "bg-sky-400/10" : "bg-surface-2"}`}>
                <span className="w-16 shrink-0 font-medium">Vecka {w.week}</span>
                <span className="w-16 shrink-0 tabular-nums text-ink-2">{w.rir} RIR</span>
                <span className="text-ink-3">{w.deload ? `Deload${w.note ? ` – ${w.note}` : ""}` : w.note}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <button onClick={() => setShowVol(!showVol)} className="text-sm text-ink-2">
          {showVol ? "Dölj" : "Visa"} set per muskel och vecka
        </button>
        {showVol && (
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {vol.map(([m, v]) => (
              <li key={m} className="flex justify-between">
                <span className="text-ink-2">{muscleLabel(m)}</span>
                <span className="tabular-nums">{num(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft.notes && <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{draft.notes}</p>}
    </div>
  );
}
