import type { SupabaseClient } from "@supabase/supabase-js";
import { ALIASES, SL_MAP } from "./strengthlog-map";

export type SLRow = Record<string, string | undefined>;

export interface PlanSet {
  set_type: "normal" | "warmup";
  weight: number | null;
  reps: number | null;
  bodyweight: number | null;
  extra_weight: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  is_max: boolean;
  note: string | null;
  completed_at: string | null;
}
export interface PlanWorkout {
  key: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  exercises: { name: string; sets: PlanSet[] }[];
}
export interface Plan {
  workouts: PlanWorkout[];
  exerciseNames: string[];
  bodyweights: { date: string; bodyweight: number }[];
  setCount: number;
  from: string | null;
  to: string | null;
}

const n = (v: string | undefined) => {
  if (v == null || v.trim() === "") return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
};
const ms = (v: string | undefined) => {
  const x = n(v);
  return x && x > 1e11 ? new Date(x).toISOString() : null;
};
const hms = (v: string | undefined) => {
  if (!v) return null;
  const p = v.split(":").map(Number);
  if (p.some((x) => !Number.isFinite(x))) return null;
  const s = p.reduce((acc, x) => acc * 60 + x, 0);
  return s > 0 ? s : null;
};
export const canonicalName = (raw: string) => {
  const t = raw.trim().replace(/\s+/g, " ");
  return ALIASES[t] ?? t;
};

/** Pure: turn CSV rows into a structured plan. */
export function buildPlan(rows: SLRow[]): Plan {
  const byKey = new Map<string, PlanWorkout>();
  const names = new Set<string>();
  let setCount = 0;
  const bwByDate = new Map<string, number>();

  for (const r of rows) {
    if (!r.workout || !r.start || !r.exercise?.trim()) continue;
    const key = r.start.trim();
    let w = byKey.get(key);
    if (!w) {
      const started = ms(r.start);
      if (!started) continue;
      w = { key, name: r.workout.trim(), started_at: started, ended_at: ms(r.end), exercises: [] };
      byKey.set(key, w);
    }
    const name = canonicalName(r.exercise);
    names.add(name);
    let ex = w.exercises.find((e) => e.name === name);
    if (!ex) {
      ex = { name, sets: [] };
      w.exercises.push(ex);
    }
    const bw = n(r.bodyweight);
    if (bw) bwByDate.set(w.started_at.slice(0, 10), bw);
    ex.sets.push({
      set_type: r.warmup === "true" ? "warmup" : "normal",
      weight: n(r.weight),
      reps: n(r.reps) == null ? null : Math.round(n(r.reps)!),
      bodyweight: bw,
      extra_weight: n(r.extraWeight),
      distance_km: n(r.distanceKM),
      duration_seconds: hms(r.time),
      is_max: r.max === "true",
      note: r.setComment?.trim() || null,
      completed_at: ms(r.checked),
    });
    setCount++;
  }

  const workouts = [...byKey.values()].sort((a, b) => a.started_at.localeCompare(b.started_at));
  // one bodyweight point per change
  const bodyweights: Plan["bodyweights"] = [];
  [...bwByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([date, bodyweight]) => {
      if (bodyweights.at(-1)?.bodyweight !== bodyweight) bodyweights.push({ date, bodyweight });
    });

  return {
    workouts,
    exerciseNames: [...names].sort(),
    bodyweights,
    setCount,
    from: workouts[0]?.started_at ?? null,
    to: workouts.at(-1)?.started_at ?? null,
  };
}

const chunk = <T,>(a: T[], size: number) => Array.from({ length: Math.ceil(a.length / size) }, (_, i) => a.slice(i * size, i * size + size));

