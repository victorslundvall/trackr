"use client";

import { supabase } from "./supabase/client";
import { loadLocal, saveLocal, withTimeout } from "./offline";
import { e1rm } from "./format";

/** exercise_id → (reps → best load) from all sessions before the current one. */
export type Bests = Map<string, Map<number, number>>;

export type LivePr = { kind: "e1rm" | "reps"; value: number; previous: number; reps: number };

export async function loadBests(exerciseIds: string[], excludeWorkout: string): Promise<Bests> {
  const key = `bests:${excludeWorkout}`;
  const res = await withTimeout(supabase().rpc("exercise_bests", { p_exercises: exerciseIds, p_exclude_workout: excludeWorkout }), 6000, null);
  let rows = (res && !res.error ? res.data : null) as { exercise_id: string; reps: number; load: number }[] | null;
  if (rows) {
    const prev = loadLocal<typeof rows>(key) ?? [];
    // keep rows for exercises we didn't ask about this time (added earlier in the session)
    rows = [...prev.filter((r) => !exerciseIds.includes(r.exercise_id)), ...rows];
    saveLocal(key, rows);
  } else rows = loadLocal<typeof rows>(key) ?? [];
  const out: Bests = new Map();
  for (const r of rows) {
    const m = out.get(r.exercise_id) ?? new Map<number, number>();
    m.set(r.reps, Math.max(m.get(r.reps) ?? 0, Number(r.load)));
    out.set(r.exercise_id, m);
  }
  return out;
}

/**
 * Is this set a PR against earlier sessions? Same rules as the summary (workout_prs):
 * e1RM above the best earlier e1RM, or more load than ever lifted for at least as many reps.
 * Needs history – a first-ever session never "PRs".
 */
export function checkPr(bests: Bests, exerciseId: string, load: number | null, reps: number | null): LivePr | null {
  const m = bests.get(exerciseId);
  if (!m || !m.size || !load || !reps || reps < 1 || reps > 20) return null;
  let prevE1 = 0;
  m.forEach((l, r) => {
    const v = e1rm(l, r);
    if (v && v > prevE1) prevE1 = v;
  });
  const cur = e1rm(load, reps);
  if (cur && prevE1 && cur > prevE1 + 1e-9) return { kind: "e1rm", value: cur, previous: prevE1, reps };
  let prevForReps = 0;
  m.forEach((l, r) => {
    if (r >= reps && l > prevForReps) prevForReps = l;
  });
  if (prevForReps && load > prevForReps + 1e-9) return { kind: "reps", value: load, previous: prevForReps, reps };
  return null;
}

/** Count a logged set as history so the next set must beat it. */
export function addToBests(bests: Bests, exerciseId: string, load: number, reps: number) {
  const m = bests.get(exerciseId) ?? new Map<number, number>();
  m.set(reps, Math.max(m.get(reps) ?? 0, load));
  bests.set(exerciseId, m);
}
