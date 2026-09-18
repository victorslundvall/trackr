import { serverSupabase } from "@/lib/supabase/server";
import { quickText } from "@/lib/coach/server";
import { evaluate, groupRows } from "@/lib/progression";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = {
  exercise_id: string;
  exercises: { name: string; is_bodyweight: boolean; category: string } | null;
  sets: { set_type: string; weight: number | null; reps: number | null; rpe: number | null; rir: number | null; extra_weight: number | null; bodyweight: number | null; position: number }[];
};

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY saknas." }, { status: 500 });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inte inloggad." }, { status: 401 });
  const { workoutId, force } = (await req.json()) as { workoutId: string; force?: boolean };

  const { data: w } = await sb.from("workouts").select("id,name,started_at,ended_at,ai_comment,template_id").eq("id", workoutId).single();
  if (!w) return Response.json({ error: "Passet finns inte." }, { status: 404 });
  if (w.ai_comment && !force) return Response.json({ comment: w.ai_comment });

  const { data: wes } = await sb
    .from("workout_exercises")
    .select("exercise_id, exercises(name,is_bodyweight,category), sets(set_type,weight,reps,rpe,rir,extra_weight,bodyweight,position)")
    .eq("workout_id", workoutId)
    .order("position");
  const rows = (wes ?? []) as unknown as Row[];
  if (!rows.length) return Response.json({ comment: null });
  const ids = rows.map((r) => r.exercise_id);

  const [{ data: hist }, { data: prs }, tpl] = await Promise.all([
    sb.rpc("progression_sessions", { p_exercises: ids, p_limit: 6, p_since: null, p_exclude_workout: null }),
    sb.rpc("workout_prs", { p_workout: workoutId }),
    w.template_id
      ? sb.from("template_exercises").select("exercise_id,target_sets,target_reps,target_rir").eq("template_id", w.template_id)
      : Promise.resolve({ data: [] as { exercise_id: string; target_sets: number; target_reps: string | null; target_rir: string | null }[] }),
  ]);
  const grouped = groupRows(hist ?? []);
  const targets = new Map(((tpl.data ?? []) as { exercise_id: string; target_sets: number; target_reps: string | null; target_rir: string | null }[]).map((t) => [t.exercise_id, t]));

  const lines = rows.map((r) => {
    const ex = r.exercises;
    const sets = [...r.sets].sort((a, b) => a.position - b.position).filter((s) => s.set_type !== "warmup" && s.reps);
    const txt = sets
      .map((s) => {
        const load = ex?.is_bodyweight ? `BW${s.extra_weight ? `+${s.extra_weight}` : ""}` : `${s.weight ?? "?"}`;
        const eff = s.rpe != null ? ` @${s.rpe}` : s.rir != null ? ` RIR${s.rir}` : "";
        return `${load}×${s.reps}${eff}`;
      })
      .join(", ");
    const sessions = grouped.get(r.exercise_id) ?? [];
    const prev = sessions.filter((x) => x.workoutId !== workoutId)[0];
    const prevTxt = prev ? prev.sets.map((s) => `${s.load}×${s.reps}`).join(", ") : "ingen";
    const status = evaluate(sessions, { bodyweight: ex?.is_bodyweight }).reason;
    const t = targets.get(r.exercise_id);
    return `- ${ex?.name}: ${txt || "inga arbetsset"} | förra passet: ${prevTxt}${t ? ` | mål: ${t.target_sets}×${t.target_reps ?? "?"}${t.target_rir ? ` @${t.target_rir} RIR` : ""}` : ""} | progression: ${status}`;
  });
  const prTxt = ((prs ?? []) as { kind: string; reps: number | null; load: number; previous: number | null; exercise_id: string }[])
    .map((p) => `${rows.find((r) => r.exercise_id === p.exercise_id)?.exercises?.name}: ${p.kind === "e1rm" ? `e1RM ${p.load} (förut ${p.previous})` : `${p.load} kg × ${p.reps}`}`)
    .join("; ");

  const system =
    "Du är Trakkr Coach. Skriv en kort kommentar på svenska (3–5 meningar, ingen rubrik, ingen punktlista) om passet användaren just gjort. Var konkret: nämn vad som gick bra (rekord, fler reps, vikt upp), vad som stod still eller gick sämre, och ge 1–2 tydliga råd inför nästa gång (t.ex. vilken övning att höja vikten på, eller att sikta på fler reps). Använd siffrorna. Var ärlig men uppmuntrande, som en PT som sms:ar. Hitta inte på data.";
  const user = `Pass: ${w.name} (${new Date(w.started_at).toLocaleDateString("sv-SE")})\n${lines.join("\n")}\nRekord i passet: ${prTxt || "inga"}`;

  try {
    const comment = await quickText(system, user, 800);
    if (comment) await sb.from("workouts").update({ ai_comment: comment }).eq("id", workoutId);
    return Response.json({ comment });
  } catch (e) {
    console.error("[workout-comment]", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
