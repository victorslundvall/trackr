import { supabase } from "./supabase/client";
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from "./types";
import { defaultWorkoutName } from "./format";
import { enqueue, loadLocal, saveLocal, uuid, withTimeout } from "./offline";

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
    )
      .then((list) => {
        // slim copy for offline use (no instructions/images)
        saveLocal(
          "exercises",
          list.map(({ instructions: _i, images: _im, ...rest }) => ({ ...rest, instructions: [], images: [] })),
        );
        return list;
      })
      .catch((e) => {
        exerciseCache = null;
        const cached = loadLocal<Exercise[]>("exercises");
        if (cached?.length) return cached;
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
  const res = await withTimeout(
    supabase().rpc("last_sets", { p_exercise: exerciseId, p_exclude_workout: excludeWorkout ?? null }),
    6000,
    { data: null } as { data: unknown },
  );
  if (res.data) saveLocal(`last:${exerciseId}`, res.data);
  return ((res.data ?? loadLocal<WorkoutSet[]>(`last:${exerciseId}`)) ?? []) as WorkoutSet[];
}

export async function latestBodyweight() {
  const res = await withTimeout(
    supabase().from("body_metrics").select("bodyweight").not("bodyweight", "is", null).order("measured_at", { ascending: false }).limit(1).maybeSingle(),
    5000,
    null,
  );
  const bw = (res?.data?.bodyweight as number | undefined) ?? null;
  if (bw != null) saveLocal("bodyweight", bw);
  return bw ?? loadLocal<number>("bodyweight");
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

type TplExercise = {
  exercise_id: string;
  target_sets: number;
  target_reps: string | null;
  target_rpe: number | null;
  target_rir?: string | null;
  target_weight?: number | null;
  rationale?: string | null;
  notes: string | null;
  superset_group?: number | null;
};
export type WorkoutSnapshot = {
  workout: Workout;
  blocks: { we: WorkoutExercise; ex: Exercise; sets: WorkoutSet[]; prev: WorkoutSet[] }[];
  targets: [string, { sets: number; reps: string | null; rpe: number | null; rir: string | null; weight: number | null; rationale: string | null }][];
  bodyweight: number | null;
  savedAt: number;
};

/** Template + its exercises, from the network or (offline) the last cached copy. */
export async function loadTemplate(templateId: string) {
  const sb = supabase();
  const res = await withTimeout(
    Promise.all([
      sb.from("templates").select("name").eq("id", templateId).single(),
      sb.from("template_exercises").select("*").eq("template_id", templateId).order("position"),
    ]),
    6000,
    null,
  );
  if (res && res[0].data && res[1].data) {
    const v = { name: res[0].data.name as string, exercises: res[1].data as TplExercise[] };
    saveLocal(`tpl:${templateId}`, v);
    return v;
  }
  return loadLocal<{ name: string; exercises: TplExercise[] }>(`tpl:${templateId}`);
}

export function emptySet(weId: string, position: number, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: uuid(),
    workout_exercise_id: weId,
    position,
    set_type: "normal",
    weight: null,
    reps: null,
    rpe: null,
    rir: null,
    tempo: null,
    rest_seconds: null,
    bodyweight: null,
    extra_weight: null,
    distance_km: null,
    duration_seconds: null,
    is_max: false,
    note: null,
    completed_at: null,
    ...extra,
  } as WorkoutSet;
}

/**
 * Start a workout, optionally from a template, and return its id right away.
 * Works offline: rows get client ids, go into the outbox, and a local snapshot lets the logger open without network.
 * `adjust` lets the readiness coach change set counts / add notes per exercise.
 */
export async function startWorkout(templateId?: string, adjust?: Map<string, { sets?: number; note?: string }>) {
  let name = defaultWorkoutName();
  let tplExercises: TplExercise[] = [];
  if (templateId) {
    const tpl = await loadTemplate(templateId);
    if (tpl) {
      name = tpl.name;
      tplExercises = tpl.exercises;
    }
  }
  const [exercises, prevs] = await Promise.all([
    loadExercises().catch(() => [] as Exercise[]),
    Promise.all(tplExercises.map((te) => lastSets(te.exercise_id))),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  const now = new Date().toISOString();
  const workout = {
    id: uuid(),
    name,
    started_at: now,
    ended_at: null,
    notes: null,
    template_id: templateId ?? null,
    source: "trackr",
    ai_comment: null,
  } as unknown as Workout;
  const blocks: WorkoutSnapshot["blocks"] = [];
  const weRows: Record<string, unknown>[] = [];
  const setRows: WorkoutSet[] = [];
  tplExercises.forEach((te, i) => {
    const a = adjust?.get(te.exercise_id);
    const notes = [a?.note ? `Coach: ${a.note}` : null, te.notes].filter(Boolean).join("\n") || null;
    const we = { id: uuid(), workout_id: workout.id, exercise_id: te.exercise_id, position: i, notes, superset_group: te.superset_group ?? null } as WorkoutExercise;
    weRows.push(we as unknown as Record<string, unknown>);
    const n = Math.max(1, a?.sets ?? te.target_sets);
    const sets = Array.from({ length: n }, (_, p) => emptySet(we.id, p, { rpe: te.target_rpe }));
    setRows.push(...sets);
    const ex = exMap.get(te.exercise_id);
    if (ex) blocks.push({ we, ex, sets, prev: prevs[i] ?? [] });
  });

  enqueue({ table: "workouts", kind: "insert", values: [{ id: workout.id, name, started_at: now, template_id: templateId ?? null }] });
  if (weRows.length) enqueue({ table: "workout_exercises", kind: "insert", values: weRows });
  if (setRows.length) enqueue({ table: "sets", kind: "insert", values: setRows.map(({ id, workout_exercise_id, position, rpe }) => ({ id, workout_exercise_id, position, rpe })) });

  const targets: WorkoutSnapshot["targets"] = tplExercises.map((t) => [
    t.exercise_id,
    { sets: t.target_sets, reps: t.target_reps, rpe: t.target_rpe, rir: t.target_rir ?? null, weight: t.target_weight ?? null, rationale: t.rationale ?? null },
  ]);
  saveLocal<WorkoutSnapshot>(`workout:${workout.id}`, { workout, blocks, targets, bodyweight: loadLocal<number>("bodyweight"), savedAt: Date.now() });
  saveLocal("active", { id: workout.id, name, started_at: now });
  return workout.id as string;
}

export async function activeWorkout() {
  type A = { id: string; name: string; started_at: string };
  const res = await withTimeout(
    supabase().from("workouts").select("id,name,started_at").is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    5000,
    null,
  );
  if (res && !res.error) {
    // an offline-started workout may not have reached the server yet
    const local = loadLocal<A>("active");
    const data = (res.data as A | null) ?? (local && loadLocal(`workout:${local.id}`) ? local : null);
    saveLocal("active", data);
    return data;
  }
  return loadLocal<A>("active");
}
