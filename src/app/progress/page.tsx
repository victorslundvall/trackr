"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { loadExercises } from "@/lib/data";
import { loadProgression } from "@/lib/progress-data";
import type { PResult, PStatus } from "@/lib/progression";
import type { Exercise } from "@/lib/types";
import { num } from "@/lib/format";
import { STATUS_STYLE, StatusIcon } from "@/components/ProgressBadge";

const GROUPS: { status: PStatus; title: string; empty: string }[] = [
  { status: "increase", title: "Redo att höja", empty: "Inget att höja just nu." },
  { status: "stalled", title: "Står still", empty: "Inget har stagnerat – snyggt." },
  { status: "progressing", title: "Går framåt", empty: "–" },
  { status: "steady", title: "Stabila", empty: "–" },
];

const RANGES = [
  { days: 14, label: "2 v" },
  { days: 30, label: "30 d" },
  { days: 90, label: "90 d" },
];

export default function ProgressPage() {
  const [items, setItems] = useState<{ ex: Exercise; r: PResult }[] | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setItems(null);
    const since = new Date(Date.now() - days * 864e5).toISOString();
    Promise.all([loadProgression({ since }), loadExercises()]).then(([prog, exs]) => {
      const m = new Map(exs.map((e) => [e.id, e]));
      setItems(
        [...prog.entries()]
          .filter(([id]) => m.has(id))
          .map(([id, r]) => ({ ex: m.get(id)!, r }))
          .sort((a, b) => a.ex.name.localeCompare(b.ex.name)),
      );
    });
  }, [days]);

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/home" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="h1 flex-1">Progression</h1>
      </div>
      <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)} className={`chip ${days === r.days ? "border-ink bg-ink text-bg" : ""}`}>
              {r.label}
            </button>
          ))}
      </div>
      <p className="text-sm text-ink-3">
        Övningar från senaste {days} dagarna. <b className="font-medium text-ink-2">Höj</b> = alla set nådde toppen av rep-intervallet, eller samma vikt 3 pass och reps ökar. <b className="font-medium text-ink-2">Stagnerat</b> = 3 pass utan fler reps eller mer vikt.
      </p>

      {!items && <div className="py-10 text-center text-ink-3">Räknar…</div>}
      {items &&
        GROUPS.map((g) => {
          const list = items.filter((i) => i.r.status === g.status);
          if (!list.length && (g.status === "steady" || g.status === "progressing")) return null;
          return (
            <section key={g.status}>
              <h2 className="mb-2 font-semibold">
                {g.title} <span className="text-ink-3">({list.length})</span>
              </h2>
              {list.length === 0 ? (
                <p className="card p-4 text-sm text-ink-3">{g.empty}</p>
              ) : (
                <ul className="card divide-y divide-line">
                  {list.map(({ ex, r }) => (
                    <li key={ex.id}>
                      <Link href={`/exercises/${ex.id}`} className="block px-4 py-3 hover:bg-surface-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{ex.name}</span>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                            <StatusIcon status={r.status} />
                            {r.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-ink-3">
                          {r.topLoad != null && r.topLoad > 0 ? `${num(r.topLoad)} kg · ` : ""}
                          {r.reason}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
    </main>
  );
}
