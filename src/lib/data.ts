import { supabase } from "./supabase/client";
import type { Exercise, WorkoutSet } from "./types";
import { defaultWorkoutName } from "./format";

/** Fetch every row of a query, paging past PostgREST's 1000-row cap. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

let exerciseCache: Promise<Exercise[]> | null = null;

export function loadExercises(force = false) {
  if (!exerciseCache || force) {
    exerciseCache = fetchAll<Exercise>((a, b) =>
      supabase().from("exercises").select("*").eq("archived", false).order("name").range(a, b),
    ).catch((e) => {
      exerciseCache = null;
      throw e;
    });
  }
  return exerciseCache;
}

export async function loadUsage() {
  const { data } = await supabase().rpc("exercise_usage");
  const map = new Map<string, { times: number; last_used: string }>();
  for (const r of (data ?? []) as { exercise_id: string; times: number; last_used: string }[]) map.set(r.exercise_id, r);
  return map;
}

export async function lastSets(exerciseId: string, excludeWorkout?: string) {
  const { data } = await supabase().rpc("last_sets", { p_exercise: exerciseId, p_exclude_workout: excludeWorkout ?? null });
  return (data ?? []) as WorkoutSet[];
}

export async function latestBodyweight() {
  const { data } = await supabase()
    .from("body_metrics")
    .select("bodyweight")
    .not("bodyweight", "is", null)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.bodyweight as number | undefined) ?? null;
}

export async function createCustomExercise(input: Partial<Exercise> & { name: string }) {
  const { data: u } = await supabase().auth.getUser();
  const { data, error } = await supabase()
    .from("exercises")
    .insert({ ...input, user_id: u.user!.id, source: "custom" })
    .select()
    .single();
  if (error) throw error;
  await loadExercises(true);
  return data as Exercise;
}

export async function updateExercise(id: string, fields: Partial<Exercise>) {
  const { data, error } = await supabase().from("exercises").update(fields).eq("id", id).select().single();
  if (error) throw error;
  await loadExercises(true);
  return data as Exercise;
}

/** Start a workout, optionally from a template. Returns the new workout id. */
export async function startWorkout(templateId?: string) {
  const sb = supabase();
  let name = defaultWorkoutName();
  let tplExercises: { exercise_id: string; target_sets: number; target_reps: string | null; target_rpe: number | null; notes: string | null; superset_group?: number | null }[] = [];
  if (templateId) {
    const [{ data: tpl }, { data: te }] = await Promise.all([
      sb.from("templates").select("name").eq("id", templateId).single(),
      sb.from("template_exercises").select("*").eq("template_id", templateId).order("position"),
    ]);
    if (tpl) name = tpl.name;
    tplExercises = te ?? [];
  }
  const { data: w, error } = await sb.from("workouts").insert({ name, template_id: templateId ?? null }).select("id").single();
  if (error) throw error;

  for (const [i, te] of tplExercises.entries()) {
    const { data: we } = await sb
      .from("workout_exercises")
      .insert({ workout_id: w.id, exercise_id: te.exercise_id, position: i, notes: te.notes, superset_group: te.superset_group ?? null })
      .select("id")
      .single();
    if (!we) continue;
    const rows = Array.from({ length: Math.max(1, te.target_sets) }, (_, p) => ({
      workout_exercise_id: we.id,
      position: p,
      rpe: te.target_rpe,
    }));
    await sb.from("sets").insert(rows);
  }
  return w.id as string;
}

export async function activeWorkout() {
  const { data } = await supabase()
    .from("workouts")
    .select("id,name,started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; name: string; started_at: string } | null;
}