/** Write the plan to Supabase. Idempotent: workouts already imported (same start timestamp) are skipped. */
export async function runImport(sb: SupabaseClient, plan: Plan, progress: (msg: string, pct: number) => void) {
  const { data: u } = await sb.auth.getUser();
  const uid = u.user!.id;

  // 1. exercises — reuse the user's own by name, else create with mapped muscles
  progress("Skapar övningar…", 2);
  const { data: own } = await sb.from("exercises").select("id,name").eq("user_id", uid);
  const exId = new Map<string, string>((own ?? []).map((e: { id: string; name: string }) => [e.name.toLowerCase(), e.id]));
  const missing = plan.exerciseNames.filter((nm) => !exId.has(nm.toLowerCase()));
  if (missing.length) {
    const rows = missing.map((name) => {
      const m = SL_MAP[name];
      return {
        user_id: uid,
        name,
        primary_muscles: m?.[0] ?? [],
        secondary_muscles: m?.[1] ?? [],
        equipment: m?.[2] ?? null,
        category: m?.[3] === "c" ? "cardio" : "strength",
        is_bodyweight: m?.[3] === "b",
        source: "strengthlog",
      };
    });
    const { data, error } = await sb.from("exercises").insert(rows).select("id,name");
    if (error) throw error;
    (data ?? []).forEach((e: { id: string; name: string }) => exId.set(e.name.toLowerCase(), e.id));
  }

  // 2. skip already imported workouts
  progress("Kontrollerar tidigare importer…", 5);
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("workouts").select("external_key").eq("source", "strengthlog").range(from, from + 999);
    (data ?? []).forEach((r: { external_key: string }) => existing.add(r.external_key));
    if (!data || data.length < 1000) break;
  }
  const todo = plan.workouts.filter((w) => !existing.has(w.key));
  if (!todo.length) {
    progress("Allt var redan importerat.", 100);
    return { workouts: 0, sets: 0, skipped: plan.workouts.length };
  }

  // 3. workouts
  const wId = new Map<string, string>();
  for (const [i, c] of chunk(todo, 400).entries()) {
    const { data, error } = await sb
      .from("workouts")
      .insert(c.map((w) => ({ user_id: uid, name: w.name, started_at: w.started_at, ended_at: w.ended_at ?? w.started_at, source: "strengthlog", external_key: w.key })))
      .select("id,external_key");
    if (error) throw error;
    (data ?? []).forEach((r: { id: string; external_key: string }) => wId.set(r.external_key, r.id));
    progress(`Pass ${Math.min((i + 1) * 400, todo.length)}/${todo.length}`, 5 + 20 * ((i + 1) / Math.ceil(todo.length / 400)));
  }

  // 4. workout_exercises
  const weRows = todo.flatMap((w) =>
    w.exercises.map((e, pos) => ({ user_id: uid, workout_id: wId.get(w.key)!, exercise_id: exId.get(e.name.toLowerCase())!, position: pos })),
  );
  const weId = new Map<string, string>();
  const weChunks = chunk(weRows, 800);
  for (const [i, c] of weChunks.entries()) {
    const { data, error } = await sb.from("workout_exercises").insert(c).select("id,workout_id,position");
    if (error) throw error;
    (data ?? []).forEach((r: { id: string; workout_id: string; position: number }) => weId.set(`${r.workout_id}:${r.position}`, r.id));
    progress(`Övningar i pass ${Math.min((i + 1) * 800, weRows.length)}/${weRows.length}`, 25 + 20 * ((i + 1) / weChunks.length));
  }

  // 5. sets
  const setRows = todo.flatMap((w) =>
    w.exercises.flatMap((e, pos) =>
      e.sets.map((s, sp) => ({ user_id: uid, workout_exercise_id: weId.get(`${wId.get(w.key)}:${pos}`)!, position: sp, ...s })),
    ),
  );
  const setChunks = chunk(setRows, 1000);
  for (const [i, c] of setChunks.entries()) {
    const { error } = await sb.from("sets").insert(c);
    if (error) throw error;
    progress(`Set ${Math.min((i + 1) * 1000, setRows.length)}/${setRows.length}`, 45 + 50 * ((i + 1) / setChunks.length));
  }

  // 6. bodyweight history (only if user has none from before these dates)
  if (plan.bodyweights.length) {
    const { data: bm } = await sb.from("body_metrics").select("measured_at");
    const have = new Set((bm ?? []).map((r: { measured_at: string }) => r.measured_at));
    const rows = plan.bodyweights.filter((b) => !have.has(b.date)).map((b) => ({ user_id: uid, measured_at: b.date, bodyweight: b.bodyweight, note: "StrengthLog" }));
    for (const c of chunk(rows, 1000)) await sb.from("body_metrics").insert(c);
  }

  progress("Klart!", 100);
  return { workouts: todo.length, sets: setRows.length, skipped: plan.workouts.length - todo.length };
}
