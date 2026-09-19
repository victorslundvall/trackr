"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { loadLocal, saveLocal, withTimeout } from "@/lib/offline";
import { SET_TYPES, dateLabel, e1rm, effectiveLoad, num } from "@/lib/format";
import type { Exercise, WorkoutSet } from "@/lib/types";
import { Sheet } from "./motion";

type Session = { id: string; name: string; started_at: string; workout_exercises: { id: string; notes: string | null; sets: WorkoutSet[] }[] };
type RepPr = { reps: number; weight: number; achieved_at: string };
type Cached = { sessions: Session[]; prs: RepPr[] };

/** Recent sessions + bests for one exercise, opened from the ⋯ menu during a workout. */
export default function ExerciseHistorySheet({ exercise: current, workoutId, onClose }: { exercise: Exercise | null; workoutId: string; onClose: () => void }) {
  // keep showing the last exercise while the sheet animates out
  const [exercise, setExercise] = useState<Exercise | null>(current);
  useEffect(() => {
    if (current) setExercise(current);
  }, [current]);
  const [data, setData] = useState<Cached | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    const key = `hist:${exercise.id}`;
    setData(loadLocal<Cached>(key));
    setOffline(false);
    const sb = supabase();
    withTimeout(
      Promise.all([
        sb
          .from("workouts")
          .select("id,name,started_at,workout_exercises!inner(id,exercise_id,notes,sets(*))")
          .eq("workout_exercises.exercise_id", exercise.id)
          .not("ended_at", "is", null)
          .neq("id", workoutId)
          .order("started_at", { ascending: false })
          .limit(5),
        sb.rpc("exercise_rep_prs", { p_exercise: exercise.id }),
      ]),
      7000,
      null,
    ).then((res) => {
      if (!res || res[0].error) return setOffline(true);
      const v = { sessions: (res[0].data ?? []) as unknown as Session[], prs: (res[1].data ?? []) as RepPr[] };
      saveLocal(key, v);
      setData(v);
    });
  }, [exercise, workoutId]);

  const bw = exercise?.is_bodyweight;
  const cardio = exercise?.category === "cardio";
  const fmtSet = (s: WorkoutSet) =>
    cardio ? `${num(s.distance_km, 2)} km` : bw ? `${s.extra_weight ? `+${num(s.extra_weight)}` : "BW"} × ${s.reps ?? "–"}` : `${num(s.weight)} × ${s.reps ?? "–"}`;

  // best e1RM across the loaded sessions
  let best: { v: number; s: WorkoutSet; date: string } | null = null;
  data?.sessions.forEach((w) =>
    w.workout_exercises.forEach((we) =>
      we.sets.forEach((s) => {
        if (s.set_type === "warmup") return;
        const v = e1rm(effectiveLoad(s), s.reps);
        if (v && (!best || v > best.v)) best = { v, s, date: w.started_at };
      }),
    ),
  );
  const b = best as { v: number; s: WorkoutSet; date: string } | null;

  return (
    <Sheet open={!!current} onClose={onClose} className="max-h-[85dvh] max-w-lg overflow-y-auto">
      {exercise && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow text-accent">Historik</div>
              <h2 className="text-lg font-bold leading-tight">{exercise.name}</h2>
            </div>
            <Link href={`/exercises/${exercise.id}`} className="chip shrink-0 gap-1">
              Allt <ChevronRight size={13} />
            </Link>
          </div>
          {offline && <p className="mt-2 text-xs text-warm">Offline – visar senast sparade historik.</p>}

          {!data ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16" />
              ))}
            </div>
          ) : (
            <>
              {!cardio && (b || data.prs.length > 0) && (
                <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Trophy size={15} className="text-accent" /> Bästa
                  </div>
                  {b && (
                    <div className="mt-1 text-sm text-ink-2">
                      e1RM <b className="text-ink">{num(b.v)} kg</b> · {fmtSet(b.s)} · {dateLabel(b.date, { day: "numeric", month: "short" })}
                      <span className="text-ink-3"> (senaste 5 passen)</span>
                    </div>
                  )}
                  {data.prs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {data.prs
                        .slice()
                        .sort((x, y) => x.reps - y.reps)
                        .slice(0, 8)
                        .map((p) => (
                          <span key={p.reps} className="rounded-lg bg-surface-2 px-2 py-1 text-xs tabular-nums">
                            <span className="text-ink-3">{p.reps} rep</span> <b>{num(p.weight)}</b>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <ul className="stagger mt-4 space-y-2">
                {data.sessions.map((w) => {
                  const sets = w.workout_exercises.flatMap((we) => [...we.sets].sort((a, c) => a.position - c.position));
                  const note = w.workout_exercises.find((we) => we.notes)?.notes;
                  return (
                    <li key={w.id} className="rounded-xl border border-line bg-surface-2/50 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{dateLabel(w.started_at, { weekday: "short", day: "numeric", month: "short" })}</span>
                        <span className="truncate text-xs text-ink-3">{w.name}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sets.map((s) => {
                          const t = SET_TYPES.find((x) => x.value === s.set_type);
                          return (
                            <span
                              key={s.id}
                              className={`rounded-lg px-2 py-1 text-xs font-medium tabular-nums ${s.set_type === "warmup" ? "bg-warm/10 text-warm" : "bg-surface-2 text-ink"}`}
                            >
                              {t?.short ? `${t.short} ` : ""}
                              {fmtSet(s)}
                              {s.rir != null ? <span className="text-ink-3"> R{num(s.rir)}</span> : s.rpe != null ? <span className="text-ink-3"> @{num(s.rpe)}</span> : null}
                            </span>
                          );
                        })}
                      </div>
                      {note && <p className="mt-1.5 text-xs italic text-ink-3">{note}</p>}
                    </li>
                  );
                })}
                {data.sessions.length === 0 && <li className="py-6 text-center text-sm text-ink-3">Inga tidigare pass med övningen.</li>}
              </ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
