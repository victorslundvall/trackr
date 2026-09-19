import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/lib/supabase/server";
import { MODEL, userPhilosophy } from "@/lib/coach/server";
import { feedbackSummary } from "@/lib/coach/context";
import { detectSignals, type Best, type Signal } from "@/lib/coach/signals";
import { muscleLabel } from "@/lib/format";
import type { FeedbackRow } from "@/lib/zones";

export const runtime = "nodejs";
export const maxDuration = 60;

export type CoachAction = {
  id: string;
  kind: "swap_exercise" | "rep_range" | "keep_volume" | "note";
  muscle: string | null;
  exercise_id: string | null;
  te_id: string | null;
  replacement_name: string | null;
  replacement_id: string | null;
  target_reps: string | null;
  current_reps: string | null;
  message: string;
};

type Suggestion = { muscle: string; exercise_id: string; from: number; to: number; reason: string };

const TOOL: Anthropic.Tool = {
  name: "coach_review",
  description: "Din bedömning av signalerna efter passet.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "actions"],
    properties: {
      summary: { type: "string", description: "2–3 meningar på svenska: vad signalerna betyder och vad du rekommenderar. Konkret, som en PT som sms:ar." },
      actions: {
        type: "array",
        description: "0–3 åtgärder. Bara det som verkligen behövs.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "muscle", "exercise_id", "replacement_name", "target_reps", "message"],
          properties: {
            kind: {
              type: "string",
              enum: ["swap_exercise", "rep_range", "keep_volume", "note"],
              description:
                "swap_exercise = byt övningen i passet mot en annan för samma muskel; rep_range = ändra rep-intervall; keep_volume = behåll set-antalet för muskeln trots appens förslag; note = bara ett råd",
            },
            muscle: { type: ["string", "null"], description: "Muskelnyckel (engelska, som i signalen) eller null" },
            exercise_id: { type: ["string", "null"], description: "Exakt exercise_id från passet, eller null" },
            replacement_name: { type: ["string", "null"], description: "Vid swap_exercise: standardnamn på engelska, t.ex. 'Cable Lateral Raise'. Annars null." },
            target_reps: { type: ["string", "null"], description: "Vid rep_range: t.ex. '6-8' eller '12-15'. Annars null." },
            message: { type: "string", description: "Max 15 ord: varför." },
          },
        },
      },
    },
  },
};

const SYSTEM = `Du är Trakkr Coach och ger en andra åsikt efter ett pass. Appen justerar set-antalet automatiskt (±1 set per muskel) utifrån användarens muskelfeedback, men i vissa lägen krockar signalerna och regeln räcker inte. Du får signalerna, appens egna förslag och historiken.
Riktlinjer:
- Öm men starkare: ömhet är inte samma sak som dålig återhämtning om prestationen ökar. Rekommendera oftast keep_volume (behåll set-antalet) i stället för att dra ner.
- Svag pump flera pass i rad: problemet är ofta övningen (dålig stimulus/kontakt), inte volymen. Föreslå swap_exercise till en övning för samma muskel med bättre stretch/stabilitet, eller rep_range.
- Återkommande ledkänning: byt övningen mot en ledvänligare variant (swap_exercise). Dra inte bara ner set.
- Stagnation med god återhämtning: föreslå rep_range (t.ex. från 6–8 till 10–12 eller tvärtom) eller swap_exercise om övningen stått still länge.
- Hitta inte på data. Max 3 åtgärder. Svara bara via verktyget coach_review.`;

