import { serverSupabase } from "@/lib/supabase/server";
import { quickText, userPhilosophy } from "@/lib/coach/server";
import { feedbackSummary } from "@/lib/coach/context";
import { estimateZones, effectiveTarget, type FeedbackRow } from "@/lib/zones";
import { muscleLabel } from "@/lib/format";
import { TARGET_MUSCLES, volumeTarget, type UserSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 60;

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Weekly coach report. Idempotent per ISO week (week = Monday, YYYY-MM-DD). */
export async function POST(req: Request) {
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inte inloggad." }, { status: 401 });
  const { week, force } = (await req.json()) as { week: string; force?: boolean };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return Response.json({ error: "Ogiltig vecka." }, { status: 400 });

  const { data: existing } = await sb.from("weekly_reports").select("*").eq("week", week).maybeSingle();
  if (existing && !force) return Response.json({ report: existing });

  const end = addDays(week, 7);
  const [{ data: workouts }, { data: summary }, { data: muscles }, { data: prs }, { data: ready }, { data: settingsRow }] = await Promise.all([
    sb.from("workouts").select("id,name,started_at,ended_at").not("ended_at", "is", null).gte("started_at", `${week}T00:00:00`).lt("started_at", `${end}T00:00:00`).order("started_at"),
    sb.rpc("weekly_summary", { p_weeks: 8 }),
    sb.rpc("weekly_muscle_sets", { p_weeks: 8 }),
    sb.rpc("pr_timeline", { p_limit: 60 }),
    sb.from("readiness").select("sleep,soreness,energy,stress,created_at").gte("created_at", `${week}T00:00:00`).lt("created_at", `${end}T00:00:00`),
    sb.from("user_settings").select("experience,focus_muscles").maybeSingle(),
  ]);
  const { data: fbHist } = await sb.rpc("muscle_feedback_history", { p_weeks: 26 });
  const zones = estimateZones((fbHist ?? []) as FeedbackRow[]);

  const rows = (summary ?? []) as { week: string; workouts: number; sets: number; volume: number }[];
  const cur = rows.find((r) => r.week === week) ?? { workouts: 0, sets: 0, volume: 0 };
  const prev = rows.find((r) => r.week === addDays(week, -7)) ?? { workouts: 0, sets: 0, volume: 0 };
  const settings: UserSettings = (settingsRow as UserSettings | null) ?? { experience: "avancerad", focus_muscles: [] };
  const mRows = ((muscles ?? []) as { week: string; muscle: string; sets: number }[]).filter((m) => m.week === week);
  const muscleStats = TARGET_MUSCLES.map((m) => {
    const sets = Number(mRows.find((r) => r.muscle === m)?.sets ?? 0);
    const t = effectiveTarget(zones.get(m), volumeTarget(m, settings))!;
    return { muscle: m, sets, min: t.min, max: t.max, personal: t.personal };
  });
  const weekPrs = ((prs ?? []) as { exercise_id: string; started_at: string; e1rm: number; previous: number }[]).filter(
    (p) => p.started_at >= `${week}T00:00:00` && p.started_at < `${end}T00:00:00`,
  );
  let prNames = new Map<string, string>();
  if (weekPrs.length) {
    const { data: ex } = await sb.from("exercises").select("id,name").in("id", [...new Set(weekPrs.map((p) => p.exercise_id))]);
    prNames = new Map((ex ?? []).map((e) => [e.id, e.name]));
  }
  const avg = (k: "sleep" | "soreness" | "energy" | "stress") =>
    ready?.length ? Math.round((ready.reduce((a, r) => a + (r[k] ?? 0), 0) / ready.length) * 10) / 10 : null;

  const stats = {
    workouts: Number(cur.workouts),
    sets: Number(cur.sets),
    volume: Number(cur.volume),
    prevWorkouts: Number(prev.workouts),
    prevSets: Number(prev.sets),
    sessions: (workouts ?? []).map((w) => ({ name: w.name, day: w.started_at.slice(0, 10) })),
    muscles: muscleStats,
    prs: weekPrs.map((p) => ({ name: prNames.get(p.exercise_id) ?? "?", e1rm: Number(p.e1rm), gain: Number(p.e1rm) - Number(p.previous) })),
    readiness: ready?.length ? { sleep: avg("sleep"), soreness: avg("soreness"), energy: avg("energy"), stress: avg("stress"), n: ready.length } : null,
  };

  let ai: string | null = null;
  if (process.env.ANTHROPIC_API_KEY && stats.workouts > 0) {
    const philosophy = await userPhilosophy(sb);
    const input = [
      `Vecka ${week} – ${addDays(week, 6)}.`,
      `Pass: ${stats.workouts} (förra veckan ${stats.prevWorkouts}). Arbetsset: ${stats.sets} (förra ${stats.prevSets}). Volym ${Math.round(stats.volume)} kg.`,
      `Passen: ${stats.sessions.map((s) => `${s.day.slice(5)} ${s.name}`).join("; ")}`,
      `Set per muskel mot målspann (* = personlig zon inlärd ur feedbacken): ${muscleStats.map((m) => `${muscleLabel(m.muscle)} ${m.sets}/${m.min}–${m.max}${m.personal ? "*" : ""}`).join(", ")}`,
      `Fokusmuskler: ${settings.focus_muscles.map(muscleLabel).join(", ") || "inga"}`,
      stats.prs.length ? `Rekord: ${stats.prs.map((p) => `${p.name} e1RM ${p.e1rm.toFixed(1)} (+${p.gain.toFixed(1)})`).join("; ")}` : "Inga nya rekord.",
      stats.readiness ? `Dagsform snitt (1–5): sömn ${stats.readiness.sleep}, energi ${stats.readiness.energy}, träningsvärk ${stats.readiness.soreness}, stress ${stats.readiness.stress}` : "",
      await feedbackSummary(sb, { weeks: 2 }).catch(() => null),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      ai = await quickText(
        `Du är användarens tränare. Skriv en kort veckorapport på svenska i Markdown (max ~120 ord):
1. En mening om veckan som helhet.
2. 2–3 punkter: vad som gick bra och vad som ligger efter (använd musklernas målspann; nämn bara det viktigaste). Finns muskelfeedback: nämn hur kroppen svarat (t.ex. ömhet som återkommer, pump som förbättrats) och vilka set-ändringar som gjorts.
3. "**Nästa vecka:**" följt av 1–2 konkreta fokuspunkter.
Ingen rubrik, inga emojis. Följ träningsfilosofin:
${philosophy}`,
        input,
        900,
      );
    } catch (e) {
      console.error("[weekly-report]", e);
    }
  }

  const { data: report, error } = await sb
    .from("weekly_reports")
    .upsert({ week, stats, ai_summary: ai }, { onConflict: "user_id,week" })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ report });
}
