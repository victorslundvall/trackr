import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluate, groupRows } from "../progression";
import { MUSCLES, muscleLabel } from "../format";
import { estimateZones, zoneText, type FeedbackRow } from "../zones";

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

const LBL = {
  recovery: ["", "fortfarande öm", "precis återställd", "pigg länge"],
  pump: ["", "knappt", "bra", "grym"],
  effort: ["", "lätt", "lagom", "maxat"],
};
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).replace(".", ",") : "–";
};
const d = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

/**
 * Muscle feedback, the set changes it led to, personal volume zones, recent PRs and coach reviews –
 * so the coach can explain "why did I get fewer shoulder sets?" and reason about the self-adjusting program.
 */
export async function feedbackSummary(sb: SupabaseClient, opts: { weeks?: number } = {}) {
  const weeks = opts.weeks ?? 6;
  const since = new Date(Date.now() - weeks * 7 * 864e5).toISOString();
  const [{ data: hist }, { data: adj }, { data: prs }, { data: reviews }] = await Promise.all([
    sb.rpc("muscle_feedback_history", { p_weeks: 26 }),
    sb.from("set_adjustments").select("exercise_id,muscle,from_sets,to_sets,reason,applied,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(15),
    sb.rpc("pr_timeline", { p_limit: 20 }),
    sb.from("coach_reviews").select("summary,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(3),
  ]);
  const rows = (hist ?? []) as FeedbackRow[];
  const recent = rows.filter((r) => r.started_at >= since);
  const prRows = ((prs ?? []) as { exercise_id: string; started_at: string; e1rm: number; previous: number }[]).filter(
    (p) => p.started_at >= new Date(Date.now() - 30 * 864e5).toISOString(),
  );
  const adjRows = (adj ?? []) as { exercise_id: string; muscle: string; from_sets: number; to_sets: number; reason: string; applied: boolean; created_at: string }[];
  if (!recent.length && !adjRows.length && !prRows.length) return null;

  const ids = [...new Set([...adjRows.map((a) => a.exercise_id), ...prRows.map((p) => p.exercise_id)])];
  const { data: exs } = ids.length ? await sb.from("exercises").select("id,name").in("id", ids) : { data: [] };
  const name = new Map(((exs ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]));
  const zones = estimateZones(rows);

  const byMuscle = new Map<string, FeedbackRow[]>();
  recent.forEach((r) => byMuscle.set(r.muscle, [...(byMuscle.get(r.muscle) ?? []), r]));
  const fbLines = [...byMuscle.entries()].map(([m, list]) => {
    const trend = list
      .slice(-4)
      .map((r) => `${d(r.started_at)}: ${LBL.recovery[r.recovery ?? 0] || "?"}/${LBL.pump[r.pump ?? 0] || "?"}/${LBL.effort[r.effort ?? 0] || "?"}${r.joint_pain ? "/LEDKÄNNING" : ""} vid ${Number(r.week_sets).toFixed(1)} set senaste 7 d`)
      .join("; ");
    return `- ${muscleLabel(m)} (${list.length} svar, snitt återhämtning ${avg(list.map((r) => r.recovery))}, pump ${avg(list.map((r) => r.pump))}, ansträngning ${avg(list.map((r) => r.effort))}, ledkänning ${list.filter((r) => r.joint_pain).length} ggr) – senaste: ${trend}`;
  });
  const zoneLines = [...zones.values()].map((z) => `- ${muscleLabel(z.muscle)}: ${zoneText(z)}`);
  const adjLines = adjRows.map(
    (a) => `- ${d(a.created_at)} ${name.get(a.exercise_id) ?? "?"} ${a.from_sets}→${a.to_sets} set (${a.applied ? "godkänd" : "bortvald"}): ${a.reason}`,
  );
  const prLines = prRows.map((p) => `- ${d(p.started_at)} ${name.get(p.exercise_id) ?? "?"}: e1RM ${Number(p.e1rm).toFixed(1)} (förut ${Number(p.previous).toFixed(1)})`);
  const revLines = ((reviews ?? []) as { summary: string | null; created_at: string }[]).filter((r) => r.summary).map((r) => `- ${d(r.created_at)}: ${r.summary}`);

  return `# Muskelfeedback och självjusterande volym (senaste ${weeks} veckorna)
Efter sista övningen för varje muskel svarar användaren på återhämtning sedan förra gången (1 öm – 3 pigg), pump (1–3) och ansträngning (1 lätt – 3 maxat) samt ev. ledkänning. Appen föreslår ±1 set per muskel utifrån svaren och volymmålen; användaren godkänner. Förklara ändringar utifrån detta när användaren frågar.
${fbLines.length ? `\nFeedback per muskel (återhämtning/pump/ansträngning):\n${fbLines.join("\n")}` : ""}
${zoneLines.length ? `\nPersonliga volymzoner (inlärda ur feedbacken – används i stället för standardmålen när säkerheten är medel/hög):\n${zoneLines.join("\n")}` : ""}
${adjLines.length ? `\nSet-ändringar i programmet:\n${adjLines.join("\n")}` : ""}
${prLines.length ? `\nRekord senaste 30 dagarna:\n${prLines.join("\n")}` : ""}
${revLines.length ? `\nCoachens senaste bedömningar efter pass:\n${revLines.join("\n")}` : ""}`.replace(/\n{3,}/g, "\n\n");
}
