import { serverSupabase } from "@/lib/supabase/server";
import { quickText, userPhilosophy } from "@/lib/coach/server";
import { feedbackSummary } from "@/lib/coach/context";

export const runtime = "nodejs";
export const maxDuration = 60;

type Stats = {
  workouts: number;
  planned: number;
  start: string | null;
  end: string | null;
  weeks: number;
  exercises: { id: string; name: string; first: number | null; last: number | null; sessions: number }[];
  muscles: Record<string, number>;
};

/**
 * Create the report for the most recently finished block of a program (idempotent).
 * Body: { programId, blockIndex? }
 */
export async function POST(req: Request) {
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inte inloggad." }, { status: 401 });
  const { programId, blockIndex } = (await req.json()) as { programId: string; blockIndex?: number };

  const [{ data: p }, { data: prog }] = await Promise.all([
    sb.from("programs").select("id,name,weeks,week_plan,days_per_week").eq("id", programId).single(),
    sb.rpc("program_progress", { p_program: programId }),
  ]);
  if (!p) return Response.json({ error: "Programmet finns inte." }, { status: 404 });
  const pr = (prog ?? [])[0] as { completed: number; days: number; weeks: number | null } | undefined;
  const size = Math.max(1, (pr?.days ?? 1) * Math.max(1, pr?.weeks ?? p.weeks ?? 1));
  const finished = Math.floor((pr?.completed ?? 0) / size);
  const idx = blockIndex ?? finished - 1;
  if (idx < 0 || idx >= finished) return Response.json({ report: null, reason: "Inget avslutat block ännu." });

  const { data: existing } = await sb.from("block_reports").select("*").eq("program_id", programId).eq("block_index", idx).maybeSingle();
  if (existing) return Response.json({ report: existing });

  const { data: statsRaw, error } = await sb.rpc("block_stats", { p_program: programId, p_block: idx });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const stats = statsRaw as Stats;

  let ai: string | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    const perWeek = Object.entries(stats.muscles)
      .map(([m, v]) => `${m}: ${(v / Math.max(1, stats.weeks)).toFixed(1)} set/v`)
      .join(", ");
    const ex = stats.exercises
      .filter((e) => e.first && e.last)
      .map((e) => `${e.name}: ${e.first} → ${e.last} kg e1RM (${e.sessions} pass, ${(((Number(e.last) - Number(e.first)) / Number(e.first)) * 100).toFixed(1)}%)`)
      .join("\n");
    const system = `Du är Trakkr Coach. Skriv en blockrapport på svenska för ett avslutat träningsblock: 1) en mening om helheten (genomförda pass mot planerat), 2) vad som gick bäst (störst ökning i e1RM), 3) vad som stod still eller gick bakåt, 4) volym per muskel jämfört med filosofins mål, 5) om det finns muskelfeedback: hur volymen självjusterats under blocket och vad de personliga volymzonerna säger, 6) 2–3 konkreta förslag inför nästa block (t.ex. byta en stagnerad övning, justera rep-intervall, lägga till/ta bort set, deload om det behövs). Max ca 220 ord. Korta stycken eller en kort punktlista. Använd siffrorna, hitta inte på något.\n\n${await userPhilosophy(sb)}`;
    const user = `Program: ${p.name}\nBlock ${idx + 1}: ${stats.workouts} av ${stats.planned} planerade pass, ${stats.weeks} veckor (${stats.start?.slice(0, 10)} – ${stats.end?.slice(0, 10)})\n\nÖvningar (första → sista passet i blocket):\n${ex || "–"}\n\nSnittvolym per muskel och vecka: ${perWeek || "–"}`;
    const fb = await feedbackSummary(sb, { weeks: Math.max(2, stats.weeks) }).catch(() => null);
    try {
      ai = await quickText(system, fb ? `${user}\n\n${fb}` : user, 1400);
    } catch (e) {
      console.error("[block-report]", e);
    }
  }

  const { data: report, error: e2 } = await sb
    .from("block_reports")
    .insert({ program_id: programId, block_index: idx, period_start: stats.start, period_end: stats.end, stats, ai_summary: ai })
    .select("*")
    .single();
  if (e2) return Response.json({ error: e2.message }, { status: 500 });
  return Response.json({ report });
}