export async function POST(req: Request) {
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inte inloggad." }, { status: 401 });
  const { workoutId, suggestions = [] } = (await req.json()) as { workoutId: string; suggestions?: Suggestion[] };

  const { data: existing } = await sb.from("coach_reviews").select("*").eq("workout_id", workoutId).maybeSingle();
  if (existing) return Response.json({ review: existing });

  const { data: w } = await sb.from("workouts").select("id,name,template_id,ended_at").eq("id", workoutId).single();
  if (!w?.ended_at) return Response.json({ review: null });

  const [{ data: hist }, { data: wes }, { data: bests }, tpl] = await Promise.all([
    sb.rpc("muscle_feedback_history", { p_weeks: 26 }),
    sb.from("workout_exercises").select("exercise_id, exercises(id,name,primary_muscles)").eq("workout_id", workoutId),
    sb.rpc("session_bests", { p_since: new Date(Date.now() - 120 * 864e5).toISOString() }),
    w.template_id
      ? sb.from("template_exercises").select("id,exercise_id,target_sets,target_reps").eq("template_id", w.template_id)
      : Promise.resolve({ data: [] as { id: string; exercise_id: string; target_sets: number; target_reps: string | null }[] }),
  ]);
  const exercises = ((wes ?? []) as unknown as { exercises: { id: string; name: string; primary_muscles: string[] } | null }[])
    .map((r) => r.exercises)
    .filter((e): e is { id: string; name: string; primary_muscles: string[] } => !!e);
  // don't nag: a signal already raised for the same muscle/exercise in the last 14 days is skipped
  const { data: prevReviews } = await sb.from("coach_reviews").select("signals").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString());
  const seen = new Set(((prevReviews ?? []) as { signals: Signal[] }[]).flatMap((r) => r.signals.map((s) => `${s.kind}:${s.muscle}:${s.exercise_ids.join(",")}`)));
  const signals = detectSignals({
    workoutId,
    history: (hist ?? []) as FeedbackRow[],
    bests: ((bests ?? []) as Best[]).map((b) => ({ ...b, e1rm: Number(b.e1rm) })),
    exercises,
  }).filter((s) => !seen.has(`${s.kind}:${s.muscle}:${s.exercise_ids.join(",")}`));

  const save = async (summary: string | null, actions: CoachAction[]) => {
    const { data } = await sb.from("coach_reviews").upsert({ workout_id: workoutId, signals, summary, actions }, { onConflict: "workout_id" }).select("*").single();
    return Response.json({ review: data });
  };
  if (!signals.length || !process.env.ANTHROPIC_API_KEY) return save(null, []);

  const tes = (tpl.data ?? []) as { id: string; exercise_id: string; target_sets: number; target_reps: string | null }[];
  const teBy = new Map(tes.map((t) => [t.exercise_id, t]));
  const exLines = exercises.map((e) => {
    const t = teBy.get(e.id);
    return `- ${e.name} (exercise_id ${e.id}) [${e.primary_muscles.join(", ")}]${t ? ` – i passmallen ${t.target_sets} set × ${t.target_reps ?? "?"}` : ""}`;
  });
  const name = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;
  const user = [
    `Pass: ${w.name}`,
    `Övningar i passet:\n${exLines.join("\n")}`,
    `Signaler:\n${signals.map((s) => `- [${s.kind}] ${s.muscle ? `${muscleLabel(s.muscle)} (${s.muscle}): ` : ""}${s.detail}`).join("\n")}`,
    suggestions.length ? `Appens egna set-förslag för nästa gång:\n${suggestions.map((s) => `- ${name(s.exercise_id)} ${s.from}→${s.to} set (${s.reason})`).join("\n")}` : "Appen föreslår inga set-ändringar.",
    (await feedbackSummary(sb).catch(() => null)) ?? "",
    `Träningsfilosofi:\n${await userPhilosophy(sb)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const client = new Anthropic();
  const call = (strict: boolean) =>
    client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system: SYSTEM,
      tools: [strict ? TOOL : { ...TOOL, strict: undefined }],
      tool_choice: { type: "tool", name: "coach_review" },
      messages: [{ role: "user", content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming);
  let msg: Anthropic.Message;
  try {
    try {
      msg = await call(true);
    } catch (e) {
      if (e instanceof Anthropic.APIError && e.status === 400) msg = await call(false);
      else throw e;
    }
  } catch (e) {
    console.error("[review]", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const tool = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  const raw = (tool?.input ?? {}) as { summary?: string; actions?: Partial<CoachAction>[] };
  const known = new Set(exercises.map((e) => e.id));

  // resolve replacement names against the user's exercise library
  const swapNames = (raw.actions ?? []).filter((a) => a.kind === "swap_exercise" && a.replacement_name).map((a) => a.replacement_name!);
  const matches = new Map<string, string>();
  if (swapNames.length) {
    const { data: m } = await sb.rpc("match_exercises", { p_names: swapNames });
    ((m ?? []) as { name: string; exercise_id: string | null; similarity: number | null }[]).forEach((r) => {
      if (r.exercise_id && (r.similarity ?? 0) >= 0.45) matches.set(r.name, r.exercise_id);
    });
  }

  const actions: CoachAction[] = (raw.actions ?? []).slice(0, 3).map((a, i) => {
    const exId = a.exercise_id && known.has(a.exercise_id) ? a.exercise_id : null;
    const te = exId ? teBy.get(exId) : undefined;
    const replacement_id = a.kind === "swap_exercise" && a.replacement_name ? matches.get(a.replacement_name) ?? null : null;
    return {
      id: `a${i}`,
      kind: a.kind ?? "note",
      muscle: a.muscle ?? null,
      exercise_id: exId,
      te_id: te?.id ?? null,
      replacement_name: a.replacement_name ?? null,
      replacement_id: replacement_id && replacement_id !== exId ? replacement_id : null,
      target_reps: a.target_reps ?? null,
      current_reps: te?.target_reps ?? null,
      message: a.message ?? "",
    };
  });
  return save(raw.summary ?? null, actions);
}
