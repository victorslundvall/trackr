import { supabase } from "./supabase/client";
import { evaluate, groupRows, parseRepRange, type PResult, type PTarget } from "./progression";
import { loadExercises } from "./data";

export interface ExerciseSetting {
  exercise_id: string;
  weight_increment: number;
  rep_min: number | null;
  rep_max: number | null;
}

export async function loadSettings(ids?: string[]) {
  let q = supabase().from("exercise_settings").select("exercise_id,weight_increment,rep_min,rep_max");
  if (ids) q = q.in("exercise_id", ids);
  const { data } = await q;
  return new Map<string, ExerciseSetting>(((data ?? []) as ExerciseSetting[]).map((s) => [s.exercise_id, s]));
}

export async function saveSetting(exerciseId: string, patch: Partial<Omit<ExerciseSetting, "exercise_id">>) {
  const { data: u } = await supabase().auth.getUser();
  await supabase()
    .from("exercise_settings")
    .upsert({ user_id: u.user!.id, exercise_id: exerciseId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,exercise_id" });
}

/** Most recent rep target per exercise from the user's templates. */
async function templateTargets(ids?: string[]) {
  let q = supabase().from("template_exercises").select("exercise_id,target_reps,templates(created_at)").not("target_reps", "is", null);
  if (ids) q = q.in("exercise_id", ids);
  const { data } = await q;
  const out = new Map<string, { min: number; max: number }>();
  for (const r of (data ?? []) as { exercise_id: string; target_reps: string }[]) {
    const rr = parseRepRange(r.target_reps);
    if (rr && !out.has(r.exercise_id)) out.set(r.exercise_id, rr);
  }
  return out;
}

/**
 * Evaluate progression for the given exercises (or all used since `since`).
 * `overrides` lets the workout page pass the template's rep range for this session.
 */
export async function loadProgression(opts: {
  exerciseIds?: string[];
  since?: string;
  excludeWorkout?: string;
  overrides?: Map<string, { min: number; max: number }>;
}) {
  const sb = supabase();
  const ids = opts.exerciseIds;
  if (ids && ids.length === 0) return new Map<string, PResult>();
  const [{ data: rows }, settings, tpl, exercises] = await Promise.all([
    sb.rpc("progression_sessions", {
      p_exercises: ids ?? null,
      p_limit: 8,
      p_since: opts.since ?? null,
      p_exclude_workout: opts.excludeWorkout ?? null,
    }),
    loadSettings(ids),
    templateTargets(ids),
    loadExercises(),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const grouped = groupRows(rows ?? []);
  const out = new Map<string, PResult>();
  grouped.forEach((sessions, exId) => {
    const ex = exMap.get(exId);
    if (ex?.category === "cardio") return;
    const st = settings.get(exId);
    const range = opts.overrides?.get(exId) ?? (st?.rep_max ? { min: st.rep_min ?? st.rep_max, max: st.rep_max } : tpl.get(exId));
    const target: PTarget = {
      repMin: range?.min,
      repMax: range?.max,
      increment: st?.weight_increment ? Number(st.weight_increment) : undefined,
      bodyweight: ex?.is_bodyweight,
    };
    out.set(exId, evaluate(sessions, target));
  });
  return out;
}
