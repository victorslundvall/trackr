import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluate, groupRows } from "../progression";
import { MUSCLES } from "../format";

type Ex = { id: string; name: string; primary_muscles: string[]; is_bodyweight: boolean; category: string };

/** Compact text summary of the user's training for the coach prompt (RLS applies). */
export async function historySummary(sb: SupabaseClient) {
  const since90 = new Date(Date.now() - 90 * 864e5).toISOString();
  const [{ data: usage }, { data: rows }, { data: muscles }, { data: bw }, { data: wk }] = await Promise.all([
    sb.rpc("exercise_usage"),
    sb.rpc("progression_sessions", { p_exercises: null, p_limit: 6, p_since: since90, p_exclude_workout: null }),
    sb.rpc("weekly_muscle_sets", { p_weeks: 5 }),
    sb.from("body_metrics").select("bodyweight,measured_at").not("bodyweight", "is", null).order("measured_at", { ascending: false }).limit(1),
    sb.rpc("weekly_summary", { p_weeks: 8 }),
  ]);

  const grouped = groupRows(rows ?? []);
  if (grouped.size === 0) return null;
  const ids = [...grouped.keys()];
  const { data: exs } = await sb.from("exercises").select("id,name,primary_muscles,is_bodyweight,category").in("id", ids);
  const exMap = new Map(((exs ?? []) as Ex[]).map((e) => [e.id, e]));
  const useMap = new Map(((usage ?? []) as { exercise_id: string; times: number }[]).map((u) => [u.exercise_id, u.times]));

  const lines = ids
    .map((id) => ({ id, ex: exMap.get(id), sessions: grouped.get(id)! }))
    .filter((x) => x.ex && x.ex.category !== "cardio")
    .sort((a, b) => (useMap.get(b.id) ?? 0) - (useMap.get(a.id) ?? 0))
    .slice(0, 40)
    .map(({ id, ex, sessions }) => {
      const r = evaluate(sessions, { bodyweight: ex!.is_bodyweight });
      const last = sessions[0];
      const top = Math.max(...last.sets.map((s) => s.load ?? 0));
      const reps = last.sets.filter((s) => (s.load ?? 0) === top).map((s) => s.reps).join("/");
      const load = ex!.is_bodyweight ? `kroppsvikt+${last.sets[0]?.extra ?? 0} kg` : `${top} kg`;
      const status = { increase: "redo att höja", stalled: `stagnerat ${r.stalledFor} pass`, progressing: "går framåt", steady: "stabil", new: "ny" }[r.status];
      return `- ${ex!.name} [${ex!.primary_muscles.join(", ")}] – ${useMap.get(id) ?? "?"} pass totalt, senast ${load} × ${reps}, ${status}`;
    });

  // average weekly sets per muscle over the last 4 full weeks
  const acc = new Map<string, number>();
  const weeks = new Set<string>();
  ((muscles ?? []) as { week: string; muscle: string; sets: number }[]).forEach((m) => {
    weeks.add(m.week);
    acc.set(m.muscle, (acc.get(m.muscle) ?? 0) + Number(m.sets));
  });
  const nWeeks = Math.max(1, weeks.size);
  const vol = Object.keys(MUSCLES)
    .map((m) => `${m}: ${((acc.get(m) ?? 0) / nWeeks).toFixed(1)}`)
    .join(", ");

  const wkRows = (wk ?? []) as { workouts: number }[];
  const perWeek = wkRows.length ? (wkRows.reduce((a, w) => a + Number(w.workouts), 0) / 8).toFixed(1) : "?";
  const bodyweight = (bw ?? [])[0]?.bodyweight;

  return `# Användarens träningshistorik (senaste 90 dagarna)
- Snitt pass/vecka senaste 8 veckorna: ${perWeek}
${bodyweight ? `- Kroppsvikt: ${bodyweight} kg\n` : ""}- Snitt hårda set per muskel/vecka (senaste ~5 v): ${vol}

Övningar (mest använda först), senaste toppset och status enligt appens progressionsregler:
${lines.join("\n")}`;
}
